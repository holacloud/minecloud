package terrain

import "math"

// Where the metals are. Mirrored line by line by js/terrainGen.js: the fingerprints in
// terrain_test.go hold the two together.
//
// Everything is a pure function of world position, with no state between calls: a vein belongs to
// a cell of a fixed lattice, and all of it (where it runs, how thick it is, what it is made of) is
// worked out from that cell's coordinates. So a vein that crosses a chunk border is the same vein
// on both sides, whichever chunk is generated first. Nothing here moves anything else in the world:
// heights, biomes, trees and plants never look at ores.
//
// There are two kinds of deposit. Veins lie in the rock below the soil, and show on a cliff if the
// slope cuts through them. Outcrops are patches at the surface: all over the bare rock of the
// mountains, and elsewhere only on a steep slope, where the soil would not hold anyway.

// A vein lives inside its cell, so one question about a block only needs one cell. The cell is
// narrower than a chunk, and is not aligned with it, so veins do cross chunk borders.
const (
	veinCellXZ   = 12
	veinCellY    = 6
	veinMargin   = 2   // endpoints stay this far from the sides of the cell, so veinMaxRadius fits
	veinMaxRise  = 1   // how far one end of a vein climbs above the other
	veinMaxTotal = 0.5 // no entry in veinTable adds up to more than this
	// The outer skin of a vein is ragged. It is thin enough that every block of it touches the
	// solid core: stepping towards the axis gets at least 1/sqrt(3) closer.
	veinSkin       = 0.5
	veinSkinChance = 0.65
	veinMaxRadius2 = 3.61 // 1.9, the thickest of veinKinds, squared
	// How much ground a vein needs over both its ends, and how far above the floor of the world it
	// starts, or it would be cut down to crumbs. Bare rock has hardly any soil to cut it.
	veinCoverSoil = 5
	veinCoverRock = 3
	veinFloor     = -3
)

// The depth of a vein, from the height of the cell it was born in.
const (
	veinZoneHigh = 4 // from this y upwards
	veinZoneMid  = 0 // from this y to veinZoneHigh; below, deep
)

// veinKind is the size of the veins of one ore: Radius in blocks, Length as a share of what the
// cell gives it. Bulk ores run long and thick, precious ones are small pockets.
type veinKind struct{ Radius, Length float64 }

var veinKinds = map[string]veinKind{
	"coal_ore":   {1.9, 1},
	"iron_ore":   {1.7, 0.9},
	"copper_ore": {1.6, 0.9},
	"tin_ore":    {1.5, 0.7},
	"zinc_ore":   {1.6, 0.8},
	"lead_ore":   {1.6, 0.8},
	"silver_ore": {1.4, 0.5},
	"gold_ore":   {1.4, 0.35},
}

// oreChance is the share of cells (or of outcrop patches) that holds an ore.
type oreChance struct {
	Ore    string
	Chance float64
}

// veinTable says what a cell holds, by biome and depth [deep, mid, high]. See the guide, page 248:
//   - coal, in the wet lowlands that were swamps once, is the shallowest and most common;
//   - iron is everywhere, more of it deep and in the mountains;
//   - copper belongs to the dry lands and the mountains;
//   - tin only to the mountains, with their granite;
//   - zinc and lead lie deep in the plains and forests, or in the mountains;
//   - silver and gold are rare and deep, more in the mountains.
var veinTable = map[string][3][]oreChance{
	"plains": {
		{{"iron_ore", 0.13}, {"coal_ore", 0.07}, {"zinc_ore", 0.05}, {"lead_ore", 0.04}, {"copper_ore", 0.02}, {"gold_ore", 0.012}},
		{{"coal_ore", 0.2}, {"iron_ore", 0.09}, {"zinc_ore", 0.03}, {"lead_ore", 0.02}, {"copper_ore", 0.015}},
		{{"coal_ore", 0.25}, {"iron_ore", 0.04}},
	},
	"forest": {
		{{"iron_ore", 0.11}, {"coal_ore", 0.11}, {"zinc_ore", 0.03}, {"lead_ore", 0.03}, {"copper_ore", 0.02}, {"gold_ore", 0.01}},
		{{"coal_ore", 0.24}, {"iron_ore", 0.07}, {"zinc_ore", 0.015}, {"lead_ore", 0.015}, {"copper_ore", 0.01}},
		{{"coal_ore", 0.28}, {"iron_ore", 0.03}},
	},
	"desert": {
		{{"copper_ore", 0.15}, {"iron_ore", 0.08}, {"lead_ore", 0.03}, {"coal_ore", 0.02}, {"zinc_ore", 0.02}, {"gold_ore", 0.015}},
		{{"copper_ore", 0.14}, {"iron_ore", 0.06}, {"coal_ore", 0.05}, {"lead_ore", 0.01}},
		{{"copper_ore", 0.08}, {"iron_ore", 0.04}, {"coal_ore", 0.04}},
	},
	"rocky": {
		{{"iron_ore", 0.1}, {"tin_ore", 0.08}, {"lead_ore", 0.07}, {"copper_ore", 0.06}, {"gold_ore", 0.04}, {"coal_ore", 0.03}, {"silver_ore", 0.03}},
		{{"iron_ore", 0.1}, {"coal_ore", 0.08}, {"copper_ore", 0.06}, {"tin_ore", 0.06}, {"lead_ore", 0.05}, {"silver_ore", 0.015}, {"gold_ore", 0.015}},
		{{"coal_ore", 0.12}, {"iron_ore", 0.1}, {"tin_ore", 0.08}, {"copper_ore", 0.06}, {"lead_ore", 0.04}, {"silver_ore", 0.01}, {"gold_ore", 0.005}},
	},
}

// A lead vein is galena, and some of it holds what galena so often comes with. The shares are of the
// pockets of the vein, each galenaPocket blocks across, so they are small lumps and not loose crumbs.
const (
	galenaSilver = 0.1
	galenaZinc   = 0.14
	galenaPocket = 3
)

// veinCell is one cell of the lattice: where its vein would run, and the roll that says what it is.
type veinCell struct {
	cellX, cellY, cellZ    int
	roll                   float64
	x0, y0, z0, x1, y1, z1 int
	ore                    string
	decided                bool
}

// veinMemo remembers the last cell looked at for one call of Generate, which walks up a column at a
// time: most blocks ask about the cell the block before asked about. It belongs to that one call and
// only saves time: the answers are the same without it.
type veinMemo struct {
	cell      veinCell
	stackX    int
	stackZ    int
	shift     int
	ready     bool
	hasShift  bool
	decisions map[[3]int]string
}

func newVeinMemo() *veinMemo {
	return &veinMemo{decisions: map[[3]int]string{}}
}

// veinCellOf works out a cell from nothing but its coordinates.
func veinCellOf(cellX, cellY, cellZ, shift int) veinCell {
	c := veinCell{cellX: cellX, cellY: cellY, cellZ: cellZ, roll: hash3(cellX, cellY, cellZ, 3101)}
	if c.roll >= veinMaxTotal {
		return c
	}
	span := float64(veinCellXZ - 2*veinMargin)
	c.x0 = cellX*veinCellXZ + veinMargin + int(math.Floor(hash3(cellX, cellY, cellZ, 3102)*span))
	c.z0 = cellZ*veinCellXZ + veinMargin + int(math.Floor(hash3(cellX, cellY, cellZ, 3103)*span))
	c.y0 = cellY*veinCellY - shift + veinMargin + int(math.Floor(hash3(cellX, cellY, cellZ, 3104)*(veinCellY-2*veinMargin-veinMaxRise+1)))
	c.x1 = cellX*veinCellXZ + veinMargin + int(math.Floor(hash3(cellX, cellY, cellZ, 3105)*span))
	c.z1 = cellZ*veinCellXZ + veinMargin + int(math.Floor(hash3(cellX, cellY, cellZ, 3106)*span))
	c.y1 = c.y0 + int(math.Floor(hash3(cellX, cellY, cellZ, 3107)*(veinMaxRise+1)))
	return c
}

// veinOreAt is the ore of the vein this block lies in, or "". The cell's own roll goes first, then
// the geometry; the climate, by far the dearest, is only looked at inside a vein. A nil memo is fine.
func veinOreAt(x, y, z int, memo *veinMemo) string {
	cellX := floorDiv(x, veinCellXZ)
	cellZ := floorDiv(z, veinCellXZ)
	// Each stack of cells is shifted on its own, or veins would leave empty layers across the world.
	var shift int
	if memo != nil && memo.hasShift && memo.stackX == cellX && memo.stackZ == cellZ {
		shift = memo.shift
	} else {
		shift = int(math.Floor(hash2(cellX, cellZ, 3100) * veinCellY))
		if memo != nil {
			memo.stackX, memo.stackZ, memo.shift, memo.hasShift = cellX, cellZ, shift, true
			memo.ready = false
		}
	}
	cellY := floorDiv(y+shift, veinCellY)

	var c veinCell
	if memo != nil && memo.ready && memo.cell.cellY == cellY {
		c = memo.cell
	} else {
		c = veinCellOf(cellX, cellY, cellZ, shift)
		if memo != nil {
			memo.cell = c
			memo.ready = true
		}
	}
	if c.roll >= veinMaxTotal {
		return ""
	}

	if segmentDistance2(x-c.x0, y-c.y0, z-c.z0, c.x1-c.x0, c.y1-c.y0, c.z1-c.z0, 1) > veinMaxRadius2 {
		return ""
	}

	var ore string
	if memo == nil {
		ore = veinOre(c)
	} else {
		key := [3]int{cellX, cellY, cellZ}
		known := false
		if ore, known = memo.decisions[key]; !known {
			ore = veinOre(c)
			memo.decisions[key] = ore
		}
	}
	if ore == "" {
		return ""
	}
	kind := veinKinds[ore]
	d2 := segmentDistance2(x-c.x0, y-c.y0, z-c.z0, c.x1-c.x0, c.y1-c.y0, c.z1-c.z0, kind.Length)
	if d2 > float64(kind.Radius*kind.Radius) {
		return ""
	}
	core := kind.Radius - veinSkin
	if d2 > float64(core*core) && hash3(x, y, z, 3108) >= veinSkinChance {
		return ""
	}
	return galenaMix(ore, x, y, z)
}

// galenaMix turns some pockets of lead into the silver and the zinc that come with it.
func galenaMix(ore string, x, y, z int) string {
	if ore != "lead_ore" {
		return ore
	}
	mix := hash3(floorDiv(x, galenaPocket), floorDiv(y, galenaPocket), floorDiv(z, galenaPocket), 3109)
	if mix < galenaSilver {
		return "silver_ore"
	}
	if mix < galenaSilver+galenaZinc {
		return "zinc_ore"
	}
	return ore
}

// veinOre decides what a whole vein is: the biome and the depth are those of its first end. A vein
// that the floor of the world or the soil would cut down to crumbs is not there at all.
func veinOre(c veinCell) string {
	if c.y0 < veinFloor {
		return ""
	}
	climate := sampleClimate(float64(c.x0), float64(c.z0))
	biome := dominantBiome(climate)
	ore := pickOre(veinTable[biome][veinZone(c.y0)], c.roll)
	if ore == "" {
		return ""
	}
	cover := veinCoverSoil
	if biome == "rocky" {
		cover = veinCoverRock
	}
	if c.y1 > terrainHeight(float64(c.x0), float64(c.z0), climate)-cover {
		return ""
	}
	x1, z1 := float64(c.x1), float64(c.z1)
	if c.y1 > terrainHeight(x1, z1, sampleClimate(x1, z1))-cover {
		return ""
	}
	return ore
}

func veinZone(y int) int {
	switch {
	case y >= veinZoneHigh:
		return 2
	case y >= veinZoneMid:
		return 1
	}
	return 0
}

func pickOre(table []oreChance, roll float64) string {
	sum := 0.0
	for _, entry := range table {
		sum += entry.Chance
		if roll < sum {
			return entry.Ore
		}
	}
	return ""
}

// segmentDistance2 is the squared distance from a point to the segment that starts at the origin,
// runs to (bx, by, bz) and stops at `length` of the way.
func segmentDistance2(px, py, pz, bx, by, bz int, length float64) float64 {
	t := 0.0
	if along := px*bx + py*by + pz*bz; along > 0 {
		t = float64(along) / float64(bx*bx+by*by+bz*bz)
		if t > length {
			t = length
		}
	}
	dx := float64(px) - float64(float64(bx)*t)
	dy := float64(py) - float64(float64(by)*t)
	dz := float64(pz) - float64(float64(bz)*t)
	return float64(float64(dx*dx)+float64(dy*dy)) + float64(dz*dz)
}

func floorDiv(v, by int) int {
	q := v / by
	if v%by != 0 && v < 0 {
		q--
	}
	return q
}

// Outcrops: one patch at most in each cell of a lattice over the ground.
const (
	outcropCell     = 18
	outcropMargin   = 4
	outcropMaxTotal = 0.61
	outcropReach    = 2    // a slope is steep when the column this far away is...
	outcropSlope    = 2    // ...at least this much lower
	outcropEdge     = 0.75 // the share of the columns of a patch's rim that are there
	outcropMinDepth = 2    // even at the rim, so a patch on broken ground holds together
)

// outcropKinds gives the size of a patch: Radius in columns, and how deep it runs at most.
type outcropKind struct {
	Radius float64
	Depth  int
}

var outcropKinds = map[string]outcropKind{
	"coal_ore":   {3.2, 3},
	"iron_ore":   {2.8, 3},
	"copper_ore": {2.6, 2},
	"tin_ore":    {2.2, 2},
	"zinc_ore":   {2.2, 2},
	"lead_ore":   {2.2, 2},
	"silver_ore": {1.5, 1},
	"gold_ore":   {1.5, 1},
}

// outcropTable says what a patch is, by biome. Nothing shows in a place where the table has no room.
var outcropTable = map[string][]oreChance{
	"plains": {{"coal_ore", 0.3}, {"iron_ore", 0.22}, {"copper_ore", 0.04}, {"zinc_ore", 0.02}, {"lead_ore", 0.02}},
	"forest": {{"coal_ore", 0.34}, {"iron_ore", 0.2}, {"copper_ore", 0.03}, {"zinc_ore", 0.01}, {"lead_ore", 0.01}},
	"desert": {{"copper_ore", 0.38}, {"iron_ore", 0.14}, {"coal_ore", 0.05}, {"lead_ore", 0.02}},
	"rocky":  {{"coal_ore", 0.16}, {"iron_ore", 0.14}, {"copper_ore", 0.07}, {"tin_ore", 0.05}, {"lead_ore", 0.03}, {"zinc_ore", 0.015}, {"silver_ore", 0.005}, {"gold_ore", 0.007}},
}

// outcropOreAt is the ore of the patch this block belongs to, or "". Only columns whose ground is
// really theirs to lose: no water over them, no beach, no tree or plant growing on them.
func outcropOreAt(x, y, z int, s Surface) string {
	cellX := floorDiv(x, outcropCell)
	cellZ := floorDiv(z, outcropCell)
	roll := hash2(cellX, cellZ, 3200)
	if roll >= outcropMaxTotal {
		return ""
	}
	span := outcropCell - 2*outcropMargin
	x0 := cellX*outcropCell + outcropMargin + int(math.Floor(hash2(cellX, cellZ, 3201)*float64(span)))
	z0 := cellZ*outcropCell + outcropMargin + int(math.Floor(hash2(cellX, cellZ, 3202)*float64(span)))
	dx := x - x0
	dz := z - z0
	d2 := dx*dx + dz*dz
	if d2 > outcropMargin*outcropMargin {
		return ""
	}
	if s.Height < WaterLevel || s.Beach {
		return ""
	}
	ore := pickOre(outcropTable[dominantBiome(sampleClimate(float64(x0), float64(z0)))], roll)
	if ore == "" {
		return ""
	}
	kind := outcropKinds[ore]
	if float64(d2) > float64(kind.Radius*kind.Radius) {
		return ""
	}
	// The rim is ragged, and deeper in the middle than at the edge.
	d := math.Sqrt(float64(d2))
	if d > kind.Radius-1 && hash2(x, z, 3203) >= outcropEdge {
		return ""
	}
	deep := kind.Depth - int(math.Floor(float64(d/kind.Radius)*float64(kind.Depth)))
	if deep < outcropMinDepth {
		deep = outcropMinDepth
	}
	if s.Height-y >= deep {
		return ""
	}
	if s.Biome != "rocky" && !steepAt(x, z, s) {
		return ""
	}
	if decoratedAt(x, z, s) {
		return ""
	}
	return galenaMix(ore, x, y, z)
}

// steepAt says whether the ground falls away from this column at 45 degrees or more: at least as
// many blocks down as along. Only one column in 30 to 100 does, outside the mountains.
func steepAt(x, z int, s Surface) bool {
	for _, d := range [4][2]int{{outcropReach, 0}, {-outcropReach, 0}, {0, outcropReach}, {0, -outcropReach}} {
		nx, nz := float64(x+d[0]), float64(z+d[1])
		if s.Height-terrainHeight(nx, nz, sampleClimate(nx, nz)) >= outcropSlope {
			return true
		}
	}
	return false
}

// decoratedAt says whether anything grows on this column: the same rolls as Generate. An outcrop
// leaves it alone, so no tree stands on coal and no flower on iron.
func decoratedAt(x, z int, s Surface) bool {
	if treeAt(x, z, s) != "" {
		return true
	}
	decorRoll := hash2(x, z, 2048)
	switch s.Biome {
	case "desert":
		return hash2(x, z, 999) < 0.012
	case "forest":
		return decorRoll < 0.08
	case "plains":
		return decorRoll < 0.14
	case "rocky":
		return decorRoll < 0.012
	}
	return false
}

// outcropMaxDepth is the deepest any patch reaches, in blocks from the top of the column.
const outcropMaxDepth = 3

// oreAt is the ore at a cell of a column at or below its surface, or "".
func oreAt(x, y, z int, s Surface, soilDepth int, veins *veinMemo) string {
	if y == BedrockY || (y == BedrockY+1 && hash3(x, y, z, 5) < 0.5) {
		return ""
	}
	depth := s.Height - y
	if depth < outcropMaxDepth {
		if ore := outcropOreAt(x, y, z, s); ore != "" {
			return ore
		}
	}
	if depth > soilDepth {
		return veinOreAt(x, y, z, veins)
	}
	return ""
}

// IsNaturalOre says whether a block is one of the ores the world is made with.
func IsNaturalOre(name string) bool {
	_, ok := veinKinds[name]
	return ok
}
