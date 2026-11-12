package network

import (
	"encoding/json"
	"log"
)

// Constructions (js/game/constructions.js) only place blocks, and what a chest holds lives here, in the
// storage book. So once a build has placed its last block, the client sends what its storage holds:
//
//   - constructionStock {fills: [{x, y, z, items: [{type, count}], freezer: [...]}]}: each fill puts these
//     stacks, one per slot and in this order, in the storage block at (x, y, z), which must be empty.
//     `freezer` is a fridge's second compartment. In a machine (an oven, the foundry...) each stack goes to
//     the one slot its item belongs in (machine.slotFor), never to the result. Microscopes and incubators
//     take nothing this way: a slide or a plate only moves with what lies on it.
//   - constructionStockResult {filled: [[x, y, z]...], refused: [{x, y, z, reason}...]} answers it. Each
//     fill lands whole or not at all.
//
// Only from a session that passed creative auth (Client.creative, set by creativeAuth and cleared by
// creativeOff); from any other client the message is ignored, with no answer, as an unknown one would be.
// A creative player can /give anything anyway, so this gives nothing new to whoever has the key, and
// nothing at all to a modified client without it. Beyond that, a fill only lands in a block that is
// really storage and empty, with item names this server knows (stockItems), stacks of at most
// stockMaxStack and stockMaxItems in one block, all under the book's one lock, and it is saved before it
// is answered, like any move.
//
// stockItems lists what a construction may put in its storage; test/js/construction_lab.test.js checks
// that every item of a design's stock is in it and that every name in it is a real item of the game.

const (
	stockMaxPayload = 32 * 1024
	stockMaxFills   = 32
	stockMaxStack   = 64
	stockMaxItems   = 256
)

var stockItems = map[string]bool{}

func init() {
	for _, name := range []string{
		// Microscopy and cultures.
		"test_tube", "glass_slide", "micropipette", "iodine_tincture", "methylene_blue", "darkfield_stop",
		"agar_plate", "petri_dish", "water_filter", "tardigrade_tube", "tardigrade_tun",
		"sample_forest_lake_b", "sample_mountain_lake_d", "sample_plains_lake_a", "sample_oasis_a", "sample_moss_a", "sample_still_water",
		// Chemistry.
		"element_h", "element_o", "element_na", "element_cl", "element_si", "element_fe", "element_c", "element_n", "element_cu", "element_sn",
		"glass", "water_flask", "bucket", "baking_soda", "copper_sulfate", "quicklime", "salt",
		// Furnaces and the store.
		"coal_ore", "sand", "cobblestone", "limestone", "iron_ore", "copper_ore", "tin_ore", "planks", "torch",
		// Electricity and logic.
		"copper_wire", "wire_post", "multimeter", "light_bulb", "electric_lamp", "battery", "battery_block", "solar_cell",
		"lever", "push_button", "pressure_plate", "and_gate", "or_gate", "not_gate", "xor_gate", "delay_gate", "latch",
		"daylight_sensor", "proximity_sensor", "hand_crank", "copper_wrench", "iron_block", "copper_block",
		// Food and drink.
		"bread", "cooked_fish", "cheese", "honey_bottle", "wheat", "milk", "cold_water", "cold_milk", "cold_soda",
		"ice", "frozen_fish", "frozen_cooked_fish", "frozen_bread", "roast_mushroom", "raw_fish",
		// Books, maps and instruments.
		"blueprint", "breeding_notebook", "measuring_tape", "telescope", "star_chart", "thermometer", "barometer", "anemometer",
		"candle", "lantern", "bug_net", "ant_farm",
		// Rocks for a geologist.
		"basalt", "granite", "marble", "obsidian", "pyrite", "fluorite",
		// The greenhouse.
		"wheat_seeds", "fertilizer", "water_bucket", "iron_hoe",
	} {
		stockItems[name] = true
	}
}

type stockStack struct {
	Type  string `json:"type"`
	Count int    `json:"count"`
}

type stockFill struct {
	X       int          `json:"x"`
	Y       int          `json:"y"`
	Z       int          `json:"z"`
	Items   []stockStack `json:"items"`
	Freezer []stockStack `json:"freezer"`
}

type stockRefusal struct {
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Z      int    `json:"z"`
	Reason string `json:"reason"`
}

// stockCheck is what a fill must pass before it touches anything: "" when valid.
func stockCheck(fill stockFill) string {
	if len(fill.Items)+len(fill.Freezer) == 0 {
		return "nothing to put"
	}
	total := 0
	for _, list := range [][]stockStack{fill.Items, fill.Freezer} {
		for _, stack := range list {
			if !stockItems[stack.Type] {
				return "unknown item"
			}
			if stack.Count < 1 || stack.Count > stockMaxStack {
				return "bad count"
			}
			total += stack.Count
		}
	}
	if total > stockMaxItems {
		return "too many items"
	}
	return ""
}

// stockSlots lays out one compartment's stacks: one per slot in order, or in a machine each in its own slot.
func stockSlots(place storagePlace, compartment string, stacks []stockStack) ([]StorageSlot, string) {
	capacity, ok := place.slots(compartment)
	if !ok {
		return nil, "bad compartment"
	}
	if len(stacks) == 0 {
		return nil, ""
	}
	if len(stacks) > capacity {
		return nil, "too many stacks"
	}
	slots := make([]StorageSlot, capacity)
	m := machines[place.kind]
	for i, stack := range stacks {
		slot := i
		if m != nil {
			if slot = m.slotFor(stack.Type); slot < 0 {
				return nil, "not for the " + m.Name
			}
			if slots[slot].Count > 0 {
				return nil, "one stack per slot"
			}
		}
		slots[slot] = StorageSlot{Type: stack.Type, Count: stack.Count}
	}
	return slots, ""
}

// stock fills one empty storage block. Returns "" when it landed, or why not.
func (b *storageBook) stock(w cropWorld, fill stockFill) string {
	if reason := stockCheck(fill); reason != "" {
		return reason
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	place, ok := b.locate(w, fill.X, fill.Y, fill.Z)
	if !ok {
		return "not a storage block"
	}
	if place.kind == microscopeKind || place.kind == incubatorKind {
		return "not for the " + place.kind
	}
	key := storageKeyOf(place.cell)
	block := b.blocks[key]
	if block != nil && !block.holdsNothing() {
		return "not empty"
	}
	slots, reason := stockSlots(place, "", fill.Items)
	if reason != "" {
		return reason
	}
	freezer, reason := stockSlots(place, storageFreezerTab, fill.Freezer)
	if len(fill.Freezer) > 0 && reason != "" {
		return reason
	}
	if block == nil {
		block = &StorageBlock{X: place.cell[0], Y: place.cell[1], Z: place.cell[2]}
	}
	block.Slots = slots
	block.Freezer = freezer
	b.blocks[key] = block
	b.wakeLocked(place, block)
	b.rev++
	b.notifyLocked(place)
	return ""
}

// stockAll applies a message's fills in order: what landed and what did not.
func (b *storageBook) stockAll(w cropWorld, fills []stockFill) (filled [][3]int, refused []stockRefusal) {
	filled = [][3]int{}
	refused = []stockRefusal{}
	for i, fill := range fills {
		reason := "too many fills"
		if i < stockMaxFills {
			reason = b.stock(w, fill)
		}
		if reason == "" {
			filled = append(filled, [3]int{fill.X, fill.Y, fill.Z})
		} else {
			refused = append(refused, stockRefusal{X: fill.X, Y: fill.Y, Z: fill.Z, Reason: reason})
		}
	}
	return filled, refused
}

func handleConstructionStock(client *Client, payload json.RawMessage) {
	if !client.creative.Load() || len(payload) > stockMaxPayload {
		return
	}
	var request struct {
		Fills []stockFill `json:"fills"`
	}
	if err := json.Unmarshal(payload, &request); err != nil {
		return
	}
	// Only the admin gets here, and the admin may fill anything: the check stays the one of claims.go.
	var allowed []stockFill
	var protected []stockRefusal
	for _, fill := range request.Fills {
		if claimCheck(client, fill.X, fill.Z) != nil {
			protected = append(protected, stockRefusal{X: fill.X, Y: fill.Y, Z: fill.Z, Reason: "protected"})
			continue
		}
		allowed = append(allowed, fill)
	}
	filled, refused := storage.stockAll(chunkStore, allowed)
	refused = append(refused, protected...)
	// Saved before it is answered, as any move (storage.go).
	if len(filled) > 0 {
		worldStorage.changed()
	}
	log.Printf("constructionStock from %s: %d filled, %d refused", client.ID, len(filled), len(refused))
	storageDeliver(client, createMessage("constructionStockResult", map[string]interface{}{"filled": filled, "refused": refused}))
}

func init() {
	// Only the admin gets to fill, and each fill still goes through claimCheck.
	registerMessage(messageSpec{plot: plotChecked, handle: func(c *Client, m Message) { handleConstructionStock(c, m.Payload) }}, "constructionStock")
}
