package terrain

import (
	"crypto/sha1"
	"encoding/binary"
	"encoding/hex"
	"testing"
)

// jsFingerprint is the SHA-1 of the same chunks produced by the original JavaScript
// generator (js/chunkWorker.js + js/terrainGen.js) with the id table below.
const jsFingerprint = "12a83b901d6c228b4f499e062cf75acca4b320c4"

func jsBlockIDs() map[string]uint16 {
	names := []string{"air", "grass", "dirt", "stone", "cobblestone", "sand", "water", "bedrock", "coal_ore", "iron_ore", "gold_ore", "cactus", "tall_grass", "flower_red", "flower_yellow", "mushroom_red", "mushroom_brown"}
	for _, wood := range []string{"wood", "spruce_wood", "birch_wood", "jungle_wood", "dark_oak_wood", "cherry_wood", "maple_wood", "willow_wood", "acacia_wood"} {
		leaves := "leaves"
		if wood != "wood" {
			leaves = wood[:len(wood)-len("_wood")] + "_leaves"
		}
		names = append(names, wood, leaves)
	}
	ids := make(map[string]uint16, len(names))
	for i, name := range names {
		ids[name] = uint16(i)
	}
	return ids
}

func TestGeneratorMatchesJavaScript(t *testing.T) {
	ids := jsBlockIDs()
	h := sha1.New()
	buf := make([]byte, ChunkVolume*2)
	for cx := -6; cx < 6; cx += 2 {
		for cz := -6; cz < 6; cz += 2 {
			c := Generate(cx*17, cz*13)
			for i, p := range c.Blocks {
				name := c.Palette[p]
				// Moss replaces the top of a column and nothing else: under it, the same world as ever.
				if name == "moss" {
					lx, y, lz := chunkCell(i)
					x, z := c.X*ChunkSize+lx, c.Z*ChunkSize+lz
					s := ColumnSurface(x, z)
					if y != s.Height {
						t.Fatalf("moss at %d,%d,%d is not the top of its column (%d)", x, y, z, s.Height)
					}
					name = groundBlockAt(x, y, z, s, soilDepthAt(x, z, s))
				}
				id, ok := ids[name]
				if !ok {
					t.Fatalf("unexpected block %q", name)
				}
				binary.LittleEndian.PutUint16(buf[i*2:], id)
			}
			h.Write(buf)
		}
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != jsFingerprint {
		t.Fatalf("generator diverged from JavaScript: got %s, want %s", got, jsFingerprint)
	}
}

// chunkCell undoes ChunkIndex.
func chunkCell(index int) (lx, y, lz int) {
	layer := ChunkSize * ChunkSize
	return index % ChunkSize, index/layer + WorldMinY, (index / ChunkSize) % ChunkSize
}

// mossFingerprint is the SHA-1 of the block at the top of every column in mossRegion, one name per
// line. test/js/terrainGen.test.js reads this constant and gets the same from js/terrainGen.js.
const mossFingerprint = "85a1a4d8963c344fdf2cda9e35a242f2de324164"

// mossRegion holds forest and mountain lakes, and the columns around the origin.
var mossRegion = [4]int{-60, 40, 120, 260} // x0, z0, x1, z1

func TestMossMatchesJavaScript(t *testing.T) {
	h := sha1.New()
	moss := 0
	for x := mossRegion[0]; x < mossRegion[2]; x++ {
		for z := mossRegion[1]; z < mossRegion[3]; z++ {
			s := ColumnSurface(x, z)
			name := blockAt(x, s.Height, z, s, soilDepthAt(x, z, s))
			if name == "moss" {
				moss++
			}
			h.Write([]byte(name + "\n"))
		}
	}
	if moss < 20 {
		t.Fatalf("only %d moss blocks in the region: it no longer tests moss", moss)
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != mossFingerprint {
		t.Fatalf("moss diverged: got %s, want %s (%d moss blocks)", got, mossFingerprint, moss)
	}
}

func TestMossRule(t *testing.T) {
	counts := map[string]int{}
	for x := -700; x < 700; x++ {
		for z := -700; z < 700; z++ {
			s := ColumnSurface(x, z)
			if blockAt(x, s.Height, z, s, soilDepthAt(x, z, s)) != "moss" {
				continue
			}
			switch {
			case s.Climate.Mountain >= 0.10:
				counts["mountain"]++
			case s.Climate.Forest >= 0.5:
				counts["forest"]++
			default:
				t.Fatalf("moss at %d,%d outside forest and mountain: %+v", x, z, s.Climate)
			}
			if s.Height < WaterLevel || s.Height > WaterLevel+mossMaxAbove || s.Beach {
				t.Fatalf("moss at %d,%d on height %d, beach %v", x, z, s.Height, s.Beach)
			}
			near := false
			for dx := -mossReach; dx <= mossReach && !near; dx++ {
				for dz := -mossReach; dz <= mossReach && !near; dz++ {
					near = ColumnSurface(x+dx, z+dz).Height < WaterLevel
				}
			}
			if !near {
				t.Fatalf("moss at %d,%d with no water within %d blocks", x, z, mossReach)
			}
		}
	}
	if counts["forest"] < 100 || counts["mountain"] < 20 {
		t.Fatalf("too little moss: %v", counts)
	}
}

func TestGenerateIsDeterministicWithMoss(t *testing.T) {
	for _, at := range [][2]int{{1, 5}, {-1, 10}, {2, 6}, {-3, 10}} {
		a, b := Generate(at[0], at[1]), Generate(at[0], at[1])
		if a.Biome != b.Biome || len(a.Palette) != len(b.Palette) {
			t.Fatalf("chunk %v differs: %v and %v", at, a.Palette, b.Palette)
		}
		for i := range a.Blocks {
			if a.Palette[a.Blocks[i]] != b.Palette[b.Blocks[i]] {
				t.Fatalf("chunk %v differs at %d", at, i)
			}
		}
	}
}

// A tree never depends on moss, so whatever stands on a shore stands there anyway.
func TestMossLeavesTreesWhereTheyWere(t *testing.T) {
	seen := 0
	for x := -300; x < 300; x++ {
		for z := -300; z < 300; z++ {
			s := ColumnSurface(x, z)
			if treeAt(x, z, s) != "" && mossAt(x, z, s) {
				seen++
				c := Generate(floorChunk(x), floorChunk(z))
				lx, lz := x-c.X*ChunkSize, z-c.Z*ChunkSize
				if got := c.Get(lx, s.Height, lz); got != "moss" {
					t.Fatalf("under the tree at %d,%d: %s", x, z, got)
				}
				if got := c.Get(lx, s.Height+1, lz); got != treeAt(x, z, s) {
					t.Fatalf("the tree at %d,%d is now %s", x, z, got)
				}
			}
		}
	}
	if seen == 0 {
		t.Fatal("no tree on moss found to check")
	}
}

func floorChunk(v int) int {
	if v < 0 {
		return -((-v + ChunkSize - 1) / ChunkSize)
	}
	return v / ChunkSize
}

func BenchmarkGenerate(b *testing.B) {
	for i := 0; b.Loop(); i++ {
		Generate(i, i*3)
	}
}
