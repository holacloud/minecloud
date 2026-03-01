package world

type World struct {
	Chunks map[string]*Chunk
}

func New() *World {
	return &World{
		Chunks: make(map[string]*Chunk),
	}
}

func (w *World) GetChunkKey(x, z int) string {
	return string(rune(x)) + "," + string(rune(z))
}
