package network

import (
	"encoding/json"
	"math"
	"reflect"
	"testing"

	"minecloud/pkg/terrain"
)

// An incubator at the origin, in a book whose power, temperature and light the test decides.
type incubatorRig struct {
	book    *storageBook
	w       fakeCropWorld
	power   bool
	ambient float64
	light   bool
	asks    map[[3]int]bool
}

func newIncubatorRig() *incubatorRig {
	r := &incubatorRig{ambient: 20, asks: map[[3]int]bool{}}
	r.book, _ = newTestBook()
	r.w = fakeCropWorld{{0, 0, 0}: "incubator:n"}
	r.book.powered = func([3]int) bool { return r.power }
	r.book.ambient = func(cropWorld, [3]int) float64 { return r.ambient }
	r.book.lit = func(cropWorld, [3]int) bool { return r.light }
	r.book.wantPower = func(cell [3]int, on bool) { r.asks[cell] = on }
	return r
}

var cultureReq = 0

func (r *incubatorRig) send(t *testing.T, op string, slot int, source string, target float64) storageOutcome {
	t.Helper()
	cultureReq++
	request := cultureRequest{Slot: slot, Source: source, Target: target, ReqID: "culture-" + string(rune('a'+cultureReq%26)) + "-" + itoa(cultureReq)}
	apply := map[string]func(cropWorld, *[3]float64, cultureRequest) (storageOutcome, bool){
		"load": r.book.cultureLoad, "inoculate": r.book.cultureInoculate, "harvest": r.book.cultureHarvest, "set": r.book.cultureSet,
	}[op]
	outcome, _ := apply(r.w, storageEye, request)
	return outcome
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func (r *incubatorRig) run(seconds int) {
	for i := 0; i < seconds; i++ {
		r.book.tickAppliances(r.w, 1)
	}
}

func (r *incubatorRig) plate(slot int) *CulturePlate {
	block := r.book.blocks[blockKey(0, 0, 0)]
	if block == nil || slot >= len(block.Plates) {
		return nil
	}
	return block.Plates[slot]
}

// One plate run alone at a steady temperature, for the shape of its curve.
func runPlate(species string, t float64, light bool, seconds int, unsterile bool) *CulturePlate {
	plate := "agar_plate"
	if unsterile {
		plate = "agar_plate_unsterile"
	}
	p := cultureNewPlate(plate)
	if species != "" {
		p.Main = &CulturePop{Species: species, LogN: cultureLogInoculum, Lag: cultureLagWork}
	}
	for i := 0; i < seconds; i++ {
		p.step(t, light, 1)
	}
	return p
}

func TestCultureGamma(t *testing.T) {
	for id, kind := range cultureSpecies {
		if !(kind.Tmin < kind.Topt && kind.Topt < kind.Tmax) {
			t.Fatalf("%s: cardinal temperatures out of order", id)
		}
		if kind.Topt == (kind.Tmin+kind.Tmax)/2 {
			t.Fatalf("%s: the model has no value with Topt halfway", id)
		}
		if g := cultureGamma(kind.Topt, kind); math.Abs(g-1) > 1e-9 {
			t.Fatalf("%s at Topt: %v", id, g)
		}
		if cultureGamma(kind.Tmin, kind) != 0 || cultureGamma(kind.Tmax, kind) != 0 || cultureGamma(kind.Tmax+5, kind) != 0 || cultureGamma(kind.Tmin-5, kind) != 0 {
			t.Fatalf("%s grows outside its range", id)
		}
		// It rises to the optimum and falls after it, faster above than below (the real asymmetry).
		prev := 0.0
		for temp := kind.Tmin + 0.5; temp <= kind.Topt; temp += 0.5 {
			g := cultureGamma(temp, kind)
			if g < prev-1e-12 {
				t.Fatalf("%s falls at %v below its optimum", id, temp)
			}
			prev = g
		}
		for temp := kind.Topt + 0.5; temp < kind.Tmax; temp += 0.5 {
			g := cultureGamma(temp, kind)
			if g > prev+1e-12 {
				t.Fatalf("%s rises at %v above its optimum", id, temp)
			}
			prev = g
		}
		if kind.Item == "" {
			t.Fatalf("%s gives no culture", id)
		}
	}
}

func TestCultureCurveShowsTheFourPhases(t *testing.T) {
	p := cultureNewPlate("agar_plate")
	p.Main = &CulturePop{Species: "yeast", LogN: cultureLogInoculum, Lag: cultureLagWork}
	seen := map[string]int{}
	order := []string{}
	full := -1
	for i := 0; i < 900; i++ {
		p.step(30, false, 1)
		phase := p.Main.Phase
		if len(order) == 0 || order[len(order)-1] != phase {
			order = append(order, phase)
		}
		seen[phase]++
		if full < 0 && p.Main.LogN >= 8.5 {
			full = i
		}
	}
	want := []string{"lag", "growth", "stationary", "death"}
	if len(order) != 4 {
		t.Fatalf("phases %v, want %v", order, want)
	}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("phases %v, want %v", order, want)
		}
	}
	// The plan: from 10^3 to 10^9 in about three minutes at the best temperature.
	if full < 120 || full > 240 {
		t.Fatalf("full after %d s", full)
	}
	if seen["lag"] < 10 || seen["lag"] > 40 {
		t.Fatalf("lag of %d s", seen["lag"])
	}
	// Left for a game day it is dying.
	if seen["stationary"] < 120 {
		t.Fatalf("stationary for only %d s", seen["stationary"])
	}
	if len(p.History) == 0 || len(p.History) > cultureHistoryMax {
		t.Fatalf("history of %d points", len(p.History))
	}
	if p.Every <= cultureHistoryEvery {
		t.Fatal("a full graph spreads out")
	}
}

func TestCultureTemperatureDecides(t *testing.T) {
	// The plan's experiment: the same yeast at 10, 30 and 45 °C.
	cold := runPlate("yeast", 10, false, 600, false).Main.LogN
	warm := runPlate("yeast", 30, false, 300, false).Main.LogN
	hot := runPlate("yeast", 45, false, 300, false).Main.LogN
	if !(warm > cold && cold > cultureLogInoculum && hot < cultureLogInoculum) {
		t.Fatalf("yeast at 10, 30, 45: %v %v %v", cold, warm, hot)
	}
	// Lactobacilli like it hot: at 42 they win, at 10 they do not grow at all.
	if l := runPlate("lactobacillus", 10, false, 300, false).Main; l.LogN != cultureLogInoculum || l.Phase != "still" {
		t.Fatalf("lactobacilli grew at 10: %+v", l)
	}
	if runPlate("lactobacillus", 42, false, 200, false).Main.LogN < 8 {
		t.Fatal("lactobacilli at their best")
	}
	// Cyanobacteria need light.
	if runPlate("cyanobacteria", 28, false, 400, false).Main.LogN != cultureLogInoculum {
		t.Fatal("cyanobacteria grew in the dark")
	}
	if runPlate("cyanobacteria", 28, true, 400, false).Main.LogN < cultureLogHarvest {
		t.Fatal("cyanobacteria in the light")
	}
	// Each species at its own best reaches a culture in a few minutes.
	for id, kind := range cultureSpecies {
		if runPlate(id, kind.Topt, true, 360, false).Main.LogN < cultureLogHarvest {
			t.Fatalf("%s at its best", id)
		}
	}
	// A cold plate keeps: in a fridge's cold nothing grows and nothing dies.
	cool := runPlate("yeast", 4, false, 2000, false).Main
	if cool.LogN != cultureLogInoculum {
		t.Fatalf("yeast at 4 °C: %v", cool.LogN)
	}
}

func TestCultureContamination(t *testing.T) {
	// A sterile plate grows nothing of itself: the control.
	clean := runPlate("", 25, true, 600, false)
	if clean.growing() || clean.touched() {
		t.Fatal("a sterile plate with nothing on it grew something")
	}
	if item := cultureHarvestOf("agar_plate", clean); item != "agar_plate" {
		t.Fatalf("an untouched plate comes back: %s", item)
	}
	// An unsterile one grows mould by itself, and gives a mould culture.
	mould := runPlate("", 23, false, 600, true)
	if item := cultureHarvestOf("agar_plate_unsterile", mould); item != "culture_mould" {
		t.Fatalf("mould plate gives %s (mould %v)", item, mould.Mould.LogN)
	}
	// Lactobacilli on an unsterile plate: the mould takes nutrient and holds them back, and the plate gives mould.
	pure := runPlate("lactobacillus", 25, false, 400, false)
	spoilt := runPlate("lactobacillus", 25, false, 400, true)
	if spoilt.Main.LogN >= pure.Main.LogN {
		t.Fatalf("the mould changed nothing: %v vs %v", spoilt.Main.LogN, pure.Main.LogN)
	}
	if item := cultureHarvestOf("agar_plate_unsterile", runPlate("lactobacillus", 25, false, 420, true)); item != "culture_mould" {
		t.Fatalf("a contaminated plate gives %s", item)
	}
	// Yeast, a fungus too, is not held back by penicillin; it only shares the food.
	if runPlate("yeast", 25, false, 150, true).Main.LogN < runPlate("yeast", 25, false, 150, false).Main.LogN-0.2 {
		t.Fatal("penicillin held back yeast")
	}
	// Two together run out of food sooner and die sooner.
	alone := runPlate("yeast", 25, false, 700, false)
	shared := runPlate("yeast", 25, false, 700, true)
	if shared.Nutrient > alone.Nutrient {
		t.Fatalf("nutrient alone %v, shared %v", alone.Nutrient, shared.Nutrient)
	}
	// A plate where nothing reached a culture gives only its dish.
	if item := cultureHarvestOf("agar_plate", runPlate("yeast", 30, false, 30, false)); item != usedDish {
		t.Fatalf("an early plate gives %s", item)
	}
}

func TestIncubatorMessages(t *testing.T) {
	r := newIncubatorRig()
	if o := r.send(t, "load", 0, "dirt", 0); o.Amount != 0 || o.Reason != "not a plate" {
		t.Fatalf("dirt as a plate: %+v", o)
	}
	if o := r.send(t, "load", 3, "agar_plate", 0); o.Reason != "bad slot" {
		t.Fatalf("slot 3: %+v", o)
	}
	if o := r.send(t, "inoculate", 0, "milk", 0); o.Reason != "no plate" {
		t.Fatalf("inoculate nothing: %+v", o)
	}
	if o := r.send(t, "load", 0, "agar_plate", 0); o.Amount != 1 || o.Type != "agar_plate" {
		t.Fatalf("load: %+v", o)
	}
	if o := r.send(t, "load", 0, "agar_plate", 0); o.Reason != "occupied" {
		t.Fatalf("load twice: %+v", o)
	}
	if o := r.send(t, "inoculate", 0, "tardigrade_tube", 0); o.Reason != "nothing grows" {
		t.Fatalf("a tardigrade on agar: %+v", o)
	}
	if o := r.send(t, "inoculate", 0, "sample_plains_lake_b", 0); o.Reason != "nothing grows" {
		t.Fatalf("a lake sample with no cyanobacteria: %+v", o)
	}
	if o := r.send(t, "inoculate", 0, "flower_red", 0); o.Amount != 1 {
		t.Fatalf("inoculate: %+v", o)
	}
	if r.plate(0).Main.Species != "yeast" {
		t.Fatal("flowers carry yeast")
	}
	if o := r.send(t, "inoculate", 0, "milk", 0); o.Reason != "inoculated" {
		t.Fatalf("inoculate twice: %+v", o)
	}
	// Plain moves are refused: a plate moves only with what is on it.
	if o, _ := r.book.put(r.w, storageEye, storageMove{Type: "agar_plate", Amount: 1, ReqID: "plain-put-1"}); o.Reason != "not for the incubator" {
		t.Fatalf("plain put: %+v", o)
	}
	if o, _ := r.book.take(r.w, storageEye, storageMove{Type: "agar_plate", Amount: 1, ReqID: "plain-take-1"}); o.Reason != "not for the incubator" {
		t.Fatalf("plain take: %+v", o)
	}
	// Too far, and not an incubator.
	far := &[3]float64{40, 1, 40}
	if o, _ := r.book.cultureLoad(r.w, far, cultureRequest{Slot: 1, Source: "agar_plate", ReqID: "far-away-1"}); o.Reason != "too far" {
		t.Fatalf("far: %+v", o)
	}
	r.w[[3]int{5, 0, 0}] = "chest"
	if o, _ := r.book.cultureLoad(r.w, &[3]float64{5.5, 1.5, 0.5}, cultureRequest{X: 5, Slot: 1, Source: "agar_plate", ReqID: "chest-plate-1"}); o.Reason != "not an incubator" {
		t.Fatalf("chest: %+v", o)
	}
	// The same request twice is answered from the log and does nothing twice.
	req := cultureRequest{Slot: 1, Source: "agar_plate", ReqID: "same-request-1"}
	first, changed := r.book.cultureLoad(r.w, storageEye, req)
	again, changedAgain := r.book.cultureLoad(r.w, storageEye, req)
	if !reflect.DeepEqual(first, again) || !changed || changedAgain {
		t.Fatalf("repeat: %+v %+v", first, again)
	}
	if got := r.book.sync([]string{"same-request-1"}); len(got) != 1 || !reflect.DeepEqual(got[0], first) {
		t.Fatalf("sync: %+v", got)
	}
	// The target is clamped to the dial.
	r.send(t, "set", 0, "", 80)
	if incubatorTarget(r.book.blocks[blockKey(0, 0, 0)]) != incubatorMaxTarget {
		t.Fatal("target above the dial")
	}
	r.send(t, "set", 0, "", -3)
	if incubatorTarget(r.book.blocks[blockKey(0, 0, 0)]) != incubatorMinTarget {
		t.Fatal("target below the dial")
	}
}

func TestIncubatorPowerAndAmbient(t *testing.T) {
	r := newIncubatorRig()
	r.ambient = 12
	r.send(t, "set", 0, "", 30)
	r.send(t, "load", 0, "agar_plate", 0)
	// Nothing grows on it yet: no power is asked for.
	r.run(5)
	if r.asks[[3]int{0, 0, 0}] {
		t.Fatal("an incubator with nothing growing asks for power")
	}
	r.send(t, "inoculate", 0, "flower_yellow", 0)
	// No power: it drifts to the room, at 12 °C, and the yeast grows slowly.
	r.run(200)
	block := r.book.blocks[blockKey(0, 0, 0)]
	if math.Abs(*block.Inside-12) > 0.5 {
		t.Fatalf("without power it is %v inside", *block.Inside)
	}
	if !r.asks[[3]int{0, 0, 0}] {
		t.Fatal("it should be asking for its watts")
	}
	slow := r.plate(0).Main.LogN
	// With power it goes to 30 and the yeast takes off.
	r.power = true
	r.run(120)
	if math.Abs(*block.Inside-30) > 1 {
		t.Fatalf("with power it is %v inside", *block.Inside)
	}
	if r.plate(0).Main.LogN < slow+2 {
		t.Fatalf("yeast %v then %v", slow, r.plate(0).Main.LogN)
	}
	// The panel hears it all.
	snapshot := r.book.snapshotLocked(storagePlace{cell: [3]int{0, 0, 0}, capacity: 3, kind: incubatorKind})
	if snapshot.Incubator == nil || snapshot.Incubator.Target != 30 || snapshot.Incubator.Plates[0] == nil || snapshot.Incubator.Plates[0].Main.Species != "yeast" {
		t.Fatalf("snapshot: %+v", snapshot.Incubator)
	}
	if snapshot.Incubator.Plates[1] != nil || len(snapshot.Incubator.Plates) != 3 {
		t.Fatal("empty slots are nil, and there are three")
	}
	// Harvest: a culture and its dish; the incubator stops asking when nothing grows.
	o := r.send(t, "harvest", 0, "", 0)
	if o.Type != "culture_yeast" || o.Also != "" || o.Amount != 1 {
		t.Fatalf("harvest: %+v", o)
	}
	if o := r.send(t, "harvest", 0, "", 0); o.Reason != "gone" {
		t.Fatalf("harvest twice: %+v", o)
	}
	r.run(2)
	if r.asks[[3]int{0, 0, 0}] {
		t.Fatal("still asking with nothing in it")
	}
	// Only the target is left, and it is kept.
	if block := r.book.blocks[blockKey(0, 0, 0)]; block == nil || block.Target != 30 {
		t.Fatal("the target was lost")
	}
}

func TestIncubatorSurvivesARestartAndABreak(t *testing.T) {
	r := newIncubatorRig()
	r.power = true
	r.send(t, "set", 0, "", 42)
	r.send(t, "load", 0, "agar_plate", 0)
	r.send(t, "load", 2, "agar_plate_unsterile", 0)
	r.send(t, "inoculate", 0, "milk", 0)
	r.run(150)
	saved, log := r.book.snapshot()
	data, err := json.Marshal(saved)
	if err != nil {
		t.Fatal(err)
	}
	var reread map[string]StorageBlock
	if err := json.Unmarshal(data, &reread); err != nil {
		t.Fatal(err)
	}
	r2 := newIncubatorRig()
	r2.power = true
	r2.book.load(reread, log)
	before := r.plate(0).Main.LogN
	if got := r2.plate(0); got == nil || got.Main.LogN != before || got.Main.Species != "lactobacillus" || r2.plate(2).Mould == nil {
		t.Fatalf("after a restart: %+v", got)
	}
	// It is ticked again after loading, and keeps growing.
	r2.run(30)
	if r2.plate(0).Main.LogN <= before {
		t.Fatal("a reloaded incubator does not run")
	}
	// A saved plate cannot claim the impossible.
	bad := reread[blockKey(0, 0, 0)]
	bad.Plates[0].Main.LogN = 50
	bad.Plates[0].Nutrient = -4
	bad.Plates[2].Mould.Species = "dragon"
	bad.Slots[1] = StorageSlot{Type: "diamond", Count: 9}
	bad.Target = 300
	r3 := newIncubatorRig()
	r3.book.load(map[string]StorageBlock{"x": bad}, nil)
	block := r3.book.blocks[blockKey(0, 0, 0)]
	if block.Plates[0].Main.LogN != cultureLogMax || block.Plates[0].Nutrient != 0 || block.Plates[2].Mould != nil || block.Slots[1].Count != 0 || block.Target != incubatorMaxTarget {
		t.Fatalf("cleaned: %+v %+v", block.Plates[0], block.Slots)
	}
	// Breaking it gives each plate as it would come out: nothing lost, nothing doubled.
	spill, _, err := r2.book.replace(r2.w, 0, 0, 0, "", func() (bool, error) { return true, r2.w.SetBlock(0, 0, 0, "") })
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]int{}
	for _, slot := range spill {
		got[slot.Type] += slot.Count
	}
	// The culture is its own dish; the unsterile plate, whose mould never got going at 37 °C or above,
	// comes back as it went in.
	if got["culture_lactobacillus"] != 1 || got["agar_plate_unsterile"] != 1 || len(got) != 2 {
		t.Fatalf("spill: %v", got)
	}
	if r2.book.blocks[blockKey(0, 0, 0)] != nil {
		t.Fatal("a broken incubator keeps its plates")
	}
}

func TestAutoclaveIsAnElectricMachine(t *testing.T) {
	m := machines[autoclaveKind]
	if m == nil || !m.electric() || m.slotFor("used_dish") != ovenSlotFood || m.slotFor("water_flask") != -1 {
		t.Fatal("autoclave")
	}
	// A culture plate is a dish with colonies: once done with, it comes out an empty sterile dish, so no
	// dish is lost to a culture.
	for _, kind := range cultureSpecies {
		if recipe, ok := autoclaveRecipes[kind.Item]; !ok || recipe.Out != "petri_dish" || recipe.yield() != 1 {
			t.Errorf("the autoclave does not take %s back to a dish", kind.Item)
		}
	}
	if powerKinds[autoclaveKind].Watts <= 0 || !powerKinds[autoclaveKind].OnDemand || !powerKinds[incubatorKind].OnDemand {
		t.Fatal("the autoclave and the incubator ask for power only while they have work")
	}
	book := newApplianceBook(nil)
	on := true
	book.powered = func([3]int) bool { return on }
	w := fakeCropWorld{{0, 0, 0}: "autoclave"}
	if o, _ := book.put(w, storageEye, storageMove{Type: "used_dish", Amount: 3, ReqID: "autoclave-put-1"}); o.Amount != 3 {
		t.Fatalf("put: %+v", o)
	}
	applianceRun(book, w, 40)
	if got := slotAt(book, ovenSlotResult); got.Type != "petri_dish" || got.Count != 3 {
		t.Fatalf("after 40 s: %+v", got)
	}
}

func TestFilterAndCultureSources(t *testing.T) {
	book, _ := newTestBook()
	w := fakeCropWorld{{0, 0, 0}: "water", {1, 0, 0}: "moss"}
	flatSurface := surfaceWith(terrain.Climate{}, 0)
	o := book.takeSample(w, flatSurface, storageEye, microscopeRequest{Source: waterFilter, ReqID: "filter-water-1"})
	if o.Type != sampleFiltered || o.Amount != 1 {
		t.Fatalf("filter in water: %+v", o)
	}
	o = book.takeSample(w, flatSurface, storageEye, microscopeRequest{X: 1, Source: waterFilter, ReqID: "filter-moss-1"})
	if o.Amount != 0 || o.Reason != "not water" {
		t.Fatalf("filter on moss: %+v", o)
	}
	// What an incubator gives can go on a slide, and back on a plate.
	for id, kind := range cultureSpecies {
		species, ok := sampleSpecies(kind.Item)
		if !ok || len(species) != 1 || species[0] != id {
			t.Fatalf("%s under the microscope: %v", kind.Item, species)
		}
		if got, ok := cultureInoculum(kind.Item); !ok || got != id {
			t.Fatalf("%s on a plate: %s", kind.Item, got)
		}
	}
	if s, _ := sampleSpecies(sampleFiltered); len(s) != 1 || s[0] != "soil_bacteria" {
		t.Fatal("a filtered sample keeps only a few bacteria")
	}
	for _, source := range []string{"dirt", "milk", "cheese", "flower_red", "honeycomb", "sample_plains_lake_a", "sample_oasis_c"} {
		if _, ok := cultureInoculum(source); !ok {
			t.Fatalf("%s grows nothing", source)
		}
	}
}
