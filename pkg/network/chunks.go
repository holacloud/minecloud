package network

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"minecloud/pkg/terrain"
	"minecloud/pkg/world"
)

const chunkDataPath = "data/chunks"

// The bytes of a sign's text the server keeps.
const signMaxTextBytes = 288

var chunkStore *world.Store

// legacyIndex maps a chunk to the keys of world.json edits made before the server owned
// the terrain; they are folded into the chunk the first time it is generated.
var legacyIndex map[[2]int][]string

func initChunkStore() error {
	stateMu.Lock()
	legacyIndex = make(map[[2]int][]string)
	add := func(key string) {
		var x, y, z int
		if _, err := fmt.Sscanf(key, "%d,%d,%d", &x, &y, &z); err != nil {
			return
		}
		chunkX, chunkZ := world.ChunkCoords(x, z)
		legacyIndex[[2]int{chunkX, chunkZ}] = append(legacyIndex[[2]int{chunkX, chunkZ}], key)
	}
	for key := range gameState.RemovedBlocks {
		add(key)
	}
	for key := range gameState.Blocks {
		add(key)
	}
	stateMu.Unlock()

	store, err := world.Open(chunkDataPath, takeLegacyEdits)
	if err != nil {
		return err
	}
	chunkStore = store
	go chunkStore.FlushEvery(5 * time.Second)
	return startChangeIndex(store)
}

// previewLegacyEdits is what takeLegacyEdits would return, leaving everything in place.
func previewLegacyEdits(chunkX, chunkZ int) []world.Edit {
	stateMu.RLock()
	defer stateMu.RUnlock()
	var edits []world.Edit
	for _, k := range legacyIndex[[2]int{chunkX, chunkZ}] {
		if block, ok := gameState.Blocks[k]; ok {
			edits = append(edits, world.Edit{X: block.X, Y: block.Y, Z: block.Z, Block: block.BlockType})
		} else if gameState.RemovedBlocks[k] {
			var x, y, z int
			fmt.Sscanf(k, "%d,%d,%d", &x, &y, &z)
			edits = append(edits, world.Edit{X: x, Y: y, Z: z})
		}
	}
	return edits
}

// pendingLegacyChunks lists the chunks with world.json edits not folded yet.
func pendingLegacyChunks() [][2]int {
	stateMu.RLock()
	defer stateMu.RUnlock()
	keys := make([][2]int, 0, len(legacyIndex))
	for key := range legacyIndex {
		keys = append(keys, key)
	}
	return keys
}

// takeLegacyEdits is called by the store (with its lock held) when a chunk is generated.
// Plain blocks and removals leave world.json; blocks with metadata (signs, sound blocks,
// ladders) keep their entry for that metadata.
func takeLegacyEdits(chunkX, chunkZ int) []world.Edit {
	stateMu.Lock()
	key := [2]int{chunkX, chunkZ}
	keys := legacyIndex[key]
	if len(keys) == 0 {
		stateMu.Unlock()
		return nil
	}
	delete(legacyIndex, key)

	edits := make([]world.Edit, 0, len(keys))
	for _, k := range keys {
		if block, ok := gameState.Blocks[k]; ok {
			edits = append(edits, world.Edit{X: block.X, Y: block.Y, Z: block.Z, Block: block.BlockType})
			if !hasBlockMetadata(block) {
				delete(gameState.Blocks, k)
			}
			continue
		}
		if gameState.RemovedBlocks[k] {
			var x, y, z int
			fmt.Sscanf(k, "%d,%d,%d", &x, &y, &z)
			edits = append(edits, world.Edit{X: x, Y: y, Z: z})
		}
		delete(gameState.RemovedBlocks, k)
	}
	stateMu.Unlock()

	// The shrunk legacy maps are saved with the next round, outside the store lock.
	worldBlocks.mark()
	return edits
}

// isSignBlock reports whether a block name is a sign, in any of its states: sign, sign:e:post...
// Worlds saved before signs had states hold the plain name.
func isSignBlock(name string) bool {
	base, _, _ := strings.Cut(name, ":")
	return base == "sign"
}

// sanitizeSignPayload keeps a placed sign's text within its limit, and takes text and votes off
// anything that is not a sign.
func sanitizeSignPayload(payload *Block) {
	if !isSignBlock(payload.BlockType) {
		payload.Text = ""
		payload.Votes = nil
		return
	}
	if len(payload.Text) > signMaxTextBytes {
		payload.Text = payload.Text[:signMaxTextBytes]
	}
	if payload.Votes == nil {
		payload.Votes = map[string]int{"thumbup": 0, "thumbdown": 0, "heart": 0, "happy": 0, "star": 0}
	}
}

func hasBlockMetadata(b Block) bool {
	return b.Text != "" || b.Votes != nil || b.Instrument != "" || b.Facing != ""
}

// FlushWorld writes pending chunk changes; called on shutdown.
func FlushWorld() error {
	if chunkStore == nil {
		return nil
	}
	return chunkStore.Flush()
}

// chunkStream serves one client's chunk requests, nearest to the player first.
type chunkStream struct {
	client *Client

	mu      sync.Mutex
	pending map[[2]int]bool
	focusX  int
	focusZ  int
	radius  int
	wake    chan struct{}
}

func newChunkStream(client *Client) *chunkStream {
	return &chunkStream{client: client, pending: make(map[[2]int]bool), radius: 8, wake: make(chan struct{}, 1)}
}

func (s *chunkStream) signal() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *chunkStream) request(chunks [][2]int) {
	s.mu.Lock()
	for _, c := range chunks {
		s.pending[c] = true
	}
	s.mu.Unlock()
	s.signal()
}

// focus moves the stream's centre; pending chunks out of range are forgotten (the client
// applies the same rule and requests them again if it comes back).
func (s *chunkStream) focus(chunkX, chunkZ, radius int) {
	s.mu.Lock()
	s.focusX, s.focusZ = chunkX, chunkZ
	if radius > 0 && radius <= 16 {
		s.radius = radius
	}
	for c := range s.pending {
		if s.distance(c) > s.radius {
			delete(s.pending, c)
		}
	}
	s.mu.Unlock()
	s.signal()
}

func (s *chunkStream) distance(c [2]int) int {
	return max(abs(c[0]-s.focusX), abs(c[1]-s.focusZ))
}

// next is the pending chunk closest to the focus as the crow flies (ties broken by position,
// so the order is stable), which loads the world in growing circles around the player.
func (s *chunkStream) next() ([2]int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var best [2]int
	bestDistance := 0
	found := false
	for c := range s.pending {
		dx, dz := c[0]-s.focusX, c[1]-s.focusZ
		distance := dx*dx + dz*dz
		if !found || distance < bestDistance || (distance == bestDistance && (c[0] < best[0] || (c[0] == best[0] && c[1] < best[1]))) {
			best, bestDistance, found = c, distance, true
		}
	}
	if found {
		delete(s.pending, best)
	}
	return best, found
}

func (s *chunkStream) run() {
	for {
		select {
		case <-s.client.done:
			return
		case <-s.wake:
		}
		for {
			c, ok := s.next()
			if !ok {
				break
			}
			data, err := chunkStore.Encoded(c[0], c[1])
			if err != nil {
				log.Printf("chunk %d,%d: %v", c[0], c[1], err)
				continue
			}
			powerAdoptChunk(chunkStore, c[0], c[1])
			// Blocks until the writer catches up, so slow clients only slow their own stream.
			select {
			case s.client.chunks <- data:
			case <-s.client.done:
				return
			}
		}
	}
}

func handleChunkMessage(client *Client, msg Message) {
	switch msg.Type {
	case "chunkRequest":
		var payload struct {
			Chunks [][2]int `json:"chunks"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil || len(payload.Chunks) > 1024 {
			return
		}
		valid := payload.Chunks[:0]
		limit := 1 << 20 / terrain.ChunkSize
		for _, c := range payload.Chunks {
			if abs(c[0]) < limit && abs(c[1]) < limit {
				valid = append(valid, c)
			}
		}
		client.stream.request(valid)
	case "chunkFocus":
		var payload struct {
			ChunkX int `json:"chunkX"`
			ChunkZ int `json:"chunkZ"`
			Radius int `json:"radius"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return
		}
		client.stream.focus(payload.ChunkX, payload.ChunkZ, payload.Radius)
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
