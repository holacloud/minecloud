package world

import (
	"testing"

	"minecloud/pkg/terrain"
)

// asSavedBeforeFossils is a chunk as it was saved when the world had no fossils: the same, with the
// ground they lie in where each one is.
func asSavedBeforeFossils(gen *terrain.Chunk) (saved *terrain.Chunk, fossils int) {
	saved = gen.Clone()
	layer := terrain.ChunkSize * terrain.ChunkSize
	for i := range saved.Blocks {
		name := paletteName(gen, i)
		if !terrain.IsNaturalFossil(name) {
			continue
		}
		fossils++
		ground := "stone"
		if name == "old_bones" {
			// The soil of its column: what lies right over it, or dirt under the grass.
			if ground = paletteName(gen, i+layer); ground != "sand" {
				ground = "dirt"
			}
		}
		saved.Blocks[i] = saved.PaletteID(ground)
	}
	return saved, fossils
}

// A chunk saved before the world had fossils has nothing a player did in it: where today's generator
// has a fossil, it has the rock or the soil that was there. Without this, every chunk of a saved
// world with a fossil in it (nearly all of them) would go on the viewer's list of changes.
func TestSavedGroundWhereAFossilIsNowIsNotAChange(t *testing.T) {
	seen := map[string]bool{}
	checked := 0
	for cx := -40; cx < 40 && len(seen) < 7; cx++ {
		for cz := -40; cz < 40 && len(seen) < 7; cz++ {
			gen := terrain.Generate(cx, cz)
			fresh := false
			for _, name := range gen.Palette {
				if terrain.IsNaturalFossil(name) && !seen[name] {
					seen[name] = true
					fresh = true
				}
			}
			if !fresh {
				continue
			}
			saved, fossils := asSavedBeforeFossils(gen)
			if fossils == 0 {
				t.Fatalf("chunk %d,%d names a fossil and holds none", cx, cz)
			}
			if changed, columns, _, _ := diffSurface(saved, gen, nil); changed || len(columns) != 0 {
				t.Fatalf("chunk %d,%d, saved before its %d fossils: changed %v, columns %v", cx, cz, fossils, changed, columns)
			}
			checked++
		}
	}
	if len(seen) != 7 {
		t.Fatalf("only these fossils in 6400 chunks: %v", seen)
	}
	if checked < 3 {
		t.Fatalf("only %d chunks checked", checked)
	}
}

// What a player does to a fossil still counts, and so does one put where none belongs.
func TestWhatAPlayerDoesToAFossilIsAChange(t *testing.T) {
	gen, fossilAt := firstChunkWith(t, terrain.IsNaturalFossil)
	if changed, _, _, _ := diffSurface(gen.Clone(), gen, nil); changed {
		t.Fatal("a chunk differs from itself")
	}

	// Mined: the fossil is in somebody's pocket.
	mined := gen.Clone()
	mined.Blocks[fossilAt] = mined.PaletteID("air")
	if changed, _, _, _ := diffSurface(mined, gen, nil); !changed {
		t.Fatal("mining a fossil is not a change")
	}
	built := gen.Clone()
	built.Blocks[fossilAt] = built.PaletteID("planks")
	if changed, _, _, _ := diffSurface(built, gen, nil); !changed {
		t.Fatal("planks where a fossil is generated is not a change")
	}

	// Saved when the numbers were other: a fossil where today's generator has plain rock, and an
	// ore, rolled the old way, where it has a fossil.
	stony, stoneAt := firstChunkWith(t, func(name string) bool { return name == "stone" })
	old := stony.Clone()
	old.Blocks[stoneAt] = old.PaletteID("fossil_rock")
	if changed, _, _, _ := diffSurface(old, stony, nil); changed {
		t.Fatal("an old fossil in today's stone counts as a change")
	}
	old = gen.Clone()
	old.Blocks[fossilAt] = old.PaletteID("coal_ore")
	if changed, _, _, _ := diffSurface(old, gen, nil); changed {
		t.Fatal("an old ore where a fossil is generated counts as a change")
	}

	// A fossil a player placed in the open air, and one put in place of grass.
	for i := len(gen.Blocks) - 1; i >= 0; i-- {
		if paletteName(gen, i) == "air" {
			placed := gen.Clone()
			placed.Blocks[i] = placed.PaletteID("amber_rock")
			if changed, columns, _, _ := diffSurface(placed, gen, nil); !changed || len(columns) != 1 {
				t.Fatalf("amber placed in the air: changed %v, columns %v", changed, columns)
			}
			break
		}
	}
	grassy, grassAt := firstChunkWith(t, func(name string) bool { return name == "grass" })
	onTop := grassy.Clone()
	onTop.Blocks[grassAt] = onTop.PaletteID("old_bones")
	if changed, _, _, _ := diffSurface(onTop, grassy, nil); !changed {
		t.Fatal("old bones in place of the grass is not a change")
	}
}
