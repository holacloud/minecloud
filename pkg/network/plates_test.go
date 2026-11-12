package network

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"reflect"
	"testing"
)

// A lab: two chests, a fridge, an autoclave, a microscope and an incubator, all in reach.
type plateLab struct {
	book *storageBook
	w    fakeCropWorld
}

var (
	labChest      = [3]int{0, 0, 0}
	labChest2     = [3]int{-2, 0, 2}
	labFridge     = [3]int{2, 0, 0}
	labAutoclave  = [3]int{0, 0, 2}
	labMicroscope = [3]int{2, 0, 2}
	labIncubator  = [3]int{-2, 0, 0}
)

// Request ids are unique across labs: a lab loaded from another keeps its log.
var plateReqs = 0

func newPlateLab() *plateLab {
	book, _ := newTestBook()
	seed := uint32(100)
	book.seed = func() uint32 { seed++; return seed }
	book.ambient = func(cropWorld, [3]int) float64 { return 30 }
	book.lit = func(cropWorld, [3]int) bool { return false }
	book.powered = func([3]int) bool { return true }
	w := fakeCropWorld{labChest: "chest", labChest2: "chest", labFridge: "fridge", labAutoclave: "autoclave", labMicroscope: "microscope", labIncubator: "incubator:n"}
	return &plateLab{book: book, w: w}
}

func (l *plateLab) req() string {
	plateReqs++
	return fmt.Sprintf("plate-req-%06d", plateReqs)
}

// harvest grows a plate as the test says and takes it out of the incubator.
func (l *plateLab) harvest(t *testing.T, species string, logN, mould float64) PlateGrant {
	t.Helper()
	at := cultureRequest{X: labIncubator[0], Y: labIncubator[1], Z: labIncubator[2], Slot: 0, Source: "agar_plate", ReqID: l.req()}
	if o, _ := l.book.cultureLoad(l.w, storageEye, at); o.Amount != 1 {
		t.Fatalf("load: %+v", o)
	}
	plate := l.book.blocks[blockKey(labIncubator[0], labIncubator[1], labIncubator[2])].Plates[0]
	plate.Main = &CulturePop{Species: species, LogN: logN, Phase: "stationary"}
	if mould > 0 {
		plate.Mould = &CulturePop{Species: mouldSpecies, LogN: mould, Phase: "growth"}
	}
	plate.record()
	at.ReqID = l.req()
	o, _ := l.book.cultureHarvest(l.w, storageEye, at)
	if o.Amount != 1 || len(o.Plates) != 1 {
		t.Fatalf("harvest: %+v", o)
	}
	return o.Plates[0]
}

func (l *plateLab) put(at [3]int, compartment string, g PlateGrant) storageOutcome {
	o, _ := l.book.put(l.w, storageEye, storageMove{X: at[0], Y: at[1], Z: at[2], Type: g.Type, Amount: 1, Plate: g.ID, Token: g.Token, Compartment: compartment, ReqID: l.req()})
	return o
}

func (l *plateLab) take(at [3]int, compartment string, slot int, item, plate string) storageOutcome {
	o, _ := l.book.take(l.w, storageEye, storageMove{X: at[0], Y: at[1], Z: at[2], Slot: slot, Type: item, Amount: 1, Plate: plate, Compartment: compartment, ReqID: l.req()})
	return o
}

func (l *plateLab) block(at [3]int) *StorageBlock {
	return l.book.blocks[blockKey(at[0], at[1], at[2])]
}

// slotOf finds the plate in a block: compartment and slot, or ok false.
func (l *plateLab) slotOf(at [3]int, id string) (string, int, bool) {
	block := l.block(at)
	if block == nil {
		return "", 0, false
	}
	for _, c := range []string{"", storageFreezerTab} {
		for i, slot := range *block.compartment(c) {
			if slot.Plate == id {
				return c, i, true
			}
		}
	}
	return "", 0, false
}

func TestPlateHarvestIssuesARecordOfWhatGrew(t *testing.T) {
	l := newPlateLab()
	a := l.harvest(t, "yeast", 7.4, 0)
	b := l.harvest(t, "lactobacillus", 8.1, 6.5)
	if a.Type != "culture_yeast" || a.Culture.Main.Species != "yeast" || a.Culture.Main.LogN != 7.4 || a.Culture.Seed == 0 {
		t.Fatalf("yeast plate: %+v %+v", a, a.Culture.Main)
	}
	// Mould won: it is a mould plate, and it remembers the lactobacilli it held back.
	if b.Type != "culture_mould" || b.Culture.Main.Species != "lactobacillus" || b.Culture.Mould.LogN != 6.5 || len(b.Culture.History) == 0 {
		t.Fatalf("mould plate: %+v", b.Culture)
	}
	if a.ID == b.ID || a.Token == b.Token || a.Culture.Seed == b.Culture.Seed || !plateIDPattern.MatchString(a.ID) || !plateTokenPattern.MatchString(a.Token) {
		t.Fatalf("two plates are not two: %+v %+v", a, b)
	}
	// The seed is the one the incubator drew it with.
	if rec := l.book.plates[a.ID]; rec == nil || rec.Token != a.Token || rec.Culture.Seed != a.Culture.Seed {
		t.Fatalf("record: %+v", rec)
	}
	// Breaking an incubator hands its culture out the same way.
	at := cultureRequest{X: labIncubator[0], Y: labIncubator[1], Z: labIncubator[2], Slot: 1, Source: "agar_plate", ReqID: l.req()}
	l.book.cultureLoad(l.w, storageEye, at)
	l.block(labIncubator).Plates[1].Main = &CulturePop{Species: "soil_bacteria", LogN: 6.6}
	spill, _, _ := l.book.replace(l.w, labIncubator[0], labIncubator[1], labIncubator[2], "", func() (bool, error) { return true, l.w.SetBlock(-2, 0, 0, "") })
	if len(spill) != 1 || spill[0].Grant == nil || spill[0].Grant.Culture.Main.LogN != 6.6 || l.book.plates[spill[0].Grant.ID] == nil {
		t.Fatalf("spill: %+v", spill)
	}
}

func TestPlatesMoveAsThemselvesAndNeverStack(t *testing.T) {
	l := newPlateLab()
	a := l.harvest(t, "yeast", 7.4, 0)
	b := l.harvest(t, "yeast", 6.2, 0)
	if o := l.put(labChest, "", a); o.Amount != 1 {
		t.Fatalf("put a: %+v", o)
	}
	if o := l.put(labChest, "", b); o.Amount != 1 {
		t.Fatalf("put b: %+v", o)
	}
	block := l.block(labChest)
	if block.Slots[0] != (StorageSlot{Type: "culture_yeast", Count: 1, Plate: a.ID}) || block.Slots[1] != (StorageSlot{Type: "culture_yeast", Count: 1, Plate: b.ID}) {
		t.Fatalf("two yeast plates stacked: %+v", block.Slots[:3])
	}
	// The panel is told what is on each.
	snap := l.book.snapshotLocked(storagePlace{cell: labChest, capacity: 27, kind: "chest"})
	if len(snap.Cultures) != 2 || snap.Cultures[b.ID].Main.LogN != 6.2 {
		t.Fatalf("cultures shown: %+v", snap.Cultures)
	}
	// Once in, the token is spent: the same plate cannot go in again, here or anywhere.
	if o := l.put(labChest2, "", a); o.Amount != 0 || o.Reason != "not yours" {
		t.Fatalf("put twice: %+v", o)
	}
	// Taking names the plate: the wrong one (or none) is refused, and moving one moves exactly that one.
	if o := l.take(labChest, "", 0, "culture_yeast", b.ID); o.Amount != 0 {
		t.Fatalf("took b from a's slot: %+v", o)
	}
	if o := l.take(labChest, "", 0, "culture_yeast", ""); o.Amount != 0 {
		t.Fatalf("took a plate without naming it: %+v", o)
	}
	o := l.take(labChest, "", 1, "culture_yeast", b.ID)
	if o.Amount != 1 || len(o.Plates) != 1 || o.Plates[0].ID != b.ID || o.Plates[0].Token == b.Token || o.Plates[0].Culture.Main.LogN != 6.2 {
		t.Fatalf("take b: %+v", o)
	}
	if block.Slots[0].Plate != a.ID || block.Slots[1].Count != 0 {
		t.Fatalf("after taking b: %+v", block.Slots[:2])
	}
	// The old token is dead, the new one works, into the fridge's freezer.
	if o := l.put(labFridge, storageFreezerTab, b); o.Reason != "not yours" {
		t.Fatalf("stale token: %+v", o)
	}
	nb := o.Plates[0]
	if o := l.put(labFridge, storageFreezerTab, nb); o.Amount != 1 {
		t.Fatalf("into the freezer: %+v", o)
	}
	if c, i, ok := l.slotOf(labFridge, b.ID); !ok || c != storageFreezerTab || i != 0 {
		t.Fatalf("not in the freezer: %v %v %v", c, i, ok)
	}
	// A request answered twice gives the same answer and moves nothing twice.
	move := storageMove{X: 2, Slot: 0, Type: "culture_yeast", Amount: 1, Plate: b.ID, Compartment: storageFreezerTab, ReqID: "plate-take-twice"}
	first, _ := l.book.take(l.w, storageEye, move)
	again, changed := l.book.take(l.w, storageEye, move)
	if first.Amount != 1 || !reflect.DeepEqual(first, again) || changed {
		t.Fatalf("take twice: %+v %+v", first, again)
	}
	if got := l.book.sync([]string{"plate-take-twice"}); len(got) != 1 || !reflect.DeepEqual(got[0], first) {
		t.Fatalf("sync: %+v", got)
	}
}

func TestPlateForgeriesAreRefused(t *testing.T) {
	l := newPlateLab()
	real := l.harvest(t, "cyanobacteria", 8.8, 0)
	richer := func(g PlateGrant) PlateGrant {
		g.Culture = &CulturePlate{Main: &CulturePop{Species: "cyanobacteria", LogN: 9}}
		return g
	}
	cases := map[string]PlateGrant{
		"made-up id":       {ID: "0123456789abcdef01234567", Token: real.Token, Type: real.Type},
		"bad id":           {ID: "../../etc", Token: real.Token, Type: real.Type},
		"wrong token":      {ID: real.ID, Token: "00000000000000000000000000000000", Type: real.Type},
		"no token":         {ID: real.ID, Type: real.Type},
		"another type":     {ID: real.ID, Token: real.Token, Type: "culture_yeast"},
		"not even a plate": {ID: real.ID, Token: real.Token, Type: "diamond"},
	}
	for name, g := range cases {
		if o := l.put(labChest, "", g); o.Amount != 0 {
			t.Errorf("%s: %+v", name, o)
		}
	}
	// Two at once is not one plate.
	if o, _ := l.book.put(l.w, storageEye, storageMove{Type: real.Type, Amount: 2, Plate: real.ID, Token: real.Token, ReqID: l.req()}); o.Amount != 0 {
		t.Fatalf("two of one plate: %+v", o)
	}
	if l.block(labChest) != nil && !storageIsEmpty(l.block(labChest).Slots) {
		t.Fatalf("a forgery landed: %+v", l.block(labChest).Slots)
	}
	// What a client says is on its plate changes nothing: the record is the server's.
	if o := l.put(labChest, "", richer(real)); o.Amount != 1 {
		t.Fatalf("the real one: %+v", o)
	}
	if got := l.book.plates[real.ID].Culture.Main.LogN; got != 8.8 {
		t.Fatalf("the client rewrote the plate: %v", got)
	}
	// A plate seen in a chest (its id is public) is not anyone's to put.
	if o := l.put(labChest2, "", PlateGrant{ID: real.ID, Token: "", Type: real.Type}); o.Amount != 0 {
		t.Fatalf("seen plate: %+v", o)
	}
	// A plain plate (from before records) is only what its type says, never more.
	o, _ := l.book.put(l.w, storageEye, storageMove{X: -2, Z: 2, Type: "culture_cyano", Amount: 2, ReqID: l.req()})
	if o.Amount != 2 {
		t.Fatalf("plain put: %+v", o)
	}
	for _, slot := range l.block(labChest2).Slots[:2] {
		rec := l.book.plates[slot.Plate]
		if rec == nil || slot.Count != 1 || rec.Culture.Main.LogN != plateDefaultLog || rec.Culture.Mould != nil || rec.Token != "" {
			t.Fatalf("plain plate: %+v %+v", slot, rec)
		}
	}
	// The sowing and the microscope refuse the same forgeries.
	inc := cultureRequest{X: -2, Slot: 2, Source: "agar_plate", ReqID: l.req()}
	l.book.cultureLoad(l.w, storageEye, inc)
	sow := cultureRequest{X: -2, Slot: 2, Source: "culture_cyano", Plate: real.ID, Token: real.Token, ReqID: l.req()}
	if o, _ := l.book.cultureInoculate(l.w, storageEye, sow); o.Reason != "not yours" {
		t.Fatalf("sown with a plate in a chest: %+v", o)
	}
	if o, _ := l.book.prepare(l.w, storageEye, microscopeRequest{X: 2, Z: 2, Source: "culture_cyano", Plate: real.ID, Token: real.Token, ReqID: l.req()}); o.Reason != "not yours" {
		t.Fatalf("on the stage from a chest: %+v", o)
	}
}

func TestPlateOnTheMicroscopeIsItsRecord(t *testing.T) {
	l := newPlateLab()
	g := l.harvest(t, "lactobacillus", 7.9, 5.5)
	req := microscopeRequest{X: 2, Z: 2, Source: g.Type, Plate: g.ID, Token: g.Token, ReqID: l.req()}
	if o, _ := l.book.prepare(l.w, storageEye, req); o.Amount != 1 {
		t.Fatalf("prepare: %+v", o)
	}
	block := l.block(labMicroscope)
	view := l.book.microscopeViewOf(block)
	if view.Plate != g.ID || view.Seed != g.Culture.Seed || !reflect.DeepEqual(view.Culture, g.Culture) || block.Slots[0].Plate != g.ID {
		t.Fatalf("view: %+v culture %+v", view, view.Culture)
	}
	if l.book.plates[g.ID].Token != "" {
		t.Fatal("a plate on the stage can still be put elsewhere")
	}
	o, _ := l.book.clearSlide(l.w, storageEye, microscopeRequest{X: 2, Z: 2, ReqID: l.req()})
	if o.Amount != 1 || o.Type != g.Type || len(o.Plates) != 1 || o.Plates[0].ID != g.ID || !reflect.DeepEqual(o.Plates[0].Culture, g.Culture) {
		t.Fatalf("clear: %+v", o)
	}
	if again := l.put(labChest, "", g); again.Reason != "not yours" {
		t.Fatalf("token from before the stage: %+v", again)
	}
	if ok := l.put(labChest, "", o.Plates[0]); ok.Amount != 1 {
		t.Fatalf("token from the stage: %+v", ok)
	}
	// A plain culture plate on the stage gets the record its type says.
	if o, _ := l.book.prepare(l.w, storageEye, microscopeRequest{X: 2, Z: 2, Source: "culture_soil", ReqID: l.req()}); o.Amount != 1 {
		t.Fatalf("plain on stage: %+v", o)
	}
	if v := l.book.microscopeViewOf(l.block(labMicroscope)); v.Culture == nil || v.Culture.Main.Species != "soil_bacteria" || v.Culture.Main.LogN != plateDefaultLog {
		t.Fatalf("plain on stage: %+v", v)
	}
}

func TestPlateIsUsedUpBySowingAndByTheAutoclave(t *testing.T) {
	l := newPlateLab()
	g := l.harvest(t, "yeast", 7, 0)
	inc := cultureRequest{X: -2, Slot: 1, Source: "agar_plate", ReqID: l.req()}
	l.book.cultureLoad(l.w, storageEye, inc)
	sow := cultureRequest{X: -2, Slot: 1, Source: g.Type, Plate: g.ID, Token: g.Token, ReqID: l.req()}
	if o, _ := l.book.cultureInoculate(l.w, storageEye, sow); o.Amount != 1 {
		t.Fatalf("sow: %+v", o)
	}
	if l.book.plates[g.ID] != nil {
		t.Fatal("a sown plate lives on")
	}
	sow.ReqID = l.req()
	sow.Slot = 2
	l.book.cultureLoad(l.w, storageEye, cultureRequest{X: -2, Slot: 2, Source: "agar_plate", ReqID: l.req()})
	if o, _ := l.book.cultureInoculate(l.w, storageEye, sow); o.Reason != "not yours" {
		t.Fatalf("sown twice: %+v", o)
	}
	// The autoclave takes one plate at a time, and the record goes when it is done.
	a := l.harvest(t, "yeast", 7, 0)
	b := l.harvest(t, "yeast", 7.5, 0)
	if o := l.put(labAutoclave, "", a); o.Amount != 1 {
		t.Fatalf("autoclave a: %+v", o)
	}
	if o := l.put(labAutoclave, "", b); o.Reason != "full" {
		t.Fatalf("autoclave b: %+v", o)
	}
	for i := 0; i < 15; i++ {
		l.book.tickAppliances(l.w, 1)
	}
	block := l.block(labAutoclave)
	if l.book.plates[a.ID] != nil || block.Slots[ovenSlotFood].Count != 0 || block.Slots[ovenSlotResult] != (StorageSlot{Type: "petri_dish", Count: 1}) {
		t.Fatalf("after the autoclave: %+v %v", block.Slots, l.book.plates[a.ID])
	}
	if o := l.put(labAutoclave, "", b); o.Amount != 1 {
		t.Fatalf("autoclave b after a: %+v", o)
	}
}

func TestPlatesSpillOneByOne(t *testing.T) {
	l := newPlateLab()
	a := l.harvest(t, "yeast", 7, 0)
	l.put(labChest, "", a)
	testPut(l.book, l.w, "stone-in-chest", "stone", 5)
	l.book.blocks[blockKey(0, 0, 0)].Slots[5] = StorageSlot{Type: "culture_soil", Count: 2}
	spill, _, _ := l.book.replace(l.w, 0, 0, 0, "", func() (bool, error) { return true, l.w.SetBlock(0, 0, 0, "") })
	grants := map[string]bool{}
	stone := 0
	for _, item := range spill {
		if item.Grant != nil {
			if item.Count != 1 || grants[item.Grant.ID] || l.book.plates[item.Grant.ID].Token != item.Grant.Token {
				t.Fatalf("spilt plate: %+v", item)
			}
			grants[item.Grant.ID] = true
		} else if item.Type == "stone" {
			stone += item.Count
		} else {
			t.Fatalf("spilt: %+v", item)
		}
	}
	if !grants[a.ID] || len(grants) != 3 || stone != 5 {
		t.Fatalf("spill: %+v", spill)
	}
}

func TestPlatesSurviveARestartAndOldPlatesMigrate(t *testing.T) {
	l := newPlateLab()
	in := l.harvest(t, "yeast", 7.3, 0)
	out := l.harvest(t, "soil_bacteria", 6.9, 4.2)
	onStage := l.harvest(t, "cyanobacteria", 8, 0)
	l.put(labChest, "", in)
	l.book.prepare(l.w, storageEye, microscopeRequest{X: 2, Z: 2, Source: onStage.Type, Plate: onStage.ID, Token: onStage.Token, ReqID: l.req()})
	// From before plates had records: a stack in a chest, and a plain one on a stage.
	chest2 := &StorageBlock{X: -2, Z: 2, Slots: make([]StorageSlot, 27)}
	chest2.Slots[0] = StorageSlot{Type: "culture_mould", Count: 3}
	l.book.blocks[blockKey(-2, 0, 2)] = chest2
	full := &StorageBlock{X: 9, Z: 0, Slots: make([]StorageSlot, 2)}
	full.Slots[0] = StorageSlot{Type: "culture_yeast", Count: 4}
	full.Slots[1] = StorageSlot{Type: "stone", Count: 1}
	l.book.blocks[blockKey(9, 0, 0)] = full

	blocks, log, plates := l.book.snapshotAll()
	data, err := json.Marshal(storageSaved{Storage: blocks, StorageLog: log, Plates: plates})
	if err != nil {
		t.Fatal(err)
	}
	var reread storageSaved
	if err := json.Unmarshal(data, &reread); err != nil {
		t.Fatal(err)
	}
	r := newPlateLab()
	r.book.load(reread.Storage, reread.StorageLog, reread.Plates)

	// The plate in the chest is still that plate, with what grew on it.
	if c, i, ok := r.slotOf(labChest, in.ID); !ok || c != "" || i != 0 || r.book.plates[in.ID].Culture.Main.LogN != 7.3 {
		t.Fatalf("chest plate after restart: %v %v %v", c, i, ok)
	}
	// The one in the inventory can still be put somewhere, with the token it has; the one on the stage
	// is still on it, and is still its record.
	if o := r.put(labChest, "", out); o.Amount != 1 || r.book.plates[out.ID].Culture.Mould.LogN != 4.2 {
		t.Fatalf("held plate after restart: %+v", o)
	}
	if v := r.book.microscopeViewOf(r.block(labMicroscope)); v == nil || v.Plate != onStage.ID || v.Seed != onStage.Culture.Seed || v.Culture.Main.LogN != 8 {
		t.Fatalf("stage after restart: %+v", v)
	}
	// The old stack became three plates, each its own, each only what its type says.
	ids := map[string]bool{}
	for _, slot := range r.block(labChest2).Slots {
		if slot.Count > 0 {
			rec := r.book.plates[slot.Plate]
			if slot.Type != "culture_mould" || slot.Count != 1 || rec == nil || rec.Token != "" || rec.Culture.Main.LogN != plateDefaultLog {
				t.Fatalf("migrated: %+v %+v", slot, rec)
			}
			ids[slot.Plate] = true
		}
	}
	if len(ids) != 3 {
		t.Fatalf("migrated plates: %v", ids)
	}
	// With no room to split, the rest stays a plain stack, and becomes plates as it is taken.
	fullAfter := r.book.blocks[blockKey(9, 0, 0)]
	if fullAfter.Slots[0].Count != 4 || fullAfter.Slots[0].Plate != "" {
		t.Fatalf("no room: %+v", fullAfter.Slots)
	}
	r.w[[3]int{9, 0, 0}] = "chest"
	near := &[3]float64{9.5, 1.5, 0.5}
	o, _ := r.book.take(r.w, near, storageMove{X: 9, Type: "culture_yeast", Amount: 3, ReqID: r.req()})
	if o.Amount != 3 || len(o.Plates) != 3 || fullAfter.Slots[0].Count != 1 {
		t.Fatalf("take from an old stack: %+v %+v", o, fullAfter.Slots)
	}
	// A saved record that claims the impossible is cleaned; a chest naming a plate with no record gets one.
	bad := reread.Plates[in.ID]
	bad.Culture.Main.LogN = 80
	bad.Culture.Nutrient = 7
	reread.Plates[in.ID] = bad
	delete(reread.Plates, out.ID)
	reread.Plates["ffffffffffffffffffffffff"] = PlateRecord{ID: "ffffffffffffffffffffffff", Type: "culture_yeast", Culture: cultureDefaultPlate("culture_yeast", 3)}
	r2 := newPlateLab()
	r2.book.load(reread.Storage, reread.StorageLog, reread.Plates)
	if rec := r2.book.plates[in.ID]; rec.Culture.Main.LogN != cultureLogMax || rec.Culture.Nutrient != 1 {
		t.Fatalf("cleaned: %+v", rec.Culture)
	}
	if r2.book.plates["ffffffffffffffffffffffff"] != nil {
		t.Fatal("a record that is nowhere and was never handed out was kept")
	}
}

// A real world.json, written by the real handlers, read back by a fresh server.
func TestPlatesThroughMessagesAndARestart(t *testing.T) {
	newClient, send, expect := storageMessages(t)
	alice := newClient("alice")
	send(alice, "blockPlace", Block{X: 2, Y: 120, Z: 2, BlockType: "incubator"})
	send(alice, "blockPlace", Block{X: 3, Y: 120, Z: 2, BlockType: "chest"})
	at := map[string]interface{}{"x": 2, "y": 120, "z": 2}
	reply := func(kind string, payload map[string]interface{}) storageOutcome {
		t.Helper()
		for k, v := range at {
			if _, set := payload[k]; !set {
				payload[k] = v
			}
		}
		send(alice, kind, payload)
		var o storageOutcome
		if err := json.Unmarshal(expect(alice, "storageResult"), &o); err != nil {
			t.Fatal(err)
		}
		return o
	}
	if o := reply("cultureLoad", map[string]interface{}{"slot": 0, "source": "agar_plate", "reqId": "msg-load-1"}); o.Amount != 1 {
		t.Fatalf("load: %+v", o)
	}
	storage.mu.Lock()
	storage.blocks[blockKey(2, 120, 2)].Plates[0].Main = &CulturePop{Species: "yeast", LogN: 7.7}
	storage.mu.Unlock()
	o := reply("cultureHarvest", map[string]interface{}{"slot": 0, "reqId": "msg-harvest-1"})
	if o.Amount != 1 || len(o.Plates) != 1 {
		t.Fatalf("harvest: %+v", o)
	}
	g := o.Plates[0]
	if o := reply("storagePut", map[string]interface{}{"x": 3, "type": g.Type, "amount": 1, "plate": g.ID, "token": g.Token, "reqId": "msg-put-1"}); o.Amount != 1 {
		t.Fatalf("put: %+v", o)
	}
	if o := reply("storagePut", map[string]interface{}{"x": 3, "type": g.Type, "amount": 1, "plate": g.ID, "token": g.Token, "reqId": "msg-put-2"}); o.Reason != "not yours" {
		t.Fatalf("put again: %+v", o)
	}
	// The server restarts from what it saved.
	storage = newStorageBook()
	if err := worldLoad(); err != nil {
		t.Fatal(err)
	}
	if o := reply("storagePut", map[string]interface{}{"x": 3, "type": g.Type, "amount": 1, "plate": g.ID, "token": g.Token, "reqId": "msg-put-3"}); o.Reason != "not yours" {
		t.Fatalf("put again after a restart: %+v", o)
	}
	// The answer to the first put is still known after the restart (a client that reloads asks).
	send(alice, "storageSync", map[string]interface{}{"reqIds": []string{"msg-put-1", "msg-never-sent"}})
	var first, lost storageOutcome
	json.Unmarshal(expect(alice, "storageResult"), &first)
	json.Unmarshal(expect(alice, "storageResult"), &lost)
	if first.Amount != 1 || lost.Reason != "lost" {
		t.Fatalf("sync after restart: %+v %+v", first, lost)
	}
	taken := reply("storageTake", map[string]interface{}{"x": 3, "slot": 0, "type": g.Type, "amount": 1, "plate": g.ID, "reqId": "msg-take-1"})
	if taken.Amount != 1 || len(taken.Plates) != 1 || taken.Plates[0].Culture.Main.LogN != 7.7 || taken.Plates[0].Culture.Seed != g.Culture.Seed {
		t.Fatalf("take after restart: %+v", taken)
	}
	saved, err := os.ReadFile(worldStorage.path())
	if err != nil {
		t.Fatal(err)
	}
	var state storageSaved
	json.Unmarshal(saved, &state)
	if rec, ok := state.Plates[g.ID]; !ok || rec.Token != taken.Plates[0].Token {
		t.Fatalf("world.json: %+v", rec)
	}
}

// Random moves of a few plates among the containers, the client's own copies and replays of old
// messages: every plate is always in exactly one place, and nothing is made or lost.
func TestPlatesRandomMovesNeverDuplicate(t *testing.T) {
	for round := 0; round < 40; round++ {
		rng := rand.New(rand.NewPCG(uint64(round), 77))
		l := newPlateLab()
		held := map[string]PlateGrant{}
		stale := []PlateGrant{}
		var replays []storageMove
		for i := 0; i < 6; i++ {
			g := l.harvest(t, cultureOrder[rng.IntN(len(cultureOrder))], 6+rng.Float64()*3, 0)
			held[g.ID] = g
		}
		total := len(held)
		places := []struct {
			at [3]int
			c  string
		}{{labChest, ""}, {labChest2, ""}, {labFridge, ""}, {labFridge, storageFreezerTab}}
		pick := func() (PlateGrant, bool) {
			for _, g := range held {
				if rng.IntN(2) == 0 {
					return g, true
				}
			}
			for _, g := range held {
				return g, true
			}
			return PlateGrant{}, false
		}
		onStage := ""
		for step := 0; step < 120; step++ {
			switch rng.IntN(6) {
			case 0, 1: // put a held plate somewhere
				g, ok := pick()
				if !ok {
					continue
				}
				p := places[rng.IntN(len(places))]
				move := storageMove{X: p.at[0], Y: p.at[1], Z: p.at[2], Type: g.Type, Amount: 1, Plate: g.ID, Token: g.Token, Compartment: p.c, ReqID: l.req()}
				o, _ := l.book.put(l.w, storageEye, move)
				if o.Amount == 1 {
					delete(held, g.ID)
					stale = append(stale, g)
					replays = append(replays, move)
				}
			case 2: // take a plate out of somewhere
				p := places[rng.IntN(len(places))]
				block := l.block(p.at)
				if block == nil {
					continue
				}
				list := *block.compartment(p.c)
				for i, slot := range list {
					if slot.Plate != "" {
						o := l.take(p.at, p.c, i, slot.Type, slot.Plate)
						if o.Amount != 1 || len(o.Plates) != 1 {
							t.Fatalf("take: %+v", o)
						}
						held[o.Plates[0].ID] = o.Plates[0]
						break
					}
				}
			case 3: // a forger replays an old put with a stale token, under a new request id
				if len(stale) == 0 {
					continue
				}
				g := stale[rng.IntN(len(stale))]
				if cur, ok := held[g.ID]; ok && cur.Token == g.Token {
					continue
				}
				p := places[rng.IntN(len(places))]
				if o := l.put(p.at, p.c, g); o.Amount != 0 {
					t.Fatalf("round %d step %d: a stale token put a plate: %+v", round, step, o)
				}
			case 4: // the same message again (a lost answer): the log answers, nothing moves
				if len(replays) == 0 {
					continue
				}
				move := replays[rng.IntN(len(replays))]
				o, changed := l.book.put(l.w, storageEye, move)
				if changed || o.Amount != 1 {
					t.Fatalf("replay: %+v %v", o, changed)
				}
			case 5: // on and off the microscope
				if onStage == "" {
					g, ok := pick()
					if !ok {
						continue
					}
					o, _ := l.book.prepare(l.w, storageEye, microscopeRequest{X: 2, Z: 2, Source: g.Type, Plate: g.ID, Token: g.Token, ReqID: l.req()})
					if o.Amount == 1 {
						delete(held, g.ID)
						stale = append(stale, g)
						onStage = g.ID
					}
				} else {
					o, _ := l.book.clearSlide(l.w, storageEye, microscopeRequest{X: 2, Z: 2, ReqID: l.req()})
					if o.Amount != 1 || len(o.Plates) != 1 || o.Plates[0].ID != onStage {
						t.Fatalf("clear: %+v", o)
					}
					held[onStage] = o.Plates[0]
					onStage = ""
				}
			}
			// Every plate is in one place: held (and only the holder's token works), or in one slot.
			where := map[string]int{}
			for _, block := range l.book.blocks {
				for _, list := range [][]StorageSlot{block.Slots, block.Freezer} {
					for _, slot := range list {
						if slot.Plate != "" {
							if slot.Count != 1 {
								t.Fatalf("a plate slot of %d", slot.Count)
							}
							where[slot.Plate]++
							if l.book.plates[slot.Plate].Token != "" {
								t.Fatalf("a plate in a slot still has a token")
							}
						}
					}
				}
			}
			for id, g := range held {
				where[id]++
				if l.book.plates[id].Token != g.Token {
					t.Fatalf("the holder's token does not work")
				}
			}
			if len(where) != total || len(l.book.plates) != total {
				t.Fatalf("round %d step %d: %d plates in %d places, %d records", round, step, total, len(where), len(l.book.plates))
			}
			for id, n := range where {
				if n != 1 {
					t.Fatalf("round %d step %d: plate %s is in %d places", round, step, id, n)
				}
			}
		}
		// And all of it survives a restart unchanged.
		blocks, log, plates := l.book.snapshotAll()
		data, _ := json.Marshal(storageSaved{Storage: blocks, StorageLog: log, Plates: plates})
		var reread storageSaved
		json.Unmarshal(data, &reread)
		r := newPlateLab()
		r.book.load(reread.Storage, reread.StorageLog, reread.Plates)
		if len(r.book.plates) != total {
			t.Fatalf("round %d: %d records after a restart, want %d", round, len(r.book.plates), total)
		}
		for id, g := range held {
			if r.book.plates[id].Token != g.Token {
				t.Fatalf("round %d: a held plate lost its token in a restart", round)
			}
		}
	}
}
