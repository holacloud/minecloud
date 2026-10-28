package terrain

import "math"

const (
	WaterLevel = 5
	BedrockY   = -5
)

// Climate holds the continuous biome weights of a column; heights blend between biomes
// so borders are smooth.
type Climate struct {
	Mountain, Desert, Forest, Plains, Continental float64
}

// Surface describes the top of a terrain column.
type Surface struct {
	Climate Climate
	Biome   string
	Height  int
	Beach   bool
}

func sampleClimate(x, z float64) Climate {
	temperature := fbm(x, z, 260, 3, 11)
	moisture := fbm(x, z, 210, 3, 23)
	continental := fbm(x, z, 240, 3, 37)

	mountain := smoothstep(0.56, 0.72, continental)
	desert := float64(float64(smoothstep(0.54, 0.64, temperature)*(1-smoothstep(0.42, 0.52, moisture))) * (1 - mountain))
	forest := float64(float64(smoothstep(0.5, 0.62, moisture)*(1-desert)) * (1 - mountain))
	plains := math.Max(0, 1-mountain-desert-forest)
	return Climate{Mountain: mountain, Desert: desert, Forest: forest, Plains: plains, Continental: continental}
}

func dominantBiome(c Climate) string {
	best := "plains"
	weight := c.Plains
	if c.Forest > weight {
		best = "forest"
		weight = c.Forest
	}
	if c.Desert > weight {
		best = "desert"
		weight = c.Desert
	}
	if c.Mountain > weight {
		best = "rocky"
	}
	return best
}

func terrainHeight(x, z float64, c Climate) int {
	hills := fbm(x, z, 64, 4, 51)
	detail := fbm(x, z, 18, 2, 67)

	plainsHeight := float64(5+float64(hills*6)) + float64(detail*1.5)
	forestHeight := float64(5+float64(hills*8)) + float64(detail*2)
	dunes := float64(math.Abs(fbm(x, z, 28, 2, 79)-0.5) * 2)
	desertHeight := float64(4+float64(hills*3)) + float64(dunes*3)
	ridges := 1 - float64(math.Abs(fbm(x, z, 70, 4, 83)-0.5)*2)
	mountainHeight := float64(float64(7+float64(hills*8))+float64(float64(ridges*ridges)*16)) + float64(detail*2)

	height := float64(float64(float64(plainsHeight*c.Plains)+float64(forestHeight*c.Forest))+float64(desertHeight*c.Desert)) + float64(mountainHeight*c.Mountain)

	// Lakes: carve gently below the water level, never inside mountains.
	lake := fbm(x, z, 90, 3, 97)
	lakeStrength := float64(smoothstep(0.6, 0.72, lake) * (1 - c.Mountain))
	if lakeStrength > 0 {
		height = lerp(height, float64(WaterLevel-1)-float64(lakeStrength*3), lakeStrength)
	}
	return int(math.Floor(height))
}

// ColumnSurface evaluates the terrain column at integer world coordinates.
func ColumnSurface(worldX, worldZ int) Surface {
	x := float64(worldX)
	z := float64(worldZ)
	climate := sampleClimate(x, z)
	biome := dominantBiome(climate)
	height := terrainHeight(x, z, climate)
	beach := biome != "rocky" && height <= WaterLevel+1 && fbm(x, z, 40, 2, 131) > 0.35
	return Surface{Climate: climate, Biome: biome, Height: height, Beach: beach}
}

type treeShape struct {
	trunkMin, trunkMax int
	canopy             string
	radius             float64
}

var treeShapes = map[string]treeShape{
	"wood":          {4, 6, "round", 0},
	"birch_wood":    {5, 7, "round", 1.6},
	"spruce_wood":   {6, 9, "cone", 0},
	"jungle_wood":   {7, 10, "round", 2.6},
	"dark_oak_wood": {5, 7, "round", 2.8},
	"acacia_wood":   {4, 6, "flat", 0},
	"cherry_wood":   {4, 6, "round", 2.6},
	"maple_wood":    {5, 7, "round", 2.3},
	"willow_wood":   {5, 7, "willow", 0},
}

var (
	forestTrees = []string{"wood", "spruce_wood", "birch_wood", "jungle_wood", "dark_oak_wood", "cherry_wood", "maple_wood", "willow_wood"}
	rockyTrees  = []string{"spruce_wood"}
	plainsTrees = []string{"wood", "birch_wood", "acacia_wood", "maple_wood"}
)

// treeAt returns the wood type of a tree rooted at this column, or "".
func treeAt(worldX, worldZ int, s Surface) string {
	if s.Height < WaterLevel || s.Beach || s.Biome == "desert" {
		return ""
	}
	c := s.Climate
	treeChance := float64(float64(c.Forest*0.045)+float64(c.Plains*0.006)) + float64(c.Mountain*0.004)
	if hash2(worldX, worldZ, 999) >= treeChance {
		return ""
	}
	types := plainsTrees
	if s.Biome == "forest" {
		types = forestTrees
	} else if s.Biome == "rocky" {
		types = rockyTrees
	}
	// Neighbouring trees tend to share a species, which reads as groves.
	grove := fbm(float64(worldX), float64(worldZ), 24, 1, 1777)
	return types[int(math.Floor(float64(grove*float64(len(types)))*0.999))]
}

func soilDepthAt(worldX, worldZ int, s Surface) int {
	if s.Biome == "rocky" {
		return 1
	}
	return 3 + int(math.Floor(hash2(worldX, worldZ, 141)*2))
}

// blockAt is the block type of a terrain cell at or below the column surface.
func blockAt(worldX, y, worldZ int, s Surface, soilDepth int) string {
	depth := s.Height - y
	if y == BedrockY || (y == BedrockY+1 && hash3(worldX, y, worldZ, 5) < 0.5) {
		return "bedrock"
	}
	if depth > soilDepth {
		oreRand := hash3(worldX, y, worldZ, 100)
		switch {
		case oreRand < 0.018:
			return "coal_ore"
		case oreRand < 0.024 && y < 4:
			return "iron_ore"
		case oreRand < 0.026 && y < 1:
			return "gold_ore"
		}
		return "stone"
	}
	if s.Biome == "desert" || s.Beach {
		return "sand"
	}
	if s.Biome == "rocky" {
		if hash2(worldX, worldZ, 1700) < 0.25+float64(float64(depth)*0.1) {
			return "cobblestone"
		}
		return "stone"
	}
	if depth == 0 && s.Height >= WaterLevel {
		return "grass"
	}
	return "dirt"
}
