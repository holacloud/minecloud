package network

import (
	"encoding/json"
	"errors"
	"log"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// What the world keeps besides its chunks, a file for each mechanic: data/world/<name>.json. A mechanic
// declares its section from its own file and says when it has changed; only that file is written, so what
// a save costs is the size of the mechanic and not of the whole world.
//
//	var worldGlow *worldSection
//
//	func init() {
//		worldGlow = registerWorldSection(worldSectionSpec{
//			name:     "glow",
//			snapshot: func() any { return glowSaved{Glow: glowSnapshot()} },       // a copy, safe to read unlocked
//			load:     func(data []byte) error { ...json.Unmarshal(data, &saved); glowLoad(saved.Glow) },
//		})
//	}
//
//	worldGlow.changed()   // after changing it
//
// A section is written a few seconds after it changes (worldSaveEvery), and when the server stops: a
// server killed outright loses those seconds, as it does of the chunks (world.Store.FlushEvery). A section
// that is `immediate` is on disk before changed() returns instead: for what must not be answered before
// it is saved (a chest: the player's side of the move is kept by the client, storage.go).
//
// Each file is one JSON object, and no two sections use the same key: a world saved when it was all one
// file (data/world.json) is read by giving that file to every section, and each takes its own keys.

const (
	worldSectionsDir = "data/world"
	worldLegacyPath  = "data/world.json"
	worldSaveEvery   = 5 * time.Second
)

type worldSectionSpec struct {
	name      string
	immediate bool
	// A copy of the state to marshal, taken under the mechanic's own locks and read with none held.
	snapshot func() any
	// Installs what a file says. It is not called for a world that never saved this section.
	load func(data []byte) error
}

type worldSection struct {
	worldSectionSpec
	writing sync.Mutex // one write of this file at a time
	dirty   atomic.Bool
}

var worldSections []*worldSection

func registerWorldSection(spec worldSectionSpec) *worldSection {
	if spec.name == "" || spec.snapshot == nil || spec.load == nil {
		panic("registerWorldSection: a section needs a name, a snapshot and a load")
	}
	for _, other := range worldSections {
		if other.name == spec.name {
			panic("registerWorldSection: " + spec.name + " registered twice")
		}
	}
	section := &worldSection{worldSectionSpec: spec}
	worldSections = append(worldSections, section)
	return section
}

func (s *worldSection) path() string {
	return filepath.Join(worldSectionsDir, s.name+".json")
}

// mark notes that the section has changed, to be written with the next round. It takes no lock: it may
// be called from anywhere, with anything held.
func (s *worldSection) mark() {
	s.dirty.Store(true)
}

// changed notes that the section has changed. An immediate one is on disk when this returns, so never
// call it holding a lock its snapshot takes; any other is written within worldSaveEvery.
func (s *worldSection) changed() {
	s.dirty.Store(true)
	if s.immediate {
		s.write()
	}
}

// write saves the section if it has changed since it was last written. Somebody who changed it while
// another write was on its way waits here, and finds its change already saved or saves it now.
func (s *worldSection) write() {
	s.writing.Lock()
	defer s.writing.Unlock()
	if !s.dirty.Swap(false) {
		return
	}
	if err := s.writeFile(); err != nil {
		s.dirty.Store(true)
		log.Printf("Failed to save world section %s: %v", s.name, err)
	}
}

func (s *worldSection) writeFile() error {
	data, err := json.Marshal(s.snapshot())
	if err != nil {
		return err
	}
	if err := os.MkdirAll(worldSectionsDir, 0o755); err != nil {
		return err
	}
	// Whole or not at all: a server stopped half way leaves the file as it was.
	tmpPath := s.path() + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmpPath, s.path())
}

// worldLoad reads every section from its file. One with no file yet takes its part of the old
// data/world.json, which is left as it is, and is written to its own file with the next round.
func worldLoad() error {
	legacy, err := os.ReadFile(worldLegacyPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, section := range worldSections {
		data, err := os.ReadFile(section.path())
		switch {
		case err == nil:
		case !errors.Is(err, os.ErrNotExist):
			return err
		case legacy != nil:
			data = legacy
			section.mark()
			log.Printf("World section %s: read from %s", section.name, worldLegacyPath)
		default:
			continue
		}
		if err := section.load(data); err != nil {
			return errors.New("world section " + section.name + ": " + err.Error())
		}
	}
	return nil
}

// worldFlush writes every section that has changed and is not on disk yet.
func worldFlush() {
	for _, section := range worldSections {
		section.write()
	}
}

// worldSaveAll writes every section, changed or not.
func worldSaveAll() {
	for _, section := range worldSections {
		section.mark()
	}
	worldFlush()
}

// SaveWorldState writes what changed in the last seconds: called as the server stops.
func SaveWorldState() {
	worldFlush()
}

func runWorldSaver() {
	ticker := time.NewTicker(worldSaveEvery)
	defer ticker.Stop()
	for range ticker.C {
		worldFlush()
	}
}

func init() {
	registerLoop(runWorldSaver)
}
