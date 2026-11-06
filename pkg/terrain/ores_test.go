package terrain

import (
	"crypto/sha1"
	"encoding/hex"
	"sort"
	"strings"
	"sync"
	"testing"
)

var allOres = []string{"coal_ore", "iron_ore", "copper_ore", "tin_ore", "zinc_ore", "lead_ore", "silver_ore", "gold_ore"}

// oreFingerprint is the SHA-1 of every terrain cell of oreRegion, bottom to top, one name per line,
// ores and all. test/js/ores.test.js reads this constant and gets the same from js/terrainGen.js:
// this is what holds the two generators together now that the older fingerprints look past ores.
const oreFingerprint = "721f90e49adb295a235467992b1bdae137d166c2"

// oreRegion holds plains, forest, desert and mountain ground, with every ore of the game.
var oreRegion = [4]int{-260, -100, -100, 60} // x0, z0, x1, z1

func TestOresMatchJavaScript(t *testing.T) {
	h := sha1.New()
	seen := map[string]int{}
	for x := oreRegion[0]; x < oreRegion[2]; x++ {
		for z := oreRegion[1]; z < oreRegion[3]; z++ {
			s := ColumnSurface(x, z)
			soil := soilDepthAt(x, z, s)
			for y := BedrockY; y <= s.Height; y++ {
				name := blockAt(x, y, z, s, soil)
				if IsNaturalOre(name) {
					seen[name]++
				}
				h.Write([]byte(name + "\n"))
			}
		}
	}
	for _, ore := range allOres {
		if seen[ore] == 0 {
			t.Errorf("no %s in the region: it no longer tests it (%v)", ore, seen)
		}
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != oreFingerprint {
		t.Fatalf("ores diverged: got %s, want %s (%v)", got, oreFingerprint, seen)
	}
}

func TestOreTablesFitTheirLimits(t *testing.T) {
	maxRadius := 0.0
	for ore, kind := range veinKinds {
		if kind.Radius > maxRadius {
			maxRadius = kind.Radius
		}
		if float64(kind.Radius-veinSkin) < 0.87 {
			t.Errorf("%s: a core thinner than half a block's diagonal may fall apart", ore)
		}
		if _, ok := outcropKinds[ore]; !ok {
			t.Errorf("%s has no outcrop", ore)
		}
	}
	if maxRadius*maxRadius != veinMaxRadius2 {
		t.Errorf("veinMaxRadius2 is %v, the thickest vein %v", veinMaxRadius2, maxRadius)
	}
	if maxRadius > veinMargin {
		t.Errorf("a vein of radius %v leaves its cell", maxRadius)
	}
	for biome, zones := range veinTable {
		for zone, table := range zones {
			sum := 0.0
			for _, entry := range table {
				sum += entry.Chance
				if _, ok := veinKinds[entry.Ore]; !ok {
					t.Errorf("%s: unknown ore %s", biome, entry.Ore)
				}
			}
			if sum > veinMaxTotal {
				t.Errorf("%s zone %d: %v of the cells, over the %v that are looked at", biome, zone, sum, veinMaxTotal)
			}
		}
	}
	for biome, table := range outcropTable {
		sum := 0.0
		for _, entry := range table {
			sum += entry.Chance
			kind := outcropKinds[entry.Ore]
			if kind.Radius > outcropMargin || kind.Depth > outcropMaxDepth {
				t.Errorf("%s does not fit its cell", entry.Ore)
			}
		}
		if sum > outcropMaxTotal {
			t.Errorf("%s: %v of the patches, over %v", biome, sum, outcropMaxTotal)
		}
	}
}

// The memo of Generate only saves time: every block is what the point question says, whichever
// order the chunks are asked for.
func TestGenerateAgreesWithThePointQuestion(t *testing.T) {
	for _, at := range [][2]int{{-11, -8}, {-12, -8}, {0, 0}, {30, -40}, {-1, -1}} {
		c := Generate(at[0], at[1])
		for lx := range ChunkSize {
			for lz := range ChunkSize {
				x, z := c.X*ChunkSize+lx, c.Z*ChunkSize+lz
				s := ColumnSurface(x, z)
				soil := soilDepthAt(x, z, s)
				for y := BedrockY; y <= s.Height; y++ {
					got := c.Get(lx, y, lz)
					want := blockAt(x, y, z, s, soil)
					if got != want {
						t.Fatalf("%d,%d,%d is %s in the chunk and %s by itself", x, y, z, got, want)
					}
				}
			}
		}
	}
}

// Veins cross chunk borders, and each side of a border agrees with the other about them.
func TestVeinsCrossChunkBordersSeamlessly(t *testing.T) {
	crossing := 0
	var chunks = map[[2]int]*Chunk{}
	get := func(cx, cz int) *Chunk {
		if c, ok := chunks[[2]int{cx, cz}]; ok {
			return c
		}
		c := Generate(cx, cz)
		chunks[[2]int{cx, cz}] = c
		return c
	}
	for cx := -20; cx < 20; cx++ {
		for cz := -20; cz < 20; cz++ {
			a, b := get(cx, cz), get(cx+1, cz)
			for lz := range ChunkSize {
				for y := BedrockY; y < 40; y++ {
					left, right := a.Get(ChunkSize-1, y, lz), b.Get(0, y, lz)
					if IsNaturalOre(left) && left == right {
						crossing++
					}
				}
			}
			// The same chunk, asked for again after its neighbour, comes out the same.
			again := Generate(cx, cz)
			for i := range a.Blocks {
				if a.Palette[a.Blocks[i]] != again.Palette[again.Blocks[i]] {
					t.Fatalf("chunk %d,%d changed at %d", cx, cz, i)
				}
			}
		}
	}
	if crossing < 200 {
		t.Fatalf("only %d pairs of ore across a chunk border in 1600 chunks", crossing)
	}
}

// A vein is whole across the border: take the veins of the cells that straddle one, and read them
// block by block from the chunks on either side, each chunk generated on its own.
func TestAVeinIsTheSameFromEitherChunk(t *testing.T) {
	both := 0
	generated := map[[2]int]*Chunk{}
	chunkAt := func(x, z int) *Chunk {
		key := [2]int{floorDiv(x, ChunkSize), floorDiv(z, ChunkSize)}
		if generated[key] == nil {
			generated[key] = Generate(key[0], key[1])
		}
		return generated[key]
	}
	for cellX := -25; cellX < 25; cellX++ {
		for cellZ := -25; cellZ < 25; cellZ++ {
			minX := cellX * veinCellXZ
			if floorDiv(minX, ChunkSize) == floorDiv(minX+veinCellXZ-1, ChunkSize) {
				continue
			}
			border := (floorDiv(minX, ChunkSize) + 1) * ChunkSize
			shift := int(hash2(cellX, cellZ, 3100) * veinCellY)
			for cellY := -1; cellY < 2; cellY++ {
				cell := veinCellOf(cellX, cellY, cellZ, shift)
				if cell.roll >= veinMaxTotal || veinOre(cell) == "" {
					continue
				}
				left, right := 0, 0
				for x := minX; x < minX+veinCellXZ; x++ {
					for z := cellZ * veinCellXZ; z < (cellZ+1)*veinCellXZ; z++ {
						s := ColumnSurface(x, z)
						soil := soilDepthAt(x, z, s)
						for y := cellY*veinCellY - shift; y < (cellY+1)*veinCellY-shift; y++ {
							if y < BedrockY || s.Height-y <= soil {
								continue
							}
							c := chunkAt(x, z)
							got := c.Get(x-c.X*ChunkSize, y, z-c.Z*ChunkSize)
							if want := blockAt(x, y, z, s, soil); got != want {
								t.Fatalf("%d,%d,%d: %s in its chunk, %s by itself", x, y, z, got, want)
							}
							if IsNaturalOre(got) {
								if x < border {
									left++
								} else {
									right++
								}
							}
						}
					}
				}
				if left > 0 && right > 0 {
					both++
				}
			}
		}
	}
	if both < 30 {
		t.Fatalf("only %d veins found on both sides of a chunk border", both)
	}
}

// Veins are lumps of ore and not loose blocks: nearly all the ore lies in clusters.
func TestVeinsAreConnectedClusters(t *testing.T) {
	const radius = 12 // chunks
	type at struct{ x, y, z int }
	blocks := map[at]string{}
	for cx := -radius; cx < radius; cx++ {
		for cz := -radius; cz < radius; cz++ {
			c := Generate(cx, cz)
			for i, id := range c.Blocks {
				if name := c.Palette[id]; IsNaturalOre(name) {
					lx, y, lz := chunkCell(i)
					blocks[at{c.X*ChunkSize + lx, y, c.Z*ChunkSize + lz}] = name
				}
			}
		}
	}
	sizes := map[string][]int{}
	totals := map[string]int{}
	inClusters := map[string]int{}
	seen := map[at]bool{}
	for start, name := range blocks {
		if seen[start] {
			continue
		}
		seen[start] = true
		stack := []at{start}
		n := 0
		for len(stack) > 0 {
			p := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			n++
			for _, d := range []at{{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}} {
				q := at{p.x + d.x, p.y + d.y, p.z + d.z}
				if blocks[q] == name && !seen[q] {
					seen[q] = true
					stack = append(stack, q)
				}
			}
		}
		sizes[name] = append(sizes[name], n)
		totals[name] += n
		if n >= 4 {
			inClusters[name] += n
		}
	}
	for _, ore := range []string{"coal_ore", "iron_ore", "copper_ore", "tin_ore", "lead_ore"} {
		if totals[ore] == 0 {
			t.Errorf("no %s", ore)
			continue
		}
		if share := float64(inClusters[ore]) / float64(totals[ore]); share < 0.95 {
			t.Errorf("%s: only %.0f%% of it in clusters of 4 or more", ore, 100*share)
		}
		sort.Ints(sizes[ore])
		if median := sizes[ore][len(sizes[ore])/2]; median < 8 {
			t.Errorf("%s: its median cluster has %d blocks", ore, median)
		}
	}
}

// Galena comes with pockets of silver and zinc, far fewer than of lead.
func TestSilverAndZincComeWithLead(t *testing.T) {
	lead, silver, zinc := 0, 0, 0
	for x := -500; x < 500; x++ {
		for z := -500; z < 500; z++ {
			for y := 0; y < 3; y++ {
				switch veinOreAt(x, y, z, nil) {
				case "lead_ore":
					lead++
				case "silver_ore":
					silver++
				case "zinc_ore":
					zinc++
				}
			}
		}
	}
	if lead == 0 || silver == 0 || zinc == 0 || silver > lead || zinc > lead*2 {
		t.Fatalf("lead %d, silver %d, zinc %d", lead, silver, zinc)
	}
}

// An outcrop takes only ground that is its to take.
func TestOutcropRules(t *testing.T) {
	seen := map[string]int{}
	onSlope := 0
	for x := -1000; x < 1000; x++ {
		for z := -1000; z < 1000; z++ {
			s := ColumnSurface(x, z)
			soil := soilDepthAt(x, z, s)
			top := blockAt(x, s.Height, z, s, soil)
			if !IsNaturalOre(top) {
				continue
			}
			seen[top]++
			if s.Height < WaterLevel {
				t.Fatalf("ore under water at %d,%d", x, z)
			}
			if s.Beach {
				t.Fatalf("ore on a beach at %d,%d", x, z)
			}
			if s.Biome != "desert" && mossAt(x, z, s) {
				t.Fatalf("ore in place of moss at %d,%d", x, z)
			}
			if treeAt(x, z, s) != "" || decoratedAt(x, z, s) {
				t.Fatalf("something grows on the ore at %d,%d", x, z)
			}
			if s.Biome == "rocky" {
				if ground := groundBlockAt(x, s.Height, z, s, soil); ground != "stone" && ground != "cobblestone" {
					t.Fatalf("ore on %s in the mountains at %d,%d", ground, x, z)
				}
			} else {
				if !steepAt(x, z, s) {
					t.Fatalf("ore on flat ground at %d,%d (%s)", x, z, s.Biome)
				}
				onSlope++
			}
		}
	}
	for _, ore := range allOres {
		if seen[ore] == 0 {
			t.Errorf("no outcrop of %s in 4 million columns: %v", ore, seen)
		}
	}
	if onSlope < 100 {
		t.Errorf("only %d outcrops on slopes outside the mountains", onSlope)
	}
	if !(seen["coal_ore"] > seen["copper_ore"] && seen["iron_ore"] > seen["copper_ore"] && seen["copper_ore"] > seen["silver_ore"] && seen["silver_ore"] > seen["gold_ore"]) {
		t.Errorf("the order of how common they are is off: %v", seen)
	}
}

// Nothing stands oddly on an outcrop in the real chunks either: over its top there is only air.
func TestOverAnOutcropThereIsAir(t *testing.T) {
	checked := 0
	for cx := -40; cx < 40; cx++ {
		for cz := -40; cz < 40; cz++ {
			c := Generate(cx, cz)
			for lx := range ChunkSize {
				for lz := range ChunkSize {
					x, z := c.X*ChunkSize+lx, c.Z*ChunkSize+lz
					s := ColumnSurface(x, z)
					if !IsNaturalOre(c.Get(lx, s.Height, lz)) {
						continue
					}
					checked++
					// A branch of the tree next door may hang there; nothing grows from the ore itself.
					if above := c.Get(lx, s.Height+1, lz); above != "air" && !strings.HasSuffix(above, "leaves") {
						t.Fatalf("%s over the ore at %d,%d", above, x, z)
					}
				}
			}
		}
	}
	if checked < 200 {
		t.Fatalf("only %d outcrops checked", checked)
	}
}

// Coal starts every chain, so there is some in reach from the very start, and in every land.
func TestCoalIsReachableEarly(t *testing.T) {
	best := 1 << 30
	for x := -200; x < 200; x++ {
		for z := -200; z < 200; z++ {
			s := ColumnSurface(x, z)
			if blockAt(x, s.Height, z, s, soilDepthAt(x, z, s)) == "coal_ore" {
				if d := x*x + z*z; d < best {
					best = d
				}
			}
		}
	}
	if best > 200*200 {
		t.Fatal("no coal in sight within 200 blocks of the origin")
	}
	byBiome := map[string]int{}
	for x := -1200; x < 1200; x += 2 {
		for z := -1200; z < 1200; z += 2 {
			s := ColumnSurface(x, z)
			for y := 0; y < 6; y++ {
				if y < s.Height-soilDepthAt(x, z, s) && veinOreAt(x, y, z, nil) == "coal_ore" {
					byBiome[s.Biome]++
				}
			}
		}
	}
	for _, biome := range []string{"plains", "forest", "desert", "rocky"} {
		if byBiome[biome] == 0 {
			t.Errorf("no coal to dig in %s: %v", biome, byBiome)
		}
	}
}

// Veins know the biome they were born in: tin in the mountains, copper in the dry lands first.
func TestOresBelongToTheirBiomes(t *testing.T) {
	const rocky, desert, other = 0, 1, 2
	blocks := map[string]*[3]int{}
	columns := [3]int{}
	for _, ore := range allOres {
		blocks[ore] = &[3]int{}
	}
	for x := -2000; x < 2000; x += 3 {
		for z := -2000; z < 2000; z += 3 {
			s := ColumnSurface(x, z)
			land := other
			switch s.Biome {
			case "rocky":
				land = rocky
			case "desert":
				land = desert
			}
			columns[land]++
			soil := soilDepthAt(x, z, s)
			for y := BedrockY; y <= s.Height; y++ {
				if ore := oreAt(x, y, z, s, soil, nil); ore != "" {
					blocks[ore][land]++
				}
			}
		}
	}
	rate := func(ore string, land int) float64 { return float64(blocks[ore][land]) / float64(columns[land]) }
	if rate("tin_ore", rocky) < 20*rate("tin_ore", other) || rate("tin_ore", desert) > rate("tin_ore", rocky)/20 {
		t.Errorf("tin is not of the mountains: %v of %v", blocks["tin_ore"], columns)
	}
	if rate("copper_ore", desert) < 2*rate("copper_ore", other) || rate("copper_ore", rocky) < 2*rate("copper_ore", other) {
		t.Errorf("copper is not of dry lands and mountains: %v of %v", blocks["copper_ore"], columns)
	}
	if rate("coal_ore", other) < 2*rate("coal_ore", desert) {
		t.Errorf("coal is not of the green lands: %v of %v", blocks["coal_ore"], columns)
	}
	if rate("gold_ore", rocky) < 3*rate("gold_ore", other) {
		t.Errorf("gold is not of the mountains: %v of %v", blocks["gold_ore"], columns)
	}
}

// Generating chunks at the same time, on any goroutines, shares nothing.
func TestGenerateSharesNoState(t *testing.T) {
	want := map[[2]int]*Chunk{}
	var keys [][2]int
	for cx := -3; cx < 3; cx++ {
		for cz := -3; cz < 3; cz++ {
			keys = append(keys, [2]int{cx, cz})
			want[[2]int{cx, cz}] = Generate(cx, cz)
		}
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for _, k := range keys {
				got := Generate(k[0], k[1])
				w := want[k]
				for i := range got.Blocks {
					if got.Palette[got.Blocks[i]] != w.Palette[w.Blocks[i]] {
						t.Errorf("chunk %v differs", k)
						return
					}
				}
			}
		}()
	}
	wg.Wait()
}
