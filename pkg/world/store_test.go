package world

import (
	"testing"

	"minecloud/pkg/terrain"
)

func TestEncodeDecodeRoundTrip(t *testing.T) {
	c := terrain.Generate(3, -7)
	data, err := Encode(c)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Decode(data)
	if err != nil {
		t.Fatal(err)
	}
	if got.X != c.X || got.Z != c.Z || got.Biome != c.Biome {
		t.Fatalf("header mismatch: %+v vs %+v", got, c)
	}
	for i := range c.Blocks {
		if got.Palette[got.Blocks[i]] != c.Palette[c.Blocks[i]] {
			t.Fatalf("block %d differs", i)
		}
	}
	if len(data) > 4096 {
		t.Fatalf("encoded chunk unexpectedly large: %d bytes", len(data))
	}
}

func TestEditsPersistAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetBlock(-20, 40, 35, "gold_block"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetBlock(-20, 2, 35, ""); err != nil {
		t.Fatal(err)
	}
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := reopened.Block(-20, 40, 35); got != "gold_block" {
		t.Fatalf("placed block lost: %q", got)
	}
	if got, _ := reopened.Block(-20, 2, 35); got != "air" {
		t.Fatalf("removed block came back: %q", got)
	}
}

func TestLegacyEditsAppliedOnGeneration(t *testing.T) {
	calls := 0
	legacy := func(chunkX, chunkZ int) []Edit {
		calls++
		if chunkX == 0 && chunkZ == 0 {
			return []Edit{{X: 1, Y: 30, Z: 2, Block: "brick"}, {X: 1, Y: 0, Z: 2, Block: ""}}
		}
		return nil
	}
	s, err := Open(t.TempDir(), legacy)
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := s.Block(1, 30, 2); got != "brick" {
		t.Fatalf("legacy placement missing: %q", got)
	}
	if got, _ := s.Block(1, 0, 2); got != "air" {
		t.Fatalf("legacy removal missing: %q", got)
	}
	s.Block(5, 5, 5)
	if calls != 1 {
		t.Fatalf("legacy edits requested %d times, want once per generated chunk", calls)
	}
}

// Block states (js/blockShapes.js) live in the block name, so a door toggled open or stairs
// facing east survive a save and reload, and replacing one state with another (opening a door)
// leaves no trace of the old one.
func TestBlockStateNamesPersist(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	want := map[[3]int]string{
		{5, 9, 5}:  "oak_door",
		{5, 10, 5}: "oak_door:upper:n:left:open",
		{6, 10, 5}: "stone_stairs:e:top",
		{7, 10, 5}: "oak_fence",
	}
	if err := s.SetBlock(5, 10, 5, "oak_door:upper:n:left:closed"); err != nil {
		t.Fatal(err)
	}
	for pos, name := range want {
		if err := s.SetBlock(pos[0], pos[1], pos[2], name); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	for pos, name := range want {
		if got, _ := reopened.Block(pos[0], pos[1], pos[2]); got != name {
			t.Fatalf("block at %v: got %q, want %q", pos, got, name)
		}
	}
	data, err := reopened.Encoded(0, 0)
	if err != nil {
		t.Fatal(err)
	}
	chunk, err := Decode(data)
	if err != nil {
		t.Fatal(err)
	}
	for i, name := range chunk.Palette {
		if name != "oak_door:upper:n:left:closed" {
			continue
		}
		for _, id := range chunk.Blocks {
			if int(id) == i {
				t.Fatalf("the replaced state is still in the chunk")
			}
		}
	}
}
