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
				id, ok := ids[c.Palette[p]]
				if !ok {
					t.Fatalf("unexpected block %q", c.Palette[p])
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

func BenchmarkGenerate(b *testing.B) {
	for i := 0; b.Loop(); i++ {
		Generate(i, i*3)
	}
}
