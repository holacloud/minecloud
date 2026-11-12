package network

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// A key for these tests only; the real one is given to the server at start and is never in the repo.
const stockTestKey = "only-for-the-construction-stock-tests"

func stack(t string, n int) stockStack { return stockStack{Type: t, Count: n} }

func TestConstructionStockFillsOnlyEmptyStorageItTakes(t *testing.T) {
	book, _ := newTestBook()
	w := fakeCropWorld{
		{0, 0, 0}:  "chest:e",
		{1, 0, 0}:  "stone",
		{2, 0, 0}:  "chest",
		{3, 0, 0}:  "barrel",
		{4, 0, 0}:  "microscope:n",
		{5, 0, 0}:  "incubator:n",
		{6, 0, 0}:  "oven:n",
		{7, 0, 0}:  "fridge:lower:n",
		{7, 1, 0}:  "fridge:upper:n",
		{8, 0, 0}:  "wardrobe:lower:n",
		{8, 1, 0}:  "wardrobe:upper:n",
		{9, 0, 0}:  "arc_furnace:n",
		{10, 0, 0}: "chest",
	}
	// Something a player put in already.
	if got, _ := book.put(w, &[3]float64{2.5, 1.5, 0.5}, storageMove{X: 2, Type: "stone", Amount: 3, ReqID: "player-put-1"}); got.Amount != 3 {
		t.Fatalf("put: %+v", got)
	}
	many := make([]stockStack, 19)
	for i := range many {
		many[i] = stack("glass", 1)
	}
	heavy := []stockStack{stack("sand", 64), stack("sand", 64), stack("sand", 64), stack("sand", 64), stack("sand", 1)}
	cases := []struct {
		name   string
		fill   stockFill
		reason string
	}{
		{"a chest", stockFill{X: 0, Items: []stockStack{stack("test_tube", 12), stack("glass_slide", 16)}}, ""},
		{"not storage", stockFill{X: 1, Items: []stockStack{stack("glass", 1)}}, "not a storage block"},
		{"air", stockFill{X: 50, Items: []stockStack{stack("glass", 1)}}, "not a storage block"},
		{"not empty", stockFill{X: 2, Items: []stockStack{stack("glass", 1)}}, "not empty"},
		{"stocked twice", stockFill{X: 0, Items: []stockStack{stack("glass", 1)}}, "not empty"},
		{"unknown item", stockFill{X: 3, Items: []stockStack{stack("diamond_of_doom", 1)}}, "unknown item"},
		{"an item a player has but a build may not give", stockFill{X: 3, Items: []stockStack{stack("ruby", 1)}}, "unknown item"},
		{"a state is not an item", stockFill{X: 3, Items: []stockStack{stack("chest:e", 1)}}, "unknown item"},
		{"zero", stockFill{X: 3, Items: []stockStack{stack("glass", 0)}}, "bad count"},
		{"negative", stockFill{X: 3, Items: []stockStack{stack("glass", -4)}}, "bad count"},
		{"over a stack", stockFill{X: 3, Items: []stockStack{stack("glass", stockMaxStack+1)}}, "bad count"},
		{"too many in one block", stockFill{X: 3, Items: heavy}, "too many items"},
		{"more stacks than slots", stockFill{X: 3, Items: many}, "too many stacks"},
		{"nothing", stockFill{X: 3}, "nothing to put"},
		{"a freezer a barrel has not", stockFill{X: 3, Freezer: []stockStack{stack("ice", 1)}}, "bad compartment"},
		{"a slide moves with its preparation", stockFill{X: 4, Items: []stockStack{stack("glass_slide", 1)}}, "not for the microscope"},
		{"a plate moves with its culture", stockFill{X: 5, Items: []stockStack{stack("agar_plate", 1)}}, "not for the incubator"},
		{"what an oven does not take", stockFill{X: 6, Items: []stockStack{stack("glass", 1)}}, "not for the oven"},
		{"two fuels in one slot", stockFill{X: 6, Items: []stockStack{stack("coal_ore", 4), stack("planks", 4)}}, "one stack per slot"},
		{"an oven's fuel", stockFill{X: 6, Items: []stockStack{stack("coal_ore", 8)}}, ""},
		{"a fridge, both compartments, from its upper cell", stockFill{X: 7, Y: 1, Items: []stockStack{stack("cold_water", 6)}, Freezer: []stockStack{stack("ice", 8)}}, ""},
		{"a wardrobe", stockFill{X: 8, Items: []stockStack{stack("candle", 2)}}, ""},
		{"the arc's coal", stockFill{X: 9, Items: []stockStack{stack("coal_ore", 16)}}, ""},
	}
	for _, c := range cases {
		if got := book.stock(w, c.fill); got != c.reason {
			t.Errorf("%s: %q, want %q", c.name, got, c.reason)
		}
	}
	slots := book.blocks[blockKey(0, 0, 0)].Slots
	if len(slots) != 27 || slots[0] != (StorageSlot{Type: "test_tube", Count: 12}) || slots[1] != (StorageSlot{Type: "glass_slide", Count: 16}) || slots[2].Count != 0 {
		t.Fatalf("chest: %+v", slots[:3])
	}
	if got := book.blocks[blockKey(2, 0, 0)].Slots; got[0].Count != 3 || got[1].Count != 0 {
		t.Fatalf("a chest with a player's things is untouched: %+v", got[:2])
	}
	for _, x := range []int{1, 3, 4, 5, 10} {
		if book.blocks[blockKey(x, 0, 0)] != nil {
			t.Fatalf("%d,0,0 got contents: %+v", x, book.blocks[blockKey(x, 0, 0)])
		}
	}
	oven := book.blocks[blockKey(6, 0, 0)]
	if oven.Slots[ovenSlotFood].Count != 0 || oven.Slots[ovenSlotFuel] != (StorageSlot{Type: "coal_ore", Count: 8}) || oven.Slots[ovenSlotResult].Count != 0 || oven.Kind != "oven" {
		t.Fatalf("the coal goes in the fuel slot: %+v", oven)
	}
	if arc := book.blocks[blockKey(9, 0, 0)]; arc.Slots[ovenSlotFuel] != (StorageSlot{Type: "coal_ore", Count: 16}) {
		t.Fatalf("arc: %+v", arc.Slots)
	}
	fridge := book.blocks[blockKey(7, 0, 0)]
	if fridge == nil || fridge.Slots[0] != (StorageSlot{Type: "cold_water", Count: 6}) || len(fridge.Freezer) != 9 || fridge.Freezer[0] != (StorageSlot{Type: "ice", Count: 8}) {
		t.Fatalf("fridge, in its lower cell: %+v", fridge)
	}
	if book.blocks[blockKey(8, 0, 0)] == nil || book.blocks[blockKey(8, 1, 0)] != nil {
		t.Fatal("a wardrobe keeps its contents in the lower cell")
	}
	// What a stock puts in is spilled like anything else when the block goes.
	spill, _, _ := book.replace(w, 0, 0, 0, "", func() (bool, error) { delete(w, [3]int{0, 0, 0}); return true, nil })
	if len(spill) != 2 || spill[0].Count != 12 {
		t.Fatalf("spill: %+v", spill)
	}
}

func TestConstructionStockCapsTheFillsOfOneMessage(t *testing.T) {
	book, _ := newTestBook()
	w := fakeCropWorld{}
	fills := make([]stockFill, stockMaxFills+3)
	for i := range fills {
		w[[3]int{i, 0, 0}] = "chest"
		fills[i] = stockFill{X: i, Items: []stockStack{stack("glass", 1)}}
	}
	filled, refused := book.stockAll(w, fills)
	if len(filled) != stockMaxFills || len(refused) != 3 || refused[0].Reason != "too many fills" {
		t.Fatalf("%d filled, refused %+v", len(filled), refused)
	}
}

// Through the real handlers: nothing from a session without creative, everything from one with it, saved before
// it is answered; and creativeOff, or a wrong key, ends it.
func TestConstructionStockNeedsCreative(t *testing.T) {
	alice, send, expect := storageMessageRig(t)
	defer ConfigureCreative("")
	ConfigureCreative(stockTestKey)
	send(alice, "blockPlace", Block{X: 2, Y: 120, Z: 2, BlockType: "chest"})
	send(alice, "blockPlace", Block{X: 3, Y: 120, Z: 2, BlockType: "chest"})
	fill := map[string]interface{}{"fills": []stockFill{{X: 2, Y: 120, Z: 2, Items: []stockStack{stack("telescope", 2)}}}}
	drain := func() {
		for len(alice.send) > 0 {
			<-alice.send
		}
	}
	silent := func(why string) {
		t.Helper()
		for len(alice.send) > 0 {
			var message Message
			json.Unmarshal(<-alice.send, &message)
			if message.Type == "constructionStockResult" {
				t.Fatalf("%s: answered", why)
			}
		}
		storage.mu.Lock()
		defer storage.mu.Unlock()
		if storage.blocks[blockKey(2, 120, 2)] != nil {
			t.Fatalf("%s: the chest got items", why)
		}
	}
	drain()

	send(alice, "constructionStock", fill)
	silent("without creative")
	send(alice, "creativeAuth", map[string]interface{}{"key": "a wrong key", "command": "creative"})
	send(alice, "constructionStock", fill)
	silent("with a wrong key")

	send(alice, "creativeAuth", map[string]interface{}{"key": stockTestKey, "command": "creative"})
	var auth struct {
		OK bool `json:"ok"`
	}
	json.Unmarshal(expect(alice, "creativeAuth"), &auth)
	if !auth.OK {
		t.Fatal("the key was refused")
	}
	two := map[string]interface{}{"fills": []stockFill{
		{X: 2, Y: 120, Z: 2, Items: []stockStack{stack("telescope", 2)}},
		{X: 3, Y: 120, Z: 2, Items: []stockStack{stack("telescope", 2), stack("not_an_item_at_all", 1)}},
	}}
	send(alice, "constructionStock", two)
	var result struct {
		Filled  [][3]int       `json:"filled"`
		Refused []stockRefusal `json:"refused"`
	}
	json.Unmarshal(expect(alice, "constructionStockResult"), &result)
	if len(result.Filled) != 1 || result.Filled[0] != [3]int{2, 120, 2} || len(result.Refused) != 1 || result.Refused[0].Reason != "unknown item" {
		t.Fatalf("result: %+v", result)
	}
	saved, err := os.ReadFile(worldStorage.path())
	if err != nil || !strings.Contains(string(saved), `"telescope"`) {
		t.Fatalf("not saved: %v", err)
	}
	var persisted storageSaved
	if err := json.Unmarshal(saved, &persisted); err != nil {
		t.Fatal(err)
	}
	if got := persisted.Storage[blockKey(2, 120, 2)]; len(got.Slots) == 0 || got.Slots[0] != (StorageSlot{Type: "telescope", Count: 2}) {
		t.Fatalf("saved: %+v", got)
	}
	if _, ok := persisted.Storage[blockKey(3, 120, 2)]; ok {
		t.Fatal("a refused fill lands with nothing")
	}

	// creativeOff ends it, and so does a wrong key after a good one.
	send(alice, "blockBreak", map[string]int{"x": 2, "y": 120, "z": 2})
	send(alice, "blockPlace", Block{X: 2, Y: 120, Z: 2, BlockType: "chest"})
	drain()
	send(alice, "creativeOff", map[string]interface{}{})
	send(alice, "constructionStock", fill)
	silent("after creativeOff")
	send(alice, "creativeAuth", map[string]interface{}{"key": stockTestKey, "command": "creative"})
	send(alice, "creativeAuth", map[string]interface{}{"key": "wrong again", "command": "creative"})
	drain()
	send(alice, "constructionStock", fill)
	silent("after a wrong key")

	// And with creative disabled on the server (no key), nothing at all.
	ConfigureCreative("")
	send(alice, "creativeAuth", map[string]interface{}{"key": stockTestKey, "command": "creative"})
	drain()
	send(alice, "constructionStock", fill)
	silent("with creative disabled on the server")
}

func TestConstructionStockIgnoresOversizedMessages(t *testing.T) {
	alice, send, _ := storageMessageRig(t)
	alice.creative.Store(true)
	send(alice, "blockPlace", Block{X: 2, Y: 120, Z: 2, BlockType: "chest"})
	for len(alice.send) > 0 {
		<-alice.send
	}
	fills := []stockFill{{X: 2, Y: 120, Z: 2, Items: []stockStack{stack("glass", 1)}}}
	pad := strings.Repeat("x", stockMaxPayload)
	send(alice, "constructionStock", map[string]interface{}{"fills": fills, "pad": pad})
	if len(alice.send) != 0 || storage.blocks[blockKey(2, 120, 2)] != nil {
		t.Fatal("an oversized message was read")
	}
}
