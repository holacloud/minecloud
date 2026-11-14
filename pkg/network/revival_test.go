package network

import (
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"
)

// The revival machine (revival.go): what it takes, what starts it, what it needs to go on, where the animal
// appears and who is told.

var revivalCell = [3]int{0, 0, 0}

// A machine at (0, 0, 0) on a floor of stone, in a book whose world outside is the test's to set: whether
// the grid feeds it, whether its top face has a signal, how many animals live near, and the animals it makes.
type revivalRig struct {
	t        *testing.T
	book     *storageBook
	w        fakeCropWorld
	power    bool
	signal   bool
	near     int
	asks     map[[3]int]bool
	made     []animalSpawnSpec
	now      time.Time
	requests int
}

func newRevivalRig(t *testing.T) *revivalRig {
	t.Helper()
	book, _ := newTestBook()
	rig := &revivalRig{t: t, book: book, w: fakeCropWorld{revivalCell: revivalKind}, asks: make(map[[3]int]bool), now: time.Unix(5000, 0)}
	revivalFill(rig.w, -6, 6, -1, -1, -6, 6, "stone")
	book.powered = func([3]int) bool { return rig.power }
	book.wantPower = func(cell [3]int, want bool) {
		if want {
			rig.asks[cell] = true
		} else {
			delete(rig.asks, cell)
		}
	}
	book.revivalSignal = func([3]int) bool { return rig.signal }
	book.revivalNear = func(x, z float64) int { return rig.near }
	book.revivalZone = func(x, z int) string { return "" }
	book.revivalSpawn = func(spec animalSpawnSpec) (uint32, bool) {
		rig.made = append(rig.made, spec)
		return uint32(len(rig.made)), true
	}
	book.seed = func() uint32 { return 7 }
	t.Cleanup(func() { worldStorage.dirty.Store(false) })
	return rig
}

func revivalFill(w fakeCropWorld, x0, x1, y0, y1, z0, z1 int, name string) {
	for x := x0; x <= x1; x++ {
		for y := y0; y <= y1; y++ {
			for z := z0; z <= z1; z++ {
				w[[3]int{x, y, z}] = name
			}
		}
	}
}

func (rig *revivalRig) put(item string, amount int) storageOutcome {
	rig.requests++
	return testPut(rig.book, rig.w, fmt.Sprintf("revival-%04d", rig.requests), item, amount)
}

func (rig *revivalRig) take(item string, slot, amount int) storageOutcome {
	rig.requests++
	return testTake(rig.book, rig.w, fmt.Sprintf("revival-%04d", rig.requests), item, slot, amount)
}

// run ticks the machines for so many seconds, as runRevival does. Returns the animals made and the names
// that changed meanwhile.
func (rig *revivalRig) run(seconds float64) (news []revivalNews, names []Block) {
	for i := 0; i < int(math.Round(seconds/revivalTickInterval.Seconds())); i++ {
		rig.now = rig.now.Add(revivalTickInterval)
		changed, made := rig.book.tickRevival(rig.w, revivalTickInterval.Seconds(), rig.now)
		news = append(news, made...)
		names = append(names, changed...)
	}
	return news, names
}

func (rig *revivalRig) block() *StorageBlock {
	return rig.book.blocks[storageKeyOf(revivalCell)]
}

// The work of the machine: nil when it holds nothing.
func (rig *revivalRig) work() *RevivalWork {
	if block := rig.block(); block != nil {
		return block.Revival
	}
	return nil
}

func (rig *revivalRig) view() *revivalView {
	return rig.book.revivalViewLocked(revivalCell, rig.block())
}

func (rig *revivalRig) name() string {
	return rig.w[revivalCell]
}

func TestRevivalTableIsOneTheMachineCanWorkWith(t *testing.T) {
	if len(revivalSpecies) != 41 {
		t.Errorf("%d species in the table: the plan has 41", len(revivalSpecies))
	}
	for id, row := range revivalSpecies {
		if !animalSpeciesOK.MatchString(id) {
			t.Errorf("%s cannot be the species of a kept animal", id)
		}
		if row.Pieces != 1 && row.Pieces != len(revivalPieces) {
			t.Errorf("%s: %d pieces", id, row.Pieces)
		}
		if row.Water < 0 || !(row.Seconds > 0) || row.Radius < 0 || row.Radius > animalsMaxRadius || !(row.Speed > 0) || row.Speed > 8 || row.Chase < 0 {
			t.Errorf("%s: %+v", id, row)
		}
		// A water that the flood can never reach would never start.
		if side := 2*revivalWaterReach + 1; row.Water > side*side {
			t.Errorf("%s asks for %d blocks of water, more than a pond a block deep within reach", id, row.Water)
		}
		var items []string
		if row.Pieces == 1 {
			items = []string{"fossil_" + id}
		} else {
			for _, piece := range revivalPieces {
				items = append(items, "fossil_"+id+"_"+piece)
			}
		}
		for slot, item := range items {
			if species, at, ok := revivalFossil(item); !ok || species != id || at != slot {
				t.Errorf("%s is the fossil of %q in slot %d (%v), not of %s in slot %d", item, species, at, ok, id, slot)
			}
			if !storageItemName.MatchString(item) {
				t.Errorf("no chest takes %s", item)
			}
		}
		// A skeleton is not revived from one bone, nor a small animal from a piece of it.
		if _, _, ok := revivalFossil("fossil_" + id); ok != (row.Pieces == 1) {
			t.Errorf("fossil_%s: %v", id, ok)
		}
		if _, _, ok := revivalFossil("fossil_" + id + "_skull"); ok != (row.Pieces == 3) {
			t.Errorf("fossil_%s_skull: %v", id, ok)
		}
	}
	for _, item := range []string{"stone", "fossil_", "fossil_sheep", "fossil_rock", "amber", "fossil_dodo_", "dodo", "fossil_plesiosaur_head"} {
		if _, _, ok := revivalFossil(item); ok {
			t.Errorf("%s is taken for a fossil", item)
		}
	}
	// The other tables it is in.
	if storageKinds[revivalKind] != len(revivalPieces) {
		t.Errorf("%d slots", storageKinds[revivalKind])
	}
	if !mechFixed[revivalKind] || mechMovable(revivalKind) || mechMovable(revivalKind+":on") {
		t.Error("a ram could move it")
	}
	kind := powerKinds[revivalKind]
	if kind.Role != powerConsumer || !kind.OnDemand || !kind.SignalTop || kind.Switch {
		t.Errorf("power: %+v", kind)
	}
	// One generator of radioisotopes is not enough; a hand crank being turned is.
	if !(kind.Watts > powerKinds["rtg"].Watts && kind.Watts <= powerKinds["hand_crank"].Watts) {
		t.Errorf("it draws %v W", kind.Watts)
	}
}

func TestRevivalTakesOnlyFossilsEachInItsSlot(t *testing.T) {
	rig := newRevivalRig(t)
	for _, item := range []string{"stone", "amber", "fossil_rock", "fossil_sheep", "fossil_plesiosaur", "fossil_dodo_skull"} {
		if got := rig.put(item, 1); got.Amount != 0 || got.Reason != "not for the revival machine" {
			t.Errorf("%s: %+v", item, got)
		}
	}
	if rig.block() != nil {
		t.Fatalf("what was refused is kept: %+v", rig.block())
	}
	if got := rig.put("fossil_plesiosaur_tail", 1); got.Amount != 1 {
		t.Fatalf("tail: %+v", got)
	}
	if got := rig.put("fossil_plesiosaur_skull", 1); got.Amount != 1 {
		t.Fatalf("skull: %+v", got)
	}
	slots := rig.block().Slots
	if slots[0].Type != "fossil_plesiosaur_skull" || slots[1].Count != 0 || slots[2].Type != "fossil_plesiosaur_tail" {
		t.Fatalf("slots: %+v", slots)
	}
	if set := revivalSetOf(slots); set.Species != "plesiosaur" || set.complete() || len(set.Missing) != 1 || set.Missing[0] != "spine" {
		t.Fatalf("the set: %+v", set)
	}
	// The fossil of a small animal is one piece, and goes where a skull goes: that slot is taken.
	if got := rig.put("fossil_dodo", 1); got.Amount != 0 || got.Reason != "full" {
		t.Fatalf("a dodo over a skull: %+v", got)
	}
	// More of the same pile up in their slot.
	if got := rig.put("fossil_plesiosaur_skull", 2); got.Amount != 2 || rig.block().Slots[0].Count != 3 {
		t.Fatalf("more skulls: %+v, %+v", got, rig.block().Slots)
	}
	if rig.block().Revival == nil || rig.block().Revival.started() || !rig.book.reviving[storageKeyOf(revivalCell)] {
		t.Fatalf("a machine with fossils is one the loop looks at, and it has not started: %+v", rig.block().Revival)
	}
}

func TestWithoutASignalItNeverStarts(t *testing.T) {
	rig := newRevivalRig(t)
	rig.power = true
	rig.put("fossil_dodo", 1)
	news, names := rig.run(90)
	if len(news) != 0 || len(rig.made) != 0 || len(names) != 0 || rig.work().started() {
		t.Fatalf("it worked with no signal: %v %v %+v", news, names, rig.work())
	}
	if len(rig.asks) != 0 {
		t.Fatal("it asks the grid for power with nothing to do")
	}
	if rig.block().Slots[0].Count != 1 || rig.name() != revivalKind {
		t.Fatalf("the fossil: %+v, the name: %s", rig.block().Slots, rig.name())
	}
	if view := rig.view(); view.Species != "dodo" || view.Working || view.Signal || view.Seconds != 45 {
		t.Fatalf("the panel: %+v", view)
	}
	// Nor with somebody looking at its panel, which makes it look around itself.
	client := &Client{ID: "p", send: make(chan []byte, 16)}
	if _, ok := rig.book.open(rig.w, storageEye, client, 0, 0, 0); !ok {
		t.Fatal("it did not open")
	}
	rig.run(30)
	if rig.work().started() || len(rig.made) != 0 || len(rig.asks) != 0 {
		t.Fatalf("it started with its panel open and no signal: %+v", rig.work())
	}
}

// What the plan asks: it does not work without power. The signal starts it, and then it waits.
func TestWithoutPowerItWaitsAndWithItTheAnimalAppearsWhenItsTimeIsUp(t *testing.T) {
	rig := newRevivalRig(t)
	rig.signal = true
	rig.put("fossil_dodo", 1)
	news, names := rig.run(120)
	work := rig.work()
	if len(news) != 0 || len(rig.made) != 0 || len(names) != 0 {
		t.Fatalf("it worked with no power: %v %v", news, names)
	}
	if !work.started() || work.Species != "dodo" || work.Done != 0 {
		t.Fatalf("started by the signal and waiting, with nothing done: %+v", work)
	}
	if !rig.asks[revivalCell] {
		t.Fatal("a machine that has started asks the grid for its watts")
	}
	if view := rig.view(); !view.Working || view.Powered || view.Starting || view.Done != 0 {
		t.Fatalf("the panel: %+v", view)
	}

	// The signal goes: it goes on by itself. Power comes: it works.
	rig.signal = false
	rig.power = true
	news, names = rig.run(44)
	if len(news) != 0 || len(rig.made) != 0 {
		t.Fatalf("an animal after 44 seconds of the 45: %v", news)
	}
	if len(names) != 1 || names[0].BlockType != revivalKind+":on" || rig.name() != revivalKind+":on" {
		t.Fatalf("working, its name says so, once: %v", names)
	}
	if view := rig.view(); !view.Working || !view.Powered || view.Done != 44 || view.Seconds != 45 {
		t.Fatalf("the panel: %+v", view)
	}
	news, names = rig.run(2)
	if len(news) != 1 || len(rig.made) != 1 {
		t.Fatalf("no animal after its 45 seconds: %v", news)
	}
	spec := rig.made[0]
	// How it walks is what its row says (its species' task writes it there).
	row := revivalSpecies["dodo"]
	if spec.Species != "dodo" || spec.Origin != "revival" || spec.Radius != row.Radius || spec.Speed != row.Speed || spec.Variant != 7 {
		t.Fatalf("the animal: %+v", spec)
	}
	if news[0].Species != "dodo" || news[0].ID != 1 || [3]int{news[0].X, news[0].Y, news[0].Z} != revivalCell || news[0].At != [3]float64{spec.X, spec.Y, spec.Z} {
		t.Fatalf("the news: %+v", news[0])
	}
	// The fossil is used up, and the machine is as one that never held anything.
	if rig.block() != nil || len(rig.book.reviving) != 0 || len(rig.book.revivalSeen) != 0 || len(rig.asks) != 0 {
		t.Fatalf("after the animal: %+v, asking %v", rig.block(), rig.asks)
	}
	if len(names) != 1 || names[0].BlockType != revivalKind || rig.name() != revivalKind {
		t.Fatalf("done, it goes dark: %v", names)
	}
	if !worldStorage.dirty.Load() {
		t.Fatal("the fossil used up is not marked to be saved")
	}
}

func TestAButtonsPulseIsEnoughAndPowerFailingKeepsWhatItHadDone(t *testing.T) {
	rig := newRevivalRig(t)
	rig.power = true
	rig.put("fossil_trilobite", 1)
	revivalFill(rig.w, 1, 2, 0, 0, 0, 1, "water")
	// A button is on for a second and a half (logicButtonTime).
	rig.signal = true
	rig.run(logicButtonTime.Seconds())
	rig.signal = false
	if !rig.work().started() {
		t.Fatal("the pulse of a button did not start it")
	}
	rig.run(10 - logicButtonTime.Seconds())
	before := rig.work().Done
	if before < 9 || before > 10 {
		t.Fatalf("%v seconds done in ten", before)
	}
	// A blackout.
	rig.power = false
	news, names := rig.run(60)
	if len(news) != 0 || rig.work().Done != before {
		t.Fatalf("without power: %v, %v done of %v", news, rig.work().Done, before)
	}
	if len(names) != 1 || names[0].BlockType != revivalKind || rig.name() != revivalKind {
		t.Fatalf("without power it goes dark: %v", names)
	}
	if view := rig.view(); !view.Working || view.Powered || view.Done != math.Floor(before) {
		t.Fatalf("the panel: %+v", view)
	}
	rig.power = true
	if news, _ = rig.run(20 - before - 0.4); len(news) != 0 {
		t.Fatal("the animal came before its time")
	}
	if news, _ = rig.run(1); len(news) != 1 || news[0].Species != "trilobite" {
		t.Fatalf("with power back it did not finish: %v", news)
	}
}

func TestTakingAFossilOutStopsItAndWhatItHadDoneIsLost(t *testing.T) {
	rig := newRevivalRig(t)
	rig.power, rig.signal = true, true
	for _, piece := range revivalPieces {
		rig.put("fossil_mammoth_"+piece, 1)
	}
	rig.run(20)
	if work := rig.work(); !work.started() || work.Done < 19 {
		t.Fatalf("not working: %+v", work)
	}
	if got := rig.take("fossil_mammoth_spine", 1, 1); got.Amount != 1 {
		t.Fatalf("a fossil cannot be taken out of a machine at work: %+v", got)
	}
	// The panel hears it with the very change, before any tick.
	if work := rig.work(); work.started() || work.Done != 0 {
		t.Fatalf("still working on two pieces: %+v", work)
	}
	if view := rig.view(); view.Working || view.Species != "mammoth" || len(view.Missing) != 1 || view.Missing[0] != "spine" {
		t.Fatalf("the panel: %+v", view)
	}
	_, names := rig.run(5)
	if len(names) != 1 || rig.name() != revivalKind || len(rig.asks) != 0 || len(rig.made) != 0 {
		t.Fatalf("stopped, it is dark and asks for nothing: %v %v", names, rig.asks)
	}
	// Back in, with the signal still on: from the start.
	rig.put("fossil_mammoth_spine", 1)
	rig.run(1)
	if work := rig.work(); !work.started() || work.Done > 1 {
		t.Fatalf("put back: %+v", work)
	}
	// The last fossil out: nothing is left to tick, and it goes dark at once.
	for slot, piece := range revivalPieces {
		rig.take("fossil_mammoth_"+piece, slot, 1)
	}
	if rig.block() != nil || rig.name() != revivalKind || len(rig.asks) != 0 || len(rig.book.reviving) != 0 {
		t.Fatalf("emptied: %+v %s %v", rig.block(), rig.name(), rig.asks)
	}
	if len(rig.book.drainNameChangesLocked()) != 1 {
		t.Fatal("going dark as it is emptied is not told")
	}
}

func TestPiecesOfTwoAnimalsOrAMissingOneDoNotStart(t *testing.T) {
	rig := newRevivalRig(t)
	rig.power, rig.signal = true, true
	revivalFill(rig.w, 1, 6, -4, 0, -3, 3, "water")
	rig.put("fossil_plesiosaur_skull", 1)
	rig.put("fossil_mammoth_spine", 1)
	rig.put("fossil_plesiosaur_tail", 1)
	rig.run(200)
	if rig.work().started() || len(rig.made) != 0 || len(rig.asks) != 0 {
		t.Fatalf("it works on the pieces of two animals: %+v", rig.work())
	}
	if view := rig.view(); !view.Mixed || view.Species != "" || view.Working {
		t.Fatalf("the panel: %+v", view)
	}
	// Two of three.
	rig.take("fossil_mammoth_spine", 1, 1)
	rig.run(200)
	if rig.work().started() || len(rig.made) != 0 {
		t.Fatalf("it works on two pieces of three: %+v", rig.work())
	}
	if view := rig.view(); view.Mixed || view.Species != "plesiosaur" || len(view.Missing) != 1 || view.Missing[0] != "spine" {
		t.Fatalf("the panel: %+v", view)
	}
	// All three of one.
	rig.put("fossil_plesiosaur_spine", 1)
	if news, _ := rig.run(125); len(news) != 1 || news[0].Species != "plesiosaur" || rig.block() != nil {
		t.Fatalf("the whole skeleton: %v, left %+v", news, rig.block())
	}
}

func TestAStackOfFossilsMakesOneAnimalAfterAnother(t *testing.T) {
	rig := newRevivalRig(t)
	rig.power, rig.signal = true, true
	rig.put("fossil_dodo", 2)
	if news, _ := rig.run(47); len(news) != 1 || rig.block() == nil || rig.block().Slots[0].Count != 1 {
		t.Fatalf("the first: %v, left %+v", news, rig.block())
	}
	// The lever is still on.
	if news, _ := rig.run(47); len(news) != 1 || rig.block() != nil || len(rig.made) != 2 {
		t.Fatalf("the second: %v, left %+v", news, rig.block())
	}
}

func TestASeaAnimalNeedsItsWaterAndIsBornInTheMiddleOfIt(t *testing.T) {
	rig := newRevivalRig(t)
	rig.power, rig.signal = true, true
	rig.put("fossil_archelon", 1)
	want := revivalSpecies["archelon"].Water
	rig.run(60)
	if rig.work().started() || len(rig.asks) != 0 {
		t.Fatal("a sea animal started with no water")
	}
	if view := rig.view(); view.Water != want || view.WaterHas != 0 || view.Working {
		t.Fatalf("the panel: %+v", view)
	}
	// A puddle of twelve.
	revivalFill(rig.w, 1, 3, 0, 0, -1, 2, "water")
	rig.run(60)
	if rig.work().started() {
		t.Fatal("a sea animal started in a puddle")
	}
	if view := rig.view(); view.WaterHas != 12 {
		t.Fatalf("the panel counts %d blocks of water of 12", view.WaterHas)
	}
	// As much water, but apart from the machine: it is not its water.
	revivalFill(rig.w, -5, -2, -4, -2, -2, 2, "water")
	rig.run(10)
	if rig.work().started() || rig.view().WaterHas != 12 {
		t.Fatalf("water it does not touch counts: %+v", rig.view())
	}
	// A pool of a hundred, five by five and four deep.
	revivalFill(rig.w, 1, 5, -3, 0, -2, 2, "water")
	news, _ := rig.run(50)
	if len(news) != 1 || len(rig.made) != 1 {
		t.Fatalf("with its water it did not come: %v, %+v", news, rig.view())
	}
	spec := rig.made[0]
	if spec.Species != "archelon" || spec.Radius != 0 {
		t.Fatalf("a swimmer is not walked by the server: %+v", spec)
	}
	spot := [3]int{int(math.Floor(spec.X)), int(spec.Y), int(math.Floor(spec.Z))}
	if spec.X != float64(spot[0])+0.5 || spec.Z != float64(spot[2])+0.5 || spec.Y != float64(spot[1]) {
		t.Fatalf("its home is not the middle of a cell: %+v", spec)
	}
	for dx := -1; dx <= 1; dx++ {
		for dy := -1; dy <= 1; dy++ {
			for dz := -1; dz <= 1; dz++ {
				if cell := [3]int{spot[0] + dx, spot[1] + dy, spot[2] + dz}; rig.w[cell] != "water" {
					t.Fatalf("born at %v, against %v which is %q", spot, cell, rig.w[cell])
				}
			}
		}
	}
	if max(spot[0], -spot[0], spot[1], -spot[1], spot[2], -spot[2]) > revivalBirthReach {
		t.Fatalf("born at %v, far from its machine", spot)
	}
}

func TestWaterThatGoesWhileItWorksIsWaitedFor(t *testing.T) {
	rig := newRevivalRig(t)
	rig.power, rig.signal = true, true
	rig.put("fossil_ammonite", 1)
	revivalFill(rig.w, 1, 3, 0, 0, 0, 1, "water")
	rig.run(10)
	if !rig.work().started() {
		t.Fatalf("six blocks of water are what an ammonite needs: %+v", rig.view())
	}
	revivalFill(rig.w, 1, 3, 0, 0, 0, 1, "air")
	if news, _ := rig.run(30); len(news) != 0 || rig.block().Slots[0].Count != 1 {
		t.Fatalf("born with no water: %v", news)
	}
	if view := rig.view(); !view.Working || view.Done != 20 || view.WaterHas != 0 || view.NoRoom || len(rig.asks) != 0 {
		t.Fatalf("done and waiting for its water, asking for no power: %+v %v", view, rig.asks)
	}
	revivalFill(rig.w, 1, 3, 0, 0, 0, 1, "water")
	if news, _ := rig.run(1.2); len(news) != 1 {
		t.Fatalf("the water is back and it does not come: %+v", rig.view())
	}
}

func TestALandAnimalAppearsWhereItCanWalkAndNeverInsideABlock(t *testing.T) {
	revive := func(t *testing.T, build func(w fakeCropWorld)) (*revivalRig, []revivalNews) {
		rig := newRevivalRig(t)
		rig.power, rig.signal = true, true
		build(rig.w)
		rig.put("fossil_dodo", 1)
		news, _ := rig.run(47)
		return rig, news
	}
	spotOf := func(t *testing.T, rig *revivalRig, news []revivalNews) [3]int {
		t.Helper()
		if len(news) != 1 {
			t.Fatalf("no animal: %+v", rig.view())
		}
		at := news[0].At
		spot := [3]int{int(math.Floor(at[0])), int(at[1]), int(math.Floor(at[2]))}
		if at != [3]float64{float64(spot[0]) + 0.5, float64(spot[1]), float64(spot[2]) + 0.5} {
			t.Fatalf("its home is not the middle of a cell, feet on its floor: %v", at)
		}
		if spec := rig.made[0]; [3]float64{spec.X, spec.Y, spec.Z} != at {
			t.Fatalf("the animal is at %+v and the news says %v", spec, at)
		}
		for dy := 0; dy <= 1; dy++ {
			if name, _ := rig.w.Block(spot[0], spot[1]+dy, spot[2]); name != "air" && name != "tall_grass" {
				t.Fatalf("born at %v, inside %s", spot, name)
			}
		}
		if under, _ := rig.w.Block(spot[0], spot[1]-1, spot[2]); under == "air" || under == "water" {
			t.Fatalf("born at %v, over %s", spot, under)
		}
		return spot
	}

	t.Run("on open ground, next to the machine", func(t *testing.T) {
		rig, news := revive(t, func(w fakeCropWorld) { w[[3]int{0, 1, 0}] = "lever:on" })
		spot := spotOf(t, rig, news)
		if spot[1] != 0 || max(spot[0], -spot[0])+max(spot[2], -spot[2]) != 1 {
			t.Fatalf("born at %v, not by the machine's side", spot)
		}
	})
	t.Run("grass is no obstacle", func(t *testing.T) {
		rig, news := revive(t, func(w fakeCropWorld) { revivalFill(w, -6, 6, 0, 0, -6, 6, "tall_grass"); w[revivalCell] = revivalKind })
		if spot := spotOf(t, rig, news); spot[1] != 0 {
			t.Fatalf("born at %v", spot)
		}
	})
	t.Run("not in a hole it cannot leave", func(t *testing.T) {
		// Thick walls all around, two blocks high, with one cell free next to the machine.
		rig, news := revive(t, func(w fakeCropWorld) {
			revivalFill(w, -2, 2, 0, 1, -2, 2, "stone")
			w[revivalCell] = revivalKind
			w[[3]int{0, 1, 0}] = "lever:on"
			w[[3]int{1, 0, 0}], w[[3]int{1, 1, 0}] = "air", "air"
		})
		spot := spotOf(t, rig, news)
		if spot == [3]int{1, 0, 0} {
			t.Fatal("born in the one cell with walls on every side")
		}
		// On the ground outside, and not on the walls though they are nearer.
		if spot[1] != 0 || max(spot[0], -spot[0], spot[2], -spot[2]) != 3 {
			t.Fatalf("born at %v, not on the ground just outside the walls", spot)
		}
	})
	t.Run("a step down or up is ground too", func(t *testing.T) {
		// The machine on a pillar: the ground is two below.
		rig, news := revive(t, func(w fakeCropWorld) {
			revivalFill(w, -6, 6, -1, -1, -6, 6, "air")
			revivalFill(w, -6, 6, -3, -3, -6, 6, "stone")
			w[[3]int{0, -1, 0}], w[[3]int{0, -2, 0}] = "stone", "stone"
		})
		if spot := spotOf(t, rig, news); spot[1] != -2 {
			t.Fatalf("born at %v, not on the ground under the pillar", spot)
		}
	})
	t.Run("never in the water around an island", func(t *testing.T) {
		rig, news := revive(t, func(w fakeCropWorld) {
			revivalFill(w, -6, 6, -1, -1, -6, 6, "water")
			revivalFill(w, -1, 1, -1, -1, 0, 0, "stone")
		})
		if spot := spotOf(t, rig, news); spot[2] != 0 || spot[1] != 0 || max(spot[0], -spot[0]) != 1 {
			t.Fatalf("born at %v, off the island", spot)
		}
	})
	t.Run("on top of the machine only when there is nowhere else", func(t *testing.T) {
		rig, news := revive(t, func(w fakeCropWorld) {
			revivalFill(w, -4, 4, -3, 3, -4, 4, "stone")
			w[revivalCell] = revivalKind
			w[[3]int{0, 1, 0}], w[[3]int{0, 2, 0}] = "air", "air"
		})
		if spot := spotOf(t, rig, news); spot != [3]int{0, 1, 0} {
			t.Fatalf("born at %v", spot)
		}
	})
	t.Run("with no room it waits, and says so", func(t *testing.T) {
		rig, news := revive(t, func(w fakeCropWorld) {
			revivalFill(w, -4, 4, -3, 3, -4, 4, "stone")
			w[revivalCell] = revivalKind
			w[[3]int{0, 1, 0}] = "lever:on"
		})
		if len(news) != 0 || len(rig.made) != 0 || rig.block().Slots[0].Count != 1 {
			t.Fatalf("an animal inside the rock: %v", news)
		}
		if view := rig.view(); !view.NoRoom || !view.Working || view.Done != 45 || len(rig.asks) != 0 || rig.name() != revivalKind {
			t.Fatalf("done and waiting, dark, asking for no power: %+v %v %s", view, rig.asks, rig.name())
		}
		// Somebody digs a way out.
		revivalFill(rig.w, 1, 4, 0, 1, 0, 0, "air")
		news, _ = rig.run(1.2)
		if spot := spotOf(t, rig, news); spot != [3]int{1, 0, 0} {
			t.Fatalf("born at %v", spot)
		}
		if rig.block() != nil {
			t.Fatal("the fossil is not used up")
		}
	})
}

func TestItDoesNotStartWithTooManyAnimalsAround(t *testing.T) {
	rig := newRevivalRig(t)
	rig.power, rig.signal = true, true
	rig.near = revivalCrowdMax
	rig.put("fossil_dodo", 1)
	rig.run(60)
	if rig.work().started() || len(rig.asks) != 0 {
		t.Fatal("one more animal among so many")
	}
	if view := rig.view(); !view.Crowded || view.CrowdMax != revivalCrowdMax || view.CrowdRange != revivalCrowdRange {
		t.Fatalf("the panel: %+v", view)
	}
	rig.near = revivalCrowdMax - 1
	rig.run(revivalLookEvery.Seconds() + 0.4)
	if !rig.work().started() || rig.view().Crowded {
		t.Fatalf("one fewer and it still waits: %+v", rig.view())
	}

	// The count is of the kept animals of the server, whoever's they are, within its range.
	animalsWorld(t)
	for i, far := range []float64{0, 10, revivalCrowdRange - 1, revivalCrowdRange + 1, 200} {
		if _, ok := animalSpawn(animalSpawnSpec{Species: "pig", X: 0.5 + far, Y: 64, Z: 0.5}); !ok {
			t.Fatalf("pig %d", i)
		}
	}
	animals.add(Animal{Species: "dog", Mode: animalStay, X: 0.5, Y: 64, Z: -20.5, HomeX: 0.5, HomeY: 64, HomeZ: -20.5, Owner: plrAna})
	if got := revivalAnimalsNear(0.5, 0.5, revivalCrowdRange); got != 4 {
		t.Fatalf("%d animals near, of the 4 within %v blocks", got, revivalCrowdRange)
	}
}

func TestTheAnimalIsOneTheServerKeepsAndBothSurviveARestart(t *testing.T) {
	book := animalsWorld(t)
	rig := newRevivalRig(t)
	rig.book.revivalSpawn = animalSpawn
	rig.power, rig.signal = true, true
	rig.put("fossil_dodo", 2)
	news, _ := rig.run(47)
	if len(news) != 1 {
		t.Fatalf("no animal: %+v", rig.view())
	}
	kept := book.byID[news[0].ID]
	if kept == nil {
		t.Fatal("the animal is not in the book of the kept animals")
	}
	at := news[0].At
	if row := revivalSpecies["dodo"]; kept.Species != "dodo" || kept.Mode != animalRoam || kept.Owner != "" || kept.Origin != "revival" || kept.Radius != row.Radius || kept.Speed != row.Speed {
		t.Fatalf("kept as %+v", kept.Animal)
	}
	if [3]float64{kept.X, kept.Y, kept.Z} != at || [3]float64{kept.HomeX, kept.HomeY, kept.HomeZ} != at {
		t.Fatalf("it stands at %v,%v,%v with its home at %v,%v,%v, and was born at %v", kept.X, kept.Y, kept.Z, kept.HomeX, kept.HomeY, kept.HomeZ, at)
	}
	if !worldAnimals.dirty.Load() {
		t.Fatal("the animal is not marked to be saved")
	}

	// The second is on its way: a restart in the middle.
	rig.run(20)
	done := rig.work().Done
	if done < 18 {
		t.Fatalf("the second is not being worked on: %+v", rig.work())
	}
	data, err := json.Marshal(book.snapshot())
	if err != nil {
		t.Fatal(err)
	}
	var savedAnimals animalsSaved
	if err := json.Unmarshal(data, &savedAnimals); err != nil {
		t.Fatal(err)
	}
	back := animalsLoad(savedAnimals).byID[news[0].ID]
	if back == nil || back.Species != "dodo" || [3]float64{back.HomeX, back.HomeY, back.HomeZ} != at || back.Radius != 8 || back.Origin != "revival" {
		t.Fatalf("after a restart the animal is %+v", back)
	}

	var saved storageSaved
	saved.Storage, saved.StorageLog, saved.Plates = rig.book.snapshotAll()
	// What the copy holds is its own: the machine going on changes nothing of what is being written.
	rig.run(1)
	if data, err = json.Marshal(saved); err != nil {
		t.Fatal(err)
	}
	var read storageSaved
	if err := json.Unmarshal(data, &read); err != nil {
		t.Fatal(err)
	}
	if work := read.Storage[storageKeyOf(revivalCell)].Revival; work == nil || work.Species != "dodo" || work.Done != done {
		t.Fatalf("saved as %+v, with %v done", work, done)
	}
	restarted := newRevivalRig(t)
	restarted.book.load(read.Storage, read.StorageLog, read.Plates)
	restarted.power = true
	if work := restarted.work(); !work.started() || work.Done != done || !restarted.book.reviving[storageKeyOf(revivalCell)] {
		t.Fatalf("loaded as %+v", work)
	}
	// It goes on with no signal, from where it was: the grid hears it again first.
	if news, _ := restarted.run(45 - done + 1); len(news) != 1 || restarted.block() != nil {
		t.Fatalf("after the restart it did not finish: %+v", restarted.view())
	}
}

func TestASavedMachineCannotClaimWhatNoMachineDid(t *testing.T) {
	load := func(block StorageBlock) (*revivalRig, *StorageBlock) {
		rig := newRevivalRig(t)
		rig.book.load(map[string]StorageBlock{storageKeyOf(revivalCell): block}, nil)
		return rig, rig.block()
	}
	dodo := []StorageSlot{{Type: "fossil_dodo", Count: 1}}
	if _, block := load(StorageBlock{Slots: dodo, Revival: &RevivalWork{Species: "dodo", Done: 9999}}); block.Revival.Done != 45 {
		t.Errorf("more seconds than a dodo takes: %+v", block.Revival)
	}
	if _, block := load(StorageBlock{Slots: dodo, Revival: &RevivalWork{Species: "dodo", Done: -3}}); block.Revival.Done != 0 {
		t.Errorf("seconds below zero: %+v", block.Revival)
	}
	for _, work := range []RevivalWork{{Species: "megalodon", Done: 100}, {Species: "sheep", Done: 5}, {Species: "", Done: 30}, {Species: "dodo", Done: math.NaN()}} {
		if _, block := load(StorageBlock{Slots: dodo, Revival: &work}); block.Revival == nil || block.Revival.started() || block.Revival.Done != 0 {
			t.Errorf("%+v over the fossil of a dodo is loaded as %+v", work, block.Revival)
		}
	}
	// What says it is a machine and stands where there is none is dropped from the loop, and left alone.
	rig, _ := load(StorageBlock{Slots: []StorageSlot{{Type: "stone", Count: 9}}, Revival: &RevivalWork{}})
	rig.w[revivalCell] = "chest"
	rig.power, rig.signal = true, true
	rig.run(1)
	if len(rig.book.reviving) != 0 || rig.block().Slots[0].Count != 9 || rig.name() != "chest" {
		t.Errorf("a chest that says it is a machine: %+v", rig.block())
	}
}

func TestItsNameIsLitOnlyWhileItReallyWorks(t *testing.T) {
	rig := newRevivalRig(t)
	// A plan or a client that places one lit gets one that is not.
	if got := rig.book.revivalSettleName(0, 0, 0, revivalKind+":on"); got != revivalKind {
		t.Fatalf("placed lit over nothing: %s", got)
	}
	for _, other := range []string{"stone", "oven:e:on", "electric_lamp:on"} {
		if got := rig.book.revivalSettleName(0, 0, 0, other); got != other {
			t.Fatalf("%s placed as %s", other, got)
		}
	}
	rig.power, rig.signal = true, true
	rig.put("fossil_dodo", 1)
	rig.run(5)
	if rig.name() != revivalKind+":on" || rig.book.revivalSettleName(0, 0, 0, revivalKind) != revivalKind+":on" {
		t.Fatalf("working: %s", rig.name())
	}
	if got := rig.book.revivalSettleName(9, 9, 9, revivalKind+":on"); got != revivalKind {
		t.Fatalf("another one, placed lit: %s", got)
	}

	// One that a crash left lit with nothing in it goes dark when it is opened.
	lit := newRevivalRig(t)
	lit.w[revivalCell] = revivalKind + ":on"
	client := &Client{ID: "p", send: make(chan []byte, 16)}
	if _, ok := lit.book.open(lit.w, storageEye, client, 0, 0, 0); !ok {
		t.Fatal("it did not open")
	}
	if names := lit.book.drainNameChangesLocked(); lit.name() != revivalKind || len(names) != 1 {
		t.Fatalf("opened: %s, %v", lit.name(), names)
	}
}

func TestAPanelHearsWhatChangesByItselfAndNoMoreThanOnceASecond(t *testing.T) {
	rig := newRevivalRig(t)
	var heard []storageSnapshot
	rig.book.deliver = func(_ *Client, data []byte) bool {
		var message Message
		var snapshot storageSnapshot
		if json.Unmarshal(data, &message) == nil && message.Type == "storageContents" && json.Unmarshal(message.Payload, &snapshot) == nil {
			heard = append(heard, snapshot)
		}
		return true
	}
	client := &Client{ID: "p", send: make(chan []byte, 16)}
	opened, ok := rig.book.open(rig.w, storageEye, client, 0, 0, 0)
	if !ok || opened.Revival == nil || opened.Capacity != 3 || opened.Revival.Signal || opened.Revival.CrowdMax != revivalCrowdMax {
		t.Fatalf("opened: %+v", opened.Revival)
	}
	rig.run(5)
	if len(heard) != 0 {
		t.Fatalf("told %d times of nothing", len(heard))
	}
	// A lever on an empty machine: the panel says so.
	rig.signal = true
	rig.run(1)
	if len(heard) != 1 || !heard[0].Revival.Signal {
		t.Fatalf("the signal coming on: %+v", heard)
	}
	rig.signal = false
	rig.run(1)
	rig.put("fossil_trilobite", 1)
	heard = nil
	// With somebody looking it counts its water, with no signal.
	revivalFill(rig.w, 1, 2, 0, 0, 0, 0, "water")
	rig.run(revivalLookEvery.Seconds() + 0.2)
	if len(heard) != 1 || heard[0].Revival.WaterHas != 2 || heard[0].Revival.Water != 4 || heard[0].Revival.Species != "trilobite" {
		t.Fatalf("the water: %+v", heard)
	}
	revivalFill(rig.w, 1, 2, 0, 0, 0, 1, "water")
	rig.signal, rig.power = true, true
	heard = nil
	rig.run(10)
	// The start, the grid's answer, and each whole second done.
	if len(heard) < 10 || len(heard) > 14 {
		t.Fatalf("told %d times in ten seconds of work", len(heard))
	}
	last := heard[len(heard)-1].Revival
	if !last.Working || !last.Powered || last.Done < 9 || last.Seconds != 20 {
		t.Fatalf("the last it heard: %+v", last)
	}
	// Nobody looking: nobody is told.
	rig.book.forget(client)
	heard = nil
	rig.run(5)
	if len(heard) != 0 || len(rig.book.revivalShown) != 0 {
		t.Fatalf("told %d times with the panel closed", len(heard))
	}
}

// The real grid (power.go, logic.go): what stands on the machine is its signal and never its power.
func TestItsTopFaceIsItsSignalAndNeverItsPower(t *testing.T) {
	up := powerPos{0, 1, 0}
	machine := powerPos{0, 0, 0}
	now := time.Unix(9000, 0)

	// A lever on top, two generators at its side.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{machine: revivalKind, {0, 1, 0}: "lever", {1, 0, 0}: "rtg", {2, 0, 0}: "rtg"})
	logicRun(g, w, powerMidnight, &now, 2)
	if g.logicInput(machine, up) {
		t.Fatal("a lever that is off is a signal")
	}
	g.press(w, 0, 1, 0, now)
	logicRun(g, w, powerMidnight, &now, 2)
	if !g.logicInput(machine, up) {
		t.Fatal("a lever that is on is no signal")
	}
	if g.netOf[powerPos{0, 1, 0}] == g.netOf[machine] {
		t.Fatal("the lever on top joined the network that feeds the machine")
	}
	if g.runsAt(machine) {
		t.Fatal("it has power without asking for any")
	}
	g.asks[machine] = true
	logicRun(g, w, powerMidnight, &now, 2)
	if !g.runsAt(machine) {
		t.Fatal("two generators at its side do not feed it")
	}
	// The other faces conduct as those of any electric block.
	for _, step := range powerSteps {
		if want := step != up; g.conducts(machine, powerPos{step[0], step[1], step[2]}) != want {
			t.Errorf("towards %v it conducts: %v", step, !want)
		}
	}
	if !g.conducts(powerPos{1, 0, 0}, powerPos{1, 1, 0}) {
		t.Error("another electric block no longer conducts upwards")
	}

	// The same two generators on top of it: a live network is a signal, and no power.
	w = fakeCropWorld{}
	g = newTestGrid(w, map[powerPos]string{machine: revivalKind, {0, 1, 0}: "rtg", {0, 2, 0}: "rtg"})
	g.asks[machine] = true
	logicRun(g, w, powerMidnight, &now, 3)
	if g.runsAt(machine) {
		t.Fatal("it takes power through its top")
	}
	if !g.logicInput(machine, up) {
		t.Fatal("a live network on top is no signal")
	}

	// A wire from a gate far away: its output is the signal, and only while it is on.
	w = fakeCropWorld{}
	g = newTestGrid(w, map[powerPos]string{
		machine: revivalKind, {0, 1, 0}: "copper_wire", {0, 1, 1}: "copper_wire", {0, 1, 2}: "and_gate",
		{-1, 1, 2}: "lever", {1, 1, 2}: "lever", {1, 0, 0}: "rtg", {2, 0, 0}: "rtg",
	})
	logicRun(g, w, powerMidnight, &now, 3)
	if g.logicInput(machine, up) {
		t.Fatal("a gate that is off sends a signal down its wire")
	}
	g.press(w, -1, 1, 2, now)
	logicRun(g, w, powerMidnight, &now, 3)
	if g.logicInput(machine, up) {
		t.Fatal("one input of an AND gate is enough")
	}
	g.press(w, 1, 1, 2, now)
	logicRun(g, w, powerMidnight, &now, 3)
	if !g.logicInput(machine, up) {
		t.Fatal("both inputs on, and the wire carries no signal to the top of the machine")
	}
}

// The whole of it with the real grid: a button on top, power at its side, and the loop of the machine.
func TestAButtonOnTopStartsItAndTheGridRunsIt(t *testing.T) {
	for _, generators := range []int{1, 2} {
		rig := newRevivalRig(t)
		blocks := map[powerPos]string{{0, 0, 0}: revivalKind, {0, 1, 0}: "push_button", {1, 0, 0}: "rtg"}
		if generators == 2 {
			blocks[powerPos{2, 0, 0}] = "rtg"
		}
		g := newTestGrid(rig.w, blocks)
		rig.book.revivalSignal = func(cell [3]int) bool { return g.logicInput(powerPos(cell), powerPos{0, 1, 0}) }
		rig.book.powered = func(cell [3]int) bool { return g.runsAt(powerPos(cell)) }
		rig.book.wantPower = func(cell [3]int, want bool) {
			if want {
				g.asks[powerPos(cell)] = true
			} else {
				delete(g.asks, powerPos(cell))
			}
		}
		// Both loops, a fifth of a second each, as on the server.
		var news []revivalNews
		run := func(seconds float64) {
			for i := 0; i < int(math.Round(seconds*5)); i++ {
				rig.now = rig.now.Add(revivalTickInterval)
				g.tick(rig.w, powerMidnight, rig.now, revivalTickInterval.Seconds())
				_, made := rig.book.tickRevival(rig.w, revivalTickInterval.Seconds(), rig.now)
				news = append(news, made...)
			}
		}
		rig.put("fossil_dodo", 1)
		run(10)
		if rig.work().started() {
			t.Fatal("started before the button was pressed")
		}
		g.press(rig.w, 0, 1, 0, rig.now)
		run(3)
		if !rig.work().started() {
			t.Fatal("the button on top did not start it")
		}
		if name := rig.w[[3]int{0, 1, 0}]; name != "push_button" {
			t.Fatalf("the button is still %s", name)
		}
		run(50)
		if generators == 1 {
			// 80 W for a machine of 100: a blackout, and it waits.
			if len(news) != 0 || rig.work().Done != 0 || rig.name() != revivalKind {
				t.Fatalf("one generator ran it: %v, %+v", news, rig.work())
			}
			continue
		}
		if len(news) != 1 || news[0].Species != "dodo" || rig.block() != nil {
			t.Fatalf("two generators did not run it to the end: %+v", rig.view())
		}
		if len(g.asks) != 0 || rig.name() != revivalKind {
			t.Fatalf("done, it still asks the grid: %v, %s", g.asks, rig.name())
		}
	}
}

func TestOnlyThePlayersNearAreToldOfTheAnimal(t *testing.T) {
	animalsWorld(t)
	near := animalsClient(t, "Near", plrAna, 20, 64, -10)
	far := animalsClient(t, "Far", plrBeto, revivalTellRange+10, 64, 0)
	revivalTell(revivalNews{X: 0, Y: 64, Z: 0, Species: "dodo", ID: 9, At: [3]float64{1.5, 64, 0.5}})
	told := claimHeard(near)["revivalDone"]
	if len(told) != 1 {
		t.Fatalf("the player near heard %d", len(told))
	}
	var made struct {
		X, Y, Z int
		Species string
		ID      uint32
		At      [3]float64
	}
	if err := json.Unmarshal(told[0], &made); err != nil || made.Species != "dodo" || made.ID != 9 || made.Y != 64 || made.At != [3]float64{1.5, 64, 0.5} {
		t.Fatalf("it heard %s (%v)", told[0], err)
	}
	if len(claimHeard(far)["revivalDone"]) != 0 {
		t.Fatal("a player far away was told")
	}
}

// The machine has no message of its own: its fossils move as those of a chest, which a stranger cannot
// open, fill or empty in somebody's plot. And no animal is born in a plot that is not the machine's.
func TestAStrangerCannotUseAMachineInSomebodysPlot(t *testing.T) {
	claimWorld(t)
	ana := claimAnaPlot(t)
	beto := claimClient(t, "Beto", plrBeto, 101, 121.6, 101)
	if err := chunkStore.SetBlock(103, 120, 103, revivalKind); err != nil {
		t.Fatal(err)
	}
	at := map[string]int{"x": 103, "y": 120, "z": 103}
	move := func(client *Client, kind, reqID string) map[string][]json.RawMessage {
		claimHeard(client)
		claimSend(t, client, kind, map[string]interface{}{"x": 103, "y": 120, "z": 103, "type": "fossil_dodo", "amount": 1, "slot": 0, "reqId": reqID})
		return claimHeard(client)
	}
	amountOf := func(heard map[string][]json.RawMessage) int {
		var outcome storageOutcome
		if len(heard["storageResult"]) != 1 || json.Unmarshal(heard["storageResult"][0], &outcome) != nil {
			t.Fatalf("answers: %v", heard)
		}
		return outcome.Amount
	}

	heard := move(beto, "storagePut", "stranger-put-1")
	if amountOf(heard) != 0 || claimRefusalOf(t, heard) == nil {
		t.Fatalf("a stranger put a fossil in: %v", heard)
	}
	if storage.blocks[blockKey(103, 120, 103)] != nil {
		t.Fatal("the stranger's fossil is in the machine")
	}
	if heard = move(ana, "storagePut", "owner-put-0001"); amountOf(heard) != 1 || claimRefusalOf(t, heard) != nil {
		t.Fatalf("the owner cannot use her machine: %v", heard)
	}
	if heard = move(beto, "storageTake", "stranger-take1"); amountOf(heard) != 0 || claimRefusalOf(t, heard) == nil {
		t.Fatalf("a stranger took the fossil out: %v", heard)
	}
	claimHeard(beto)
	claimSend(t, beto, "storageOpen", at)
	if heard = claimHeard(beto); len(heard["storageContents"]) != 0 || len(heard["storageClosed"]) != 1 {
		t.Fatalf("a stranger opened it: %v", heard)
	}
	claimSend(t, ana, "storageOpen", at)
	if heard = claimHeard(ana); len(heard["storageContents"]) != 1 {
		t.Fatalf("the owner cannot open it: %v", heard)
	}
	storage.forget(ana)

	// A machine at the edge of a plot: the animal appears on its own side of the border.
	for _, inside := range []bool{false, true} {
		rig := newRevivalRig(t)
		rig.book.revivalZone = func(x, z int) string {
			if x >= 1 {
				return "plot:ana"
			}
			return ""
		}
		if inside {
			rig.w[[3]int{1, 0, 0}], rig.w[revivalCell] = revivalKind, "air"
		}
		cell := [3]int{0, 0, 0}
		if inside {
			cell[0] = 1
		}
		for range 3 {
			spot, found := revivalGround(rig.w, cell, func(x, z int) bool { return rig.book.revivalZone(x, z) == rig.book.revivalZone(cell[0], cell[2]) })
			if !found || (spot[0] >= 1) != inside {
				t.Fatalf("a machine inside the plot (%v) makes its animal at %v (%v)", inside, spot, found)
			}
			// Each place it is given taken, the next one is on the same side too.
			rig.w[spot] = "stone"
		}
	}
}
