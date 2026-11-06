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
