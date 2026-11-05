package world

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"minecloud/pkg/terrain"
)

func plantsAreSeeThrough(name string) bool {
	return name == "tall_grass" || name == "torch"
}

func newTestIndex(t *testing.T, s *Store) *ChangeIndex {
	t.Helper()
	ix := NewChangeIndex(s, plantsAreSeeThrough, nil)
	ix.scanPause = 0
	return ix
}

// Runs the index until its startup scan is done, and leaves it running for the test.
func runIndex(t *testing.T, ix *ChangeIndex) {
	t.Helper()
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		ix.Run(stop)
		close(done)
	}()
	t.Cleanup(func() {
		close(stop)
		<-done
	})
	for ix.Scanning() {
		time.Sleep(time.Millisecond)
	}
}

// A column of a chunk with bare dry ground on top, for tests that need a place to dig and build.
func groundColumn(t *testing.T, chunkX, chunkZ int) (x, top, z int) {
	t.Helper()
	generated := terrain.Generate(chunkX, chunkZ)
	skip := skipFlags(generated.Palette, plantsAreSeeThrough)
	for lz := range terrain.ChunkSize {
		for lx := range terrain.ChunkSize {
			x, z = chunkX*terrain.ChunkSize+lx, chunkZ*terrain.ChunkSize+lz
			height := terrain.ColumnSurface(x, z).Height
			if y, block := columnTop(generated, skip, lx, lz); y == height && generated.Palette[block] != "water" {
				return x, height, z
			}
		}
	}
	t.Fatalf("no bare ground in chunk %d,%d", chunkX, chunkZ)
	return 0, 0, 0
}

func columnAt(entry *ChangedChunk, lx, lz int) (SurfaceColumn, bool) {
	for _, column := range entry.Columns {
		if int(column.Index) == lz<<4|lx {
			return column, true
		}
	}
	return SurfaceColumn{}, false
}

func TestGeneratedAndSavedChunkIsNotAChange(t *testing.T) {
	dir := t.TempDir()
	s, _ := Open(dir, nil)
	if _, err := s.Encoded(3, -2); err != nil {
		t.Fatal(err)
	}
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	reopened, _ := Open(dir, nil)
	ix := newTestIndex(t, reopened)
	runIndex(t, ix)
	if chunks, _, _ := ix.Changes(0, 10); len(chunks) != 0 {
		t.Fatalf("a chunk nobody touched is listed: %+v", chunks[0])
	}
}

func TestEditsAreFoundInAWorldAlreadySaved(t *testing.T) {
	dir := t.TempDir()
	s, _ := Open(dir, nil)
	x, top, z := groundColumn(t, 4, 9)
	s.SetBlock(x, top+20, z, "gold_block")
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}

	// A new run of the server knows nothing but the files.
	reopened, _ := Open(dir, nil)
	ix := newTestIndex(t, reopened)
	runIndex(t, ix)
	chunks, next, more := ix.Changes(0, 10)
	if len(chunks) != 1 || more || next != ix.Version() {
		t.Fatalf("changes = %d chunks, next %d, more %v", len(chunks), next, more)
	}
	entry := chunks[0]
	if entry.X != 4 || entry.Z != 9 || len(entry.Columns) != 1 {
		t.Fatalf("entry = %+v", entry)
	}
	column := entry.Columns[0]
	if int(column.Y) != top+20 || ix.Names()[column.Block] != "gold_block" || int(column.Index) != local(z)<<4|local(x) {
		t.Fatalf("column = %+v (%s)", column, ix.Names()[column.Block])
	}
	if entry.Raised.Count != 1 || entry.Lowered.Count != 0 || int(entry.Raised.Top) != top+20 {
		t.Fatalf("summaries = %+v %+v", entry.Raised, entry.Lowered)
	}
}

func TestDiggingLowersAColumn(t *testing.T) {
	s, _ := Open(t.TempDir(), nil)
	ix := newTestIndex(t, s)
	runIndex(t, ix)
	x, top, z := groundColumn(t, -3, 2)
	// Whatever grows on it goes too, then three blocks of ground.
	for y := terrain.WorldMaxY; y > top-3; y-- {
		s.SetBlock(x, y, z, "")
	}
	ix.Flush()
	chunks, _, _ := ix.Changes(0, 10)
	if len(chunks) != 1 {
		t.Fatalf("%d chunks listed", len(chunks))
	}
	column, ok := columnAt(chunks[0], local(x), local(z))
	if !ok || int(column.Y) != top-3 {
		t.Fatalf("dug column = %+v, %v, want top at %d", column, ok, top-3)
	}
	if chunks[0].Lowered.Count != 1 || chunks[0].Raised.Count != 0 {
		t.Fatalf("summaries = %+v %+v", chunks[0].Raised, chunks[0].Lowered)
	}
}

func TestOnlyColumnsWhoseTopMovedAreListed(t *testing.T) {
	s, _ := Open(t.TempDir(), nil)
	ix := newTestIndex(t, s)
	runIndex(t, ix)
	x, top, z := groundColumn(t, 11, 11)

	// Underground: the chunk is changed, but nothing shows from above.
	s.SetBlock(x, top-2, z, "gold_block")
	// A see-through block on top changes nothing either.
	s.SetBlock(x+1, terrain.ColumnSurface(x+1, z).Height+30, z, "torch")
	ix.Flush()
	chunks, _, _ := ix.Changes(0, 10)
	if len(chunks) != 1 || len(chunks[0].Columns) != 0 {
		t.Fatalf("chunks = %+v", chunks)
	}

	// Same height, other block: seen from above, so listed.
	s.SetBlock(x, top, z, "gold_block")
	ix.Flush()
	chunks, _, _ = ix.Changes(0, 10)
	if len(chunks) != 1 || len(chunks[0].Columns) != 1 || chunks[0].Raised.Count != 1 {
		t.Fatalf("after painting: %+v", chunks[0])
	}
}

func TestPuttingItBackIsStillReported(t *testing.T) {
	s, _ := Open(t.TempDir(), nil)
	ix := newTestIndex(t, s)
	runIndex(t, ix)
	x, top, z := groundColumn(t, 6, 6)
	original, _ := s.Block(x, top+40, z)
	s.SetBlock(x, top+40, z, "stone")
	ix.Flush()
	version := ix.Version()
	s.SetBlock(x, top+40, z, original)
	ix.Flush()

	// Whoever saw the block needs to hear it is gone.
	chunks, _, _ := ix.Changes(version, 10)
	if len(chunks) != 1 || len(chunks[0].Columns) != 0 {
		t.Fatalf("chunks after restoring = %+v", chunks)
	}
}

func TestChangesPagesThroughEveryChunkOnce(t *testing.T) {
	s, _ := Open(t.TempDir(), nil)
	ix := newTestIndex(t, s)
	runIndex(t, ix)
	const count = 25
	for i := range count {
		x, top, z := groundColumn(t, i, -i)
		s.SetBlock(x, top+30, z, "stone")
		ix.Flush()
	}
	// Edit the first one again: it moves to the end and appears once.
	x, top, z := groundColumn(t, 0, 0)
	s.SetBlock(x, top+31, z, "stone")
	ix.Flush()

	seen := map[int]int{}
	since := uint32(0)
	for pages := 0; ; pages++ {
		if pages > count {
			t.Fatal("pages never end")
		}
		chunks, next, more := ix.Changes(since, 10)
		if len(chunks) > 10 {
			t.Fatalf("page of %d", len(chunks))
		}
		for _, chunk := range chunks {
			seen[chunk.X]++
		}
		since = next
		if !more {
			break
		}
	}
	if since != ix.Version() || len(seen) != count {
		t.Fatalf("since %d of %d, %d chunks seen", since, ix.Version(), len(seen))
	}
	for x, times := range seen {
		if times != 1 {
			t.Fatalf("chunk %d seen %d times", x, times)
		}
	}
}

func TestLogStaysBounded(t *testing.T) {
	s, _ := Open(t.TempDir(), nil)
	ix := newTestIndex(t, s)
	runIndex(t, ix)
	x, top, z := groundColumn(t, 1, 1)
	for i := range 2100 {
		ix.refreshForTest(x, top+1+i%100, z, s)
	}
	if len(ix.log) > 2*len(ix.entries)+1025 {
		t.Fatalf("log of %d items for %d chunks", len(ix.log), len(ix.entries))
	}
	if chunks, _, _ := ix.Changes(0, 10); len(chunks) != 1 {
		t.Fatalf("%d chunks after compaction", len(chunks))
	}
}

func (ix *ChangeIndex) refreshForTest(x, y, z int, s *Store) {
	s.SetBlock(x, y, z, "stone")
	ix.Flush()
}

func TestSummaryIgnoresAFlagpole(t *testing.T) {
	var columns []SurfaceColumn
	for i := range 100 {
		columns = append(columns, SurfaceColumn{Index: uint8(i), Y: 20, Block: 1})
	}
	columns = append(columns, SurfaceColumn{Index: 200, Y: 90, Block: 2})
	summary := summarize(columns)
	if summary.Count != 101 || summary.Top != 20 || summary.Block != 1 {
		t.Fatalf("summary = %+v", summary)
	}
}

func TestSnapshotOfAnUnstoredChunkCreatesNothing(t *testing.T) {
	dir := t.TempDir()
	s, _ := Open(dir, nil)
	taken := false
	s.legacy = func(int, int) []Edit { taken = true; return nil }
	chunk, err := s.Snapshot(40, 40)
	if err != nil || chunk.X != 40 {
		t.Fatalf("chunk = %v, err %v", chunk, err)
	}
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if taken || len(s.entries) != 0 {
		t.Fatalf("legacy taken %v, %d loaded", taken, len(s.entries))
	}
	if _, err := os.Stat(s.path(40, 40)); !os.IsNotExist(err) {
		t.Fatalf("a file appeared: %v", err)
	}
	if entries, _ := os.ReadDir(filepath.Join(dir)); len(entries) != 0 {
		t.Fatalf("%d entries in the store's directory", len(entries))
	}
}

func TestLegacyEditsShowWithoutBeingTaken(t *testing.T) {
	x, top, z := groundColumn(t, 8, 8)
	edits := []Edit{{X: x, Y: top + 10, Z: z, Block: "brick"}}
	taken := 0
	s, _ := Open(t.TempDir(), func(chunkX, chunkZ int) []Edit {
		taken++
		return edits
	})
	s.SetLegacyPreview(func(chunkX, chunkZ int) []Edit { return edits })
	ix := NewChangeIndex(s, plantsAreSeeThrough, func() [][2]int { return [][2]int{{8, 8}} })
	ix.scanPause = 0
	runIndex(t, ix)

	chunks, _, _ := ix.Changes(0, 10)
	if len(chunks) != 1 || len(chunks[0].Columns) != 1 || int(chunks[0].Columns[0].Y) != top+10 {
		t.Fatalf("chunks = %+v", chunks)
	}
	if taken != 0 || len(s.entries) != 0 {
		t.Fatalf("legacy edits taken %d times, %d chunks loaded", taken, len(s.entries))
	}

	// Really generating it folds the same edits and reports it.
	version := ix.Version()
	if _, err := s.Block(x, top, z); err != nil {
		t.Fatal(err)
	}
	ix.Flush()
	if taken != 1 || ix.Version() == version {
		t.Fatalf("taken %d, version %d after %d", taken, ix.Version(), version)
	}
}

func TestPeekSeesEverythingAndChangesNothing(t *testing.T) {
	dir := t.TempDir()
	s, _ := Open(dir, nil)

	// Not stored: generated for the answer and forgotten.
	data, err := s.Peek(50, 50)
	if err != nil {
		t.Fatal(err)
	}
	if chunk, err := Decode(data); err != nil || chunk.X != 50 {
		t.Fatalf("chunk %v, err %v", chunk, err)
	}
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 || len(s.entries) != 0 {
		t.Fatalf("%d files, %d loaded", len(entries), len(s.entries))
	}

	// Edited and not flushed: seen, from memory.
	s.SetBlock(5, 150, 5, "stone")
	data, _ = s.Peek(0, 0)
	if chunk, _ := Decode(data); chunk.Get(5, 150, 5) != "stone" {
		t.Fatal("an unflushed edit is not seen")
	}
	if s.entries[[2]int{0, 0}].encoded != nil {
		t.Fatal("Peek filled the store's cache")
	}

	// Flushed and evicted: seen, from disk, and not loaded back.
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	delete(s.entries, [2]int{0, 0})
	data, _ = s.Peek(0, 0)
	if chunk, _ := Decode(data); chunk.Get(5, 150, 5) != "stone" {
		t.Fatal("a saved edit is not seen")
	}
	if len(s.entries) != 0 {
		t.Fatalf("%d loaded", len(s.entries))
	}
}

func TestPeekShowsLegacyEditsWithoutTakingThem(t *testing.T) {
	taken := false
	s, _ := Open(t.TempDir(), func(int, int) []Edit { taken = true; return nil })
	s.SetLegacyPreview(func(int, int) []Edit { return []Edit{{X: 1, Y: 150, Z: 1, Block: "brick"}} })
	data, err := s.Peek(0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if chunk, _ := Decode(data); chunk.Get(1, 150, 1) != "brick" {
		t.Fatal("a legacy edit is not seen")
	}
	if taken {
		t.Fatal("the legacy edits were taken")
	}
}

func TestParseChunkFile(t *testing.T) {
	for name, want := range map[string]bool{"c.3.-7.bin": true, "c.-3.7.bin": true, "c.3.bin": false, "c.3.4.bin.tmp": false, "x.3.4.bin": false, "c.3.4.bin ": false} {
		x, z, ok := parseChunkFile(name)
		if ok != want {
			t.Errorf("%q: ok = %v", name, ok)
		}
		if ok && (x != 3 && x != -3 || z != 7 && z != -7) {
			t.Errorf("%q: %d, %d", name, x, z)
		}
	}
}

func TestIndexWhileTheWorldChanges(t *testing.T) {
	s, _ := Open(t.TempDir(), nil)
	ix := newTestIndex(t, s)
	runIndex(t, ix)
	var wg sync.WaitGroup
	for worker := range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range 100 {
				s.SetBlock(worker*terrain.ChunkSize, 100+i, i%8*terrain.ChunkSize, "stone")
				ix.Flush()
				ix.Changes(0, 8)
				ix.Region(worker-1, 0, worker+1, 8)
				_ = ix.Names()
				s.Snapshot(worker, i%8)
				s.Peek(worker, i%8)
			}
		}()
	}
	wg.Wait()
	ix.Flush()
	if chunks, _, _ := ix.Changes(0, 100); len(chunks) != 32 {
		t.Fatalf("%d chunks", len(chunks))
	}
}

// How long an edit holds the store: it must not wait for the comparison.
func BenchmarkSetBlockWithIndex(b *testing.B) {
	s, _ := Open(b.TempDir(), nil)
	NewChangeIndex(s, nil, nil)
	for i := 0; b.Loop(); i++ {
		s.SetBlock(i%16, 40+i%50, 0, "stone")
	}
}

func BenchmarkRefreshChunk(b *testing.B) {
	s, _ := Open(b.TempDir(), nil)
	ix := NewChangeIndex(s, plantsAreSeeThrough, nil)
	s.SetBlock(3, 60, 3, "stone")
	for b.Loop() {
		ix.refresh([2]int{0, 0})
	}
}

func BenchmarkSnapshotLoaded(b *testing.B) {
	s, _ := Open(b.TempDir(), nil)
	s.SetBlock(3, 60, 3, "stone")
	for b.Loop() {
		s.Snapshot(0, 0)
	}
}
