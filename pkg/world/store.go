package world

import (
	"errors"
	"fmt"
	"io/fs"
	"log"
	"math"
	"os"
	"path/filepath"
	"strings"
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

// EditHook is told (with the store's lock held, so it must only note it down) that a chunk now
// holds something other than what the generator made.
type EditHook func(chunkX, chunkZ int)

// Store owns every chunk: loaded from disk, or generated on first use and persisted.
// Once a chunk exists its stored data is the truth, so the generator can change without
// altering explored parts of the world.
type Store struct {
	dir       string
	legacy    LegacyEdits
	maxLoaded int

	mu sync.Mutex
	// What legacy would return, without taking it; see Peek. May be nil.
	legacyPreview LegacyEdits
	onEdit        EditHook
	entries       map[[2]int]*entry
	clock         int64
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

// parseChunkFile reads the coordinates out of the file name path gives a chunk.
func parseChunkFile(name string) (chunkX, chunkZ int, ok bool) {
	var x, z int
	if n, err := fmt.Sscanf(name, "c.%d.%d.bin", &x, &z); err != nil || n != 2 || name != fmt.Sprintf("c.%d.%d.bin", x, z) {
		return 0, 0, false
	}
	return x, z, true
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
			edits := s.legacy(chunkX, chunkZ)
			applyEdits(e.chunk, edits)
			if len(edits) > 0 && s.onEdit != nil {
				s.onEdit(chunkX, chunkZ)
			}
		}
	default:
		return nil, err
	}

	s.entries[key] = e
	s.evictLocked()
	return e, nil
}

func applyEdits(chunk *terrain.Chunk, edits []Edit) {
	for _, edit := range edits {
		name := edit.Block
		if name == "" {
			name = "air"
		}
		chunk.Set(local(edit.X), edit.Y, local(edit.Z), name)
	}
}

// SetEditHook installs the function told about every chunk a player (or a legacy edit) changes.
func (s *Store) SetEditHook(hook EditHook) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onEdit = hook
}

// SetLegacyPreview installs what Peek and Snapshot use to see the legacy edits of a chunk not
// generated yet, without consuming them.
func (s *Store) SetLegacyPreview(preview LegacyEdits) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.legacyPreview = preview
}

// Dir is the directory the chunks are persisted under.
func (s *Store) Dir() string {
	return s.dir
}

// Peek returns the encoding of a chunk as it is or would be, changing nothing: a chunk that is
// not stored is not created, marked as used or kept in memory, legacy edits stay where they are,
// and no disk or compression work happens with the store's lock held.
func (s *Store) Peek(chunkX, chunkZ int) ([]byte, error) {
	s.mu.Lock()
	if e, ok := s.entries[[2]int{chunkX, chunkZ}]; ok {
		if e.encoded != nil {
			defer s.mu.Unlock()
			return e.encoded, nil
		}
		chunk := e.chunk.Clone()
		s.mu.Unlock()
		return Encode(chunk)
	}
	s.mu.Unlock()

	data, err := os.ReadFile(s.path(chunkX, chunkZ))
	if err == nil {
		return data, nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	return Encode(s.unstored(chunkX, chunkZ))
}

// Snapshot returns a private copy of a chunk as it is or would be, changing nothing (see Peek).
func (s *Store) Snapshot(chunkX, chunkZ int) (*terrain.Chunk, error) {
	s.mu.Lock()
	if e, ok := s.entries[[2]int{chunkX, chunkZ}]; ok {
		defer s.mu.Unlock()
		return e.chunk.Clone(), nil
	}
	s.mu.Unlock()

	data, err := os.ReadFile(s.path(chunkX, chunkZ))
	if err == nil {
		return Decode(data)
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	return s.unstored(chunkX, chunkZ), nil
}

// unstored is what a chunk not stored yet will be when it is first generated.
func (s *Store) unstored(chunkX, chunkZ int) *terrain.Chunk {
	s.mu.Lock()
	preview := s.legacyPreview
	s.mu.Unlock()
	chunk := terrain.Generate(chunkX, chunkZ)
	if preview != nil {
		applyEdits(chunk, preview(chunkX, chunkZ))
	}
	return chunk
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

// FindBlocks lists where a chunk holds a block of this kind (the name before any ':'), in world
// coordinates. A chunk with none costs only a look at its palette.
func (s *Store) FindBlocks(chunkX, chunkZ int, base string) [][3]int {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.load(chunkX, chunkZ)
	if err != nil {
		return nil
	}
	wanted := make(map[uint16]bool)
	for id, name := range e.chunk.Palette {
		if name == base || strings.HasPrefix(name, base+":") {
			wanted[uint16(id)] = true
		}
	}
	if len(wanted) == 0 {
		return nil
	}
	var found [][3]int
	for index, id := range e.chunk.Blocks {
		if wanted[id] {
			layer := terrain.ChunkSize * terrain.ChunkSize
			found = append(found, [3]int{
				chunkX*terrain.ChunkSize + index%terrain.ChunkSize,
				index/layer + terrain.WorldMinY,
				chunkZ*terrain.ChunkSize + (index/terrain.ChunkSize)%terrain.ChunkSize,
			})
		}
	}
	return found
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
		if s.onEdit != nil {
			s.onEdit(chunkX, chunkZ)
		}
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
