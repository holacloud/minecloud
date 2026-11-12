package network

import (
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"
)

// The foundry and the arc furnace (appliances.go). What they share with the oven is tested in
// appliances_test.go; this is what is new: yields, a second ingredient, and power on demand.

// A book whose arc furnaces have power when *on says so, and that remembers who asked for it.
func newArcBook(on *bool) (*storageBook, map[[3]int]bool) {
	book := newApplianceBook(on)
	asks := make(map[[3]int]bool)
	book.wantPower = func(cell [3]int, want bool) {
		if want {
			asks[cell] = true
		} else {
			delete(asks, cell)
		}
	}
	return book, asks
}

func TestSmelterTablesAreConsistent(t *testing.T) {
	for kind, m := range machines {
		if storageKinds[kind] != ovenSlotResult+1 {
			t.Errorf("%s: %d slots", kind, storageKinds[kind])
		}
		if !mechFixed[kind] || mechMovable(kind) || mechMovable(kind+":e:on") {
			t.Errorf("a ram could move %s", kind)
		}
		for item, recipe := range m.Recipes {
			if m.slotFor(item) != ovenSlotFood {
				t.Errorf("%s: %s goes to slot %d", kind, item, m.slotFor(item))
			}
			if recipe.In < 1 || recipe.Seconds <= 0 || recipe.Out == "" {
				t.Errorf("%s: %s: %+v", kind, item, recipe)
			}
			if recipe.Coal > 0 && !m.electric() {
				t.Errorf("%s burns its fuel, %s should not use it up as well", kind, item)
			}
		}
	}
	for food := range foundryRecipes {
		if _, both := foundryFuels[food]; both {
			t.Errorf("%s is what the foundry smelts and burns", food)
		}
	}
	if _, both := arcRecipes[arcReducer]; both {
		t.Errorf("%s is what the arc furnace melts and uses up", arcReducer)
	}
	// The oven is for food: nothing of the foundry's or the arc's cooks in it.
	for _, table := range []map[string]ovenRecipe{foundryRecipes, arcRecipes} {
		for item := range table {
			if _, ok := ovenRecipes[item]; ok {
				t.Errorf("the oven takes %s", item)
			}
		}
	}
	// What the C menu gives for the same materials (js/game.js and js/game/bucket.js): the machines
	// must give more.
	if glass := foundryRecipes["sand"]; float64(glass.yield())/float64(glass.In) <= 2.0/3.0 {
		t.Errorf("3 sand give 2 glass in the menu: %+v", glass)
	}
	if stone := foundryRecipes["cobblestone"]; float64(stone.yield())/float64(stone.In) <= 2 {
		t.Errorf("1 cobblestone gives 2 stone in the menu: %+v", stone)
	}
	// By hand, 1 ore and 1 coal give 1 metal (js/game/smelters.js).
	for _, ore := range []string{"copper_ore", "tin_ore", "zinc_ore", "lead_ore", "silver_ore"} {
		if r := foundryRecipes[ore]; float64(r.yield())/float64(r.In) <= 1 {
			t.Errorf("1 %s gives 1 metal in the menu: %+v", ore, r)
		}
	}
	if si := arcRecipes["sand"]; float64(si.yield())/float64(si.Coal) <= 1 || si.Coal != 2 || si.In != 1 {
		t.Errorf("1 coal gives 1 silicon in the menu, and silica takes 2 carbons: %+v", si)
	}
	// One 80 W generator is not enough, two are.
	arc := powerKinds[arcKind]
	rtg := powerKinds["rtg"]
	if !(arc.Role == powerConsumer && arc.OnDemand && !arc.Switch && arc.Watts > rtg.Watts && arc.Watts <= 2*rtg.Watts) {
		t.Errorf("arc furnace: %+v", arc)
	}
}

func TestSmelterRoutesItemsToTheirSlots(t *testing.T) {
	cases := []struct {
		block, item string
		slot        int
		refused     string
	}{
		{"foundry", "sand", ovenSlotFood, ""},
		{"foundry", "cobblestone", ovenSlotFood, ""},
		{"foundry", "coal_ore", ovenSlotFuel, ""},
		{"foundry", "planks", 0, "not for the foundry"},
		{"foundry", "wood", 0, "not for the foundry"},
		{"foundry", "raw_fish", 0, "not for the foundry"},
		{"foundry", "glass", 0, "not for the foundry"},
		{"arc_furnace", "sand", ovenSlotFood, ""},
		{"arc_furnace", "iron_ore", ovenSlotFood, ""},
		{"arc_furnace", "coal_ore", ovenSlotFuel, ""},
		{"arc_furnace", "planks", 0, "not for the arc furnace"},
		{"arc_furnace", "cobblestone", 0, "not for the arc furnace"},
		{"arc_furnace", "element_si", 0, "not for the arc furnace"},
		{"oven", "sand", 0, "not for the oven"},
		{"oven", "cobblestone", 0, "not for the oven"},
	}
	for i, c := range cases {
		book, _ := newArcBook(nil)
		w := fakeCropWorld{{0, 0, 0}: c.block}
		got := testPut(book, w, fmt.Sprintf("request-%d", i), c.item, 5)
		if got.Reason != c.refused {
			t.Errorf("%s takes %s: %+v", c.block, c.item, got)
		}
		if c.refused == "" && slotAt(book, c.slot).Type != c.item {
			t.Errorf("%s: %s is not in slot %d: %+v", c.block, c.item, c.slot, book.blocks[blockKey(0, 0, 0)])
		}
	}
}

func TestFoundryRecipes(t *testing.T) {
	cases := []struct {
		item, out string
		put       int
		seconds   int
		want      int
	}{
		{"sand", "glass", 3, 12, 4},
		{"cobblestone", "stone", 1, 10, 3},
		{"limestone", "quicklime", 1, 15, 2},
		{"iron_ore", "iron_block", 1, 20, 1},
		{"gold_ore", "gold_block", 1, 15, 1},
		{"copper_ore", "copper_block", 1, 15, 2},
		{"tin_ore", "element_sn", 1, 10, 2},
		{"zinc_ore", "element_zn", 1, 18, 2},
		{"lead_ore", "element_pb", 1, 10, 2},
		{"silver_ore", "element_ag", 1, 15, 2},
	}
	for _, c := range cases {
		book, _ := newArcBook(nil)
		w := fakeCropWorld{{0, 0, 0}: "foundry:e:off"}
		testPut(book, w, "request-1", c.item, c.put)
		testPut(book, w, "request-2", "coal_ore", 1)
		applianceRun(book, w, c.seconds-1)
		if got := slotAt(book, ovenSlotResult); got.Count != 0 {
			t.Errorf("%s is done early: %+v", c.item, got)
		}
		applianceRun(book, w, 1)
		if got := slotAt(book, ovenSlotResult); got.Type != c.out || got.Count != c.want {
			t.Errorf("%s: %+v", c.item, got)
		}
		if got := slotAt(book, ovenSlotFood); got.Count != 0 {
			t.Errorf("%s left: %+v", c.item, got)
		}
	}
}

func TestFoundryBurnsCoalAndShowsIt(t *testing.T) {
	book, asks := newArcBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "foundry:e:off"}
	testPut(book, w, "request-1", "sand", 2)
	testPut(book, w, "request-2", "coal_ore", 3)
	// Two sand are not a batch: it does not light.
	if names := applianceRun(book, w, 3); len(names) != 0 {
		t.Fatalf("lit with nothing to smelt: %+v", names)
	}
	if slotAt(book, ovenSlotFuel).Count != 3 {
		t.Fatalf("fuel: %+v", slotAt(book, ovenSlotFuel))
	}
	testPut(book, w, "request-3", "sand", 1)
	names := applianceRun(book, w, 1)
	if len(names) != 1 || names[0].BlockType != "foundry:e:on" || w[[3]int{0, 0, 0}] != "foundry:e:on" {
		t.Fatalf("not lit: %+v %v", names, w)
	}
	if slotAt(book, ovenSlotFuel).Count != 2 {
		t.Fatalf("fuel: %+v", slotAt(book, ovenSlotFuel))
	}
	// One coal outlasts the batch and burns out afterwards, and that is all it takes.
	applianceRun(book, w, 79)
	if got := slotAt(book, ovenSlotResult); got.Count != 4 {
		t.Fatalf("glass: %+v", got)
	}
	if w[[3]int{0, 0, 0}] != "foundry:e:off" {
		t.Fatalf("still lit: %v", w)
	}
	if slotAt(book, ovenSlotFuel).Count != 2 {
		t.Fatalf("burnt more coal with nothing to smelt: %+v", slotAt(book, ovenSlotFuel))
	}
	if len(asks) != 0 {
		t.Fatalf("a foundry has no business with the grid: %v", asks)
	}
}

// The panel of a foundry follows the fire and the work, for everyone with it open.
func TestFoundryPanelIsLive(t *testing.T) {
	book, _ := newArcBook(nil)
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
	w := fakeCropWorld{{0, 0, 0}: "foundry"}
	book.open(w, storageEye, &Client{}, 0, 0, 0)
	book.open(w, storageEye, &Client{}, 0, 0, 0)
	testPut(book, w, "request-1", "sand", 3)
	testPut(book, w, "request-2", "coal_ore", 1)
	sent = nil
	applianceRun(book, w, 5)
	if len(sent) != 10 {
		t.Fatalf("%d updates", len(sent))
	}
	last := sent[len(sent)-1]
	if last.Oven == nil || last.Oven.Cook != 5 || last.Oven.CookMax != 12 || last.Oven.Burn != 75 || last.Oven.BurnMax != 80 {
		t.Fatalf("status: %+v", last.Oven)
	}
	if last.Cold || last.Powered {
		t.Fatalf("a foundry does not use electricity: %+v", last)
	}
}

func TestMachineWaitsForRoomForTheWholeBatch(t *testing.T) {
	book, _ := newArcBook(nil)
	w := fakeCropWorld{{0, 0, 0}: "foundry"}
	testPut(book, w, "request-1", "sand", 3)
	testPut(book, w, "request-2", "coal_ore", 1)
	book.blocks[blockKey(0, 0, 0)].Slots = append(book.blocks[blockKey(0, 0, 0)].Slots[:2], StorageSlot{Type: "glass", Count: storageMaxStack - 3})
	applianceRun(book, w, 100)
	if got := slotAt(book, ovenSlotResult); got.Count != storageMaxStack-3 {
		t.Fatalf("no room for 4: %+v", got)
	}
	if slotAt(book, ovenSlotFuel).Count != 1 {
		t.Fatalf("burnt fuel with no room: %+v", slotAt(book, ovenSlotFuel))
	}
	testTake(book, w, "request-3", "glass", ovenSlotResult, 1)
	applianceRun(book, w, 12)
	if got := slotAt(book, ovenSlotResult); got.Count != storageMaxStack {
		t.Fatalf("exactly full: %+v", got)
	}
}

func TestArcFurnaceRecipes(t *testing.T) {
	cases := []struct {
		item, out      string
		coal, seconds  int
		want, coalLeft int
	}{
		{"sand", "element_si", 2, 20, 3, 0},
		{"iron_ore", "steel_ingot", 1, 15, 2, 0},
	}
	for _, c := range cases {
		on := true
		book, _ := newArcBook(&on)
		w := fakeCropWorld{{0, 0, 0}: "arc_furnace:e:off"}
		testPut(book, w, "request-1", c.item, 1)
		testPut(book, w, "request-2", "coal_ore", c.coal)
		// One tick to ask the grid, then it runs.
		applianceRun(book, w, c.seconds)
		if got := slotAt(book, ovenSlotResult); got.Count != 0 {
			t.Errorf("%s is done early: %+v", c.item, got)
		}
		applianceRun(book, w, 1)
		if got := slotAt(book, ovenSlotResult); got.Type != c.out || got.Count != c.want {
			t.Errorf("%s: %+v", c.item, got)
		}
		if food, coal := slotAt(book, ovenSlotFood), slotAt(book, ovenSlotFuel); food.Count != 0 || coal.Count != c.coalLeft {
			t.Errorf("%s left: %+v, coal %+v", c.item, food, coal)
		}
	}
}

func TestArcFurnaceNeedsItsCoal(t *testing.T) {
	on := true
	book, asks := newArcBook(&on)
	w := fakeCropWorld{{0, 0, 0}: "arc_furnace"}
	testPut(book, w, "request-1", "sand", 5)
	testPut(book, w, "request-2", "coal_ore", 1)
	applianceRun(book, w, 30)
	if got := slotAt(book, ovenSlotResult); got.Count != 0 {
		t.Fatalf("1 coal is not enough: %+v", got)
	}
	if len(asks) != 0 {
		t.Fatalf("asks for power with no work: %v", asks)
	}
	if w[[3]int{0, 0, 0}] != "arc_furnace" {
		t.Fatalf("lit with no work: %v", w)
	}
	testPut(book, w, "request-3", "coal_ore", 3)
	if len(book.active) != 1 {
		t.Fatalf("not woken: %v", book.active)
	}
	applianceRun(book, w, 21)
	if got := slotAt(book, ovenSlotResult); got.Count != 3 {
		t.Fatalf("silicon: %+v", got)
	}
	if got := slotAt(book, ovenSlotFuel); got.Count != 2 {
		t.Fatalf("coal: %+v", got)
	}
}

// Without power it holds still and keeps what it had done; the name and the panel follow.
func TestArcFurnaceHoldsWithoutPowerAndResumes(t *testing.T) {
	on := false
	book, asks := newArcBook(&on)
	var sent []storageSnapshot
	book.deliver = func(_ *Client, data []byte) bool {
		var message Message
		json.Unmarshal(data, &message)
		var snapshot storageSnapshot
		json.Unmarshal(message.Payload, &snapshot)
		sent = append(sent, snapshot)
		return true
	}
	w := fakeCropWorld{{0, 0, 0}: "arc_furnace:e:off"}
	book.open(w, storageEye, &Client{}, 0, 0, 0)
	testPut(book, w, "request-1", "sand", 2)
	testPut(book, w, "request-2", "coal_ore", 4)
	if last := sent[len(sent)-1]; last.Oven == nil || !last.Oven.Starting || last.Oven.CookMax != 20 || last.Powered {
		t.Fatalf("just filled: %+v", last.Oven)
	}
	sent = nil
	if names := applianceRun(book, w, 10); len(names) != 0 {
		t.Fatalf("lit without power: %+v", names)
	}
	if !asks[[3]int{0, 0, 0}] {
		t.Fatal("it has work: it must ask for power, or a network could never know")
	}
	last := sent[len(sent)-1]
	if last.Oven.Cook != 0 || last.Oven.Starting || last.Powered || last.Oven.CookMax != 20 {
		t.Fatalf("no power: %+v, powered %v", last.Oven, last.Powered)
	}
	if len(book.active) != 1 {
		t.Fatal("it must keep waiting for power")
	}
	// Nothing new to say while it waits.
	sent = nil
	applianceRun(book, w, 5)
	if len(sent) != 0 {
		t.Fatalf("%d updates while nothing happens", len(sent))
	}

	on = true
	names := applianceRun(book, w, 5)
	if len(names) != 1 || names[0].BlockType != "arc_furnace:e:on" {
		t.Fatalf("no arc: %+v", names)
	}
	if last := sent[len(sent)-1]; last.Oven.Cook != 5 || !last.Powered {
		t.Fatalf("running: %+v", last)
	}

	on = false
	names = applianceRun(book, w, 7)
	if len(names) != 1 || names[0].BlockType != "arc_furnace:e:off" {
		t.Fatalf("the arc stays lit: %+v", names)
	}
	if got := book.blocks[blockKey(0, 0, 0)].Cook; got != 5 {
		t.Fatalf("progress is kept while there is no power: %v", got)
	}

	on = true
	applianceRun(book, w, 15)
	if got := slotAt(book, ovenSlotResult); got.Count != 3 {
		t.Fatalf("resumes from where it was: %+v", got)
	}
}

// When the work ends, so does the demand, and an arc goes out however it ended.
func TestArcFurnaceStopsAskingWhenItHasNoWork(t *testing.T) {
	setup := func() (*storageBook, map[[3]int]bool, fakeCropWorld) {
		on := true
		book, asks := newArcBook(&on)
		w := fakeCropWorld{{0, 0, 0}: "arc_furnace:e:off"}
		testPut(book, w, "request-1", "sand", 1)
		testPut(book, w, "request-2", "coal_ore", 2)
		applianceRun(book, w, 5)
		if !asks[[3]int{0, 0, 0}] || w[[3]int{0, 0, 0}] != "arc_furnace:e:on" {
			t.Fatalf("not running: %v %v", asks, w)
		}
		return book, asks, w
	}
	check := func(what string, asks map[[3]int]bool, w fakeCropWorld, book *storageBook) {
		t.Helper()
		if len(asks) != 0 {
			t.Errorf("%s: still asking for power: %v", what, asks)
		}
		if w[[3]int{0, 0, 0}] != "arc_furnace:e:off" {
			t.Errorf("%s: %v", what, w)
		}
		if len(book.active) != 0 {
			t.Errorf("%s: still ticking: %v", what, book.active)
		}
	}

	book, asks, w := setup()
	applianceRun(book, w, 20)
	check("finished", asks, w, book)
	if got := slotAt(book, ovenSlotResult); got.Count != 3 {
		t.Errorf("silicon: %+v", got)
	}

	book, asks, w = setup()
	testTake(book, w, "request-3", "coal_ore", ovenSlotFuel, 1)
	applianceRun(book, w, 1)
	check("coal taken", asks, w, book)
	if got := book.blocks[blockKey(0, 0, 0)].Cook; got != 0 {
		t.Errorf("a stopped batch keeps its progress: %v", got)
	}

	book, asks, w = setup()
	testTake(book, w, "request-3", "coal_ore", ovenSlotFuel, 2)
	testTake(book, w, "request-4", "sand", ovenSlotFood, 1)
	check("emptied", asks, w, book)
	if len(book.blocks) != 0 {
		t.Errorf("an empty furnace keeps an entry: %v", book.blocks)
	}
	if changes := book.drainNameChanges(); len(changes) != 1 || changes[0].BlockType != "arc_furnace:e:off" {
		t.Errorf("nobody told of the arc going out: %+v", changes)
	}

	book, asks, w = setup()
	spill, _, err := book.replace(w, 0, 0, 0, "", func() (bool, error) {
		delete(w, [3]int{0, 0, 0})
		return false, nil
	})
	if err != nil || len(spill) != 2 {
		t.Errorf("break: %+v, %v", spill, err)
	}
	if len(asks) != 0 || len(book.asked) != 0 {
		t.Errorf("broken and still asking: %v %v", asks, book.asked)
	}
}

// A new state of the same machine keeps its contents; another block, or air, spills them.
func TestSmeltersDropTheirSlotsWhenBroken(t *testing.T) {
	for _, kind := range []string{"foundry", "arc_furnace"} {
		book, _ := newArcBook(nil)
		w := fakeCropWorld{{0, 0, 0}: kind + ":e:off"}
		testPut(book, w, "request-1", "sand", 7)
		testPut(book, w, "request-2", "coal_ore", 5)
		book.blocks[blockKey(0, 0, 0)].Slots[ovenSlotResult] = StorageSlot{Type: "glass", Count: 2}
		spill, _, _ := book.replace(w, 0, 0, 0, kind+":e:on", func() (bool, error) { return false, nil })
		if len(spill) != 0 {
			t.Errorf("%s: a state spills: %+v", kind, spill)
		}
		spill, _, _ = book.replace(w, 0, 0, 0, "", func() (bool, error) {
			delete(w, [3]int{0, 0, 0})
			return false, nil
		})
		total := map[string]int{}
		for _, slot := range spill {
			total[slot.Type] += slot.Count
		}
		if total["sand"] != 7 || total["coal_ore"] != 5 || total["glass"] != 2 || len(book.blocks) != 0 {
			t.Errorf("%s: spilt %+v", kind, spill)
		}
	}
}

func TestSmelterNameIsTheServers(t *testing.T) {
	on := true
	book, _ := newArcBook(&on)
	w := fakeCropWorld{{0, 0, 0}: "foundry:e:off", {1, 0, 0}: "arc_furnace:e:off"}
	if got := book.settleOvenName(0, 0, 0, "foundry:s:on"); got != "foundry:s:off" {
		t.Fatalf("a plan lit a foundry: %s", got)
	}
	if got := book.settleOvenName(1, 0, 0, "arc_furnace:w:on"); got != "arc_furnace:w:off" {
		t.Fatalf("a plan struck an arc: %s", got)
	}
	testPut(book, w, "request-1", "sand", 3)
	testPut(book, w, "request-2", "coal_ore", 1)
	book.put(w, storageEye, storageMove{X: 1, Type: "sand", Amount: 1, ReqID: "request-3"})
	book.put(w, storageEye, storageMove{X: 1, Type: "coal_ore", Amount: 2, ReqID: "request-4"})
	applianceRun(book, w, 3)
	if got := book.settleOvenName(0, 0, 0, "foundry:w:off"); got != "foundry:w:on" {
		t.Fatalf("burning: %s", got)
	}
	if got := book.settleOvenName(1, 0, 0, "arc_furnace:w:off"); got != "arc_furnace:w:on" {
		t.Fatalf("running: %s", got)
	}
	// A saved name out of step goes right when the panel opens, also on a furnace with no entry.
	w[[3]int{2, 0, 0}] = "arc_furnace:s:on"
	book.open(w, storageEye, &Client{}, 2, 0, 0)
	if changes := book.drainNameChanges(); w[[3]int{2, 0, 0}] != "arc_furnace:s:off" || len(changes) != 1 {
		t.Fatalf("stale arc: %v %+v", w, changes)
	}
}

// The real grid: what a furnace asks for, and what it takes to run it.
type arcRig struct {
	t    *testing.T
	g    *powerGrid
	w    fakeCropWorld
	book *storageBook
	now  time.Time
}

func newArcRig(t *testing.T) *arcRig {
	rig := &arcRig{t: t, g: newPowerGrid(), w: fakeCropWorld{}, now: time.Unix(1000, 0)}
	rig.book, _ = newTestBook()
	rig.book.powered = func(cell [3]int) bool { return rig.g.runsAt(powerPos(cell)) }
	rig.book.wantPower = func(cell [3]int, on bool) {
		if on {
			rig.g.asks[powerPos(cell)] = true
		} else {
			delete(rig.g.asks, powerPos(cell))
		}
	}
	rig.place(0, 0, 0, "arc_furnace")
	return rig
}

func (r *arcRig) place(x, y, z int, name string) {
	r.w[[3]int{x, y, z}] = name
	r.g.track(x, y, z, name)
}

// run plays seconds of both clocks: the grid at 5 Hz, the appliances at 1 Hz.
func (r *arcRig) run(seconds int) {
	for i := 0; i < seconds; i++ {
		for j := 0; j < 5; j++ {
			r.now = r.now.Add(200 * time.Millisecond)
			r.g.tick(r.w, powerEnvironment{}, r.now, 0.2)
		}
		r.book.tickAppliances(r.w, 1)
	}
}

func (r *arcRig) fill(sand, coal int) {
	id := fmt.Sprintf("fill-%d", r.now.UnixNano())
	testPut(r.book, r.w, id+"-sand", "sand", sand)
	testPut(r.book, r.w, id+"-coal", "coal_ore", coal)
}

func (r *arcRig) silicon() int {
	return slotAt(r.book, ovenSlotResult).Count
}

func TestArcFurnaceOnTheRealGrid(t *testing.T) {
	rig := newArcRig(t)
	rig.place(1, 0, 0, "rtg")
	rig.run(1)
	// Idle, it asks for nothing: the generator's network has no demand at all.
	network := rig.g.netOf[powerPos{0, 0, 0}]
	if network.demand != 0 || network.gen != 80 {
		t.Fatalf("idle: %+v", network)
	}
	report := rig.g.probe(0, 0, 0, rig.w, powerEnvironment{}, rig.now)
	if report.Own != 0 || report.Kind != "arc_furnace" || report.Demand != 0 || report.Counts["arc_furnace"] != 1 {
		t.Fatalf("multimeter, idle: %+v", report)
	}

	// With work it asks for 150 W, and one 80 W generator cannot give them.
	rig.fill(2, 4)
	rig.run(30)
	if rig.silicon() != 0 || rig.book.blocks[blockKey(0, 0, 0)].Cook != 0 {
		t.Fatalf("ran on 80 W: %+v", rig.book.blocks[blockKey(0, 0, 0)])
	}
	if network = rig.g.netOf[powerPos{0, 0, 0}]; network.demand != 150 || network.powered {
		t.Fatalf("underfed: %+v", network)
	}
	if name := rig.w[[3]int{0, 0, 0}]; name != "arc_furnace" {
		t.Fatalf("lit without power: %s", name)
	}

	// A second one is enough.
	rig.place(0, 0, 1, "rtg")
	rig.run(25)
	if rig.silicon() != 3 {
		t.Fatalf("two generators: %+v", rig.book.blocks[blockKey(0, 0, 0)])
	}
	if name := rig.w[[3]int{0, 0, 0}]; name != "arc_furnace:n:on" {
		t.Fatalf("not lit: %s", name)
	}
	report = rig.g.probe(0, 0, 0, rig.w, powerEnvironment{}, rig.now)
	if report.Own != -150 || report.Demand != 150 || report.Gen != 160 || !report.Powered {
		t.Fatalf("multimeter, running: %+v", report)
	}

	// Done: no demand any more, and the name goes back.
	rig.run(25)
	if rig.silicon() != 6 {
		t.Fatalf("second batch: %+v", rig.book.blocks[blockKey(0, 0, 0)])
	}
	rig.run(1)
	if network = rig.g.netOf[powerPos{0, 0, 0}]; network.demand != 0 {
		t.Fatalf("done, and still asking: %+v", network)
	}
	if name := rig.w[[3]int{0, 0, 0}]; name != "arc_furnace" {
		t.Fatalf("lit when done: %s", name)
	}
}

// A lamp keeps a network "powered" before the furnace is heard: that is not power for the furnace.
func TestArcFurnaceIsNotFooledByASmallLoad(t *testing.T) {
	rig := newArcRig(t)
	rig.place(1, 0, 0, "rtg")
	rig.place(0, 0, 1, "electric_lamp")
	rig.run(5)
	if !rig.g.netOf[powerPos{0, 0, 0}].powered {
		t.Fatal("the lamp's network should run")
	}
	rig.fill(1, 2)
	rig.run(1)
	if got := rig.book.blocks[blockKey(0, 0, 0)].Cook; got != 0 {
		t.Fatalf("worked on a network that cannot feed it: %v", got)
	}
	// All or nothing: the network goes out, lamp included, as for any other consumer.
	rig.run(3)
	if rig.g.netOf[powerPos{0, 0, 0}].powered || rig.w[[3]int{0, 0, 1}] != "electric_lamp" {
		t.Fatalf("network: %+v, lamp %s", rig.g.netOf[powerPos{0, 0, 0}], rig.w[[3]int{0, 0, 1}])
	}
	if got := rig.book.blocks[blockKey(0, 0, 0)].Cook; got != 0 {
		t.Fatalf("worked in a blackout: %v", got)
	}
	// Take the work away and the lamp comes back.
	testTake(rig.book, rig.w, "take-coal", "coal_ore", ovenSlotFuel, 2)
	rig.run(5)
	if rig.w[[3]int{0, 0, 1}] != "electric_lamp:on" {
		t.Fatalf("lamp: %s", rig.w[[3]int{0, 0, 1}])
	}
}

// Other ways of feeding it. A full battery with no generator lasts 20 s of arc.
func TestArcFurnaceOnABattery(t *testing.T) {
	rig := newArcRig(t)
	rig.place(1, 0, 0, "battery_block")
	rig.g.blocks[powerPos{1, 0, 0}].Energy = 3000
	rig.fill(2, 4)
	rig.run(22)
	if rig.silicon() != 3 {
		t.Fatalf("one battery runs one batch: %+v", rig.book.blocks[blockKey(0, 0, 0)])
	}
	rig.run(30)
	if rig.silicon() != 3 {
		t.Fatalf("an empty battery ran a second one: %+v", rig.book.blocks[blockKey(0, 0, 0)])
	}
}

func TestArcFurnaceOnWaterWheels(t *testing.T) {
	rig := newArcRig(t)
	rig.place(1, 0, 0, "water_wheel")
	for _, at := range [][3]int{{2, 0, 0}, {1, 0, 1}, {1, 0, -1}} {
		rig.w[at] = "water"
	}
	rig.fill(1, 2)
	rig.run(10)
	if got := rig.book.blocks[blockKey(0, 0, 0)].Cook; got != 0 {
		t.Fatalf("one wheel gives 105 W at most: %v", got)
	}
	rig.place(-1, 0, 0, "water_wheel")
	for _, at := range [][3]int{{-2, 0, 0}, {-1, 0, 1}, {-1, 0, -1}} {
		rig.w[at] = "water"
	}
	rig.run(30)
	if rig.silicon() != 3 {
		t.Fatalf("two wheels: %+v", rig.book.blocks[blockKey(0, 0, 0)])
	}
}

func TestSmeltersSurviveARestart(t *testing.T) {
	on := true
	book, _ := newArcBook(&on)
	w := fakeCropWorld{{0, 0, 0}: "foundry:e:off", {1, 0, 0}: "arc_furnace:e:off"}
	testPut(book, w, "request-1", "sand", 3)
	testPut(book, w, "request-2", "coal_ore", 1)
	book.put(w, storageEye, storageMove{X: 1, Type: "sand", Amount: 1, ReqID: "request-3"})
	book.put(w, storageEye, storageMove{X: 1, Type: "coal_ore", Amount: 2, ReqID: "request-4"})
	applianceRun(book, w, 6)

	blocks, outcomes := book.snapshot()
	data, err := json.Marshal(storageSaved{Storage: blocks, StorageLog: outcomes})
	if err != nil {
		t.Fatal(err)
	}
	var saved storageSaved
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatal(err)
	}
	restored, asks := newArcBook(&on)
	restored.load(saved.Storage, saved.StorageLog)
	if len(restored.active) != 2 {
		t.Fatalf("not ticking again: %v", restored.active)
	}
	foundry := restored.blocks[blockKey(0, 0, 0)]
	if foundry.Kind != "foundry" || foundry.Burn != 74 || foundry.BurnMax != 80 || foundry.Cook != 6 {
		t.Fatalf("foundry: %+v", foundry)
	}
	arc := restored.blocks[blockKey(1, 0, 0)]
	if arc.Kind != "arc_furnace" || arc.Burn != 0 || arc.Cook != 5 {
		t.Fatalf("arc: %+v", arc)
	}
	// It asks the new grid again, and goes on from where it was, one tick late.
	applianceRun(restored, w, 1)
	if !asks[[3]int{1, 0, 0}] {
		t.Fatal("not asking after a restart")
	}
	if arc.Cook != 5 {
		t.Fatalf("ran before the grid could answer: %v", arc.Cook)
	}
	applianceRun(restored, w, 15)
	if arc.Slots[ovenSlotResult].Count != 3 || foundry.Slots[ovenSlotResult].Count != 4 {
		t.Fatalf("after: %+v %+v", arc.Slots, foundry.Slots)
	}
	if len(asks) != 0 {
		t.Fatalf("still asking: %v", asks)
	}
}

func TestSmelterLoadValidation(t *testing.T) {
	book, _ := newArcBook(nil)
	coal := []StorageSlot{{Type: "coal_ore", Count: 1}}
	book.load(map[string]StorageBlock{
		"a": {X: 0, Kind: "arc_furnace", Slots: coal, Burn: 500, BurnMax: 500, Cook: 3},
		"f": {X: 1, Kind: "foundry", Slots: coal, Burn: 500, BurnMax: 500, Cook: -3},
	}, nil)
	if arc := book.blocks[blockKey(0, 0, 0)]; arc.Burn != 0 || arc.BurnMax != 0 || arc.Cook != 3 {
		t.Fatalf("an arc furnace has no fire: %+v", arc)
	}
	if foundry := book.blocks[blockKey(1, 0, 0)]; foundry.Burn != 80 || foundry.BurnMax != 80 || foundry.Cook != 0 {
		t.Fatalf("foundry: %+v", foundry)
	}
}

func TestArcFurnaceConcurrentConservation(t *testing.T) {
	book, _ := newArcBook(nil)
	book.powered = func([3]int) bool { return true }
	var asksMu sync.Mutex
	asked := 0
	book.wantPower = func([3]int, bool) {
		asksMu.Lock()
		asked++
		asksMu.Unlock()
	}
	w := fakeCropWorld{{0, 0, 0}: "arc_furnace"}
	var mu sync.Mutex
	var putSand, putCoal, gotSand, gotCoal, gotSilicon int
	var wg sync.WaitGroup
	for player := 0; player < 6; player++ {
		wg.Add(1)
		go func(player int) {
			defer wg.Done()
			for i := 0; i < 200; i++ {
				a := testPut(book, w, fmt.Sprintf("sand-%d-%d", player, i), "sand", 2)
				b := testPut(book, w, fmt.Sprintf("coal-%d-%d", player, i), "coal_ore", 3)
				c := testTake(book, w, fmt.Sprintf("back-%d-%d", player, i), "sand", ovenSlotFood, 1)
				d := testTake(book, w, fmt.Sprintf("coal-back-%d-%d", player, i), "coal_ore", ovenSlotFuel, 1)
				e := testTake(book, w, fmt.Sprintf("done-%d-%d", player, i), "element_si", ovenSlotResult, 7)
				mu.Lock()
				putSand += a.Amount
				putCoal += b.Amount
				gotSand += c.Amount
				gotCoal += d.Amount
				gotSilicon += e.Amount
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
	sand, coal := 0, 0
	if block := book.blocks[blockKey(0, 0, 0)]; block != nil {
		sand = block.Slots[ovenSlotFood].Count
		coal = block.Slots[ovenSlotFuel].Count
		gotSilicon += block.Slots[ovenSlotResult].Count
	}
	if gotSilicon%3 != 0 {
		t.Fatalf("silicon comes in threes: %d", gotSilicon)
	}
	batches := gotSilicon / 3
	if putSand != gotSand+sand+batches || putCoal != gotCoal+coal+2*batches {
		t.Fatalf("sand %d != %d + %d + %d; coal %d != %d + %d + 2*%d", putSand, gotSand, sand, batches, putCoal, gotCoal, coal, batches)
	}
}

// The whole path through the real handlers: a lit furnace placed by a plan arrives out, and panel
// and drops work with the real chunk store. Power is not on: the panel says so.
func TestArcFurnaceThroughMessages(t *testing.T) {
	alice, send, expect := storageMessageRig(t)
	send(alice, "blockPlace", Block{X: 2, Y: 120, Z: 2, BlockType: "arc_furnace:e:on"})
	var placed Block
	json.Unmarshal(expect(alice, "blockPlace"), &placed)
	if placed.BlockType != "arc_furnace:e:off" {
		t.Fatalf("placed lit: %+v", placed)
	}
	at := map[string]int{"x": 2, "y": 120, "z": 2}
	send(alice, "storageOpen", at)
	var seen storageSnapshot
	json.Unmarshal(expect(alice, "storageContents"), &seen)
	if seen.Oven == nil || seen.Capacity != 3 || seen.Cold || seen.Powered {
		t.Fatalf("open: %+v", seen)
	}
	var outcome storageOutcome
	send(alice, "storagePut", map[string]interface{}{"x": 2, "y": 120, "z": 2, "type": "stone", "amount": 1, "reqId": "alice-put-1"})
	json.Unmarshal(expect(alice, "storageResult"), &outcome)
	if outcome.Amount != 0 || outcome.Reason != "not for the arc furnace" {
		t.Fatalf("stone: %+v", outcome)
	}
	for i, item := range []string{"sand", "coal_ore"} {
		send(alice, "storagePut", map[string]interface{}{"x": 2, "y": 120, "z": 2, "type": item, "amount": 2, "reqId": fmt.Sprintf("alice-put-%d", i+2)})
		json.Unmarshal(expect(alice, "storageResult"), &outcome)
		if outcome.Amount != 2 {
			t.Fatalf("%s: %+v", item, outcome)
		}
	}
	storage.tickAppliances(chunkStore, 1)
	powerMu.Lock()
	asking := grid.asks[powerPos{2, 120, 2}]
	report := grid.blocks[powerPos{2, 120, 2}]
	powerMu.Unlock()
	if !asking || report == nil || report.Kind != arcKind {
		t.Fatalf("the grid does not know: %v %+v", asking, report)
	}
	send(alice, "blockBreak", at)
	var drop struct {
		Items []StorageSlot `json:"items"`
	}
	json.Unmarshal(expect(alice, "storageDrop"), &drop)
	if len(drop.Items) != 2 {
		t.Fatalf("drop: %+v", drop)
	}
	powerMu.Lock()
	defer powerMu.Unlock()
	if grid.asks[powerPos{2, 120, 2}] {
		t.Fatal("broken and still asking")
	}
}
