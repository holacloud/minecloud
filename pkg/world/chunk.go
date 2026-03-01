package world

type Chunk struct {
	X, Z     int
	Blocks   [][]uint8
	Modified bool
}

func NewChunk(x, z int) *Chunk {
	return &Chunk{
		X:      x,
		Z:      z,
		Blocks: make([][]uint8, 16),
	}
}
