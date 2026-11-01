package network

import "testing"

func TestChunkStreamServesNearestToFocusFirst(t *testing.T) {
	stream := newChunkStream(&Client{})
	stream.focus(100, -40, 8)
	chunks := [][2]int{}
	for x := 92; x <= 108; x++ {
		for z := -48; z <= -32; z++ {
			chunks = append(chunks, [2]int{x, z})
		}
	}
	stream.request(chunks)

	last := -1
	served := 0
	for {
		c, ok := stream.next()
		if !ok {
			break
		}
		dx, dz := c[0]-100, c[1]+40
		distance := dx*dx + dz*dz
		if distance < last {
			t.Fatalf("chunk %v (distance² %d) served after one at distance² %d", c, distance, last)
		}
		last = distance
		served++
	}
	if served != len(chunks) {
		t.Fatalf("served %d of %d chunks", served, len(chunks))
	}
}
