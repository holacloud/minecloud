package world

import (
	"encoding/base64"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
)

const (
	Seed             = 1337
	SeaLevel         = 5
	MinWorldY        = -59
	BedrockThickness = 2
)

type Climate struct {
	Continentalness float64 `json:"continentalness"`
	Erosion         float64 `json:"erosion"`
	Temperature     float64 `json:"temperature"`
	Humidity        float64 `json:"humidity"`
	Weirdness       float64 `json:"weirdness"`
	River           float64 `json:"river"`
	Lake            float64 `json:"lake"`
}

type TerrainSample struct {
	X            int     `json:"x"`
	Y            int     `json:"y"`
	Z            int     `json:"z"`
	Height       int     `json:"height"`
	HeightFloat  float64 `json:"heightFloat"`
	WaterLevel   int     `json:"waterLevel"`
	Slope        float64 `json:"slope"`
	Biome        string  `json:"biome"`
	Label        string  `json:"label"`
	SurfaceBlock string  `json:"surfaceBlock"`
	Climate      Climate `json:"climate"`
}

type InspectBlock struct {
	X    int    `json:"x"`
	Y    int    `json:"y"`
	Z    int    `json:"z"`
	Type string `json:"type"`
}

type InspectResponse struct {
	CenterX   int            `json:"centerX"`
	CenterZ   int            `json:"centerZ"`
	Radius    int            `json:"radius"`
	Step      int            `json:"step"`
	Vertical  int            `json:"verticalStep"`
	ClipY     int            `json:"clipY"`
	MinY      int            `json:"minY"`
	SeaLevel  int            `json:"seaLevel"`
	Mode      string         `json:"mode"`
	Center    TerrainSample  `json:"center"`
	Blocks    []InspectBlock `json:"blocks"`
	Truncated bool           `json:"truncated"`
	Error     string         `json:"error,omitempty"`
}

type TileResponse struct {
	OriginX      int      `json:"originX"`
	OriginZ      int      `json:"originZ"`
	Size         int      `json:"size"`
	Step         int      `json:"step"`
	Vertical     int      `json:"verticalStep"`
	ClipY        int      `json:"clipY"`
	Mode         string   `json:"mode"`
	Columns      int      `json:"columns"`
	Rows         int      `json:"rows"`
	Palette      []string `json:"palette"`
	SurfaceY     []int    `json:"surfaceY,omitempty"`
	SurfaceTypes []int    `json:"surfaceTypes,omitempty"`
	X            []int    `json:"x,omitempty"`
	Y            []int    `json:"y,omitempty"`
	Z            []int    `json:"z,omitempty"`
	Types        []int    `json:"types,omitempty"`
	Error        string   `json:"error,omitempty"`
}

type CubeResponse struct {
	OriginX int      `json:"originX"`
	OriginY int      `json:"originY"`
	OriginZ int      `json:"originZ"`
	Size    int      `json:"size"`
	Palette []string `json:"palette"`
	Data    string   `json:"data"`
	Error   string   `json:"error,omitempty"`
}

type SpawnResponse struct {
	X      float64       `json:"x"`
	Y      float64       `json:"y"`
	Z      float64       `json:"z"`
	Yaw    float64       `json:"yaw"`
	Pitch  float64       `json:"pitch"`
	Sample TerrainSample `json:"sample"`
}

type biomeDef struct {
	Label           string
	Temp            float64
	Humidity        float64
	Continentalness float64
	Erosion         float64
	MinHeight       int
	MaxHeight       int
	Top             string
	Filler          string
	Sub             string
	TreeChance      float64
	DecorChance     float64
	CactusChance    float64
	Trees           []string
}

var biomes = map[string]biomeDef{
	"deep_ocean":      {"Deep Ocean", 0.48, 0.72, 0.04, 0.65, -20, 2, "sand", "sand", "stone", 0, 0, 0, nil},
	"ocean":           {"Ocean", 0.5, 0.7, 0.18, 0.7, -12, 5, "sand", "sand", "stone", 0, 0, 0, nil},
	"beach":           {"Beach", 0.58, 0.46, 0.34, 0.72, 3, 8, "sand", "sand", "stone", 0, 0, 0, nil},
	"plains":          {"Plains", 0.55, 0.42, 0.56, 0.72, 4, 18, "grass", "dirt", "stone", 0.01, 0.085, 0, []string{"wood", "birch_wood", "maple_wood"}},
	"forest":          {"Forest", 0.52, 0.68, 0.58, 0.58, 4, 22, "grass", "dirt", "stone", 0.04, 0.075, 0, []string{"wood", "birch_wood", "dark_oak_wood", "cherry_wood", "maple_wood"}},
	"light_forest":    {"Light Forest", 0.58, 0.58, 0.54, 0.68, 4, 20, "grass", "dirt", "stone", 0.024, 0.09, 0, []string{"birch_wood", "wood", "maple_wood"}},
	"dark_forest":     {"Dark Forest", 0.44, 0.78, 0.62, 0.48, 4, 22, "grass", "dirt", "stone", 0.05, 0.07, 0, []string{"dark_oak_wood", "spruce_wood"}},
	"taiga":           {"Taiga", 0.28, 0.58, 0.6, 0.55, 5, 24, "grass", "dirt", "stone", 0.036, 0.04, 0, []string{"spruce_wood", "birch_wood"}},
	"snowy_taiga":     {"Snowy Taiga", 0.14, 0.58, 0.62, 0.5, 5, 24, "white_wool", "dirt", "stone", 0.032, 0.022, 0, []string{"spruce_wood"}},
	"snowy_plains":    {"Snowy Plains", 0.12, 0.36, 0.55, 0.72, 4, 18, "white_wool", "dirt", "stone", 0.004, 0.018, 0, []string{"spruce_wood"}},
	"desert":          {"Desert", 0.9, 0.14, 0.6, 0.62, 4, 20, "sand", "sand", "stone", 0, 0.012, 0.028, nil},
	"savanna":         {"Savanna", 0.82, 0.34, 0.58, 0.62, 4, 22, "grass", "dirt", "stone", 0.012, 0.05, 0, []string{"acacia_wood"}},
	"badlands":        {"Badlands", 0.82, 0.18, 0.72, 0.24, 8, 30, "orange_brick", "red_brick", "stone", 0.001, 0.006, 0.012, nil},
	"jungle":          {"Jungle", 0.82, 0.86, 0.62, 0.46, 4, 24, "grass", "dirt", "stone", 0.055, 0.11, 0, []string{"jungle_wood", "willow_wood"}},
	"swamp":           {"Swamp", 0.62, 0.9, 0.42, 0.82, 2, 9, "grass", "dirt", "stone", 0.026, 0.1, 0, []string{"willow_wood", "dark_oak_wood"}},
	"meadow":          {"Meadow", 0.42, 0.5, 0.66, 0.5, 10, 26, "grass", "dirt", "stone", 0.006, 0.12, 0, []string{"birch_wood", "cherry_wood"}},
	"mountains":       {"Mountains", 0.34, 0.44, 0.72, 0.18, 16, 48, "stone", "cobblestone", "stone", 0.006, 0.018, 0, []string{"spruce_wood"}},
	"snowy_mountains": {"Snowy Mountains", 0.14, 0.42, 0.7, 0.2, 15, 52, "white_wool", "stone", "stone", 0.003, 0.01, 0, []string{"spruce_wood"}},
	"stony_peaks":     {"Stony Peaks", 0.5, 0.24, 0.78, 0.12, 18, 56, "stone", "cobblestone", "stone", 0, 0.006, 0, nil},
	"river":           {"River", 0.5, 0.5, 0.5, 0.5, -10, 5, "sand", "dirt", "stone", 0, 0, 0, nil},
	"frozen_river":    {"Frozen River", 0.1, 0.5, 0.5, 0.5, -10, 5, "sand", "dirt", "stone", 0, 0, 0, nil},
}

func HandleTerrainInspect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	centerX := queryInt(r, "x", 0)
	centerZ := queryInt(r, "z", 0)
	radius := clamp(queryInt(r, "radius", 160), 16, 19200)
	requestedStep := queryInt(r, "step", 0)
	step := requestedStep
	if requestedStep <= 0 {
		step = autoStep(radius)
	}
	step = clamp(step, 1, 256)
	vertical := clamp(queryInt(r, "verticalStep", min(step, 16)), 1, 16)
	clipY := clamp(queryInt(r, "clipY", 32), MinWorldY, 2048)
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "visible"
	}
	surfaceOnly := mode == "surface"

	columns := ((radius * 2) / step) + 1
	verticalSamples := ((clipY - MinWorldY) / vertical) + 1
	if surfaceOnly {
		verticalSamples = 1
	}
	workEstimate := columns * columns * verticalSamples
	if workEstimate > 2800000 {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(InspectResponse{CenterX: centerX, CenterZ: centerZ, Radius: radius, Step: step, Vertical: vertical, ClipY: clipY, MinY: MinWorldY, SeaLevel: SeaLevel, Mode: mode, Center: SampleTerrain(centerX, centerZ), Blocks: []InspectBlock{}, Truncated: true, Error: "selection too dense; use /api/terrain/tile or increase sampling"})
		return
	}

	blocks := make([]InspectBlock, 0, min(180000, workEstimate))
	maxBlocks := 260000
	truncated := false
	minX, maxX := centerX-radius, centerX+radius
	minZ, maxZ := centerZ-radius, centerZ+radius
	for x := minX; x <= maxX; x += step {
		for z := minZ; z <= maxZ; z += step {
			profile := SampleTerrain(x, z)
			topY := min(clipY, max(MinWorldY, profile.Height))
			if profile.Height <= profile.WaterLevel {
				topY = min(clipY, profile.WaterLevel)
			}
			if surfaceOnly {
				blockType := ProceduralBlockTypeAt(x, topY, z, &profile)
				if blockType != "" {
					blocks = append(blocks, InspectBlock{X: x, Y: topY, Z: z, Type: blockType})
				}
				continue
			}
			for y := MinWorldY; y <= topY; y += vertical {
				blockType := ProceduralBlockTypeAt(x, y, z, &profile)
				if blockType == "" {
					continue
				}
				if mode == "visible" && !VisibleAt(x, y, z, clipY, step, vertical) {
					continue
				}
				blocks = append(blocks, InspectBlock{X: x, Y: y, Z: z, Type: blockType})
				if len(blocks) >= maxBlocks {
					//truncated = true
					break
				}
			}
			if truncated {
				break
			}
		}
		if truncated {
			break
		}
	}

	features := GenerateFeaturesForRegion(minX, maxX, minZ, maxZ)
	for _, f := range features {
		if f.X >= minX && f.X <= maxX && f.Z >= minZ && f.Z <= maxZ {
			if f.Y > clipY {
				continue
			}
			if mode == "visible" && !VisibleAt(f.X, f.Y, f.Z, clipY, step, vertical) {
				continue
			}
			blocks = append(blocks, InspectBlock{X: f.X, Y: f.Y, Z: f.Z, Type: f.Type})
		}
	}

	if truncated {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(InspectResponse{CenterX: centerX, CenterZ: centerZ, Radius: radius, Step: step, Vertical: vertical, ClipY: clipY, MinY: MinWorldY, SeaLevel: SeaLevel, Mode: mode, Center: SampleTerrain(centerX, centerZ), Blocks: []InspectBlock{}, Truncated: true, Error: "selection returned too many visible blocks; increase sampling or reduce radius/Y range"})
		return
	}
	_ = json.NewEncoder(w).Encode(InspectResponse{CenterX: centerX, CenterZ: centerZ, Radius: radius, Step: step, Vertical: vertical, ClipY: clipY, MinY: MinWorldY, SeaLevel: SeaLevel, Mode: mode, Center: SampleTerrain(centerX, centerZ), Blocks: blocks, Truncated: false})
}

func HandleTerrainTile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	originX := queryInt(r, "x", 0)
	originZ := queryInt(r, "z", 0)
	size := clamp(queryInt(r, "size", 256), 16, 2048)
	step := clamp(queryInt(r, "step", 8), 1, 256)
	vertical := clamp(queryInt(r, "verticalStep", min(step, 16)), 1, 16)
	clipY := clamp(queryInt(r, "clipY", 32), MinWorldY, 2048)
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "surface"
	}

	columns := (size / step) + 1
	rows := columns
	palette := make([]string, 0, 16)
	paletteIndex := make(map[string]int, 16)
	paletteID := func(blockType string) int {
		if id, ok := paletteIndex[blockType]; ok {
			return id
		}
		id := len(palette)
		palette = append(palette, blockType)
		paletteIndex[blockType] = id
		return id
	}

	if mode == "surface" {
		surfaceY := make([]int, 0, columns*rows)
		surfaceTypes := make([]int, 0, columns*rows)
		for x := originX; x <= originX+size; x += step {
			for z := originZ; z <= originZ+size; z += step {
				profile := SampleTerrain(x, z)
				y := min(clipY, max(MinWorldY, profile.Height))
				if profile.Height <= profile.WaterLevel {
					y = min(clipY, profile.WaterLevel)
				}
				blockType := ProceduralBlockTypeAt(x, y, z, &profile)
				if blockType == "" {
					blockType = "air"
				}
				surfaceY = append(surfaceY, y)
				surfaceTypes = append(surfaceTypes, paletteID(blockType))
			}
		}
		xs := make([]int, 0)
		ys := make([]int, 0)
		zs := make([]int, 0)
		types := make([]int, 0)
		if step <= 4 && size <= 512 {
			features := GenerateFeaturesForRegion(originX, originX+size, originZ, originZ+size)
			for _, f := range features {
				if f.X < originX || f.X > originX+size || f.Z < originZ || f.Z > originZ+size || f.Y > clipY {
					continue
				}
				xs = append(xs, f.X)
				ys = append(ys, f.Y)
				zs = append(zs, f.Z)
				types = append(types, paletteID(f.Type))
			}
		}
		_ = json.NewEncoder(w).Encode(TileResponse{OriginX: originX, OriginZ: originZ, Size: size, Step: step, Vertical: vertical, ClipY: clipY, Mode: mode, Columns: columns, Rows: rows, Palette: palette, SurfaceY: surfaceY, SurfaceTypes: surfaceTypes, X: xs, Y: ys, Z: zs, Types: types})
		return
	}

	workEstimate := columns * rows * (((clipY - MinWorldY) / vertical) + 1)
	if workEstimate > 650000 {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(TileResponse{OriginX: originX, OriginZ: originZ, Size: size, Step: step, Vertical: vertical, ClipY: clipY, Mode: mode, Columns: columns, Rows: rows, Error: "tile too dense; increase sampling or use surface mode"})
		return
	}

	xs := make([]int, 0, min(70000, workEstimate))
	ys := make([]int, 0, min(70000, workEstimate))
	zs := make([]int, 0, min(70000, workEstimate))
	types := make([]int, 0, min(70000, workEstimate))
	for x := originX; x <= originX+size; x += step {
		for z := originZ; z <= originZ+size; z += step {
			profile := SampleTerrain(x, z)
			topY := min(clipY, max(MinWorldY, profile.Height))
			if profile.Height <= profile.WaterLevel {
				topY = min(clipY, profile.WaterLevel)
			}
			for y := MinWorldY; y <= topY; y += vertical {
				blockType := ProceduralBlockTypeAt(x, y, z, &profile)
				if blockType == "" {
					continue
				}
				if mode == "visible" && !VisibleAt(x, y, z, clipY, step, vertical) {
					continue
				}
				xs = append(xs, x)
				ys = append(ys, y)
				zs = append(zs, z)
				types = append(types, paletteID(blockType))
			}
		}
	}

	features := GenerateFeaturesForRegion(originX, originX+size, originZ, originZ+size)
	for _, f := range features {
		if f.X >= originX && f.X <= originX+size && f.Z >= originZ && f.Z <= originZ+size {
			if f.Y > clipY {
				continue
			}
			if mode == "visible" && !VisibleAt(f.X, f.Y, f.Z, clipY, step, vertical) {
				continue
			}
			xs = append(xs, f.X)
			ys = append(ys, f.Y)
			zs = append(zs, f.Z)
			types = append(types, paletteID(f.Type))
		}
	}

	_ = json.NewEncoder(w).Encode(TileResponse{OriginX: originX, OriginZ: originZ, Size: size, Step: step, Vertical: vertical, ClipY: clipY, Mode: mode, Columns: columns, Rows: rows, Palette: palette, X: xs, Y: ys, Z: zs, Types: types})
}

func HandleTerrainCube(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	originX := queryInt(r, "x", 0)
	originY := clamp(queryInt(r, "y", MinWorldY), MinWorldY, 2048)
	originZ := queryInt(r, "z", 0)
	size := clamp(queryInt(r, "size", 64), 16, 64)

	palette := []string{"air"}
	paletteIndex := map[string]byte{"air": 0}
	paletteID := func(blockType string) byte {
		if blockType == "" {
			blockType = "air"
		}
		if id, ok := paletteIndex[blockType]; ok {
			return id
		}
		if len(palette) >= 256 {
			return 0
		}
		id := byte(len(palette))
		palette = append(palette, blockType)
		paletteIndex[blockType] = id
		return id
	}

	data := make([]byte, size*size*size)
	profiles := make(map[[2]int]TerrainSample, size*size)
	for lx := 0; lx < size; lx++ {
		wx := originX + lx
		for lz := 0; lz < size; lz++ {
			wz := originZ + lz
			profile := SampleTerrain(wx, wz)
			profiles[[2]int{lx, lz}] = profile
			for ly := 0; ly < size; ly++ {
				wy := originY + ly
				idx := (ly*size+lz)*size + lx
				data[idx] = paletteID(ProceduralBlockTypeAt(wx, wy, wz, &profile))
			}
		}
	}
	_ = profiles

	features := GenerateFeaturesForRegion(originX, originX+size, originZ, originZ+size)
	for _, f := range features {
		if f.X >= originX && f.X < originX+size && f.Z >= originZ && f.Z < originZ+size && f.Y >= originY && f.Y < originY+size {
			lx := f.X - originX
			ly := f.Y - originY
			lz := f.Z - originZ
			idx := (ly*size+lz)*size + lx
			data[idx] = paletteID(f.Type)
		}
	}

	_ = json.NewEncoder(w).Encode(CubeResponse{OriginX: originX, OriginY: originY, OriginZ: originZ, Size: size, Palette: palette, Data: base64.StdEncoding.EncodeToString(data)})
}

func HandleTerrainSpawn(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	spawn := FindSpawn()
	_ = json.NewEncoder(w).Encode(spawn)
}

func FindSpawn() SpawnResponse {
	best := SampleTerrain(0, 0)
	bestScore := -1e9
	for r := 0; r <= 2200; r += 16 {
		for x := -r; x <= r; x += 16 {
			for _, z := range []int{-r, r} {
				s := SampleTerrain(x, z)
				score := spawnScore(s)
				if score > bestScore {
					best, bestScore = s, score
				}
			}
		}
		for z := -r + 16; z <= r-16; z += 16 {
			for _, x := range []int{-r, r} {
				s := SampleTerrain(x, z)
				score := spawnScore(s)
				if score > bestScore {
					best, bestScore = s, score
				}
			}
		}
		if bestScore > 80 {
			break
		}
	}
	return SpawnResponse{X: float64(best.X) + 0.5, Y: float64(best.Height) + 2.62, Z: float64(best.Z) + 0.5, Yaw: 0, Pitch: 0, Sample: best}
}

func spawnScore(s TerrainSample) float64 {
	if s.Height <= s.WaterLevel || s.Biome == "ocean" || s.Biome == "deep_ocean" {
		return -1000
	}
	score := 100.0 - math.Abs(float64(s.Height-8))*2 - s.Slope*50
	if s.Biome == "plains" || s.Biome == "forest" || s.Biome == "light_forest" || s.Biome == "meadow" {
		score += 30
	}
	if s.Biome == "mountains" || s.Biome == "stony_peaks" || s.Biome == "snowy_mountains" {
		score -= 30
	}
	return score
}

func SampleTerrain(x, z int) TerrainSample {
	c := SampleClimate(float64(x), float64(z))
	hf := SampleHeight(float64(x), float64(z), c)
	slope := SampleSlope(float64(x), float64(z), c)
	biome := PickBiome(c, hf, slope)
	surface := PickSurfaceBlock(biome, hf, slope, c)
	def := biomes[biome]
	return TerrainSample{X: x, Z: z, HeightFloat: hf, Height: int(math.Floor(hf)), WaterLevel: SeaLevel, Slope: slope, Biome: biome, Label: def.Label, SurfaceBlock: surface, Climate: c}
}

func ProceduralBlockTypeAt(x, y, z int, profile *TerrainSample) string {
	var p TerrainSample
	if profile == nil {
		p = SampleTerrain(x, z)
		profile = &p
	}
	def := biomes[profile.Biome]
	height := max(MinWorldY+BedrockThickness+1, profile.Height)
	if y > height && y <= profile.WaterLevel {
		if y == profile.WaterLevel && profile.Climate.Temperature < 0.18 {
			return "ice"
		}
		return "water"
	}
	if y > height {
		return ""
	}
	if y <= MinWorldY+BedrockThickness-1 {
		return "bedrock"
	}
	if IsCaveAt(x, y, z, height) {
		return ""
	}
	if y < height-3 || (profile.Slope > 0.5 && y < height-1) {
		ore := seededRand(float64(x), float64(z), float64(y*100))
		if ore < 0.02 {
			return "coal_ore"
		}
		if ore < 0.025 {
			return "iron_ore"
		}
		if ore < 0.026 {
			return "gold_ore"
		}
		return def.Sub
	}
	if y == height {
		if profile.SurfaceBlock == "stone" && def.Filler == "cobblestone" {
			if seededRand(float64(x), float64(z), 1700) < 0.65 {
				return "stone"
			}
			return "cobblestone"
		}
		if profile.SurfaceBlock == "water" || profile.SurfaceBlock == "ice" {
			return def.Top
		}
		return profile.SurfaceBlock
	}
	return def.Filler
}

func VisibleAt(x, y, z, clipY, step, vertical int) bool {
	if y == clipY {
		return true
	}
	neighbors := [][3]int{{step, 0, 0}, {-step, 0, 0}, {0, vertical, 0}, {0, -vertical, 0}, {0, 0, step}, {0, 0, -step}}
	for _, n := range neighbors {
		ny := y + n[1]
		if ny > clipY {
			return true
		}
		neighbor := ProceduralBlockTypeAt(x+n[0], ny, z+n[2], nil)
		if !isOpaqueBlock(neighbor) {
			return true
		}
	}
	return false
}

func isOpaqueBlock(blockType string) bool {
	switch blockType {
	case "", "air", "water", "ice", "leaves", "tall_grass", "flower_red", "flower_yellow", "mushroom_red", "mushroom_brown":
		return false
	}
	if len(blockType) >= len("_leaves") && blockType[len(blockType)-len("_leaves"):] == "_leaves" {
		return false
	}
	return true
}

func SampleClimate(x, z float64) Climate {
	warpX := (noise2D(x+9000, z-3000, 1.0/760.0) - 0.5) * 120
	warpZ := (noise2D(x-4000, z+7400, 1.0/760.0) - 0.5) * 120
	wx, wz := x+warpX, z+warpZ
	return Climate{Continentalness: noise2D(wx+8100, wz-4400, 1.0/2200.0), Erosion: noise2D(wx-2200, wz+1600, 1.0/900.0), Temperature: noise2D(wx+1400, wz-200, 1.0/520.0), Humidity: noise2D(wx-930, wz+1180, 1.0/520.0), Weirdness: noise2D(wx+5200, wz-3100, 1.0/420.0), River: sampleRiver(x, z), Lake: sampleLake(x, z)}
}

func SampleHeight(x, z float64, c Climate) float64 {
	continentalCurve := (c.Continentalness - 0.38) * 14
	oceanShelf := 0.0
	if c.Continentalness < 0.22 {
		oceanShelf = (0.22 - c.Continentalness) * -28
	}
	coastLift := smoothstep(0.24, 0.4, c.Continentalness) * 4
	large := (noise2D(x-1700, z+900, 1.0/1800.0) - 0.5) * 8
	hills := (noise2D(x+2300, z-1300, 1.0/360.0) - 0.5) * 5 * c.Erosion
	mountainMask := smoothstep(0.34, 0.54, c.Continentalness) * smoothstep(0.0, 0.72, 1-c.Erosion) * smoothstep(0.28, 0.48, c.Weirdness)
	ridgeNoise := 1 - math.Abs(noise2D(x+2900, z+3700, 1.0/460.0)-0.5)*2
	mountainRidge := math.Pow(ridgeNoise, 0.92)
	cliffNoise := 1 - math.Abs(noise2D(x-9400, z+2700, 1.0/180.0)-0.5)*2
	cliffs := math.Pow(cliffNoise, 4.4) * smoothstep(0.42, 0.78, ridgeNoise) * mountainMask * 36
	mountains := mountainRidge*mountainMask*76 + cliffs
	valleyMask := 1 - smoothstep(0.12, 0.42, math.Abs(noise2D(x-6300, z-2800, 1.0/760.0)-0.5)*2)
	valleys := valleyMask * (0.35 + (1-c.Erosion)*0.65) * -6
	riverCut := c.River * (6 + (1-c.Erosion)*5)
	lakeCut := c.Lake * 5.5
	detail := (noise2D(x+120, z-480, 1.0/256.0) - 0.5) * 1.35
	spawnDistance := math.Sqrt(x*x + z*z)
	spawnLift := (1 - smoothstep(90, 340, spawnDistance)) * 18
	spawnCalm := (1 - smoothstep(120, 360, spawnDistance)) * -math.Abs(detail) * 0.8
	return SeaLevel + continentalCurve + oceanShelf + coastLift + large + hills + mountains + valleys + detail + spawnLift + spawnCalm - riverCut - lakeCut
}

func SampleSlope(x, z float64, c Climate) float64 {
	here := SampleHeight(x, z, c)
	dx := SampleHeight(x+4, z, SampleClimate(x+4, z)) - here
	dz := SampleHeight(x, z+4, SampleClimate(x, z+4)) - here
	return math.Min(1, math.Sqrt(dx*dx+dz*dz)/10)
}

func PickBiome(c Climate, height, slope float64) string {
	if c.River > 0.65 {
		if c.Temperature < 0.22 {
			return "frozen_river"
		}
		return "river"
	}
	if height < SeaLevel-7 {
		return "deep_ocean"
	}
	if height < SeaLevel-0.6 {
		return "ocean"
	}
	if math.Abs(height-SeaLevel) <= 2.2 && c.Continentalness < 0.52 {
		return "beach"
	}
	if c.Lake > 0.65 && c.Humidity > 0.58 && height < SeaLevel+4 {
		if c.Temperature < 0.22 {
			return "snowy_plains"
		}
		return "swamp"
	}
	if c.Weirdness > 0.54 && c.Continentalness > 0.38 && c.Erosion < 0.68 {
		if c.Temperature < 0.24 {
			return "snowy_mountains"
		}
		if c.Humidity < 0.34 {
			return "stony_peaks"
		}
		return "mountains"
	}
	if height > SeaLevel+11 || slope > 0.38 {
		if c.Temperature < 0.32 {
			return "snowy_mountains"
		}
		return "mountains"
	}
	if c.Humidity > 0.82 && height < SeaLevel+5 {
		return "swamp"
	}

	best, bestScore := "plains", math.MaxFloat64
	for name, def := range biomes {
		if name == "deep_ocean" || name == "ocean" || name == "beach" || name == "mountains" || name == "snowy_mountains" || name == "stony_peaks" {
			continue
		}
		score := math.Abs(c.Temperature-def.Temp)*1.15 + math.Abs(c.Humidity-def.Humidity) + math.Abs(c.Continentalness-def.Continentalness)*0.55 + math.Abs(c.Erosion-def.Erosion)*0.35
		if height < float64(def.MinHeight) || height > float64(def.MaxHeight) {
			score += 0.45
		}
		if score < bestScore {
			best, bestScore = name, score
		}
	}
	return best
}

func PickSurfaceBlock(biome string, height, slope float64, c Climate) string {
	if height < SeaLevel {
		if c.Temperature < 0.18 {
			return "ice"
		}
		return "water"
	}
	if math.Abs(height-SeaLevel) <= 2.2 {
		if len(biome) >= 5 && biome[:5] == "snowy" {
			return "white_wool"
		}
		if biome == "badlands" {
			return "orange_brick"
		}
		return "sand"
	}
	if slope > 0.46 {
		if len(biome) >= 5 && biome[:5] == "snowy" {
			return "white_wool"
		}
		return "stone"
	}
	return biomes[biome].Top
}

func IsCaveAt(x, y, z, surfaceHeight int) bool {
	if y >= surfaceHeight-8 || y <= MinWorldY+BedrockThickness {
		return false
	}
	depth := float64(surfaceHeight - y)
	depthMask := smoothstep(8, 16, depth)

	tunnel1 := math.Abs(noise3D(float64(x), float64(y), float64(z), 1.0/36.0)-0.5) * 2
	tunnel2 := math.Abs(noise3D(float64(x+4100), float64(y-1200), float64(z+2200), 1.0/36.0)-0.5) * 2

	thickness := 0.07 + 0.04*noise3D(float64(x-2100), float64(y+3300), float64(z-1700), 1.0/64.0)

	chamber := noise3D(float64(x+9100), float64(y-5100), float64(z+8600), 1.0/64.0)

	return depthMask > 0 && ((tunnel1 < thickness && tunnel2 < thickness) || (chamber > 0.75))
}

func sampleRiver(x, z float64) float64 {
	riverA := math.Abs(noise2D(x+5200, z-3100, 1.0/900.0)-0.5) * 2
	riverB := math.Abs(noise2D(x-2800, z+6100, 1.0/(900.0*1.35))-0.5) * 2
	main := 1 - smoothstep(0.08, 0.24, math.Min(riverA, riverB))
	tributary := 1 - smoothstep(0.044, 0.18, math.Max(0, math.Min(riverA, riverB)-0.04))
	return math.Max(main, tributary*0.55)
}

func sampleLake(x, z float64) float64 {
	basin := noise2D(x-620, z+910, 1.0/420.0)
	roundness := noise2D(x+1800, z-1900, 1.0/180.0)
	return smoothstep(0.76, 0.93, basin) * smoothstep(0.35, 0.72, roundness)
}

func noise2D(x, z, scale float64) float64 {
	ix, iz := math.Floor(x*scale), math.Floor(z*scale)
	fx, fz := x*scale-ix, z*scale-iz
	a := seededRand(ix, iz, 0)
	b := seededRand(ix+1, iz, 0)
	c := seededRand(ix, iz+1, 0)
	d := seededRand(ix+1, iz+1, 0)
	ux, uz := fx*fx*(3-2*fx), fz*fz*(3-2*fz)
	return a*(1-ux)*(1-uz) + b*ux*(1-uz) + c*(1-ux)*uz + d*ux*uz
}

func noise3D(x, y, z, scale float64) float64 {
	ix, iy, iz := math.Floor(x*scale), math.Floor(y*scale), math.Floor(z*scale)
	fx, fy, fz := x*scale-ix, y*scale-iy, z*scale-iz

	a0 := seededRand3(ix, iy, iz)
	b0 := seededRand3(ix+1, iy, iz)
	c0 := seededRand3(ix, iy+1, iz)
	d0 := seededRand3(ix+1, iy+1, iz)

	a1 := seededRand3(ix, iy, iz+1)
	b1 := seededRand3(ix+1, iy, iz+1)
	c1 := seededRand3(ix, iy+1, iz+1)
	d1 := seededRand3(ix+1, iy+1, iz+1)

	ux, uy, uz := fx*fx*(3-2*fx), fy*fy*(3-2*fy), fz*fz*(3-2*fz)

	i1 := a0*(1-ux) + b0*ux
	i2 := c0*(1-ux) + d0*ux
	i3 := a1*(1-ux) + b1*ux
	i4 := c1*(1-ux) + d1*ux

	w1 := i1*(1-uy) + i2*uy
	w2 := i3*(1-uy) + i4*uy

	return w1*(1-uz) + w2*uz
}

func seededRand(x, z, offset float64) float64 {
	n := math.Sin(x*12.9898+z*78.233+Seed+offset) * 43758.5453
	return n - math.Floor(n)
}

func seededRand3(x, y, z float64) float64 {
	n := math.Sin(x*12.9898+y*4.1414+z*78.233+Seed) * 43758.5453
	return n - math.Floor(n)
}

func smoothstep(edge0, edge1, value float64) float64 {
	t := clampFloat((value-edge0)/(edge1-edge0), 0, 1)
	return t * t * (3 - 2*t)
}

func queryInt(r *http.Request, name string, fallback int) int {
	value, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil {
		return fallback
	}
	return value
}

func autoStep(radius int) int {
	switch {
	case radius <= 80:
		return 1
	case radius <= 160:
		return 2
	case radius <= 320:
		return 4
	case radius <= 640:
		return 8
	case radius <= 1200:
		return 16
	default:
		return 32
	}
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func clampFloat(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

type FeatureBlock struct {
	X, Y, Z int
	Type    string
}

func GenerateFeaturesForRegion(minX, maxX, minZ, maxZ int) []FeatureBlock {
	var features []FeatureBlock
	for rx := minX - 2; rx <= maxX+2; rx++ {
		for rz := minZ - 2; rz <= maxZ+2; rz++ {
			p := SampleTerrain(rx, rz)
			height := max(MinWorldY+BedrockThickness+1, p.Height)
			if height <= p.WaterLevel {
				continue
			}
			def, ok := biomes[p.Biome]
			if !ok {
				continue
			}
			if def.TreeChance > 0 && seededRand(float64(rx), float64(rz), 999) < def.TreeChance && height >= 3 {
				treeTypes := def.Trees
				if len(treeTypes) == 0 {
					treeTypes = []string{"wood"}
				}
				treeIndex := int(math.Floor(seededRand(float64(rx), float64(rz), 1777) * float64(len(treeTypes))))
				if treeIndex >= len(treeTypes) {
					treeIndex = len(treeTypes) - 1
				}
				woodType := treeTypes[treeIndex]

				trunkHeight := 4 + int(math.Floor(seededRand(float64(rx), float64(rz), 2024)*2.0))
				if woodType == "dark_oak_wood" {
					trunkHeight = 4 + int(math.Floor(seededRand(float64(rx), float64(rz), 2024)*3.0))
				}

				for ty := 0; ty < trunkHeight; ty++ {
					features = append(features, FeatureBlock{rx, height + 1 + ty, rz, woodType})
				}

				leavesStart := height + 1 + trunkHeight - 2
				leavesType := "leaves"
				if woodType != "wood" {
					leavesType = strings.Replace(woodType, "_wood", "_leaves", 1)
				}
				for ly := 0; ly < 3; ly++ {
					radius := 2
					if ly == 2 {
						radius = 1
					}
					for lx := -radius; lx <= radius; lx++ {
						for lz := -radius; lz <= radius; lz++ {
							if lx == 0 && lz == 0 && ly < 2 {
								continue
							}
							if math.Abs(float64(lx)) == 2 && math.Abs(float64(lz)) == 2 {
								continue
							}
							features = append(features, FeatureBlock{rx + lx, leavesStart + ly, rz + lz, leavesType})
						}
					}
				}
			} else if def.CactusChance > 0 && seededRand(float64(rx), float64(rz), 1499) < def.CactusChance && height >= 2 {
				cactusHeight := 2 + int(math.Floor(seededRand(float64(rx), float64(rz), 3030)*3.0))
				for cy := 0; cy < cactusHeight; cy++ {
					features = append(features, FeatureBlock{rx, height + 1 + cy, rz, "cactus"})
				}
			} else {
				decorRoll := seededRand(float64(rx), float64(rz), 2048)
				if decorRoll < def.DecorChance {
					plantType := "tall_grass"
					biome := p.Biome
					if biome == "forest" || biome == "dark_forest" || biome == "jungle" || biome == "swamp" {
						if decorRoll < 0.025 {
							plantType = "mushroom_red"
						} else if decorRoll < 0.05 {
							plantType = "mushroom_brown"
						} else if decorRoll < 0.07 {
							plantType = "flower_yellow"
						}
					} else if biome == "desert" {
						if seededRand(float64(rx), float64(rz), 1888) < 0.5 {
							plantType = "mushroom_brown"
						}
					} else if biome == "mountains" || biome == "stony_peaks" {
						if seededRand(float64(rx), float64(rz), 1888) < 0.5 {
							plantType = "mushroom_brown"
						}
					} else if strings.HasPrefix(biome, "snowy") {
						plantType = "tall_grass"
					} else {
						if decorRoll < 0.025 {
							plantType = "flower_red"
						} else if decorRoll < 0.05 {
							plantType = "flower_yellow"
						}
					}
					features = append(features, FeatureBlock{rx, height + 1, rz, plantType})
				}
			}
		}
	}
	return features
}
