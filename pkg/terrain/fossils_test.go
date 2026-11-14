package terrain

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"math"
	"sync"
	"testing"
)

var allFossils = []string{fossilRock, fossilRockRare, skeletonBlocks[0], skeletonBlocks[1], skeletonBlocks[2], amberRock, oldBones}

// withoutFossil takes a fossil back to the rock or the soil it lies in and leaves any other block as
// it is. The fingerprints older than the fossils are of the world without them, and still have to
// match: that is what says nothing but fossils came with them.
func withoutFossil(name string, x, y, z int, s Surface, soil int) string {
	if IsNaturalFossil(name) {
		return groundBlockAt(x, y, z, s, soil)
	}
	return name
}

// fossilFingerprint is the SHA-1 of every terrain cell of fossilRegion, bottom to top, one name per
// line, fossils and all. test/js/fossils.test.js reads this constant and gets the same from
// js/terrainGen.js: it is what holds the two generators together about fossils.
const fossilFingerprint = "98d83ac078a12572624b2ddad777283162375ef7"

// fossilRegion holds the four biomes, with every kind of fossil: six whole skeletons, amber, and old
// bones under a beach and under a plain.
var fossilRegion = [4]int{-368, 400, -256, 512} // x0, z0, x1, z1

func TestFossilsMatchJavaScript(t *testing.T) {
	h := sha1.New()
	seen := map[string]int{}
	for x := fossilRegion[0]; x < fossilRegion[2]; x++ {
		for z := fossilRegion[1]; z < fossilRegion[3]; z++ {
			s := ColumnSurface(x, z)
			soil := soilDepthAt(x, z, s)
			for y := BedrockY; y <= s.Height; y++ {
				name := blockAt(x, y, z, s, soil)
				if IsNaturalFossil(name) {
					seen[name]++
					if name == oldBones && s.Beach {
						seen["old bones under a beach"]++
					}
				}
				h.Write([]byte(name + "\n"))
			}
		}
	}
	for _, kind := range append([]string{"old bones under a beach"}, allFossils...) {
		if seen[kind] == 0 {
			t.Errorf("no %s in the region: it no longer tests it (%v)", kind, seen)
		}
	}
	if seen[oldBones] == seen["old bones under a beach"] {
		t.Errorf("no old bones under a plain in the region (%v)", seen)
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != fossilFingerprint {
		t.Fatalf("fossils diverged: got %s, want %s (%v)", got, fossilFingerprint, seen)
	}
}

// fossilFound is one fossil block of a generated chunk.
type fossilFound struct {
	x, y, z int
	block   string
}

// fossilCensus is what a square of chunks holds.
type fossilCensus struct {
	// The square: chunks from, from+step... up to `to`, along x and along z.
	from, to, step                              int
	chunks, forestChunks, forestChunksWithAmber int
	blocks                                      map[string]int
	amberInForestChunks                         int
	// byChunk has the fossils of every chunk with any, in the order of its cells.
	byChunk map[[2]int][]fossilFound
	// inRock and rockColumns are for the tunnels (walkTunnels), made when the first one is walked.
	inRock      map[[3]int]int
	rockColumns []bool
}

func takeFossilCensus(from, to, step int) *fossilCensus {
	census := &fossilCensus{from: from, to: to, step: step, blocks: map[string]int{}, byChunk: map[[2]int][]fossilFound{}}
	for cx := from; cx < to; cx += step {
		for cz := from; cz < to; cz += step {
			c := Generate(cx, cz)
			census.chunks++
			isFossil := make([]bool, len(c.Palette))
			for id, name := range c.Palette {
				isFossil[id] = IsNaturalFossil(name)
			}
			amber := 0
			for i, id := range c.Blocks {
				if !isFossil[id] {
					continue
				}
				name := c.Palette[id]
				lx, y, lz := chunkCell(i)
				census.blocks[name]++
				census.byChunk[[2]int{cx, cz}] = append(census.byChunk[[2]int{cx, cz}], fossilFound{cx*ChunkSize + lx, y, cz*ChunkSize + lz, name})
				if name == amberRock {
					amber++
				}
			}
			if c.Biome == "forest" {
				census.forestChunks++
				census.amberInForestChunks += amber
				if amber > 0 {
					census.forestChunksWithAmber++
				}
			}
		}
	}
	return census
}

// The two samples every test below reads: 6400 chunks around the origin, and 6400 spread over
// 800 x 800. Each is generated once.
var (
	fossilsNearOrigin = sync.OnceValue(func() *fossilCensus { return takeFossilCensus(-40, 40, 1) })
	fossilsSpreadOut  = sync.OnceValue(func() *fossilCensus { return takeFossilCensus(-400, 400, 10) })
)

// How many there are, pinned at 15 % either way of what the constants of fossils.go were tuned to
// give. In the rock, per chunk: two or three pockets of common fossils (4.7 blocks), a rare one in
// four of every five, a skeleton in every fourteen. Amber, in two forest chunks of every five or so.
// Whoever changes a constant changes the number here, and the guide (pages 262 and 263) with it; what
// the numbers are for is in TestATunnelMeetsFossilsAsOftenAsItWasTunedTo.
func TestFossilsAreAsCommonAsTheyWereTunedToBe(t *testing.T) {
	const margin = 0.15
	within := func(what string, got, want float64) {
		t.Helper()
		if got < want*(1-margin) || got > want*(1+margin) {
			t.Errorf("%s: %.4f, it must stay between %.4f and %.4f", what, got, want*(1-margin), want*(1+margin))
		}
	}
	for name, census := range map[string]*fossilCensus{"6400 chunks around the origin": fossilsNearOrigin(), "6400 chunks spread over 800x800": fossilsSpreadOut()} {
		chunks := float64(census.chunks)
		within(name+": common fossil blocks per chunk", float64(census.blocks[fossilRock])/chunks, 4.7)
		within(name+": rare fossil blocks per chunk", float64(census.blocks[fossilRockRare])/chunks, 0.8)
		within(name+": skeletons per chunk", float64(census.blocks[skeletonBlocks[1]])/chunks, 1.0/14)
		within(name+": forest chunks with amber", float64(census.forestChunksWithAmber)/float64(census.forestChunks), 0.42)
		within(name+": amber blocks per forest chunk", float64(census.amberInForestChunks)/float64(census.forestChunks), 0.83)
		// Common, then rare, then the skeletons: by blocks and by finds.
		if !(census.blocks[fossilRock] > 3*census.blocks[fossilRockRare] && census.blocks[fossilRockRare] > 3*census.blocks[skeletonBlocks[1]]) {
			t.Errorf("%s: the order of how common they are is off: %v", name, census.blocks)
		}
		for _, kind := range allFossils {
			if census.blocks[kind] == 0 {
				t.Errorf("%s: no %s", name, kind)
			}
		}
		for kind := range census.blocks {
			if !IsNaturalFossil(kind) {
				t.Errorf("%s: %s is counted and is no fossil", name, kind)
			}
		}
	}
}

// Old bones go by the column: one in 110 of a beach, one in 1500 of a plain (a chunk of plain in
// six), and nowhere else.
func TestOldBonesAreAsCommonAsTheyWereTunedToBe(t *testing.T) {
	const margin = 0.15
	sample := oldBonesDug()
	columns, bones := sample.columns, sample.bones
	for where, want := range map[string]float64{"beach": 1.0 / 110, "plains": 1.0 / 1500} {
		got := float64(bones[where]) / float64(columns[where])
		if bones[where] < 300 || got < want*(1-margin) || got > want*(1+margin) {
			t.Errorf("%s: %d old bones in %d columns, one in %.0f; it must stay near one in %.0f", where, bones[where], columns[where], 1/got, 1/want)
		}
	}
	if bones["under water"] != 0 || bones["elsewhere"] != 0 {
		t.Errorf("old bones out of place: %v of %v", bones, columns)
	}
}

// What the constants of fossils.go are tuned for is not a count per chunk but what a child comes to
// who digs: a tunnel one block wide and two high shows the two cells of each step and the six that
// touch them. The aims: in the deep rock, a common fossil every 100 to 150 steps, a rare one every
// 300 to 400 and a block of a skeleton every 1000 to 1500; under a forest, amber every 150 to 250;
// under a beach, old bones once in 100 to 120 columns of sand taken away. So ten minutes of digging,
// some 400 steps, nearly always give a couple of common fossils and often show a rare one, and a
// skeleton is the event of an afternoon. The bounds here are wider than the aims: they pin how it
// feels, and the counts are pinned above. Run it with -v to read what the tunnels met.
func TestATunnelMeetsFossilsAsOftenAsItWasTunedTo(t *testing.T) {
	census := fossilsNearOrigin()
	between := func(what string, got, low, high float64) {
		t.Helper()
		t.Logf("%s: %.1f", what, got)
		if !(got >= low && got <= high) {
			t.Errorf("%s: %.1f, it must stay between %.0f and %.0f", what, got, low, high)
		}
	}

	// The deep rock: with the feet from y = -10 to y = -6, every cell a tunnel shows is in the layer of
	// the three kinds.
	deep := &tunnelSight{blocks: map[string]int{}, finds: map[string]int{}}
	for feet := fossilFloor + 1; feet+2 <= skeletonTop; feet++ {
		deep.add(census.walkTunnels(feet, nil))
	}
	if deep.steps < 5_000_000 || deep.stretches < 10_000 {
		t.Fatalf("only %d steps of tunnel and %d stretches of %d", deep.steps, deep.stretches, tunnelStretch)
	}
	between("deep rock: steps of tunnel for each common fossil met", deep.stepsPerFind(fossilRock), 100, 170)
	between("deep rock: steps of tunnel for each block of common fossil seen", deep.stepsPerBlock(fossilRock), 65, 115)
	between("deep rock: steps of tunnel for each rare fossil", deep.stepsPerBlock(fossilRockRare), 280, 440)
	between("deep rock: steps of tunnel for each block of a skeleton", deep.stepsPerBlock(skeletonKind), 900, 1600)
	between("deep rock: steps of tunnel for each skeleton met", deep.stepsPerFind(skeletonKind), 1400, 2600)
	stretches := float64(deep.stretches)
	between("ten minutes of tunnel: out of 100, those that meet a common fossil", 100*float64(deep.withCommon)/stretches, 85, 98)
	between("ten minutes of tunnel: out of 100, those that give two common fossils or more", 100*float64(deep.withTwoCommon)/stretches, 75, 95)
	between("ten minutes of tunnel: out of 100, those that show a rare fossil", 100*float64(deep.withRare)/stretches, 55, 80)
	// Common, then rare, then the skeletons: by what a tunnel meets too.
	if !(deep.finds[fossilRock] > 2*deep.finds[fossilRockRare] && deep.finds[fossilRockRare] > 2*deep.finds[skeletonKind]) {
		t.Errorf("the order of how often a tunnel meets them is off: %v", deep.finds)
	}
	if deep.blocks[amberRock] != 0 {
		t.Errorf("%d blocks of amber in the deep rock", deep.blocks[amberRock])
	}

	// Higher up there are only the common ones, nearly as many: with the feet at y = -1 a tunnel shows
	// nothing below y = -2, which is over the layer of the rare ones.
	shallow := census.walkTunnels(fossilRareTop+2, nil)
	between("feet at y = -1: steps of tunnel for each common fossil met", shallow.stepsPerFind(fossilRock), 100, 190)
	if shallow.blocks[fossilRockRare] != 0 || shallow.blocks[skeletonKind] != 0 {
		t.Errorf("a tunnel over the layer of the rare fossils saw %v", shallow.blocks)
	}

	// Amber, under a forest, with the feet at the bottom of its layer and one above: where the guide
	// sends whoever looks for it (page 263). Higher there is less and less rock.
	for feet := amberBottom; feet <= amberBottom+1; feet++ {
		forest := census.walkTunnels(feet, underForest)
		if forest.steps < 150_000 {
			t.Fatalf("only %d steps of tunnel under a forest", forest.steps)
		}
		if forest.blocks[fossilRockRare] != 0 || forest.blocks[skeletonKind] != 0 {
			t.Errorf("a tunnel in the layer of the amber saw %v", forest.blocks)
		}
		between(fmt.Sprintf("under a forest, feet at y = %d: steps of tunnel for each amber met", feet), forest.stepsPerFind(amberRock), 110, 290)
		between(fmt.Sprintf("under a forest, feet at y = %d: steps of tunnel for each block of amber seen", feet), forest.stepsPerBlock(amberRock), 75, 210)
	}

	// Old bones: the top of a column and the three blocks under it taken away, column after column.
	dig := oldBonesDug()
	between("a beach: columns dug for each old bones", float64(dig.columns["beach"])/float64(dig.dug["beach"]), 90, 135)
	between("a plain: columns dug for each old bones", float64(dig.columns["plains"])/float64(dig.dug["plains"]), 1200, 1900)
	if dig.dug["beach"] != dig.bones["beach"] || dig.dug["plains"] != dig.bones["plains"] {
		t.Errorf("old bones deeper than a player digs for them: %v of %v", dig.dug, dig.bones)
	}
}

// Each kind keeps to its layer and to its land, and takes the place of nothing but plain rock (old
// bones, of dirt and sand): never an ore, never bedrock, never the top of a column.
func TestFossilsKeepToTheirLayers(t *testing.T) {
	layers := map[string][2]int{
		fossilRock:        {-11, 2},
		fossilRockRare:    {-11, -3},
		skeletonBlocks[0]: {-11, -4},
		skeletonBlocks[1]: {-11, -4},
		skeletonBlocks[2]: {-11, -4},
		amberRock:         {3, 12},
	}
	if fossilFloor != -11 || fossilFloor <= BedrockY+2 {
		t.Fatalf("fossils start at y=%d over bedrock at y=%d: y=-12 and the rough layer stay rock and ore", fossilFloor, BedrockY)
	}
	lowest, highest := map[string]int{}, map[string]int{}
	under := map[string]int{}
	for _, census := range []*fossilCensus{fossilsNearOrigin(), fossilsSpreadOut()} {
		for _, found := range census.byChunk {
			for _, f := range found {
				s := ColumnSurface(f.x, f.z)
				soil := soilDepthAt(f.x, f.z, s)
				depth := s.Height - f.y
				ground := groundBlockAt(f.x, f.y, f.z, s, soil)
				if depth < 1 {
					t.Fatalf("%s at %d,%d,%d is the top of its column", f.block, f.x, f.y, f.z)
				}
				if ore := oreAt(f.x, f.y, f.z, s, soil, nil); ore != "" {
					t.Fatalf("%s at %d,%d,%d took the place of %s", f.block, f.x, f.y, f.z, ore)
				}
				if _, seen := lowest[f.block]; !seen || f.y < lowest[f.block] {
					lowest[f.block] = f.y
				}
				if _, seen := highest[f.block]; !seen || f.y > highest[f.block] {
					highest[f.block] = f.y
				}
				if f.block == oldBones {
					if depth > 3 || depth > soil || (ground != "dirt" && ground != "sand") {
						t.Fatalf("old bones at %d,%d,%d: %d under the top, in %s", f.x, f.y, f.z, depth, ground)
					}
					if s.Height < WaterLevel || !(s.Beach && s.Biome != "desert" || s.Biome == "plains") {
						t.Fatalf("old bones at %d,%d,%d: %s, beach %v, height %d", f.x, f.y, f.z, s.Biome, s.Beach, s.Height)
					}
					if s.Beach != (ground == "sand") {
						t.Fatalf("old bones at %d,%d,%d: in %s, beach %v", f.x, f.y, f.z, ground, s.Beach)
					}
					under[ground]++
					continue
				}
				layer := layers[f.block]
				if f.y < layer[0] || f.y > layer[1] {
					t.Fatalf("%s at y=%d, out of its layer %v", f.block, f.y, layer)
				}
				if ground != "stone" || depth <= soil {
					t.Fatalf("%s at %d,%d,%d took the place of %s, %d under the top", f.block, f.x, f.y, f.z, ground, depth)
				}
				if f.block == amberRock {
					if s.Biome != "forest" {
						t.Fatalf("amber at %d,%d,%d under %s", f.x, f.y, f.z, s.Biome)
					}
					if depth < soil+amberCover {
						t.Fatalf("amber at %d,%d,%d with no rock over it: %d under the top, %d of soil", f.x, f.y, f.z, depth, soil)
					}
				}
			}
		}
	}
	// Each layer is used from end to end: the numbers of the guide are the real ones.
	for kind, layer := range layers {
		if kind == amberRock {
			// Forest ground hardly ever has rock as high as the top of the layer.
			if lowest[kind] != layer[0] || highest[kind] < layer[1]-2 {
				t.Errorf("amber from y=%d to y=%d, its layer is %v", lowest[kind], highest[kind], layer)
			}
			continue
		}
		if lowest[kind] != layer[0] || highest[kind] != layer[1] {
			t.Errorf("%s from y=%d to y=%d, its layer is %v", kind, lowest[kind], highest[kind], layer)
		}
	}
	if under["dirt"] == 0 || under["sand"] == 0 {
		t.Errorf("old bones under %v: both a plain and a beach should have some", under)
	}
}

// The three pieces of a skeleton are always together: in one chunk, at one height, in a line along x
// or z with the spine in the middle and two or three blocks from it to each end. No chunk has one or
// two of them, so no skeleton lies across a border.
func TestASkeletonIsWholeAndInOneChunk(t *testing.T) {
	whole := 0
	lying := map[[2]int]int{}
	for _, census := range []*fossilCensus{fossilsNearOrigin(), fossilsSpreadOut()} {
		for chunk, found := range census.byChunk {
			pieces := map[string][]fossilFound{}
			for _, f := range found {
				if f.block == skeletonBlocks[0] || f.block == skeletonBlocks[1] || f.block == skeletonBlocks[2] {
					pieces[f.block] = append(pieces[f.block], f)
				}
			}
			if len(pieces) == 0 {
				continue
			}
			for _, name := range skeletonBlocks {
				if len(pieces[name]) != 1 {
					t.Fatalf("chunk %v has %d %s: %v", chunk, len(pieces[name]), name, pieces)
				}
			}
			skull, spine, tail := pieces[skeletonBlocks[0]][0], pieces[skeletonBlocks[1]][0], pieces[skeletonBlocks[2]][0]
			if skull.y != spine.y || tail.y != spine.y {
				t.Fatalf("chunk %v: a skeleton at three heights: %v %v %v", chunk, skull, spine, tail)
			}
			toSkull := [2]int{skull.x - spine.x, skull.z - spine.z}
			toTail := [2]int{tail.x - spine.x, tail.z - spine.z}
			gapSkull, gapTail := absInt(toSkull[0])+absInt(toSkull[1]), absInt(toTail[0])+absInt(toTail[1])
			straight := (toSkull[0] == 0) != (toSkull[1] == 0) && (toTail[0] == 0) == (toSkull[0] == 0) && (toTail[1] == 0) == (toSkull[1] == 0)
			opposite := toSkull[0]*toTail[0]+toSkull[1]*toTail[1] < 0
			if !straight || !opposite || gapSkull < 2 || gapSkull > 3 || gapTail < 2 || gapTail > 3 {
				t.Fatalf("chunk %v: not a skeleton in a line: skull %v, spine %v, tail %v", chunk, skull, spine, tail)
			}
			whole++
			lying[[2]int{toSkull[0] / gapSkull, toSkull[1] / gapSkull}]++
		}
	}
	if whole < 300 {
		t.Fatalf("only %d skeletons checked", whole)
	}
	if len(lying) != 4 {
		t.Errorf("skeletons lie only these ways: %v", lying)
	}
}

// A chunk's plan never leaves the chunk nor the layers, whatever its coordinates: the pieces of a
// skeleton are three different cells, and a pocket has one to three.
func TestAFossilPlanStaysInsideItsChunk(t *testing.T) {
	// The seeds of one kind end before those of the next begin: a slot too many would roll the same
	// numbers as the first pocket of the next kind, and put the two side by side.
	if seedCommon+fossilCommonSlots*fossilSlotSeeds > seedAmber || seedAmber+amberSlots*fossilSlotSeeds > seedOldBones {
		t.Fatalf("%d slots of common fossils from seed %d and %d of amber from %d run into the next kind (%d, %d)", fossilCommonSlots, seedCommon, amberSlots, seedAmber, seedAmber, seedOldBones)
	}
	sizes := map[int]int{}
	for cx := -250; cx < 250; cx++ {
		for cz := -250; cz < 250; cz++ {
			plan := fossilPlanOf(cx*7, cz*13-5)
			if plan.count > fossilMaxSpots || (plan.skeleton != 0 && plan.skeleton != 3) {
				t.Fatalf("chunk %d,%d: %d spots, %d of a skeleton", plan.chunkX, plan.chunkZ, plan.count, plan.skeleton)
			}
			common := 0
			for i, spot := range plan.spots[:plan.count] {
				if spot.lx < 0 || spot.lx >= ChunkSize || spot.lz < 0 || spot.lz >= ChunkSize {
					t.Fatalf("chunk %d,%d: %s at %d,%d,%d is outside it", plan.chunkX, plan.chunkZ, spot.block, spot.lx, spot.y, spot.lz)
				}
				if spot.y < fossilFloor || spot.y > amberTop || (spot.block != amberRock && spot.y > fossilCommonTop) || (spot.block == amberRock && spot.y < amberBottom) {
					t.Fatalf("chunk %d,%d: %s at y=%d", plan.chunkX, plan.chunkZ, spot.block, spot.y)
				}
				if plan.columns[spot.lz]&(1<<spot.lx) == 0 {
					t.Fatalf("chunk %d,%d: the column of spot %d is not marked", plan.chunkX, plan.chunkZ, i)
				}
				if (i < plan.skeleton) != (spot.block == skeletonBlocks[0] || spot.block == skeletonBlocks[1] || spot.block == skeletonBlocks[2]) {
					t.Fatalf("chunk %d,%d: %s is spot %d of %d of a skeleton", plan.chunkX, plan.chunkZ, spot.block, i, plan.skeleton)
				}
				if spot.block == fossilRock {
					common++
				}
			}
			if plan.skeleton == 3 && (plan.spots[0] == plan.spots[1] || plan.spots[1] == plan.spots[2] || plan.spots[0].lx == plan.spots[2].lx && plan.spots[0].lz == plan.spots[2].lz) {
				t.Fatalf("chunk %d,%d: a skeleton folded on itself: %v", plan.chunkX, plan.chunkZ, plan.spots[:3])
			}
			sizes[common]++
		}
	}
	// None, one or two pockets of one to three blocks: every count from 0 to 6 happens.
	for blocks := 0; blocks <= 3*fossilCommonSlots; blocks++ {
		if sizes[blocks] == 0 {
			t.Errorf("no chunk plans %d common fossils: %v", blocks, sizes)
		}
	}
	if len(sizes) != 3*fossilCommonSlots+1 {
		t.Errorf("common fossils per chunk: %v", sizes)
	}
}

// Common fossils come one, two or three together, the blocks of a pocket touching the first.
func TestCommonFossilsComeInPockets(t *testing.T) {
	type at struct{ x, y, z int }
	alone, together := 0, 0
	for _, found := range fossilsNearOrigin().byChunk {
		cells := map[at]bool{}
		for _, f := range found {
			if f.block == fossilRock {
				cells[at{f.x, f.y, f.z}] = true
			}
		}
		if len(cells) > 3*fossilCommonSlots {
			t.Fatalf("%d common fossils in one chunk", len(cells))
		}
		for cell := range cells {
			touching := false
			for _, d := range pocketSides {
				touching = touching || cells[at{cell.x + d[0], cell.y + d[1], cell.z + d[2]}]
			}
			if touching {
				together++
			} else {
				alone++
			}
		}
	}
	// 40 % of the pockets are one block, so about a fifth of the blocks: 0.4 of 1.85.
	if share := float64(alone) / float64(alone+together); share < 0.15 || share > 0.3 {
		t.Errorf("%d common fossils alone and %d with another next to them", alone, together)
	}
}

// The memo of Generate only saves time, here too: in the chunks with the most to get wrong (a
// skeleton, amber, old bones) every block is what the point question says, and the chunk comes out
// the same again after its neighbours.
func TestGenerateAgreesWithThePointQuestionAboutFossils(t *testing.T) {
	census := fossilsNearOrigin()
	wanted := map[string]int{skeletonBlocks[1]: 4, amberRock: 4, oldBones: 4, fossilRockRare: 2}
	var chunks [][2]int
	for cx := -40; cx < 40; cx++ {
		for cz := -40; cz < 40; cz++ {
			for _, f := range census.byChunk[[2]int{cx, cz}] {
				if wanted[f.block] > 0 {
					wanted[f.block]--
					chunks = append(chunks, [2]int{cx, cz})
					break
				}
			}
		}
	}
	if len(chunks) != 14 {
		t.Fatalf("%d chunks to check, %v still wanted", len(chunks), wanted)
	}
	for _, at := range chunks {
		c := Generate(at[0], at[1])
		fossils := 0
		for lx := range ChunkSize {
			for lz := range ChunkSize {
				x, z := c.X*ChunkSize+lx, c.Z*ChunkSize+lz
				s := ColumnSurface(x, z)
				soil := soilDepthAt(x, z, s)
				for y := BedrockY; y <= s.Height; y++ {
					got := c.Get(lx, y, lz)
					if want := blockAt(x, y, z, s, soil); got != want {
						t.Fatalf("%d,%d,%d is %s in the chunk and %s by itself", x, y, z, got, want)
					}
					if IsNaturalFossil(got) {
						fossils++
					}
				}
			}
		}
		if fossils != len(census.byChunk[at]) {
			t.Fatalf("chunk %v: %d fossils now, %d before", at, fossils, len(census.byChunk[at]))
		}
		Generate(at[0]+1, at[1])
		Generate(at[0], at[1]-1)
		again := Generate(at[0], at[1])
		for i := range c.Blocks {
			if c.Palette[c.Blocks[i]] != again.Palette[again.Blocks[i]] {
				t.Fatalf("chunk %v changed at %d", at, i)
			}
		}
	}
}

// A skeleton that an ore would take a piece of is not there, none of it: the plan has one, the rock
// has not, and the ore is where it was.
func TestASkeletonAnOreWouldBreakIsNotThere(t *testing.T) {
	planned, broken := 0, 0
	for cx := -150; cx < 150; cx++ {
		for cz := -150; cz < 150; cz++ {
			plan := fossilPlanOf(cx, cz)
			if plan.skeleton == 0 {
				continue
			}
			planned++
			ores, bones := 0, 0
			for _, spot := range plan.spots[:plan.skeleton] {
				x, z := cx*ChunkSize+spot.lx, cz*ChunkSize+spot.lz
				s := ColumnSurface(x, z)
				soil := soilDepthAt(x, z, s)
				name := blockAt(x, spot.y, z, s, soil)
				switch {
				case IsNaturalOre(name):
					ores++
				case name == spot.block:
					bones++
				}
			}
			if ores > 0 {
				broken++
				if bones != 0 {
					t.Fatalf("chunk %d,%d: %d pieces of a skeleton next to %d that an ore took", cx, cz, bones, ores)
				}
			} else if bones != 3 {
				t.Fatalf("chunk %d,%d: %d pieces of a skeleton and no ore in the way", cx, cz, bones)
			}
		}
	}
	if broken < 20 || planned < 20*broken {
		t.Fatalf("%d skeletons planned, %d broken by an ore", planned, broken)
	}
	if rate := float64(planned) / 90000; math.Abs(rate-skeletonChance) > 0.003 {
		t.Errorf("%d skeletons planned in 90000 chunks, the chance is %v", planned, skeletonChance)
	}
}

// A memo that is asked about another chunk works out the plan of that one: it never answers with the
// fossils of the chunk before.
func TestAFossilMemoFollowsTheChunkItIsAskedAbout(t *testing.T) {
	memo := &fossilMemo{}
	fossils := 0
	for _, x := range []int{-20, 3, 17, 40, 3} {
		for z := 0; z < 48; z++ {
			s := ColumnSurface(x, z)
			soil := soilDepthAt(x, z, s)
			for y := BedrockY; y <= s.Height; y++ {
				got, want := fossilAt(x, y, z, s, soil, memo), fossilAt(x, y, z, s, soil, nil)
				if got != want {
					t.Fatalf("%d,%d,%d: %q with a memo that was of another chunk, %q without", x, y, z, got, want)
				}
				if got != "" {
					fossils++
				}
			}
		}
	}
	if fossils < 3 {
		t.Fatalf("only %d fossils in the columns asked about", fossils)
	}
}

// What a tunnel counts: the three blocks of a skeleton are one kind, and old bones are not in the rock.
const skeletonKind = "skeleton"

var tunnelKinds = []string{fossilRock, fossilRockRare, skeletonKind, amberRock}

// tunnelCells are the cells a player gets to see at each step of a tunnel one block wide and two
// high: the two that are dug and the six that touch them, as how far to the side and how far up from
// the feet.
var tunnelCells = [8][2]int{{0, 0}, {0, 1}, {-1, 0}, {1, 0}, {-1, 1}, {1, 1}, {0, -1}, {0, 2}}

// tunnelFindGap is how many steps after the last fossil of its kind another one is still the same
// find: the rest of a pocket, or the next piece of a skeleton, which are up to three blocks apart.
const tunnelFindGap = 3

// tunnelStretch is how far a child digs in ten minutes or so: the aim is 300 to 500 steps.
const tunnelStretch = 400

// tunnelSight is what the tunnels of walkTunnels saw: the fossil blocks among the cells of every
// step, and the finds, which is how many times a kind came into sight.
type tunnelSight struct {
	steps  int
	blocks map[string]int
	finds  map[string]int
	// The same tunnels cut into stretches of tunnelStretch steps: how many there were, how many came
	// to a common fossil, how many gave two or more of them to whoever digs out the whole pocket on
	// seeing a block of it, and how many came to a rare one.
	stretches, withCommon, withTwoCommon, withRare int
}

// add puts what other tunnels saw with this.
func (sight *tunnelSight) add(other *tunnelSight) {
	sight.steps += other.steps
	for _, kind := range tunnelKinds {
		sight.blocks[kind] += other.blocks[kind]
		sight.finds[kind] += other.finds[kind]
	}
	sight.stretches += other.stretches
	sight.withCommon += other.withCommon
	sight.withTwoCommon += other.withTwoCommon
	sight.withRare += other.withRare
}

// stepsPerBlock and stepsPerFind are how long a tunnel is, on average, for one of each.
func (sight *tunnelSight) stepsPerBlock(kind string) float64 {
	return float64(sight.steps) / float64(sight.blocks[kind])
}

func (sight *tunnelSight) stepsPerFind(kind string) float64 {
	return float64(sight.steps) / float64(sight.finds[kind])
}

// walkTunnels digs straight tunnels one block wide and two high through the chunks of a census, the
// feet at one height: one every three blocks along x and as many along z, so that no two of the same
// direction see the same cell, from one side of the square to the other. A step that `counts` says
// no to (nil: every step counts) is not dug: the tunnel goes on at the next that is.
func (census *fossilCensus) walkTunnels(feet int, counts func(x, z, feet int) bool) *tunnelSight {
	if census.step != 1 {
		panic("tunnels need the chunks next to one another")
	}
	low, high := census.from*ChunkSize, census.to*ChunkSize
	side := high - low
	if census.inRock == nil {
		// Nearly every column has no fossil at all, and is done with at once.
		census.inRock = map[[3]int]int{}
		census.rockColumns = make([]bool, side*side)
		for _, found := range census.byChunk {
			for _, f := range found {
				kind := slicesIndex(tunnelKinds, f.block)
				if f.block == skeletonBlocks[0] || f.block == skeletonBlocks[1] || f.block == skeletonBlocks[2] {
					kind = slicesIndex(tunnelKinds, skeletonKind)
				}
				if kind < 0 {
					continue
				}
				census.inRock[[3]int{f.x, f.y, f.z}] = kind
				census.rockColumns[(f.z-low)*side+f.x-low] = true
			}
		}
	}
	common, rare := slicesIndex(tunnelKinds, fossilRock), slicesIndex(tunnelKinds, fossilRockRare)
	sight := &tunnelSight{blocks: map[string]int{}, finds: map[string]int{}}
	blocks, finds := make([]int, len(tunnelKinds)), make([]int, len(tunnelKinds))
	last := make([]int, len(tunnelKinds))
	for _, alongX := range []bool{true, false} {
		for row := low + 1; row < high-1; row += 3 {
			for kind := range last {
				last[kind] = low - tunnelFindGap - 1
			}
			// What this stretch of the tunnel has given so far, and the common fossils its digger has
			// taken: each one seen, and those of its pocket.
			inStretch, commonTaken, rareSeen := 0, 0, 0
			taken := map[[3]int]bool{}
			for at := low; at < high; at++ {
				x, z := at, row
				if !alongX {
					x, z = row, at
				}
				if counts != nil && !counts(x, z, feet) {
					continue
				}
				sight.steps++
				for sideways := -1; sideways <= 1; sideways++ {
					cx, cz := x, z+sideways
					if !alongX {
						cx, cz = x+sideways, z
					}
					if !census.rockColumns[(cz-low)*side+cx-low] {
						continue
					}
					for _, cell := range tunnelCells {
						if cell[0] != sideways {
							continue
						}
						seen := [3]int{cx, feet + cell[1], cz}
						kind, there := census.inRock[seen]
						if !there {
							continue
						}
						blocks[kind]++
						if at-last[kind] > tunnelFindGap {
							finds[kind]++
						}
						last[kind] = at
						switch kind {
						case rare:
							rareSeen++
						case common:
							commonTaken += census.takePocket(seen, taken)
						}
					}
				}
				if inStretch++; inStretch == tunnelStretch {
					sight.stretches++
					if commonTaken >= 1 {
						sight.withCommon++
					}
					if commonTaken >= 2 {
						sight.withTwoCommon++
					}
					if rareSeen >= 1 {
						sight.withRare++
					}
					inStretch, commonTaken, rareSeen = 0, 0, 0
				}
			}
		}
	}
	for kind, name := range tunnelKinds {
		sight.blocks[name], sight.finds[name] = blocks[kind], finds[kind]
	}
	return sight
}

// takePocket is how many fossils a player gets who, on seeing one, digs out every block of its kind
// that touches it, and those that touch them: the ones not in `taken` yet, which it adds them to.
func (census *fossilCensus) takePocket(from [3]int, taken map[[3]int]bool) int {
	if taken[from] {
		return 0
	}
	kind := census.inRock[from]
	taken[from] = true
	count := 1
	for _, d := range pocketSides {
		next := [3]int{from[0] + d[0], from[1] + d[1], from[2] + d[2]}
		if other, there := census.inRock[next]; there && other == kind {
			count += census.takePocket(next, taken)
		}
	}
	return count
}

// slicesIndex is where a name is in a list, or -1.
func slicesIndex(list []string, name string) int {
	for i, item := range list {
		if item == name {
			return i
		}
	}
	return -1
}

// underForest says whether a step of a tunnel is under a forest, with ground over the player's head:
// where a child looking for amber digs.
func underForest(x, z, feet int) bool {
	s := ColumnSurface(x, z)
	return s.Biome == "forest" && s.Height >= feet+2
}

// oldBonesSample is where the columns of a large square are and how many old bones they have: all
// those of their soil, and those a player comes to who takes away the top of the column and the
// three blocks under it.
type oldBonesSample struct {
	columns, bones, dug map[string]int
}

var oldBonesDug = sync.OnceValue(func() *oldBonesSample {
	sample := &oldBonesSample{columns: map[string]int{}, bones: map[string]int{}, dug: map[string]int{}}
	for x := -3000; x < 3000; x += 3 {
		for z := -3000; z < 3000; z += 3 {
			s := ColumnSurface(x, z)
			soil := soilDepthAt(x, z, s)
			where := "elsewhere"
			switch {
			case s.Height < WaterLevel:
				where = "under water"
			case s.Beach && s.Biome != "desert":
				where = "beach"
			case s.Biome == "plains" && !s.Beach:
				where = "plains"
			}
			sample.columns[where]++
			for y := s.Height - soil; y <= s.Height; y++ {
				if blockAt(x, y, z, s, soil) == oldBones {
					sample.bones[where]++
					if s.Height-y <= 3 {
						sample.dug[where]++
					}
				}
			}
		}
	}
	return sample
})
