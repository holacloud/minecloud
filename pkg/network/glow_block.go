package network

import (
	"encoding/json"
	"log"
	"strconv"
	"strings"
)

// The Glow Block (js/game/glow_block.js): a cube that glows in a colour kept in its name. Blocks are
// stored by name and the server has no list of them, but it knows these, so that nothing can ask for a
// colour that no client can draw.
//
//   - glowSet {x, y, z, blockType}: the panel changes a block's colour. The server checks the name, the
//     reach (as for a chest) and, in order with any break or place, that a glow block is still there,
//     and tells everyone with a blockPlace. A refusal changes nothing and is not answered: the panel
//     goes on reading what the world holds.
//   - A blockPlace with a colour that does not exist (a modified client, say) becomes the plain block.
//
// glowKelvins and glowLevels are mirrored by GLOW_KELVINS and GLOW_LEVELS (test/js/glow_block.test.js).

const glowBlock = "glow_block"

var (
	glowKelvins = []int{2700, 3000, 4000, 5000, 6500}
	glowLevels  = 6
)

// glowValidName says whether this is one of the states of a glow block.
func glowValidName(name string) bool {
	if name == glowBlock {
		return true
	}
	state, ok := strings.CutPrefix(name, glowBlock+":")
	if !ok {
		return false
	}
	if digits, ok := strings.CutPrefix(state, "rgb"); ok {
		if len(digits) != 3 {
			return false
		}
		for _, digit := range digits {
			if digit < '0' || int(digit-'0') >= glowLevels {
				return false
			}
		}
		return true
	}
	if digits, ok := strings.CutPrefix(state, "k"); ok {
		kelvin, err := strconv.Atoi(digits)
		if err != nil || strconv.Itoa(kelvin) != digits {
			return false
		}
		// The default temperature's name is the plain block.
		for _, known := range glowKelvins {
			if known == kelvin && kelvin != 3000 {
				return true
			}
		}
	}
	return false
}

// glowSanitizeName is the name a placed block gets: only a glow block's can be wrong.
func glowSanitizeName(name string) string {
	if storageBase(name) == glowBlock && !glowValidName(name) {
		return glowBlock
	}
	return name
}

// glowApply runs one glowSet. `set` writes the block; the check that it is still a glow block and the
// write happen in order with every other change, under the book's lock. It returns the block to
// announce, and whether anything was done.
func glowApply(book *storageBook, w cropWorld, eye *[3]float64, x, y, z int, name string, set func() (bool, error)) (Block, bool) {
	if !glowValidName(name) || eye == nil || !storageInReach(*eye, x, y, z) {
		return Block{}, false
	}
	done := false
	_, _, err := book.replace(w, x, y, z, name, func() (bool, error) {
		current, err := w.Block(x, y, z)
		if err != nil {
			return false, err
		}
		if storageBase(current) != glowBlock || current == name {
			return false, nil
		}
		done = true
		return set()
	})
	if err != nil {
		log.Printf("glowSet: %v", err)
		return Block{}, false
	}
	return Block{X: x, Y: y, Z: z, BlockType: name}, done
}

func handleGlowSet(client *Client, payload []byte) {
	if len(payload) > storageMaxPayload {
		return
	}
	var request struct {
		X         int    `json:"x"`
		Y         int    `json:"y"`
		Z         int    `json:"z"`
		BlockType string `json:"blockType"`
	}
	if err := json.Unmarshal(payload, &request); err != nil {
		return
	}
	// Someone else's plot (claims.go): the panel shows what the block really is.
	if refusal := claimCheck(client, request.X, request.Z); refusal != nil {
		claimRefuse(client, refusal, [3]int{request.X, request.Y, request.Z})
		return
	}
	block, done := glowApply(storage, chunkStore, storagePlayerEye(client), request.X, request.Y, request.Z, request.BlockType, func() (bool, error) {
		return setBlockTracked(request.X, request.Y, request.Z, request.BlockType)
	})
	if done {
		broadcastToAll(createMessage("blockPlace", block))
	}
}
