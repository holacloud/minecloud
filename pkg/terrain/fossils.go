package terrain

import "math"

// Where the fossils are. Mirrored line by line by js/terrainGen.js: fossilFingerprint in
// fossils_test.go holds the two together.
//
// Like the ores, all of it is a pure function of world position, with no state between calls. But a
// fossil belongs to its chunk and not to a lattice of its own: what a chunk holds (fossilPlanOf) is
// worked out from the chunk's coordinates alone, and every block of it lies inside that chunk. That
// is what keeps the three pieces of a skeleton together: whoever finds one has the other two in the
// same chunk, a few blocks away, whichever chunks were generated before.
//
// A fossil only ever takes the place of plain rock, and old bones of the soil of a plain or the sand
// of a beach: blockAtWith asks for it after the ores, so never an ore, and nothing here goes as low
// as the floor of the world or as high as the top of a column. Nothing else in the world looks at
// fossils: heights, biomes, ores, trees, plants and moss are where they were (TestOnlyOresMoved).
//
// There are four things to find, each in its own layer (the guide, pages 262 and 263):
//   - fossil rock, common and rare, in the deep rock, the rare one deeper;
//   - a skeleton: three blocks in a line (skull, spine, tail), deep, one site in many chunks;
//   - amber, only under the forest and higher up than any fossil: it was the resin of its trees;
//   - old bones, not in rock at all: a block or two under the sand of a beach or the grass of a plain.
//
// Which animal is inside is not said here. The client works it out from where the block is
// (js/game/fossils.js), so every player finds the same animal in the same block and the server needs
// no list of species.
//
// How many there are is tuned to what a child comes to who digs a tunnel one block wide and two high,
// and not to a count per chunk: ten minutes of digging in the deep rock, some 400 steps, give two
// common fossils or more nearly nine times in ten and show a rare one two times in three. A tunnel
// meets a common fossil every 140 steps or so, a rare one every 360 and a block of a skeleton every
// 1200; one under a forest, amber every 150 to 220. TestATunnelMeetsFossilsAsOftenAsItWasTunedTo
// measures it. A chunk that was generated never changes: whoever retunes this does it for the land
// nobody has seen yet.

// The blocks. The client registers every one of them (js/game/fossils.js), or it would show as a hole.
const (
	fossilRock     = "fossil_rock"
	fossilRockRare = "fossil_rock_rare"
	amberRock      = "amber_rock"
	oldBones       = "old_bones"
)

// skeletonBlocks are the pieces of a skeleton in the order they lie: the spine between the other two.
var skeletonBlocks = [3]string{"fossil_bones_skull", "fossil_bones_spine", "fossil_bones_tail"}

// fossilFloor is the lowest a fossil lies: y = -12 and the rough bedrock stay rock and ore.
const fossilFloor = -11

// Common fossils: pockets of one to three blocks, anywhere from the floor up to fossilCommonTop. A
// chunk has fossilCommonSlots chances of a pocket: two or three of them in nearly every chunk, 2.7 on
// average.
const (
	fossilCommonTop    = 2
	fossilCommonSlots  = 3
	fossilCommonChance = 0.9
	// How big a pocket is: one block below the first, two below the second, three otherwise.
	fossilPocketOne = 0.4
	fossilPocketTwo = 0.75
	// A pocket keeps this far from the sides of its chunk, so that its other blocks stay inside.
	fossilPocketMargin = 1
)

// Rare fossils: one block, in four chunks of every five, and only from fossilRareTop down.
const (
	fossilRareTop    = -3
	fossilRareChance = 0.8
)

// A skeleton: the spine, and the skull and the tail on either side of it along x or z, each
// skeletonGapMin or one more blocks away, all three at one height. The spine keeps skeletonMargin
// from the sides of the chunk, which is the longest gap: so the three never cross a border. One chunk
// in thirteen plans one, and one in fourteen has it, as an ore in the way leaves none of it.
const (
	skeletonTop    = -4
	skeletonChance = 0.075
	skeletonGapMin = 2
	skeletonMargin = 3
)

// skeletonDirections are the four ways a skeleton may lie, from the spine towards the skull.
var skeletonDirections = [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}

// Amber: pockets like those of the common fossils, in the rock from amberBottom to amberTop, where
// the column is forest and there are amberCover blocks from the top of the soil to it at the least.
// Most forest ground has no rock much above y = 5, so a pocket is likelier the lower it is: its
// height is amberBottom plus the square of a roll. That is also why two forest chunks in five have
// amber, with three planned in every two.
const (
	amberBottom = 3
	amberTop    = 12
	amberSlots  = 2
	amberChance = 0.75
	amberCover  = 2 // on top of the soil: one block of rock above the amber at the least
)

// Old bones: one block, oldBonesMinDepth to oldBonesMaxDepth under the top of a column that is dry
// land: one column in so many of a beach (the sand by the water, outside the desert) and far fewer
// of a plain. They are rolled column by column, as a beach is a strip that few chunks have much of.
// Whoever takes the sand of a beach away three blocks deep comes to one in every 110 columns.
const (
	oldBonesMinDepth     = 1
	oldBonesMaxDepth     = 3
	oldBonesBeachChance  = 1.0 / 110
	oldBonesPlainsChance = 1.0 / 1500
)

// Seeds: 3300 to 3399 are of the fossils. A slot of a pocket takes fossilSlotSeeds of them, so the
// common fossils have room for three slots before the amber, and the amber for four before the old
// bones: more than that needs the seeds moved (TestAFossilPlanStaysInsideItsChunk checks).
const (
	seedSkeleton    = 3300 // chance, x, z, y, direction, gap to the skull, gap to the tail
	seedRare        = 3310 // chance, x, z, y
	seedCommon      = 3320 // per slot: chance, x, z, y, size, first side, second side
	seedAmber       = 3350 // the same
	seedOldBones    = 3390 // chance, depth
	fossilSlotSeeds = 10
)

// pocketSides are the six cells next to the first block of a pocket where its other blocks may be.
var pocketSides = [6][3]int{{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}}

// fossilSpot is one cell of a chunk that holds a fossil, if what is there is plain rock.
type fossilSpot struct {
	lx, y, lz int
	block     string
}

// fossilMaxSpots is the most a chunk can hold: a skeleton, a rare fossil and every pocket full.
const fossilMaxSpots = 3 + 1 + 3*(fossilCommonSlots+amberSlots)

// fossilPlan is everything the rock of one chunk may hold, in the order that wins when two things
// want one cell: the skeleton, the rare fossil, the common pockets, the amber.
type fossilPlan struct {
	chunkX, chunkZ int
	spots          [fossilMaxSpots]fossilSpot
	count          int
	// columns has a bit for each column with a spot, by lz and then lx: nearly every block of a
	// chunk is in none, and is done with at once.
	columns [ChunkSize]uint16
	// skeleton is how many of the first spots are a skeleton: 3 or none. skeletonWhole says whether
	// all of it lies in plain rock, once skeletonChecked.
	skeleton        int
	skeletonChecked bool
	skeletonWhole   bool
}

// fossilMemo keeps the plan of the chunk that one call of Generate is making. It only saves time:
// the answers are the same without it.
type fossilMemo struct {
	plan  fossilPlan
	ready bool
}

func (p *fossilPlan) add(lx, y, lz int, block string) {
	p.spots[p.count] = fossilSpot{lx, y, lz, block}
	p.count++
	p.columns[lz] |= 1 << lx
}

// fossilPick is a whole number from 0 to n-1 out of the roll of a chunk.
func fossilPick(chunkX, chunkZ, seed, n int) int {
	return int(math.Floor(hash2(chunkX, chunkZ, seed) * float64(n)))
}

// fossilPlanOf works out what the rock of a chunk may hold from nothing but its coordinates. It looks
// at no column: whether the rock is there is asked block by block (fossilAt).
func fossilPlanOf(chunkX, chunkZ int) fossilPlan {
	p := fossilPlan{chunkX: chunkX, chunkZ: chunkZ}

	if hash2(chunkX, chunkZ, seedSkeleton) < skeletonChance {
		span := ChunkSize - 2*skeletonMargin
		lx := skeletonMargin + fossilPick(chunkX, chunkZ, seedSkeleton+1, span)
		lz := skeletonMargin + fossilPick(chunkX, chunkZ, seedSkeleton+2, span)
		y := fossilFloor + fossilPick(chunkX, chunkZ, seedSkeleton+3, skeletonTop-fossilFloor+1)
		d := skeletonDirections[fossilPick(chunkX, chunkZ, seedSkeleton+4, len(skeletonDirections))]
		skull := skeletonGapMin + fossilPick(chunkX, chunkZ, seedSkeleton+5, 2)
		tail := skeletonGapMin + fossilPick(chunkX, chunkZ, seedSkeleton+6, 2)
		p.add(lx+d[0]*skull, y, lz+d[1]*skull, skeletonBlocks[0])
		p.add(lx, y, lz, skeletonBlocks[1])
		p.add(lx-d[0]*tail, y, lz-d[1]*tail, skeletonBlocks[2])
		p.skeleton = len(skeletonBlocks)
	}

	if hash2(chunkX, chunkZ, seedRare) < fossilRareChance {
		lx := fossilPick(chunkX, chunkZ, seedRare+1, ChunkSize)
		lz := fossilPick(chunkX, chunkZ, seedRare+2, ChunkSize)
		p.add(lx, fossilFloor+fossilPick(chunkX, chunkZ, seedRare+3, fossilRareTop-fossilFloor+1), lz, fossilRockRare)
	}

	for slot := range fossilCommonSlots {
		seed := seedCommon + slot*fossilSlotSeeds
		if hash2(chunkX, chunkZ, seed) < fossilCommonChance {
			y := fossilFloor + fossilPick(chunkX, chunkZ, seed+3, fossilCommonTop-fossilFloor+1)
			p.addPocket(seed, y, fossilFloor, fossilCommonTop, fossilRock)
		}
	}

	for slot := range amberSlots {
		seed := seedAmber + slot*fossilSlotSeeds
		if hash2(chunkX, chunkZ, seed) < amberChance {
			roll := hash2(chunkX, chunkZ, seed+3)
			y := amberBottom + int(math.Floor(float64(roll*roll)*(amberTop-amberBottom+1)))
			p.addPocket(seed, y, amberBottom, amberTop, amberRock)
		}
	}
	return p
}

// addPocket adds a pocket of one to three blocks: the first at height y, and the others on two
// different sides of it. A block that would leave the layer of its kind, bottom to top, is not there.
func (p *fossilPlan) addPocket(seed, y, bottom, top int, block string) {
	span := ChunkSize - 2*fossilPocketMargin
	lx := fossilPocketMargin + fossilPick(p.chunkX, p.chunkZ, seed+1, span)
	lz := fossilPocketMargin + fossilPick(p.chunkX, p.chunkZ, seed+2, span)
	p.add(lx, y, lz, block)
	size := hash2(p.chunkX, p.chunkZ, seed+4)
	if size < fossilPocketOne {
		return
	}
	first := fossilPick(p.chunkX, p.chunkZ, seed+5, len(pocketSides))
	sides := []int{first}
	if size >= fossilPocketTwo {
		sides = append(sides, (first+1+fossilPick(p.chunkX, p.chunkZ, seed+6, len(pocketSides)-1))%len(pocketSides))
	}
	for _, side := range sides {
		d := pocketSides[side]
		if y+d[1] >= bottom && y+d[1] <= top {
			p.add(lx+d[0], y+d[1], lz+d[2], block)
		}
	}
}

// skeletonIsWhole says whether the three pieces of the chunk's skeleton all lie in plain rock. A
// skeleton that an ore vein would take a piece of is not there at all: nobody finds a skull whose
// tail was never made.
func skeletonIsWhole(p *fossilPlan) bool {
	for _, spot := range p.spots[:p.skeleton] {
		x, z := p.chunkX*ChunkSize+spot.lx, p.chunkZ*ChunkSize+spot.lz
		s := ColumnSurface(x, z)
		soil := soilDepthAt(x, z, s)
		if s.Height-spot.y <= soil || oreAt(x, spot.y, z, s, soil, nil) != "" {
			return false
		}
	}
	return true
}

// oldBonesAt says whether this cell of the soil of a column, `depth` blocks under its top, is old bones.
func oldBonesAt(x, z int, s Surface, depth int) bool {
	if depth < oldBonesMinDepth || depth > oldBonesMaxDepth || s.Height < WaterLevel {
		return false
	}
	var chance float64
	switch {
	case s.Beach && s.Biome != "desert":
		chance = oldBonesBeachChance
	case s.Biome == "plains" && !s.Beach:
		chance = oldBonesPlainsChance
	default:
		return false
	}
	if hash2(x, z, seedOldBones) >= chance {
		return false
	}
	return depth == oldBonesMinDepth+int(math.Floor(hash2(x, z, seedOldBones+1)*(oldBonesMaxDepth-oldBonesMinDepth+1)))
}

// fossilAt is the fossil at a cell of a column at or below its surface where no moss and no ore is,
// or "". A nil memo is fine.
func fossilAt(x, y, z int, s Surface, soilDepth int, memo *fossilMemo) string {
	depth := s.Height - y
	if depth <= soilDepth {
		if oldBonesAt(x, z, s, depth) {
			return oldBones
		}
		return ""
	}
	if y < fossilFloor || y > amberTop {
		return ""
	}
	chunkX, chunkZ := floorDiv(x, ChunkSize), floorDiv(z, ChunkSize)
	var plan *fossilPlan
	if memo == nil {
		fresh := fossilPlanOf(chunkX, chunkZ)
		plan = &fresh
	} else {
		if !memo.ready || memo.plan.chunkX != chunkX || memo.plan.chunkZ != chunkZ {
			memo.plan = fossilPlanOf(chunkX, chunkZ)
			memo.ready = true
		}
		plan = &memo.plan
	}
	lx, lz := x-chunkX*ChunkSize, z-chunkZ*ChunkSize
	if plan.columns[lz]&(1<<lx) == 0 {
		return ""
	}
	for i := range plan.count {
		spot := &plan.spots[i]
		if spot.lx != lx || spot.y != y || spot.lz != lz {
			continue
		}
		if i < plan.skeleton {
			if !plan.skeletonChecked {
				plan.skeletonWhole = skeletonIsWhole(plan)
				plan.skeletonChecked = true
			}
			if !plan.skeletonWhole {
				continue
			}
		}
		if spot.block == amberRock && (s.Biome != "forest" || depth < soilDepth+amberCover) {
			continue
		}
		return spot.block
	}
	return ""
}

// IsNaturalFossil says whether a block is one of the fossils the world is made with.
func IsNaturalFossil(name string) bool {
	switch name {
	case fossilRock, fossilRockRare, amberRock, oldBones, skeletonBlocks[0], skeletonBlocks[1], skeletonBlocks[2]:
		return true
	}
	return false
}
