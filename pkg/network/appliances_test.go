package network

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

// A book whose cold blocks have power when *on says so.
func newApplianceBook(on *bool) *storageBook {
	book, _ := newTestBook()
	book.powered = func([3]int) bool { return on != nil && *on }
	return book
}

func applianceRun(book *storageBook, w cropWorld, seconds int) (names []Block) {
	for i := 0; i < seconds; i++ {
		updates, _ := book.tickAppliances(w, 1)
		names = append(names, updates...)
	}
	return names
}

func slotAt(book *storageBook, slot int) StorageSlot {
	block := book.blocks[blockKey(0, 0, 0)]
	if block == nil || slot >= len(block.Slots) {
		return StorageSlot{}
	}
	return block.Slots[slot]
}

func TestApplianceTablesAreConsistent(t *testing.T) {
	for food, recipe := range ovenRecipes {
		if _, both := ovenFuels[food]; both {
			t.Errorf("%s is both food and fuel: a put could not tell where it goes", food)
		}
		if recipe.In < 1 || recipe.Seconds <= 0 || recipe.Out == "" {
			t.Errorf("%s: %+v", food, recipe)
		}
	}
	// Coal burns longest, then planks, then logs.
	if !(ovenFuels["coal_ore"] > ovenFuels["planks"] && ovenFuels["planks"] > ovenFuels["wood"]) {
		t.Errorf("fuels: %v", ovenFuels)
	}
	// Whatever a freezer makes, an oven can thaw: nothing gets stuck frozen for ever. A tun is the
	// exception: water brings it back, on a slide or with a flask in the C menu, and fire never would.
	for from, frozen := range freezeChanges {
		if _, ok := ovenRecipes[frozen]; !ok && frozen != tardigradeTun {
			t.Errorf("%s freezes to %s, which no oven thaws", from, frozen)
		}
	}
	if chillSeconds != 60 || freezeSeconds != 120 {
		t.Errorf("times: %v %v", chillSeconds, freezeSeconds)
	}
}

func TestOvenBlockName(t *testing.T) {
	cases := []struct {
		name string
		lit  bool
		want string
	}{
		{"oven", false, "oven"},
		{"oven", true, "oven:n:on"},
		{"oven:n:on", false, "oven"},
		{"oven:e:off", true, "oven:e:on"},
		{"oven:e:on", false, "oven:e:off"},
		{"oven:s:on", true, "oven:s:on"},
		{"oven:nonsense:on", false, "oven"},
		{"oven::", true, "oven:n:on"},
	}
	for _, c := range cases {
		if got := ovenBlockName(c.name, c.lit); got != c.want {
			t.Errorf("ovenBlockName(%q, %v) = %q, want %q", c.name, c.lit, got, c.want)
		}
	}
}

func TestOvenRoutesItemsToTheirSlots(t *testing.T) {
	book := newApplianceBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "oven:e:off"}
	if got := testPut(book, w, "request-1", "stone", 5); got.Amount != 0 || got.Reason != "not for the oven" {
		t.Fatalf("stone: %+v", got)
	}
	if got := testPut(book, w, "request-2", "cooked_fish", 5); got.Amount != 0 || got.Reason != "not for the oven" {
		t.Fatalf("a result is not an ingredient: %+v", got)
	}
	if len(book.blocks) != 0 {
		t.Fatalf("refused items stored: %+v", book.blocks)
	}
	if got := testPut(book, w, "request-3", "coal_ore", 2); got.Amount != 2 {
		t.Fatalf("coal: %+v", got)
	}
	if got := testPut(book, w, "request-4", "raw_fish", 3); got.Amount != 3 {
		t.Fatalf("fish: %+v", got)
	}
	if slotAt(book, ovenSlotFood).Type != "raw_fish" || slotAt(book, ovenSlotFuel).Type != "coal_ore" || slotAt(book, ovenSlotResult).Count != 0 {
		t.Fatalf("slots: %+v", book.blocks[blockKey(0, 0, 0)].Slots)
	}
	// One food at a time: another kind waits outside.
	if got := testPut(book, w, "request-5", "wheat", 3); got.Amount != 0 || got.Reason != "full" {
		t.Fatalf("second food: %+v", got)
	}
	if got := testPut(book, w, "request-6", "planks", 3); got.Amount != 0 || got.Reason != "full" {
		t.Fatalf("second fuel: %+v", got)
	}
}

func TestOvenCooksWithFuelAndGoesOut(t *testing.T) {
	book := newApplianceBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "oven:e:off"}
	testPut(book, w, "request-1", "raw_fish", 2)
	// Food and no fuel: nothing happens, and it is not ticked again.
	if names := applianceRun(book, w, 5); len(names) != 0 || w[[3]int{0, 0, 0}] != "oven:e:off" {
		t.Fatalf("lit with no fuel: %v", names)
	}
	if len(book.active) != 0 {
		t.Fatalf("an oven with nothing to do is still ticked: %v", book.active)
	}
	testPut(book, w, "request-2", "planks", 1)
	// The first second lights it: everyone is told, through its name.
	names := applianceRun(book, w, 1)
	if len(names) != 1 || names[0].BlockType != "oven:e:on" || w[[3]int{0, 0, 0}] != "oven:e:on" {
		t.Fatalf("not lit: %v", names)
	}
	if slotAt(book, ovenSlotFuel).Count != 0 {
		t.Fatalf("fuel not burnt: %+v", slotAt(book, ovenSlotFuel))
	}
	// Fish takes 20 s, a plank burns 30 s: one fish, and half another.
	applianceRun(book, w, 19)
	if got := slotAt(book, ovenSlotResult); got.Type != "cooked_fish" || got.Count != 1 {
		t.Fatalf("result: %+v", got)
	}
	names = applianceRun(book, w, 10)
	if len(names) != 1 || names[0].BlockType != "oven:e:off" {
		t.Fatalf("still burning: %v, %s", names, w[[3]int{0, 0, 0}])
	}
	if got := slotAt(book, ovenSlotFood); got.Count != 1 {
		t.Fatalf("the second fish: %+v", got)
	}
	if got := slotAt(book, ovenSlotResult); got.Count != 1 {
		t.Fatalf("cooked with no fire: %+v", got)
	}
	// With more fuel it goes on from where it stopped: 10 s cooked, 10 s to go.
	testPut(book, w, "request-3", "coal_ore", 1)
	applianceRun(book, w, 10)
	if got := slotAt(book, ovenSlotResult); got.Count != 2 {
		t.Fatalf("result: %+v", got)
	}
	// Nothing left to cook: the fire burns out on its own and the name follows.
	applianceRun(book, w, 80)
	if w[[3]int{0, 0, 0}] != "oven:e:off" {
		t.Fatalf("name: %s", w[[3]int{0, 0, 0}])
	}
	if got := book.blocks[blockKey(0, 0, 0)]; got == nil || got.Burn != 0 {
		t.Fatalf("block: %+v", got)
	}
}

func TestOvenRecipes(t *testing.T) {
	cases := []struct {
		food   string
		amount int
		out    string
		want   int
	}{
		{"raw_fish", 1, "cooked_fish", 1},
		{"wheat", 3, "bread", 1},
		{"wheat", 2, "", 0}, // not enough
		{"mushroom_red", 1, "roast_mushroom", 1},
		{"mushroom_brown", 1, "roast_mushroom", 1},
		{"frozen_fish", 1, "raw_fish", 1},
		{"frozen_cooked_fish", 1, "cooked_fish", 1},
		{"frozen_bread", 1, "bread", 1},
		{"ice", 1, "water_flask", 1},
	}
	for _, c := range cases {
		book := newApplianceBook(nil)
		w := fakeCropWorld{{0, 0, 0}: "oven"}
		testPut(book, w, "request-1", c.food, c.amount)
		testPut(book, w, "request-2", "coal_ore", 1)
		applianceRun(book, w, 60)
		if got := slotAt(book, ovenSlotResult); got.Count != c.want || (c.want > 0 && got.Type != c.out) {
			t.Errorf("%d %s: %+v", c.amount, c.food, got)
		}
	}
}

func TestOvenWaitsWhenTheResultSlotIsTaken(t *testing.T) {
	book := newApplianceBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "oven"}
	testPut(book, w, "request-1", "raw_fish", 1)
	testPut(book, w, "request-2", "coal_ore", 5)
	applianceRun(book, w, 20)
	if got := slotAt(book, ovenSlotResult); got.Type != "cooked_fish" {
		t.Fatalf("result: %+v", got)
	}
	// Wheat would make bread, and the cooked fish is in the way: it cooks nothing and no fuel goes.
	testPut(book, w, "request-3", "wheat", 3)
	applianceRun(book, w, 100)
	if got := slotAt(book, ovenSlotFuel).Count; got != 4 {
		t.Fatalf("fuel burnt with nothing to cook: %d", got)
	}
	if got := slotAt(book, ovenSlotFood); got.Count != 3 {
		t.Fatalf("food: %+v", got)
	}
	// Taking the fish out wakes it.
	testTake(book, w, "request-4", "cooked_fish", ovenSlotResult, 1)
	applianceRun(book, w, 30)
	if got := slotAt(book, ovenSlotResult); got.Type != "bread" || got.Count != 1 {
		t.Fatalf("result: %+v", got)
	}
}

func TestOvenEmptiedLeavesNoEntryAndBreaksSpillEverything(t *testing.T) {
	book := newApplianceBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "oven"}
	testPut(book, w, "request-1", "raw_fish", 1)
	testPut(book, w, "request-2", "planks", 1)
	applianceRun(book, w, 1)
	// The food comes out while it burns: the fire stays until it is out, and only then the entry goes.
	testTake(book, w, "request-3", "raw_fish", ovenSlotFood, 1)
	if len(book.blocks) != 1 {
		t.Fatalf("a burning oven lost its entry: %+v", book.blocks)
	}
	if w[[3]int{0, 0, 0}] != "oven:n:on" {
		t.Fatalf("name: %s", w[[3]int{0, 0, 0}])
	}
	applianceRun(book, w, 30)
	if w[[3]int{0, 0, 0}] != "oven" || len(book.blocks) != 0 || len(book.active) != 0 {
		t.Fatalf("left behind: %s %+v %v", w[[3]int{0, 0, 0}], book.blocks, book.active)
	}

	// Breaking one mid-burn drops what it holds, cooked or not, and the fire goes with it.
	testPut(book, w, "request-4", "raw_fish", 3)
	testPut(book, w, "request-5", "coal_ore", 2)
	applianceRun(book, w, 21)
	spill, _, _ := book.replace(w, 0, 0, 0, "", func() (bool, error) { return false, w.SetBlock(0, 0, 0, "") })
	total := map[string]int{}
	for _, slot := range spill {
		total[slot.Type] += slot.Count
	}
	if total["raw_fish"] != 2 || total["coal_ore"] != 1 || total["cooked_fish"] != 1 {
		t.Fatalf("spill: %+v", spill)
	}
	if names := applianceRun(book, w, 2); len(names) != 0 || len(book.active) != 0 {
		t.Fatalf("a broken oven still runs: %v %v", names, book.active)
	}
}

// A plan, a blueprint or a client cannot light an oven: only fire does.
func TestOvenNameIsTheServers(t *testing.T) {
	book := newApplianceBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "oven"}
	if got := book.settleOvenName(0, 0, 0, "oven:s:on"); got != "oven:s:off" {
		t.Fatalf("placed lit: %s", got)
	}
	if got := book.settleOvenName(5, 0, 0, "stone:on"); got != "stone:on" {
		t.Fatalf("others keep their name: %s", got)
	}
	testPut(book, w, "request-1", "raw_fish", 1)
	testPut(book, w, "request-2", "coal_ore", 1)
	applianceRun(book, w, 1)
	if got := book.settleOvenName(0, 0, 0, "oven:w:off"); got != "oven:w:on" {
		t.Fatalf("turned while burning: %s", got)
	}
	// Placed again over itself (a turn), it keeps its contents.
	if spill, _, _ := book.replace(w, 0, 0, 0, "oven:w:on", func() (bool, error) { return false, w.SetBlock(0, 0, 0, "oven:w:on") }); len(spill) != 0 {
		t.Fatalf("a turn spilled it: %+v", spill)
	}
	if book.blocks[blockKey(0, 0, 0)] == nil {
		t.Fatal("contents gone")
	}
}

// Ovens left lit in a saved world (they used to be a switch) go out when opened; so do their names.
func TestOvenFromASavedWorldGoesOutWhenOpened(t *testing.T) {
	book := newApplianceBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "oven:s:on"}
	snapshot, ok := book.open(w, storageEye, &Client{}, 0, 0, 0)
	if !ok || snapshot.Capacity != 3 || snapshot.Oven == nil || snapshot.Oven.Burn != 0 {
		t.Fatalf("open: %+v", snapshot)
	}
	if w[[3]int{0, 0, 0}] != "oven:s:off" {
		t.Fatalf("still lit: %s", w[[3]int{0, 0, 0}])
	}
	changes := book.drainNameChanges()
	if len(changes) != 1 || changes[0].BlockType != "oven:s:off" {
		t.Fatalf("not announced: %+v", changes)
	}
}

func TestPanelSeesProgressLive(t *testing.T) {
	book := newApplianceBook(nil)
	var mu sync.Mutex
	var sent []storageSnapshot
	book.deliver = func(_ *Client, data []byte) bool {
		mu.Lock()
		defer mu.Unlock()
		var message Message
		json.Unmarshal(data, &message)
		var snapshot storageSnapshot
		json.Unmarshal(message.Payload, &snapshot)
		sent = append(sent, snapshot)
		return true
	}
	w := fakeCropWorld{{0, 0, 0}: "oven"}
	alice, bob := &Client{}, &Client{}
	book.open(w, storageEye, alice, 0, 0, 0)
	book.open(w, storageEye, bob, 0, 0, 0)
	testPut(book, w, "request-1", "raw_fish", 1)
	testPut(book, w, "request-2", "coal_ore", 1)
	sent = nil
	applianceRun(book, w, 5)
	// Five updates, one for each of the two watching.
	if len(sent) != 10 {
		t.Fatalf("%d updates", len(sent))
	}
	last := sent[len(sent)-1]
	if last.Oven == nil || last.Oven.Cook != 5 || last.Oven.CookMax != 20 || last.Oven.Burn != 75 || last.Oven.BurnMax != 80 {
		t.Fatalf("status: %+v", last.Oven)
	}
	if last.Rev <= sent[0].Rev-1 {
		t.Fatalf("revisions: %d, %d", sent[0].Rev, last.Rev)
	}
	// With the fire out and nothing to do, nothing more is sent.
	testTake(book, w, "request-3", "raw_fish", ovenSlotFood, 1)
	applianceRun(book, w, 80)
	sent = nil
	applianceRun(book, w, 5)
	if len(sent) != 0 {
		t.Fatalf("sent %d updates with nothing happening", len(sent))
	}
}

func TestFridgeChillsWithPowerAndIsACupboardWithout(t *testing.T) {
	on := false
	book := newApplianceBook(&on)
	w := fakeCropWorld{{0, 0, 0}: "fridge:lower:e", {0, 1, 0}: "fridge:upper:e"}
	testPut(book, w, "request-1", "water_flask", 4)
	testPut(book, w, "request-2", "stone", 2)
	// No power: nothing changes, however long.
	applianceRun(book, w, 500)
	if got := slotAt(book, 0); got.Type != "water_flask" || got.Count != 4 || got.Chill != 0 {
		t.Fatalf("no power: %+v", got)
	}
	on = true
	applianceRun(book, w, 30)
	// A blackout halfway stops the clock and keeps what was counted.
	on = false
	applianceRun(book, w, 200)
	if got := slotAt(book, 0); got.Type != "water_flask" || got.Chill != 30 {
		t.Fatalf("blackout: %+v", got)
	}
	on = true
	applianceRun(book, w, 30)
	if got := slotAt(book, 0); got.Type != "cold_water" || got.Count != 4 || got.Chill != 0 {
		t.Fatalf("chilled: %+v", got)
	}
	if got := slotAt(book, 1); got.Type != "stone" || got.Count != 2 {
		t.Fatalf("stone: %+v", got)
	}
	// Nothing left to chill: it drops out of the tick. Cold items stay cold for ever.
	if len(book.active) != 0 {
		t.Fatalf("still ticked: %v", book.active)
	}
	on = false
	applianceRun(book, w, 500)
	if got := slotAt(book, 0); got.Type != "cold_water" {
		t.Fatalf("warmed up: %+v", got)
	}
}

func TestColdTables(t *testing.T) {
	cases := []struct {
		kind, tab, in, out string
		seconds            int
	}{
		{"fridge", "", "water_flask", "cold_water", 60},
		{"fridge", "", "milk", "cold_milk", 60},
		{"fridge", "", "soda_water", "cold_soda", 60},
		{"fridge", "", "raw_fish", "raw_fish", 200},
		{"fridge", storageFreezerTab, "water_flask", "ice", 120},
		{"fridge", storageFreezerTab, "cold_water", "ice", 120},
		{"fridge", storageFreezerTab, "raw_fish", "frozen_fish", 120},
		{"fridge", storageFreezerTab, "milk", "milk", 200},
		{"fridge", storageFreezerTab, "frozen_fish", "frozen_fish", 200},
		{"chest_freezer", "", "water_flask", "ice", 120},
		{"chest_freezer", "", "cooked_fish", "frozen_cooked_fish", 120},
		{"chest_freezer", "", "bread", "frozen_bread", 120},
		{"chest_freezer", "", "soda_water", "soda_water", 200},
		{"chest_freezer", "", "ice", "ice", 200},
	}
	on := true
	for _, c := range cases {
		book := newApplianceBook(&on)
		w := fakeCropWorld{{0, 0, 0}: c.kind}
		got, _ := book.put(w, storageEye, storageMove{Type: c.in, Amount: 5, ReqID: "request-1", Compartment: c.tab})
		if got.Amount != 5 {
			t.Fatalf("put: %+v", got)
		}
		applianceRun(book, w, c.seconds-1)
		block := book.blocks[blockKey(0, 0, 0)]
		slot := (*block.compartment(c.tab))[0]
		if c.in != c.out && slot.Type != c.in {
			t.Errorf("%s %q %s: changed a second too soon: %+v", c.kind, c.tab, c.in, slot)
		}
		applianceRun(book, w, 1)
		slot = (*block.compartment(c.tab))[0]
		if slot.Type != c.out || slot.Count != 5 {
			t.Errorf("%s %q %s: %+v", c.kind, c.tab, c.in, slot)
		}
	}
}

func TestFridgeCompartments(t *testing.T) {
	on := true
	book := newApplianceBook(&on)
	w := fakeCropWorld{{0, 0, 0}: "fridge:lower:n", {0, 1, 0}: "fridge:upper:n"}
	client := &Client{}
	snapshot, ok := book.open(w, storageEye, client, 0, 1, 0)
	if !ok || snapshot.Capacity != 18 || len(snapshot.Slots) != 18 || len(snapshot.Freezer) != 9 || !snapshot.Cold || !snapshot.Powered {
		t.Fatalf("open: %+v", snapshot)
	}
	// Through either half, each compartment has its own slots.
	move := func(id string, y int, compartment string) storageMove {
		return storageMove{Y: y, Type: "water_flask", Amount: 2, ReqID: id, Compartment: compartment}
	}
	if got, _ := book.put(w, storageEye, move("request-1", 0, "")); got.Amount != 2 {
		t.Fatalf("put: %+v", got)
	}
	if got, _ := book.put(w, storageEye, move("request-2", 1, storageFreezerTab)); got.Amount != 2 {
		t.Fatalf("put: %+v", got)
	}
	block := book.blocks[blockKey(0, 0, 0)]
	if len(book.blocks) != 1 || block == nil || block.Slots[0].Count != 2 || block.Freezer[0].Count != 2 {
		t.Fatalf("not in the lower cell: %+v", book.blocks)
	}
	// Bad compartments, and bad slots for the right one.
	for i, name := range []string{"cellar", "FREEZER", " freezer", strings.Repeat("x", 500)} {
		got, changed := book.put(w, storageEye, move(fmt.Sprintf("bad-%04d", i), 0, name))
		if got.Amount != 0 || changed || got.Reason != "bad compartment" {
			t.Errorf("%q: %+v", name, got)
		}
	}
	take := func(id string, slot int, compartment string) storageOutcome {
		got, _ := book.take(w, storageEye, storageMove{Slot: slot, Type: "water_flask", Amount: 1, ReqID: id, Compartment: compartment})
		return got
	}
	if got := take("slot-0001", 9, storageFreezerTab); got.Reason != "bad slot" {
		t.Errorf("slot 9 of 9: %+v", got)
	}
	if got := take("slot-0002", -1, storageFreezerTab); got.Reason != "bad slot" {
		t.Errorf("slot -1: %+v", got)
	}
	if got := take("slot-0003", 17, ""); got.Reason != "gone" {
		t.Errorf("slot 17 of 18: %+v", got)
	}
	if got := take("slot-0004", 0, storageFreezerTab); got.Amount != 1 {
		t.Errorf("take: %+v", got)
	}
	// The chest next to it has no freezer.
	w[[3]int{1, 0, 0}] = "chest"
	if got, _ := book.put(w, storageEye, storageMove{X: 1, Type: "stone", Amount: 1, ReqID: "chest-0001", Compartment: storageFreezerTab}); got.Reason != "bad compartment" {
		t.Errorf("a chest's freezer: %+v", got)
	}
	// The same request again gets its first answer, whichever compartment it names.
	if got, _ := book.put(w, storageEye, move("request-1", 0, storageFreezerTab)); got.Amount != 2 || block.Freezer[0].Count != 1 {
		t.Errorf("replay: %+v %+v", got, block.Freezer[0])
	}
	// Both compartments drop, once, through whichever half goes first.
	spill, _, _ := book.replace(w, 0, 1, 0, "", func() (bool, error) { return false, w.SetBlock(0, 1, 0, "") })
	total := 0
	for _, slot := range spill {
		total += slot.Count
		if slot.Chill != 0 {
			t.Errorf("a drop with a clock: %+v", slot)
		}
	}
	if total != 3 {
		t.Fatalf("spill: %+v", spill)
	}
	spill, _, _ = book.replace(w, 0, 0, 0, "", func() (bool, error) { return false, w.SetBlock(0, 0, 0, "") })
	if len(spill) != 0 || len(book.blocks) != 0 || len(book.active) != 0 {
		t.Fatalf("spilled twice: %+v, %+v", spill, book.blocks)
	}
}

func TestFridgeUpperHalfAloneIsNotStorage(t *testing.T) {
	book := newApplianceBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "chest", {0, 1, 0}: "fridge:upper:e"}
	if got, _ := book.put(w, storageEye, storageMove{Y: 1, Type: "stone", Amount: 5, ReqID: "request-1"}); got.Amount != 0 {
		t.Fatalf("put through a lone half: %+v", got)
	}
	if _, ok := book.open(w, storageEye, &Client{}, 0, 1, 0); ok {
		t.Fatal("a lone upper half opened")
	}
}

// An appliance standing where a chest stood starts empty: what the chest held is spilled.
func TestReplacingAChestWithAnApplianceSpills(t *testing.T) {
	book, w := newTestBook()
	testPut(book, w, "request-1", "stone", 10)
	spill, _, _ := book.replace(w, 0, 0, 0, "oven", func() (bool, error) { return false, w.SetBlock(0, 0, 0, "oven") })
	if len(spill) != 1 || spill[0].Count != 10 || len(book.blocks) != 0 {
		t.Fatalf("spill: %+v, %+v", spill, book.blocks)
	}
}

func TestChestsDoNotTick(t *testing.T) {
	book, w := newTestBook()
	testPut(book, w, "request-1", "water_flask", 5)
	if len(book.active) != 0 {
		t.Fatalf("a chest is ticked: %v", book.active)
	}
	applianceRun(book, w, 500)
	if got := slotAt(book, 0); got.Type != "water_flask" || got.Chill != 0 {
		t.Fatalf("a chest chilled: %+v", got)
	}
}

// A panel on a fridge follows its power, also when there is nothing inside to change.
func TestPanelFollowsPower(t *testing.T) {
	on := false
	book := newApplianceBook(&on)
	var sent int
	var last storageSnapshot
	book.deliver = func(_ *Client, data []byte) bool {
		var message Message
		json.Unmarshal(data, &message)
		last = storageSnapshot{}
		json.Unmarshal(message.Payload, &last)
		sent++
		return true
	}
	w := fakeCropWorld{{0, 0, 0}: "chest_freezer:e"}
	client := &Client{}
	if snapshot, _ := book.open(w, storageEye, client, 0, 0, 0); snapshot.Powered || !snapshot.Cold || snapshot.Capacity != 36 || snapshot.Freezer != nil {
		t.Fatalf("open: %+v", snapshot)
	}
	applianceRun(book, w, 3)
	if sent != 0 {
		t.Fatalf("%d updates with no change", sent)
	}
	on = true
	applianceRun(book, w, 3)
	if sent != 1 || !last.Powered {
		t.Fatalf("%d updates: %+v", sent, last)
	}
	on = false
	applianceRun(book, w, 1)
	if sent != 2 || last.Powered {
		t.Fatalf("%d updates: %+v", sent, last)
	}
	book.forget(client)
	if len(book.shownPower) != 0 {
		t.Fatalf("left behind: %v", book.shownPower)
	}
}

// A fridge placed before fridges used electricity is not in the grid's registry: opening it joins
// both halves, and a chest is not told about.
func TestSavedFridgeJoinsTheGridWhenOpened(t *testing.T) {
	book := newApplianceBook(nil)
	var adopted []string
	book.adopt = func(_, _, _ int, name string) { adopted = append(adopted, name) }
	w := fakeCropWorld{{0, 0, 0}: "fridge:lower:n", {0, 1, 0}: "fridge:upper:n", {3, 0, 0}: "chest"}
	if _, ok := book.open(w, storageEye, &Client{}, 0, 1, 0); !ok {
		t.Fatal("open")
	}
	if len(adopted) != 2 || adopted[0] != "fridge:lower:n" || adopted[1] != "fridge:upper:n" {
		t.Fatalf("adopted: %v", adopted)
	}
	adopted = nil
	book.open(w, storageEye, &Client{}, 3, 0, 0)
	if len(adopted) != 0 {
		t.Fatalf("a chest joined the grid: %v", adopted)
	}
}

// The real grid: one fridge is one consumer of 30 W, and a network that cannot feed everything
// gives its fridge no power at all.
func TestFridgeOnTheRealGrid(t *testing.T) {
	g := newPowerGrid()
	w := fakeCropWorld{}
	place := func(x, y, z int, name string) {
		w[[3]int{x, y, z}] = name
		g.track(x, y, z, name)
	}
	place(0, 0, 0, "fridge:lower:n")
	place(0, 1, 0, "fridge:upper:n")
	now := time.Unix(1000, 0)
	run := func(seconds float64) {
		for t := 0.0; t < seconds; t += 0.2 {
			now = now.Add(200 * time.Millisecond)
			g.tick(w, powerEnvironment{}, now, 0.2)
		}
	}
	run(1)
	if g.runsAt(powerPos{0, 0, 0}) {
		t.Fatal("a fridge with no generator runs")
	}
	if network := g.netOf[powerPos{0, 0, 0}]; network.demand != 30 {
		t.Fatalf("one fridge asks for %v W", network.demand)
	}
	place(1, 0, 0, "rtg")
	run(4)
	if !g.runsAt(powerPos{0, 0, 0}) {
		t.Fatal("80 W does not run a fridge")
	}
	// The name carries no :on: the fridge keeps its half and facing.
	if w[[3]int{0, 0, 0}] != "fridge:lower:n" || w[[3]int{0, 1, 0}] != "fridge:upper:n" {
		t.Fatalf("names: %v", w)
	}
	report := g.probe(0, 1, 0, w, powerEnvironment{}, now)
	if !report.Found || report.Kind != "fridge" || report.Own != -30 || report.Demand != 30 || report.Counts["fridge"] != 1 {
		t.Fatalf("multimeter: %+v", report)
	}
	// Three more 30 W consumers: 120 W > 80 W, so everything goes off, fridge included.
	place(0, 0, 1, "chest_freezer")
	place(1, 0, 1, "grow_lamp")
	place(2, 0, 1, "grow_lamp")
	run(1)
	if g.runsAt(powerPos{0, 0, 0}) || g.runsAt(powerPos{0, 0, 1}) {
		t.Fatal("an underpowered network kept its cold running")
	}
	// Taking the excess away brings it back, after the usual wait (no flicker).
	place(2, 0, 1, "stone")
	g.track(2, 0, 1, "stone")
	run(0.4)
	place(1, 0, 1, "stone")
	g.track(1, 0, 1, "stone")
	run(5)
	if !g.runsAt(powerPos{0, 0, 0}) || !g.runsAt(powerPos{0, 0, 1}) {
		t.Fatalf("60 W of 80 W is off: %+v", g.netOf[powerPos{0, 0, 0}])
	}
	if network := g.netOf[powerPos{0, 0, 0}]; network.demand != 60 {
		t.Fatalf("demand %v", network.demand)
	}
}

// The clock in the fridge runs on what the grid says, not on anything of its own.
func TestFridgeClockFollowsTheGrid(t *testing.T) {
	g := newPowerGrid()
	w := fakeCropWorld{{0, 0, 0}: "chest_freezer"}
	g.track(0, 0, 0, "chest_freezer")
	book, _ := newTestBook()
	book.powered = func(cell [3]int) bool { return g.runsAt(powerPos(cell)) }
	testPut(book, w, "request-1", "water_flask", 1)
	now := time.Unix(1000, 0)
	step := func(seconds int) {
		for i := 0; i < seconds; i++ {
			for j := 0; j < 5; j++ {
				now = now.Add(200 * time.Millisecond)
				g.tick(w, powerEnvironment{}, now, 0.2)
			}
			book.tickAppliances(w, 1)
		}
	}
	step(10)
	if got := slotAt(book, 0); got.Chill != 0 {
		t.Fatalf("cooling with no generator: %+v", got)
	}
	w[[3]int{1, 0, 0}] = "rtg"
	g.track(1, 0, 0, "rtg")
	step(130)
	if got := slotAt(book, 0); got.Type != "ice" {
		t.Fatalf("not frozen: %+v", got)
	}
}

func TestAppliancesSurviveARestart(t *testing.T) {
	on := true
	book := newApplianceBook(&on)
	w := fakeCropWorld{
		{0, 0, 0}: "oven:e:off",
		{1, 0, 0}: "fridge:lower:n",
		{1, 1, 0}: "fridge:upper:n",
	}
	testPut(book, w, "request-1", "raw_fish", 3)
	testPut(book, w, "request-2", "coal_ore", 1)
	book.put(w, storageEye, storageMove{X: 1, Type: "milk", Amount: 2, ReqID: "request-3"})
	book.put(w, storageEye, storageMove{X: 1, Type: "bread", Amount: 1, ReqID: "request-4", Compartment: storageFreezerTab})
	applianceRun(book, w, 30)

	blocks, outcomes := book.snapshot()
	data, err := json.Marshal(persistedWorldState{Storage: blocks, StorageLog: outcomes})
	if err != nil {
		t.Fatal(err)
	}
	var saved persistedWorldState
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatal(err)
	}
	restored := newApplianceBook(&on)
	restored.load(saved.Storage, saved.StorageLog)
	if len(restored.active) != 2 {
		t.Fatalf("not ticking again: %v", restored.active)
	}
	oven := restored.blocks[blockKey(0, 0, 0)]
	if oven.Burn != 50 || oven.BurnMax != 80 || oven.Cook != 10 || oven.Kind != "oven" {
		t.Fatalf("oven: %+v", oven)
	}
	fridge := restored.blocks[blockKey(1, 0, 0)]
	if fridge.Slots[0].Chill != 30 || fridge.Freezer[0].Chill != 30 {
		t.Fatalf("fridge: %+v", fridge)
	}
	// It goes on from where it was, and the fire shows even if the chunk says otherwise.
	w[[3]int{0, 0, 0}] = "oven:e:off"
	names := applianceRun(restored, w, 30)
	if len(names) != 1 || names[0].BlockType != "oven:e:on" {
		t.Fatalf("fire not shown: %+v", names)
	}
	if fridge.Slots[0].Type != "cold_milk" {
		t.Fatalf("milk: %+v", fridge.Slots[0])
	}
	if oven.Slots[ovenSlotResult].Count != 3 {
		t.Fatalf("cooked: %+v", oven.Slots)
	}
	// The answers stay in the log.
	if answers := restored.sync([]string{"request-3"}); answers[0].Amount != 2 {
		t.Fatalf("log: %+v", answers)
	}
}

// A chest saved before these existed, and a damaged save.
func TestApplianceLoadValidation(t *testing.T) {
	book := newApplianceBook(nil)
	book.load(map[string]StorageBlock{
		"0,0,0": {Slots: []StorageSlot{{Type: "stone", Count: 3}}},
		"1,0,0": {X: 1, Kind: "oven", Burn: 1e9, BurnMax: 1e9, Cook: -5, Slots: []StorageSlot{{Type: "wheat", Count: 3, Chill: -9}, {}, {}}},
		"2,0,0": {X: 2, Kind: "nonsense", Burn: 50, Slots: []StorageSlot{{Type: "stone", Count: 1}}},
		"3,0,0": {X: 3, Kind: "fridge", Burn: 50, Freezer: []StorageSlot{{Type: "bad name", Count: 1}}},
	}, nil)
	if len(book.blocks) != 3 || len(book.active) != 1 || !book.active[blockKey(1, 0, 0)] {
		t.Fatalf("blocks %+v, active %v", book.blocks, book.active)
	}
	oven := book.blocks[blockKey(1, 0, 0)]
	if oven.Burn != 80 || oven.BurnMax != 80 || oven.Cook != 0 || oven.Slots[0].Chill != 0 {
		t.Fatalf("oven: %+v", oven)
	}
	if got := book.blocks[blockKey(2, 0, 0)]; got.Kind != "" || got.Burn != 0 {
		t.Fatalf("not an appliance: %+v", got)
	}
}

// Many players on an oven and a freezer while the simulation runs and the blocks are broken and
// rebuilt: every item ends up in exactly one place. Run with -race.
func TestAppliancesConcurrentConservation(t *testing.T) {
	on := true
	book := newApplianceBook(&on)
	w := fakeCropWorld{{0, 0, 0}: "chest_freezer"}
	const (
		players = 6
		rounds  = 300
	)
	var mu sync.Mutex
	var put, taken, spilled int
	count := func(n *int, amount int) {
		mu.Lock()
		*n += amount
		mu.Unlock()
	}
	var wg sync.WaitGroup
	for player := 0; player < players; player++ {
		wg.Add(1)
		go func(player int) {
			defer wg.Done()
			for i := 0; i < rounds; i++ {
				got := testPut(book, w, fmt.Sprintf("put-%d-%d", player, i), "water_flask", 3)
				count(&put, got.Amount)
				for _, item := range []string{"water_flask", "ice"} {
					got = testTake(book, w, fmt.Sprintf("take-%s-%d-%d", item, player, i), item, i%3, 1)
					count(&taken, got.Amount)
				}
			}
		}(player)
	}
	wg.Add(2)
	go func() {
		defer wg.Done()
		for i := 0; i < rounds; i++ {
			name, block := "", "air"
			if i%2 == 1 {
				name, block = "chest_freezer", "chest_freezer"
			}
			spill, _, err := book.replace(w, 0, 0, 0, name, func() (bool, error) { return false, w.SetBlock(0, 0, 0, block) })
			if err != nil {
				t.Error(err)
			}
			for _, slot := range spill {
				count(&spilled, slot.Count)
			}
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < rounds; i++ {
			book.tickAppliances(w, 40) // quick, so that items really change under the moves
			book.snapshot()
		}
	}()
	wg.Wait()

	left := 0
	blocks, _ := book.snapshot()
	for _, block := range blocks {
		for _, slot := range block.Slots {
			left += slot.Count
		}
	}
	if put != taken+spilled+left {
		t.Fatalf("put %d != taken %d + spilled %d + left %d", put, taken, spilled, left)
	}
	if put == 0 || taken == 0 {
		t.Fatalf("the race never happened: put %d, taken %d, spilled %d", put, taken, spilled)
	}
}

func TestOvenConcurrentFuelAndFoodAreNeverDoubled(t *testing.T) {
	book := newApplianceBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "oven"}
	var mu sync.Mutex
	var putFish, gotFish, gotCooked int
	var wg sync.WaitGroup
	for player := 0; player < 6; player++ {
		wg.Add(1)
		go func(player int) {
			defer wg.Done()
			for i := 0; i < 200; i++ {
				a := testPut(book, w, fmt.Sprintf("fish-%d-%d", player, i), "raw_fish", 2)
				testPut(book, w, fmt.Sprintf("coal-%d-%d", player, i), "coal_ore", 1)
				b := testTake(book, w, fmt.Sprintf("back-%d-%d", player, i), "raw_fish", ovenSlotFood, 1)
				c := testTake(book, w, fmt.Sprintf("done-%d-%d", player, i), "cooked_fish", ovenSlotResult, 5)
				mu.Lock()
				putFish += a.Amount
				gotFish += b.Amount
				gotCooked += c.Amount
				mu.Unlock()
			}
		}(player)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 600; i++ {
			book.tickAppliances(w, 25)
		}
	}()
	wg.Wait()
	block := book.blocks[blockKey(0, 0, 0)]
	left := 0
	if block != nil {
		left = block.Slots[ovenSlotFood].Count + block.Slots[ovenSlotResult].Count
	}
	if putFish != gotFish+gotCooked+left {
		t.Fatalf("put %d != back %d + cooked %d + left %d", putFish, gotFish, gotCooked, left)
	}
}

// The whole path through the real handlers: a lit oven placed by a plan arrives out, and fire,
// panel and drops work with the real chunk store. The cold side of power is tested above.
func TestApplianceThroughMessages(t *testing.T) {
	alice, send, expect := storageMessageRig(t)
	send(alice, "blockPlace", Block{X: 2, Y: 120, Z: 2, BlockType: "oven:e:on"})
	var placed Block
	json.Unmarshal(expect(alice, "blockPlace"), &placed)
	if placed.BlockType != "oven:e:off" {
		t.Fatalf("placed lit: %+v", placed)
	}
	at := map[string]int{"x": 2, "y": 120, "z": 2}
	send(alice, "storageOpen", at)
	var seen storageSnapshot
	json.Unmarshal(expect(alice, "storageContents"), &seen)
	if seen.Oven == nil || seen.Capacity != 3 {
		t.Fatalf("open: %+v", seen)
	}
	send(alice, "storagePut", map[string]interface{}{"x": 2, "y": 120, "z": 2, "type": "stone", "amount": 1, "reqId": "alice-put-1"})
	var outcome storageOutcome
	json.Unmarshal(expect(alice, "storageResult"), &outcome)
	if outcome.Amount != 0 || outcome.Reason != "not for the oven" {
		t.Fatalf("stone: %+v", outcome)
	}
	for i, item := range []string{"raw_fish", "coal_ore"} {
		send(alice, "storagePut", map[string]interface{}{"x": 2, "y": 120, "z": 2, "type": item, "amount": 1, "reqId": fmt.Sprintf("alice-put-%d", i+2)})
		json.Unmarshal(expect(alice, "storageResult"), &outcome)
		if outcome.Amount != 1 {
			t.Fatalf("%s: %+v", item, outcome)
		}
	}
	updates, changed := storage.tickAppliances(chunkStore, 1)
	if !changed || len(updates) != 1 || updates[0].BlockType != "oven:e:on" {
		t.Fatalf("tick: %+v %v", updates, changed)
	}
	if name, _ := chunkStore.Block(2, 120, 2); name != "oven:e:on" {
		t.Fatalf("chunk: %s", name)
	}
	send(alice, "blockBreak", at)
	var drop struct {
		Items []StorageSlot `json:"items"`
	}
	json.Unmarshal(expect(alice, "storageDrop"), &drop)
	if len(drop.Items) != 1 || drop.Items[0].Type != "raw_fish" {
		t.Fatalf("drop: %+v", drop)
	}
}
