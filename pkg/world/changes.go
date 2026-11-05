package world

import (
	"crypto/rand"
	"encoding/hex"
	"io/fs"
	"log"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"minecloud/pkg/terrain"
)

// The disk cannot tell a chunk a player changed from one merely generated and saved (both are
// plain files, and the store marks both dirty), so ChangeIndex finds out by comparing: a chunk is
// changed when its blocks differ from what terrain.Generate makes for it. That covers worlds
// saved long ago and legacy edits with no bookkeeping in the files. Once at startup a background
// goroutine compares every stored chunk; after that the store's EditHook names the chunks to
// compare again. Requests only ever read the index in memory: no disk, no generator and no store
// lock on their path.
//
// For each changed chunk the index keeps only the columns whose top differs from the generated
// top, plus a summary for looking at it from far away. Columns nobody touched are left out, so
// whoever draws them keeps its own terrain there.

// SurfaceColumn is one column whose top is not the generated one. Index is lz<<4 | lx; Y is the
// height of its top block (terrain.WorldMinY-1 when the column holds nothing); Block indexes
// ChangeIndex.Names.
type SurfaceColumn struct {
	Index uint8
	Y     int16
	Block uint16
}

// SurfaceSummary stands for a group of a chunk's changed columns. Top and Block are of the column
// three quarters of the way up the group's heights, so one flagpole does not lift a whole chunk.
type SurfaceSummary struct {
	Count int
	Top   int16
	Block uint16
}

// ChangedChunk is one chunk's entry, never modified once published (an update replaces it).
// Raised sums the columns at or above their generated top, Lowered the ones dug below it. A chunk
// with no columns has changes only underground, or has been put back as it was generated.
type ChangedChunk struct {
	X, Z    int
	Version uint32
	Columns []SurfaceColumn
	Raised  SurfaceSummary
	Lowered SurfaceSummary
}

// ChangeIndex is the list of chunks that differ from the generated terrain.
type ChangeIndex struct {
	store *Store
	// skip reports the blocks a look from above goes past (plants, torches...). They never
	// count as the top of a column, so picking a flower is not a change seen from the sky.
	skip func(name string) bool
	// pendingLegacy lists chunks with legacy edits; they may have no file to find by scanning.
	pendingLegacy func() [][2]int
	epoch         string
	scanning      atomic.Bool

	mu      sync.RWMutex
	version uint32
	entries map[[2]int]*ChangedChunk
	// Entries by version, oldest first; the ones replaced later are skipped when read and
	// compacted away when they outnumber the rest.
	log     []logItem
	names   []string
	nameIDs map[string]uint16

	pendingMu sync.Mutex
	pending   map[[2]int]bool
	wake      chan struct{}
	// Pause between the chunks of the startup scan, so that it stays in the background.
	scanPause time.Duration
}

type logItem struct {
	version uint32
	key     [2]int
}

// NewChangeIndex creates an index over a store and hooks it to the store's edits. Nothing is
// known until Run has gone through the chunks saved so far.
func NewChangeIndex(store *Store, skip func(name string) bool, pendingLegacy func() [][2]int) *ChangeIndex {
	epoch := make([]byte, 8)
	rand.Read(epoch)
	ix := &ChangeIndex{
		store:         store,
		skip:          skip,
		pendingLegacy: pendingLegacy,
		epoch:         hex.EncodeToString(epoch),
		entries:       make(map[[2]int]*ChangedChunk),
		nameIDs:       make(map[string]uint16),
		pending:       make(map[[2]int]bool),
		wake:          make(chan struct{}, 1),
		scanPause:     200 * time.Microsecond,
	}
	ix.scanning.Store(true)
	store.SetEditHook(ix.mark)
	return ix
}

// Epoch identifies this run of the server: versions only compare within one epoch.
func (ix *ChangeIndex) Epoch() string {
	return ix.epoch
}

// Scanning reports whether the startup scan is still finding chunks.
func (ix *ChangeIndex) Scanning() bool {
	return ix.scanning.Load()
}

func (ix *ChangeIndex) mark(chunkX, chunkZ int) {
	ix.pendingMu.Lock()
	ix.pending[[2]int{chunkX, chunkZ}] = true
	ix.pendingMu.Unlock()
	select {
	case ix.wake <- struct{}{}:
	default:
	}
}

// Run scans the stored chunks once and then follows edits until stop closes. Edits go first, so
// a build shows up while the scan is still running.
func (ix *ChangeIndex) Run(stop <-chan struct{}) {
	scan := ix.storedChunks()
	if ix.pendingLegacy != nil {
		scan = append(scan, ix.pendingLegacy()...)
	}
	for _, key := range scan {
		select {
		case <-stop:
			return
		default:
		}
		ix.drain()
		ix.mu.RLock()
		_, known := ix.entries[key]
		ix.mu.RUnlock()
		if !known {
			ix.refresh(key)
		}
		if ix.scanPause > 0 {
			time.Sleep(ix.scanPause)
		}
	}
	ix.scanning.Store(false)

	// Edits come in bursts (a /build); comparing a little later takes each chunk once.
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
		}
		ix.drain()
	}
}

func (ix *ChangeIndex) drain() {
	ix.pendingMu.Lock()
	keys := make([][2]int, 0, len(ix.pending))
	for key := range ix.pending {
		keys = append(keys, key)
		delete(ix.pending, key)
	}
	ix.pendingMu.Unlock()
	for _, key := range keys {
		ix.refresh(key)
	}
}

// storedChunks walks the store's directory: done once, at startup.
func (ix *ChangeIndex) storedChunks() [][2]int {
	var keys [][2]int
	filepath.WalkDir(ix.store.Dir(), func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			log.Printf("world: index scan: %v", err)
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		if x, z, ok := parseChunkFile(entry.Name()); ok {
			keys = append(keys, [2]int{x, z})
		}
		return nil
	})
	return keys
}

// refresh compares one chunk with its generated self and publishes the outcome.
func (ix *ChangeIndex) refresh(key [2]int) {
	stored, err := ix.store.Snapshot(key[0], key[1])
	if err != nil {
		log.Printf("world: index chunk %d,%d: %v", key[0], key[1], err)
		return
	}
	changed, columns, raised, lowered := diffSurface(stored, terrain.Generate(key[0], key[1]), ix.skip)

	ix.mu.Lock()
	defer ix.mu.Unlock()
	if _, known := ix.entries[key]; !known && !changed {
		return
	}
	ids := make([]uint16, len(stored.Palette))
	for i, name := range stored.Palette {
		ids[i] = ix.nameID(name)
	}
	for i := range columns {
		columns[i].Block = ids[columns[i].Block]
	}
	raised.Block = ids[raised.Block]
	lowered.Block = ids[lowered.Block]
	ix.version++
	ix.entries[key] = &ChangedChunk{X: key[0], Z: key[1], Version: ix.version, Columns: columns, Raised: raised, Lowered: lowered}
	ix.log = append(ix.log, logItem{ix.version, key})
	if len(ix.log) > 2*len(ix.entries)+1024 {
		ix.compactLocked()
	}
}

func (ix *ChangeIndex) nameID(name string) uint16 {
	if id, ok := ix.nameIDs[name]; ok {
		return id
	}
	id := uint16(len(ix.names))
	ix.names = append(ix.names, name)
	ix.nameIDs[name] = id
	return id
}

func (ix *ChangeIndex) compactLocked() {
	kept := ix.log[:0]
	for _, item := range ix.log {
		if ix.entries[item.key].Version == item.version {
			kept = append(kept, item)
		}
	}
	ix.log = kept
}

// diffSurface compares a chunk with the generated one. Blocks in the returned columns and
// summaries are indices into stored.Palette.
func diffSurface(stored, generated *terrain.Chunk, skip func(string) bool) (changed bool, columns []SurfaceColumn, raised, lowered SurfaceSummary) {
	same := make([]int32, len(stored.Palette))
	byName := make(map[string]int32, len(generated.Palette))
	for i, name := range generated.Palette {
		byName[name] = int32(i)
	}
	for i, name := range stored.Palette {
		same[i] = -1
		if id, ok := byName[name]; ok {
			same[i] = id
		}
	}
	for i, id := range stored.Blocks {
		if same[id] != int32(generated.Blocks[i]) {
			changed = true
			break
		}
	}
	if !changed {
		return false, nil, raised, lowered
	}

	skipStored := skipFlags(stored.Palette, skip)
	skipGenerated := skipFlags(generated.Palette, skip)
	var raisedColumns, loweredColumns []SurfaceColumn
	for lz := range terrain.ChunkSize {
		for lx := range terrain.ChunkSize {
			y, block := columnTop(stored, skipStored, lx, lz)
			genY, genBlock := columnTop(generated, skipGenerated, lx, lz)
			if y == genY && stored.Palette[block] == generated.Palette[genBlock] {
				continue
			}
			column := SurfaceColumn{Index: uint8(lz<<4 | lx), Y: int16(y), Block: block}
			columns = append(columns, column)
			if y >= genY {
				raisedColumns = append(raisedColumns, column)
			} else {
				loweredColumns = append(loweredColumns, column)
			}
		}
	}
	return true, columns, summarize(raisedColumns), summarize(loweredColumns)
}

func skipFlags(palette []string, skip func(string) bool) []bool {
	flags := make([]bool, len(palette))
	for i, name := range palette {
		flags[i] = i == 0 || (skip != nil && skip(name))
	}
	return flags
}

// columnTop finds the highest block of a column a look from above stops at.
func columnTop(c *terrain.Chunk, skip []bool, lx, lz int) (int, uint16) {
	for y := terrain.WorldMaxY; y >= terrain.WorldMinY; y-- {
		id := c.Blocks[terrain.ChunkIndex(lx, y, lz)]
		if !skip[id] {
			return y, id
		}
	}
	return terrain.WorldMinY - 1, 0
}

func summarize(columns []SurfaceColumn) SurfaceSummary {
	if len(columns) == 0 {
		return SurfaceSummary{}
	}
	sort.Slice(columns, func(i, j int) bool { return columns[i].Y < columns[j].Y })
	at := columns[len(columns)*3/4]
	return SurfaceSummary{Count: len(columns), Top: at.Y, Block: at.Block}
}

// Changes returns up to limit chunks changed after version `since`, oldest first, the version to
// ask from next (the index's own version once nothing is left) and whether more remain.
func (ix *ChangeIndex) Changes(since uint32, limit int) (chunks []*ChangedChunk, next uint32, more bool) {
	ix.mu.RLock()
	defer ix.mu.RUnlock()
	start := sort.Search(len(ix.log), func(i int) bool { return ix.log[i].version > since })
	next = ix.version
	for _, item := range ix.log[start:] {
		entry := ix.entries[item.key]
		if entry.Version != item.version {
			continue
		}
		if len(chunks) == limit {
			return chunks, chunks[len(chunks)-1].Version, true
		}
		chunks = append(chunks, entry)
	}
	return chunks, next, false
}

// Region returns the entries inside a rectangle of chunks (inclusive), ordered by position. The
// caller bounds the rectangle.
func (ix *ChangeIndex) Region(minX, minZ, maxX, maxZ int) []*ChangedChunk {
	var chunks []*ChangedChunk
	ix.mu.RLock()
	defer ix.mu.RUnlock()
	for x := minX; x <= maxX; x++ {
		for z := minZ; z <= maxZ; z++ {
			if entry, ok := ix.entries[[2]int{x, z}]; ok {
				chunks = append(chunks, entry)
			}
		}
	}
	return chunks
}

// Version is the version of the latest change.
func (ix *ChangeIndex) Version() uint32 {
	ix.mu.RLock()
	defer ix.mu.RUnlock()
	return ix.version
}

// Names returns the table SurfaceColumn.Block indexes. It only grows, and the returned slice
// stays valid for every entry already read.
func (ix *ChangeIndex) Names() []string {
	ix.mu.RLock()
	defer ix.mu.RUnlock()
	return ix.names
}

// Flush folds pending edits into the index now, for whoever cannot wait for the next tick.
func (ix *ChangeIndex) Flush() {
	ix.drain()
}
