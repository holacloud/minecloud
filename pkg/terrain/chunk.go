package terrain

import (
	"math"
	"strings"
)

// Chunk geometry, shared with the client (js/chunkStore.js).
const (
	ChunkSize   = 16
	WorldMinY   = -16
	WorldHeight = 256
	WorldMaxY   = WorldMinY + WorldHeight - 1
	ChunkVolume = ChunkSize * ChunkSize * WorldHeight
	treeMargin  = 3
)

// ChunkIndex is the y-major, then z, then x layout used everywhere.
func ChunkIndex(lx, y, lz int) int {
	return ((y-WorldMinY)*ChunkSize+lz)*ChunkSize + lx
}

// Chunk is a column of blocks stored as indices into a palette of block names.
// Palette[0] is always "air".
type Chunk struct {
	X, Z    int
	Biome   string
	Palette []string
	Blocks  []uint16
	ids     map[string]uint16
}

func NewChunk(x, z int) *Chunk {
	return &Chunk{X: x, Z: z, Palette: []string{"air"}, Blocks: make([]uint16, ChunkVolume), ids: map[string]uint16{"air": 0}}
}

// PaletteID returns (adding if needed) the palette index of a block name.
func (c *Chunk) PaletteID(name string) uint16 {
	if c.ids == nil {
		c.ids = make(map[string]uint16, len(c.Palette))
		for i, n := range c.Palette {
			c.ids[n] = uint16(i)
		}
	}
	if id, ok := c.ids[name]; ok {
		return id
	}
	id := uint16(len(c.Palette))
	c.Palette = append(c.Palette, name)
	c.ids[name] = id
	return id
}

// Get returns the block name at local coordinates ("air" outside the height range).
func (c *Chunk) Get(lx, y, lz int) string {
	if y < WorldMinY || y > WorldMaxY {
		return "air"
	}
	return c.Palette[c.Blocks[ChunkIndex(lx, y, lz)]]
}

// Set writes a block name at local coordinates; returns false when out of range or unchanged.
func (c *Chunk) Set(lx, y, lz int, name string) bool {
	if y < WorldMinY || y > WorldMaxY {
		return false
	}
	id := c.PaletteID(name)
	index := ChunkIndex(lx, y, lz)
	if c.Blocks[index] == id {
		return false
	}
	c.Blocks[index] = id
	return true
}

var plants = map[string]bool{"tall_grass": true, "flower_red": true, "flower_yellow": true, "mushroom_red": true, "mushroom_brown": true}

// Generate builds a self-contained chunk: terrain, water and decoration inside it, plus
// the parts of trees rooted in a small margin around it that fall inside.
func Generate(chunkX, chunkZ int) *Chunk {
	c := NewChunk(chunkX, chunkZ)
	minX := chunkX * ChunkSize
	minZ := chunkZ * ChunkSize
	plantIDs := map[uint16]bool{}
	for name := range plants {
		plantIDs[c.PaletteID(name)] = true
	}

	// put writes a block inside this chunk; onlyIntoAir keeps existing non-plant blocks.
	put := func(x, y, z int, name string, onlyIntoAir bool) {
		lx := x - minX
		lz := z - minZ
		if lx < 0 || lz < 0 || lx >= ChunkSize || lz >= ChunkSize || y < WorldMinY || y > WorldMaxY {
			return
		}
		index := ChunkIndex(lx, y, lz)
		current := c.Blocks[index]
		if onlyIntoAir && current != 0 && !plantIDs[current] {
			return
		}
		c.Blocks[index] = c.PaletteID(name)
	}

	generateTree := func(x, y, z int, woodType string) {
		leaves := "leaves"
		if woodType != "wood" {
			leaves = strings.Replace(woodType, "_wood", "_leaves", 1)
		}
		shape, ok := treeShapes[woodType]
		if !ok {
			shape = treeShapes["wood"]
		}
		trunkHeight := shape.trunkMin + int(math.Floor(hash2(x, z, 2024)*float64(shape.trunkMax-shape.trunkMin+1)))
		top := y + trunkHeight
		solidLeaf := func(lx, ly, lz int) { put(lx, ly, lz, leaves, true) }
		// Ragged edges: drop a few outer leaves deterministically.
		leaf := func(lx, ly, lz int) {
			if hash3(lx, ly, lz, 4242) < 0.12 {
				return
			}
			solidLeaf(lx, ly, lz)
		}

		switch shape.canopy {
		case "cone":
			for ly := top - trunkHeight + 2; ly <= top+1; ly++ {
				t := float64(top+1-ly) / float64(trunkHeight-1)
				radius := int(jsRound(float64(0.4+float64(t*2.4)) - float64(float64((top-ly)%2)*0.6)))
				for dx := -radius; dx <= radius; dx++ {
					for dz := -radius; dz <= radius; dz++ {
						if float64(absInt(dx)+absInt(dz)) > float64(radius)+0.5 {
							continue
						}
						if dx == 0 && dz == 0 && ly < top {
							continue
						}
						solidLeaf(x+dx, ly, z+dz)
					}
				}
			}
		case "flat":
			for dx := -3; dx <= 3; dx++ {
				for dz := -3; dz <= 3; dz++ {
					d := jsHypot(float64(dx), float64(dz))
					if d > 3.2 {
						continue
					}
					leaf(x+dx, top, z+dz)
					if d < 1.8 {
						leaf(x+dx, top+1, z+dz)
					}
				}
			}
		default:
			radius := shape.radius
			if radius == 0 {
				radius = 2.2
			}
			centerY := float64(top) - 0.5
			r := int(math.Ceil(radius))
			for dy := -r; dy <= r; dy++ {
				for dx := -r; dx <= r; dx++ {
					for dz := -r; dz <= r; dz++ {
						d := jsHypot(float64(dx), float64(float64(dy)*1.05), float64(dz))
						if d > radius {
							continue
						}
						if dx == 0 && dz == 0 && dy < 1 {
							continue
						}
						ly := int(jsRound(centerY + float64(dy)))
						if d > radius-0.8 {
							leaf(x+dx, ly, z+dz)
						} else {
							solidLeaf(x+dx, ly, z+dz)
						}
					}
				}
			}
			if shape.canopy == "willow" {
				for _, o := range [][2]int{{-3, 0}, {3, 0}, {0, -3}, {0, 3}, {-2, -2}, {2, 2}, {-2, 2}, {2, -2}} {
					length := 2 + int(math.Floor(hash2(x+o[0], z+o[1], 77)*3))
					for i := range length {
						solidLeaf(x+o[0], top-1-i, z+o[1])
					}
				}
			}
		}

		for ty := range trunkHeight {
			put(x, y+ty, z, woodType, false)
		}
	}

	// 1. Terrain, water and single-column decoration inside the chunk.
	for lx := range ChunkSize {
		for lz := range ChunkSize {
			worldX := minX + lx
			worldZ := minZ + lz
			s := ColumnSurface(worldX, worldZ)
			soilDepth := soilDepthAt(worldX, worldZ, s)

			for y := BedrockY; y <= s.Height; y++ {
				put(worldX, y, worldZ, blockAt(worldX, y, worldZ, s, soilDepth), false)
			}
			for y := s.Height + 1; y <= WaterLevel; y++ {
				put(worldX, y, worldZ, "water", false)
			}
			if s.Height < WaterLevel {
				continue
			}

			roll := hash2(worldX, worldZ, 999)
			decorRoll := hash2(worldX, worldZ, 2048)
			if treeAt(worldX, worldZ, s) != "" {
				continue
			}

			switch {
			case s.Biome == "desert" && roll < 0.012:
				cactusHeight := 2 + int(math.Floor(hash2(worldX, worldZ, 3030)*3))
				for cy := range cactusHeight {
					put(worldX, s.Height+1+cy, worldZ, "cactus", false)
				}
			case s.Biome == "forest" && decorRoll < 0.08:
				plant := "tall_grass"
				switch {
				case decorRoll < 0.015:
					plant = "mushroom_red"
				case decorRoll < 0.03:
					plant = "mushroom_brown"
				case decorRoll < 0.04:
					plant = "flower_red"
				case decorRoll < 0.045:
					plant = "flower_yellow"
				}
				put(worldX, s.Height+1, worldZ, plant, false)
			case s.Biome == "plains" && !s.Beach && decorRoll < 0.14:
				// Flowers cluster in meadows instead of being sprinkled uniformly.
				meadow := fbm(float64(worldX), float64(worldZ), 20, 2, 303)
				plant := "tall_grass"
				if meadow > 0.62 && decorRoll < 0.06 {
					plant = "flower_yellow"
					if decorRoll < 0.03 {
						plant = "flower_red"
					}
				}
				put(worldX, s.Height+1, worldZ, plant, false)
			case s.Biome == "rocky" && decorRoll < 0.012:
				plant := "tall_grass"
				if hash2(worldX, worldZ, 1888) < 0.5 {
					plant = "mushroom_brown"
				}
				put(worldX, s.Height+1, worldZ, plant, false)
			}
		}
	}

	// 2. Trees rooted inside the chunk or its margin. Global (x, z) order keeps overlapping
	//    canopies consistent between the chunks that share them.
	for worldX := minX - treeMargin; worldX < minX+ChunkSize+treeMargin; worldX++ {
		for worldZ := minZ - treeMargin; worldZ < minZ+ChunkSize+treeMargin; worldZ++ {
			s := ColumnSurface(worldX, worldZ)
			if woodType := treeAt(worldX, worldZ, s); woodType != "" {
				generateTree(worldX, s.Height+1, worldZ, woodType)
			}
		}
	}

	center := ChunkSize / 2
	c.Biome = dominantBiome(sampleClimate(float64(minX+center), float64(minZ+center)))
	return c
}

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
