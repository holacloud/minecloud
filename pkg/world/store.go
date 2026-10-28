package world

import (
	"errors"
	"fmt"
	"io/fs"
	"log"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"minecloud/pkg/terrain"
)

// Edit is a block change; an empty Block means air (a removal).
type Edit struct {
	X, Y, Z int
	Block   string
}

// LegacyEdits returns (and forgets) edits recorded for a chunk before the server owned
// the terrain. They are applied once, when the chunk is first generated.
type LegacyEdits func(chunkX, chunkZ int) []Edit

// Store owns every chunk: loaded from disk, or generated on first use and persisted.
// Once a chunk exists its stored data is the truth, so the generator can change without
// altering explored parts of the world.
type Store struct {
	dir       string
	legacy    LegacyEdits
	maxLoaded int

	mu      sync.Mutex
	entries map[[2]int]*entry
	clock   int64
}

type entry struct {
	chunk    *terrain.Chunk
	encoded  []byte // cached Encode output; nil after edits
	dirty    bool
	lastUsed int64
}

// Open creates a store persisting under dir. legacy may be nil.
func Open(dir string, legacy LegacyEdits) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{dir: dir, legacy: legacy, maxLoaded: 4096, entries: make(map[[2]int]*entry)}, nil
}

// ChunkCoords maps a world position to its chunk.
func ChunkCoords(x, z int) (int, int) {
	return floorDiv(x, terrain.ChunkSize), floorDiv(z, terrain.ChunkSize)
}

func floorDiv(v, size int) int {
	return int(math.Floor(float64(v) / float64(size)))
}

func local(v int) int {
	return ((v % terrain.ChunkSize) + terrain.ChunkSize) % terrain.ChunkSize
}

func (s *Store) path(chunkX, chunkZ int) string {
	region := fmt.Sprintf("r.%d.%d", floorDiv(chunkX, 32), floorDiv(chunkZ, 32))
	return filepath.Join(s.dir, region, fmt.Sprintf("c.%d.%d.bin", chunkX, chunkZ))
}

// load returns the entry for a chunk, reading or generating it. Caller holds s.mu.
func (s *Store) load(chunkX, chunkZ int) (*entry, error) {
	key := [2]int{chunkX, chunkZ}
	s.clock++
	if e, ok := s.entries[key]; ok {
		e.lastUsed = s.clock
		return e, nil
	}

	e := &entry{lastUsed: s.clock}
	data, err := os.ReadFile(s.path(chunkX, chunkZ))
	switch {
	case err == nil:
		chunk, decodeErr := Decode(data)
		if decodeErr != nil {
			return nil, fmt.Errorf("world: chunk %d,%d: %w", chunkX, chunkZ, decodeErr)
		}
		e.chunk = chunk
		e.encoded = data
	case errors.Is(err, fs.ErrNotExist):
		e.chunk = terrain.Generate(chunkX, chunkZ)
		e.dirty = true
		if s.legacy != nil {
			for _, edit := range s.legacy(chunkX, chunkZ) {
				name := edit.Block
				if name == "" {
					name = "air"
				}
				e.chunk.Set(local(edit.X), edit.Y, local(edit.Z), name)
			}
		}
	default:
		return nil, err
	}

	s.entries[key] = e
	s.evictLocked()
	return e, nil
}

// Encoded returns the wire/disk encoding of a chunk, generating it if needed.
func (s *Store) Encoded(chunkX, chunkZ int) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.load(chunkX, chunkZ)
	if err != nil {
		return nil, err
	}
	if e.encoded == nil {
		if e.encoded, err = Encode(e.chunk); err != nil {
			return nil, err
		}
	}
	return e.encoded, nil
}

// Block returns the block at a world position ("air" when empty).
func (s *Store) Block(x, y, z int) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	chunkX, chunkZ := ChunkCoords(x, z)
	e, err := s.load(chunkX, chunkZ)
	if err != nil {
		return "", err
	}
	return e.chunk.Get(local(x), y, local(z)), nil
}

// SetBlock applies a player edit; an empty name removes the block.
func (s *Store) SetBlock(x, y, z int, name string) error {
	if name == "" {
		name = "air"
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	chunkX, chunkZ := ChunkCoords(x, z)
	e, err := s.load(chunkX, chunkZ)
	if err != nil {
		return err
	}
	if e.chunk.Set(local(x), y, local(z), name) {
		e.dirty = true
		e.encoded = nil
	}
	return nil
}

// Flush writes every modified or newly generated chunk to disk.
func (s *Store) Flush() error {
	s.mu.Lock()
	type pending struct {
		path string
		data []byte
		e    *entry
	}
	var writes []pending
	for key, e := range s.entries {
		if !e.dirty {
			continue
		}
		if e.encoded == nil {
			data, err := Encode(e.chunk)
			if err != nil {
				s.mu.Unlock()
				return err
			}
			e.encoded = data
		}
		writes = append(writes, pending{s.path(key[0], key[1]), e.encoded, e})
		e.dirty = false
	}
	s.mu.Unlock()

	var firstErr error
	for _, w := range writes {
		if err := writeAtomic(w.path, w.data); err != nil {
			s.mu.Lock()
			w.e.dirty = true
			s.mu.Unlock()
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	return firstErr
}

// FlushEvery persists periodically until the process exits.
func (s *Store) FlushEvery(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		if err := s.Flush(); err != nil {
			log.Printf("world: flush failed: %v", err)
		}
	}
}

// evictLocked drops the least recently used clean chunks above the memory budget.
func (s *Store) evictLocked() {
	for len(s.entries) > s.maxLoaded {
		var oldestKey [2]int
		var oldest *entry
		for key, e := range s.entries {
			if e.dirty {
				continue
			}
			if oldest == nil || e.lastUsed < oldest.lastUsed {
				oldestKey, oldest = key, e
			}
		}
		if oldest == nil {
			return
		}
		delete(s.entries, oldestKey)
	}
}

func writeAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
