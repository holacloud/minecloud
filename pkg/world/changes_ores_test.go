package world

import (
	"testing"

	"minecloud/pkg/terrain"
)

// firstChunkWith finds a generated chunk holding the block, and where in it.
func firstChunkWith(t *testing.T, want func(string) bool) (*terrain.Chunk, int) {
	t.Helper()
	for cx := -40; cx < 40; cx++ {
		for cz := -40; cz < 40; cz++ {
			c := terrain.Generate(cx, cz)
			for i, id := range c.Blocks {
				if want(c.Palette[id]) {
					return c, i
				}
			}
		}
	}
	t.Fatal("no such block in 6400 chunks")
	return nil, 0
}

func paletteName(c *terrain.Chunk, i int) string { return c.Palette[c.Blocks[i]] }

// A chunk saved before the generator moved its ores has nothing a player did in it: its ores are in
// other places, and it must not count as changed. What a player does to one still does.
func TestSavedOresAreNotChanges(t *testing.T) {
	gen, oreAt := firstChunkWith(t, terrain.IsNaturalOre)
	if changed, _, _, _ := diffSurface(gen.Clone(), gen, nil); changed {
		t.Fatal("a chunk differs from itself")
	}

	// Saved with stone where today's generator has an ore.
	old := gen.Clone()
	old.Blocks[oreAt] = old.PaletteID("stone")
	if changed, _, _, _ := diffSurface(old, gen, nil); changed {
		t.Fatal("stone where an ore is generated counts as a change")
	}

	// Saved with coal, rolled the old way, where today's generator has stone.
	stony, stoneAt := firstChunkWith(t, func(name string) bool { return name == "stone" })
	old = stony.Clone()
	old.Blocks[stoneAt] = old.PaletteID("coal_ore")
	if changed, _, _, _ := diffSurface(old, stony, nil); changed {
		t.Fatal("an old ore in today's stone counts as a change")
	}

	// A player mined the ore: that is a change.
	mined := gen.Clone()
	mined.Blocks[oreAt] = mined.PaletteID("air")
	if changed, _, _, _ := diffSurface(mined, gen, nil); !changed {
		t.Fatal("mining an ore is not a change")
	}
	// So is whatever a player puts in its place, other than plain ground.
	built := gen.Clone()
	built.Blocks[oreAt] = built.PaletteID("planks")
	if changed, _, _, _ := diffSurface(built, gen, nil); !changed {
		t.Fatal("planks where an ore is generated is not a change")
	}
	// And an ore a player placed in the open air.
	air := terrain.Generate(gen.X, gen.Z)
	for i := len(air.Blocks) - 1; i >= 0; i-- {
		if paletteName(air, i) == "air" {
			placed := air.Clone()
			placed.Blocks[i] = placed.PaletteID("gold_ore")
			if changed, columns, _, _ := diffSurface(placed, air, nil); !changed || len(columns) != 1 {
				t.Fatalf("gold placed in the air: changed %v, columns %v", changed, columns)
			}
			break
		}
	}
}

// savedWithTheOldFloor is a chunk as it was saved when bedrock lay at y=-5: that, half of y=-4, and
// nothing under it.
func savedWithTheOldFloor(gen *terrain.Chunk) *terrain.Chunk {
	saved := gen.Clone()
	stone, bedrock := saved.PaletteID("stone"), saved.PaletteID("bedrock")
	for lx := range terrain.ChunkSize {
		for lz := range terrain.ChunkSize {
			for y := terrain.WorldMinY; y < -5; y++ {
				saved.Blocks[terrain.ChunkIndex(lx, y, lz)] = 0
			}
			saved.Blocks[terrain.ChunkIndex(lx, -5, lz)] = bedrock
			top := stone
			if (lx+lz)%2 == 0 {
				top = bedrock
			}
			saved.Blocks[terrain.ChunkIndex(lx, -4, lz)] = top
		}
	}
	return saved
}

// A chunk saved with the old floor has nothing a player did in it, whatever the rock under it looks
// like today. Without this every chunk of a saved world would go on the viewer's list of changes.
func TestTheOldFloorIsNotAChange(t *testing.T) {
	gen := terrain.Generate(3, -7)
	saved := savedWithTheOldFloor(gen)
	changed, columns, _, _ := diffSurface(saved, gen, nil)
	if changed || len(columns) != 0 {
		t.Fatalf("an untouched old chunk: changed %v, columns %v", changed, columns)
	}

	// What a player does to one still counts: on top, in the rock, and under the old floor.
	const x, z = 4, 9
	var top int
	for y := terrain.WorldMaxY; y >= terrain.WorldMinY; y-- {
		if gen.Get(x, y, z) != "air" {
			top = y
			break
		}
	}
	built := saved.Clone()
	built.Set(x, top+1, z, "planks")
	if changed, columns, raised, _ := diffSurface(built, gen, nil); !changed || len(columns) != 1 || raised.Count != 1 {
		t.Fatalf("a block on top: changed %v, columns %v", changed, columns)
	}
	mined := saved.Clone()
	mined.Set(x, -2, z, "air")
	if changed, columns, _, _ := diffSurface(mined, gen, nil); !changed || len(columns) != 0 {
		t.Fatalf("a block mined underground: changed %v, columns %v", changed, columns)
	}
	under := saved.Clone()
	under.Set(x, -9, z, "planks")
	if changed, _, _, _ := diffSurface(under, gen, nil); !changed {
		t.Fatal("a block built under the old floor is not a change")
	}
}

// In today's deep rock, digging is digging: no old floor to mistake it for.
func TestDiggingTheDeepRockIsAChange(t *testing.T) {
	gen := terrain.Generate(3, -7)
	for _, y := range []int{-4, -5, -6, -13} {
		for lx := range terrain.ChunkSize {
			if gen.Get(lx, y, 9) == "bedrock" {
				continue
			}
			dug := gen.Clone()
			dug.Set(lx, y, 9, "air")
			if changed, columns, _, _ := diffSurface(dug, gen, nil); !changed || len(columns) != 0 {
				t.Fatalf("digging at y=%d: changed %v, columns %v", y, changed, columns)
			}
			break
		}
	}
}

// Once a chunk has really changed, its columns say what is really on top of it, even an old top
// where today's generator would show an outcrop.
func TestColumnsOfAChangedChunkTellTheTruth(t *testing.T) {
	const top = 80
	gen, _ := firstChunkWith(t, terrain.IsNaturalOre)
	stored := gen.Clone()
	stored.Blocks[terrain.ChunkIndex(3, top, 3)] = stored.PaletteID("planks")
	changed, columns, raised, _ := diffSurface(stored, gen, nil)
	if !changed || len(columns) != 1 || raised.Count != 1 {
		t.Fatalf("changed %v, columns %v, raised %+v", changed, columns, raised)
	}
}
