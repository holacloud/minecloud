package network

import (
	"encoding/json"
	"log"
	"strings"
)

// Curtains (js/game/decor.js) open and close in vertical strips: a click changes the curtain and the
// ones hanging right above and below it, with the same facing, up to curtainStripLimit in all. The
// client sends the whole strip in one curtainStrip message, and the server writes all of it or none:
// if any cell is no longer the curtain the client thought (someone broke it, it was never there, it
// is out of the world), nothing changes and the sender alone is told what those cells really hold.
// Everybody else hears the strip as one message, so nobody sees it half drawn.

const curtainStripLimit = 10

type curtainStripPayload struct {
	Blocks []Block `json:"blocks"`
}

// The facing and opening side of a curtain block name: red_curtain is north and opens right,
// red_curtain:e:open looks east, red_curtain:e:open:left opens to the left.
func curtainFacing(name string) (base, facing string, ok bool) {
	base, facing, _, ok = curtainKind(name)
	return base, facing, ok
}

func curtainKind(name string) (base, facing, side string, ok bool) {
	parts := strings.Split(name, ":")
	if !strings.HasSuffix(parts[0], "_curtain") {
		return "", "", "", false
	}
	facing, side = "n", "right"
	if len(parts) > 1 {
		facing = parts[1]
	}
	if len(parts) > 3 {
		side = parts[3]
	}
	return parts[0], facing, side, true
}

// Whether the strip is one column of contiguous cells, each a curtain now, each staying the same
// curtain with the same facing and side, all of them facing the same way.
func curtainStripValid(blocks []Block) bool {
	if len(blocks) == 0 || len(blocks) > curtainStripLimit {
		return false
	}
	minY, maxY := blocks[0].Y, blocks[0].Y
	seen := make(map[int]bool, len(blocks))
	facing := ""
	for _, block := range blocks {
		if block.X != blocks[0].X || block.Z != blocks[0].Z || seen[block.Y] || !blockEditable(block.X, block.Y, block.Z) {
			return false
		}
		seen[block.Y] = true
		minY, maxY = min(minY, block.Y), max(maxY, block.Y)
		base, to, side, ok := curtainKind(block.BlockType)
		if !ok {
			return false
		}
		current, err := chunkStore.Block(block.X, block.Y, block.Z)
		if err != nil {
			return false
		}
		// Only opening or closing: each keeps its colour, facing and side.
		was, from, wasSide, ok := curtainKind(current)
		if !ok || was != base || from != to || wasSide != side || (facing != "" && to != facing) {
			return false
		}
		facing = to
	}
	return maxY-minY+1 == len(blocks)
}

func curtainStripMessage(client *Client, raw json.RawMessage) {
	var payload curtainStripPayload
	if json.Unmarshal(raw, &payload) != nil {
		return
	}
	blockEditMu.Lock()
	// A strip in someone else's plot (claims.go) is refused whole, like an invalid one.
	var refusal *claimRefusal
	for i, block := range payload.Blocks {
		if i >= curtainStripLimit {
			break
		}
		if refusal = claimCheck(client, block.X, block.Z); refusal != nil {
			break
		}
		// Nor over a plot's marker, unless it is the sender's own (a guest may not cover it).
		if refusal = claimMarkerGuard(client, block.X, block.Y, block.Z); refusal != nil {
			break
		}
	}
	if refusal != nil {
		claimRefuse(client, refusal)
	}
	if refusal != nil || !curtainStripValid(payload.Blocks) {
		// Put the sender's world right: it already drew the strip it asked for.
		truth := make([]Block, 0, len(payload.Blocks))
		for i, block := range payload.Blocks {
			if i >= curtainStripLimit {
				break
			}
			name, err := chunkStore.Block(block.X, block.Y, block.Z)
			if err != nil {
				continue
			}
			if name == "air" {
				name = ""
			}
			truth = append(truth, Block{X: block.X, Y: block.Y, Z: block.Z, BlockType: name})
		}
		blockEditMu.Unlock()
		log.Printf("curtainStrip refused: %d cells", len(payload.Blocks))
		client.trySend(createMessage("curtainStrip", curtainStripPayload{Blocks: truth}))
		return
	}
	placed := make([]Block, 0, len(payload.Blocks))
	for _, block := range payload.Blocks {
		if done, ok := placeBlock(client, Block{X: block.X, Y: block.Y, Z: block.Z, BlockType: block.BlockType}); ok {
			placed = append(placed, done)
		}
	}
	blockEditMu.Unlock()
	broadcastToAll(createMessage("curtainStrip", curtainStripPayload{Blocks: placed}))
}

func init() {
	// A strip is several cells, refused whole.
	registerMessage(messageSpec{plot: plotChecked, handle: func(c *Client, m Message) { curtainStripMessage(c, m.Payload) }}, "curtainStrip")
}
