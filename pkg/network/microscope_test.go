package network

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"

	"minecloud/pkg/terrain"
)

const testMicroReq = "microscope-req-"

// A book with one microscope at the origin, a fixed clock and a fixed seed.
func newMicroBook() (*storageBook, fakeCropWorld, *time.Time) {
	book, _ := newTestBook()
	clock := time.Unix(1000000, 0)
	book.now = func() time.Time { return clock }
	book.seed = func() uint32 { return 7 }
	return book, fakeCropWorld{{0, 0, 0}: "microscope"}, &clock
}

func microAt(source, id string) microscopeRequest {
	return microscopeRequest{Source: source, ReqID: testMicroReq + id}
}

func surfaceWith(climate terrain.Climate, height int) func(int, int) terrain.Surface {
	return func(int, int) terrain.Surface { return terrain.Surface{Climate: climate, Height: height} }
}

// ---- Habitat by column ----

func TestSampleHabitatByColumn(t *testing.T) {
	cases := []struct {
		climate terrain.Climate
		want    string
	}{
		{terrain.Climate{Mountain: 0.10}, "mountain_lake"},
		{terrain.Climate{Mountain: 0.5, Forest: 0.9, Desert: 0.9}, "mountain_lake"},
		{terrain.Climate{Mountain: 0.09, Forest: 0.5}, "forest_lake"},
		{terrain.Climate{Forest: 0.5, Desert: 0.6}, "forest_lake"},
		{terrain.Climate{Forest: 0.49, Desert: 0.5}, "oasis"},
		{terrain.Climate{Forest: 0.49, Desert: 0.49, Mountain: 0.09}, "plains_lake"},
		{terrain.Climate{Plains: 1}, "plains_lake"},
	}
	for _, c := range cases {
		if got := sampleHabitat(c.climate); got != c.want {
			t.Errorf("%+v: %s, want %s", c.climate, got, c.want)
		}
	}
}

func TestSampleOfWaterInEachHabitat(t *testing.T) {
	for habitat, climate := range map[string]terrain.Climate{
		"mountain_lake": {Mountain: 0.2},
		"forest_lake":   {Forest: 0.9},
		"oasis":         {Desert: 0.9},
		"plains_lake":   {Plains: 1},
	} {
		surface := terrain.Surface{Climate: climate, Height: 1}
		got := sampleOfWater(surface, 3, terrain.WaterLevel, 3)
		if !strings.HasPrefix(got, "sample_"+habitat+"_") {
			t.Errorf("%s gave %s", habitat, got)
		}
		if _, ok := sampleSpecies(got); !ok {
			t.Errorf("%s is not a known source", got)
		}
	}
}

// Water that is not where the terrain makes it was poured there, wherever it is.
func TestSamplePouredWater(t *testing.T) {
	surface := terrain.Surface{Climate: terrain.Climate{Forest: 1}, Height: 2}
	for _, y := range []int{terrain.WaterLevel + 1, 40, 2, 1, -3} {
		if got := sampleOfWater(surface, 5, y, 5); got != sampleStill {
			t.Errorf("water at y %d over height 2 gave %s", y, got)
		}
	}
	for _, y := range []int{3, 4, terrain.WaterLevel} {
		if got := sampleOfWater(surface, 5, y, 5); got == sampleStill {
			t.Errorf("water at y %d over height 2 counts as poured", y)
		}
	}
	// A column whose terrain stands above the water level has no water of its own at all.
	high := terrain.Surface{Climate: terrain.Climate{Forest: 1}, Height: 12}
	for _, y := range []int{5, 12, 13} {
		if got := sampleOfWater(high, 5, y, 5); got != sampleStill {
			t.Errorf("water at y %d over height 12 gave %s", y, got)
		}
	}
	species, ok := sampleSpecies(sampleStill)
	if !ok || len(species) != 1 || species[0] != "soil_bacteria" {
		t.Errorf("still water holds %v", species)
	}
	if n := microscopeTardigrades(sampleStill, 1); n != 0 {
		t.Errorf("still water with %d tardigrades", n)
	}
}

// A real lake and a real poured block over land, from the real generator.
func TestSampleFromRealTerrain(t *testing.T) {
	foundLake, foundLand := false, false
	for x := -400; x < 400 && !(foundLake && foundLand); x += 3 {
		for z := -400; z < 400; z += 3 {
			s := terrain.ColumnSurface(x, z)
			if s.Height < terrain.WaterLevel {
				foundLake = true
				if got := sampleOfWater(s, x, terrain.WaterLevel, z); got == sampleStill {
					t.Fatalf("the lake at %d,%d counts as poured", x, z)
				}
				if got := sampleOfWater(s, x, terrain.WaterLevel+1, z); got != sampleStill {
					t.Fatalf("water above the lake at %d,%d gave %s", x, z, got)
				}
			} else {
				foundLand = true
				if got := sampleOfWater(s, x, s.Height+1, z); got != sampleStill {
					t.Fatalf("poured on land at %d,%d gave %s", x, z, got)
				}
			}
		}
	}
	if !foundLake || !foundLand {
		t.Fatal("no lake or no land found")
	}
}

// ---- The same place gives the same thing ----

func TestSampleIsFixedByPlace(t *testing.T) {
	surface := terrain.Surface{Climate: terrain.Climate{Forest: 1}, Height: 1}
	seen := map[string]bool{}
	for cellX := -40; cellX < 40; cellX++ {
		for cellZ := -40; cellZ < 40; cellZ++ {
			first := sampleOfWater(surface, cellX*8, 5, cellZ*8)
			seen[first] = true
			// Every block of the cell, at every depth, including negative coordinates.
			for dx := 0; dx < 8; dx += 3 {
				for dz := 0; dz < 8; dz += 3 {
					for y := 2; y <= 5; y++ {
						if got := sampleOfWater(surface, cellX*8+dx, y, cellZ*8+dz); got != first {
							t.Fatalf("cell %d,%d: %s and %s", cellX, cellZ, first, got)
						}
					}
				}
			}
		}
	}
	if len(seen) != 4 {
		t.Fatalf("variants seen: %v", seen)
	}
	if sampleOfMoss(4, 6, -9) != sampleOfMoss(4, 6, -9) {
		t.Fatal("moss changes")
	}
	different := false
	for x := 0; x < 50 && !different; x++ {
		different = sampleOfMoss(x, 6, 0) != sampleOfMoss(0, 6, 0)
	}
	if !different {
		t.Fatal("all moss holds the same: its block should decide")
	}
}

// The takeSample path reads the block and gives what the place says, with the block left there.
func TestTakeSample(t *testing.T) {
	book, _, _ := newMicroBook()
	w := fakeCropWorld{{0, 3, 0}: "water", {1, 1, 0}: "moss", {2, 1, 0}: "stone"}
	surface := surfaceWith(terrain.Climate{Forest: 1}, 1)
	eye := &[3]float64{0.5, 3, 0.5}

	first := book.takeSample(w, surface, eye, microscopeRequest{Y: 3, ReqID: testMicroReq + "a"})
	if first.Amount != 1 || !strings.HasPrefix(first.Type, "sample_forest_lake_") {
		t.Fatalf("water: %+v", first)
	}
	again := book.takeSample(w, surface, eye, microscopeRequest{Y: 3, ReqID: testMicroReq + "b"})
	if again.Type != first.Type {
		t.Fatalf("same place, %s then %s", first.Type, again.Type)
	}
	if w[[3]int{0, 3, 0}] != "water" {
		t.Fatal("the water was removed")
	}
	moss := book.takeSample(w, surface, eye, microscopeRequest{X: 1, Y: 1, ReqID: testMicroReq + "c"})
	if moss.Amount != 1 || !strings.HasPrefix(moss.Type, "sample_moss_") || w[[3]int{1, 1, 0}] != "moss" {
		t.Fatalf("moss: %+v", moss)
	}
	stone := book.takeSample(w, surface, eye, microscopeRequest{X: 2, Y: 1, ReqID: testMicroReq + "d"})
	if stone.Amount != 0 || stone.Reason == "" {
		t.Fatalf("stone: %+v", stone)
	}
	// The same request answers the same, from the log.
	if got := book.takeSample(w, surface, eye, microscopeRequest{Y: 3, ReqID: testMicroReq + "a"}); got != first {
		t.Fatalf("repeat: %+v", got)
	}
	if got := book.takeSample(w, surface, nil, microscopeRequest{Y: 3, ReqID: testMicroReq + "e"}); got.Reason != "too far" {
		t.Fatalf("no position: %+v", got)
	}
	if got := book.takeSample(w, surface, eye, microscopeRequest{Y: 3, ReqID: "x"}); got.ReqID != "" {
		t.Fatalf("bad id: %+v", got)
	}
}

func TestTakeSampleReach(t *testing.T) {
	book, _, _ := newMicroBook()
	w := fakeCropWorld{{20, 3, 0}: "water"}
	surface := surfaceWith(terrain.Climate{Forest: 1}, 1)
	if got := book.takeSample(w, surface, &[3]float64{0.5, 3, 0.5}, microscopeRequest{X: 20, Y: 3, ReqID: testMicroReq + "far"}); got.Reason != "too far" || got.Amount != 0 {
		t.Fatalf("far: %+v", got)
	}
	if got := book.takeSample(w, surface, &[3]float64{17, 3, 0.5}, microscopeRequest{X: 20, Y: 3, ReqID: testMicroReq + "near"}); got.Amount != 1 {
		t.Fatalf("near: %+v", got)
	}
}

// ---- The plan's table ----

func TestVariantProportions(t *testing.T) {
	want := map[string]float64{"forest_lake": 0.35, "mountain_lake": 0.5, "plains_lake": 0, "oasis": 0, "moss": 0.6}
	if len(want) != len(sampleVariants) {
		t.Fatalf("habitats: %v", sampleVariants)
	}
	for habitat, share := range want {
		variants := sampleVariants[habitat]
		if len(variants) != 4 {
			t.Fatalf("%s has %d variants", habitat, len(variants))
		}
		sum, table := 0.0, 0.0
		for i, variant := range variants {
			if variant.Letter != string(rune('a'+i)) {
				t.Errorf("%s variant %d is %s", habitat, i, variant.Letter)
			}
			sum += variant.Weight
			for _, id := range variant.Species {
				if id == "tardigrade" {
					table += variant.Weight
				}
			}
		}
		if math.Abs(sum-1) > 1e-9 || math.Abs(table-share) > 1e-9 {
			t.Errorf("%s: weights add to %v, tardigrades %v, want %v", habitat, sum, table, share)
		}
	}
	// And what really comes out, over many places.
	const n = 200000
	for habitat, share := range want {
		with := 0
		count := map[string]int{}
		for i := range n {
			var roll float64
			if habitat == "moss" {
				roll = sampleRoll(sampleSaltMoss, i-n/2, 6, i*7)
			} else {
				roll = sampleRoll(sampleSaltWater, i-n/2, i*3)
			}
			variant := sampleVariantFor(habitat, roll)
			count[variant.Letter]++
			if microscopeTardigrades("sample_"+habitat+"_"+variant.Letter, 1) > 0 {
				with++
			}
		}
		if got := float64(with) / n; math.Abs(got-share) > 0.01 {
			t.Errorf("%s: %.3f of the places have tardigrades, want %.2f", habitat, got, share)
		}
		for _, variant := range sampleVariants[habitat] {
			if got := float64(count[variant.Letter]) / n; math.Abs(got-variant.Weight) > 0.01 {
				t.Errorf("%s %s: %.3f, want %v", habitat, variant.Letter, got, variant.Weight)
			}
		}
	}
}

// The letters of a habitat with tardigrades are not the same as another's, so a letter says nothing.
func TestLettersSayNothing(t *testing.T) {
	letters := map[string]string{}
	for _, habitat := range []string{"forest_lake", "mountain_lake", "moss"} {
		key := ""
		for _, variant := range sampleVariants[habitat] {
			if microscopeTardigrades("sample_"+habitat+"_"+variant.Letter, 1) > 0 {
				key += variant.Letter
			}
		}
		letters[habitat] = key
	}
	if letters["forest_lake"] == "" || letters["forest_lake"] == letters["moss"] {
		t.Errorf("tardigrade letters: %v", letters)
	}
}

// ---- A slide ----

func TestPrepareAndClear(t *testing.T) {
	book, w, _ := newMicroBook()
	got, changed := book.prepare(w, storageEye, microAt("sample_forest_lake_b", "1"))
	if got.Amount != 1 || !changed {
		t.Fatalf("prepare: %+v", got)
	}
	block := book.blocks[blockKey(0, 0, 0)]
	if block == nil || block.Prep == nil || block.Prep.Seed != 7 || block.Prep.Source != "sample_forest_lake_b" {
		t.Fatalf("block: %+v", block)
	}
	if block.Slots[0].Type != glassSlide || block.Slots[0].Count != 1 {
		t.Fatalf("slot: %+v", block.Slots)
	}
	if block.Prep.Tardigrades < 1 || block.Prep.Tardigrades > 3 {
		t.Fatalf("tardigrades: %d", block.Prep.Tardigrades)
	}
	// One slide at a time.
	if got, changed := book.prepare(w, storageEye, microAt("dirt", "2")); got.Reason != "occupied" || changed {
		t.Fatalf("second slide: %+v", got)
	}
	// The same request is not done twice.
	if got, changed := book.prepare(w, storageEye, microAt("sample_forest_lake_b", "1")); got.Amount != 1 || changed {
		t.Fatalf("repeat: %+v", got)
	}
	got, changed = book.clearSlide(w, storageEye, microAt("", "3"))
	if got.Amount != 1 || got.Type != glassSlide || !changed {
		t.Fatalf("clear: %+v", got)
	}
	if _, ok := book.blocks[blockKey(0, 0, 0)]; ok {
		t.Fatal("the slide is still there")
	}
	if got, _ := book.clearSlide(w, storageEye, microAt("", "4")); got.Amount != 0 {
		t.Fatalf("clearing nothing: %+v", got)
	}
}

func TestPrepareRefusals(t *testing.T) {
	book, w, _ := newMicroBook()
	for _, source := range []string{"stone", "glass", "sample_forest_lake_z", "sample_", "", "tardigrade", "ANY"} {
		if got, changed := book.prepare(w, storageEye, microAt(source, "bad"+strings.ToLower(source))); got.Amount != 0 || changed {
			t.Errorf("%q: %+v", source, got)
		}
	}
	for _, source := range []string{"cheek", "dirt", "milk", "wheat", "leaves", "cherry_leaves", "flower_red", "red_wool", "honeycomb", "raw_fish", "mushroom_brown", "cheese", sampleStill, tardigradeTube, tardigradeTun} {
		book, w, _ := newMicroBook()
		if got, _ := book.prepare(w, storageEye, microAt(source, "good")); got.Amount != 1 {
			t.Errorf("%q: %+v", source, got)
		}
	}
	if got, _ := book.prepare(fakeCropWorld{{0, 0, 0}: "chest"}, storageEye, microAt("dirt", "chest")); got.Reason != "not a microscope" {
		t.Errorf("on a chest: %+v", got)
	}
	if got, _ := book.prepare(w, &[3]float64{30, 0, 0}, microAt("dirt", "far")); got.Reason != "too far" {
		t.Errorf("too far: %+v", got)
	}
	if got, _ := book.prepare(w, nil, microAt("dirt", "nopos")); got.Reason != "too far" {
		t.Errorf("no position: %+v", got)
	}
}

// The slot of a microscope is not a chest's: nothing goes in or out by the chest messages.
func TestChestMessagesDoNotTouchTheSlide(t *testing.T) {
	book, w, _ := newMicroBook()
	if got, changed := book.put(w, storageEye, storageMove{Type: "stone", Amount: 1, ReqID: testMicroReq + "put"}); got.Amount != 0 || changed {
		t.Fatalf("put: %+v", got)
	}
	book.prepare(w, storageEye, microAt("dirt", "1"))
	if got, changed := book.take(w, storageEye, storageMove{Type: glassSlide, Amount: 1, ReqID: testMicroReq + "take"}); got.Amount != 0 || changed {
		t.Fatalf("take: %+v", got)
	}
	if book.blocks[blockKey(0, 0, 0)].Prep == nil {
		t.Fatal("the slide lost its contents")
	}
}

func TestBreakingAMicroscopeGivesTheSlideBack(t *testing.T) {
	book, w, _ := newMicroBook()
	book.prepare(w, storageEye, microAt("dirt", "1"))
	spill, _, err := book.replace(w, 0, 0, 0, "", func() (bool, error) {
		delete(w, [3]int{0, 0, 0})
		return true, nil
	})
	if err != nil || len(spill) != 1 || spill[0].Type != glassSlide || spill[0].Count != 1 {
		t.Fatalf("spill: %+v %v", spill, err)
	}
	if _, ok := book.blocks[blockKey(0, 0, 0)]; ok {
		t.Fatal("the entry stays")
	}
}

// A slide lasts through a save and a restart: its source, seed, clock and captures.
func TestPreparationPersists(t *testing.T) {
	book, w, clock := newMicroBook()
	book.prepare(w, storageEye, microAt("sample_mountain_lake_b", "1"))
	*clock = clock.Add(30 * time.Second)
	book.capture(w, storageEye, microAt("", "2"))

	blocks, outcomes := book.snapshot()
	// The snapshot is a copy: what happens next does not reach it.
	book.blocks[blockKey(0, 0, 0)].Prep.Seed = 99
	if blocks[blockKey(0, 0, 0)].Prep.Seed != 7 {
		t.Fatal("the snapshot shares its slide with the book")
	}
	book.blocks[blockKey(0, 0, 0)].Prep.Seed = 7

	saved, err := json.Marshal(blocks)
	if err != nil {
		t.Fatal(err)
	}
	var read map[string]StorageBlock
	if err := json.Unmarshal(saved, &read); err != nil {
		t.Fatal(err)
	}
	restarted, _, _ := newMicroBook()
	restarted.now = book.now
	restarted.load(read, outcomes)
	block := restarted.blocks[blockKey(0, 0, 0)]
	if block == nil || block.Prep == nil {
		t.Fatalf("lost: %+v", read)
	}
	if block.Prep.Source != "sample_mountain_lake_b" || block.Prep.Seed != 7 || block.Prep.Taken != 1 || block.Prep.Tardigrades != microscopeTardigrades("sample_mountain_lake_b", 7) {
		t.Fatalf("prep: %+v", block.Prep)
	}
	place := storagePlace{cell: [3]int{0, 0, 0}, capacity: 1, kind: microscopeKind}
	view := restarted.snapshotLocked(place).Microscope
	if view == nil || view.Age != 30 {
		t.Fatalf("view: %+v", view)
	}
	// What was answered is still known, so a late question gets the same answer.
	if got, changed := restarted.prepare(w, storageEye, microAt("sample_mountain_lake_b", "1")); got.Amount != 1 || changed {
		t.Fatalf("repeat after restart: %+v", got)
	}
}

func TestLoadDropsImpossibleSlides(t *testing.T) {
	book, _, _ := newMicroBook()
	book.load(map[string]StorageBlock{
		blockKey(0, 0, 0): {Slots: []StorageSlot{{Type: glassSlide, Count: 1}}, Prep: &MicroscopePrep{Source: "gold_block"}},
		blockKey(1, 0, 0): {X: 1, Slots: []StorageSlot{{Type: glassSlide, Count: 1}}, Prep: &MicroscopePrep{Source: tardigradeTube, Tardigrades: 50, Taken: 50}},
	}, nil)
	if prep := book.blocks[blockKey(0, 0, 0)].Prep; prep != nil {
		t.Errorf("unknown source kept: %+v", prep)
	}
	if prep := book.blocks[blockKey(1, 0, 0)].Prep; prep.Tardigrades != 1 || prep.Taken != 1 {
		t.Errorf("not limited: %+v", prep)
	}
}

func TestDryingAndDrop(t *testing.T) {
	book, w, clock := newMicroBook()
	book.prepare(w, storageEye, microAt("sample_moss_a", "1"))
	prep := func() *MicroscopePrep { return book.blocks[blockKey(0, 0, 0)].Prep }

	// Wetted before it dries, nothing has happened to it.
	*clock = clock.Add(100 * time.Second)
	if got, changed := book.dropWater(w, storageEye, microAt("", "2")); got.Amount != 1 || !changed || prep().Revived {
		t.Fatalf("early drop: %+v, %+v", got, prep())
	}
	if prep().WetAt != float64(clock.Unix()) {
		t.Fatalf("not wetted: %+v", prep())
	}
	// Dried out, a drop brings it back with Revived set: only tardigrades came through.
	*clock = clock.Add(microscopeDrySeconds * time.Second)
	if got, _ := book.dropWater(w, storageEye, microAt("", "3")); got.Amount != 1 || !prep().Revived {
		t.Fatalf("late drop: %+v, %+v", got, prep())
	}
	if view := book.microscopeViewOf(book.blocks[blockKey(0, 0, 0)]); view.Age != 0 || view.Woke != 0 {
		t.Fatalf("age: %+v", view)
	}
	// Another drop on a slide that is wet does not make its tardigrades curl up and open again.
	*clock = clock.Add(50 * time.Second)
	book.dropWater(w, storageEye, microAt("", "3b"))
	if view := book.microscopeViewOf(book.blocks[blockKey(0, 0, 0)]); view.Age != 0 || view.Woke != 50 {
		t.Fatalf("second drop: %+v", view)
	}
	if got, _ := book.dropWater(fakeCropWorld{{0, 0, 0}: "microscope"}, &[3]float64{40, 0, 0}, microAt("", "4")); got.Reason != "too far" {
		t.Fatalf("far: %+v", got)
	}
}

func TestCapture(t *testing.T) {
	book, w, clock := newMicroBook()
	book.seed = func() uint32 { return 1 } // 2 tardigrades
	book.prepare(w, storageEye, microAt("sample_moss_a", "1"))
	got, changed := book.capture(w, storageEye, microAt("", "2"))
	if got.Amount != 1 || got.Type != tardigradeTube || !changed {
		t.Fatalf("capture: %+v", got)
	}
	// From a slide that has dried, it comes as a tun.
	*clock = clock.Add(microscopeDrySeconds * time.Second)
	if got, _ := book.capture(w, storageEye, microAt("", "3")); got.Type != tardigradeTun {
		t.Fatalf("dry capture: %+v", got)
	}
	if got, changed := book.capture(w, storageEye, microAt("", "4")); got.Amount != 0 || got.Reason != "none left" || changed {
		t.Fatalf("none left: %+v", got)
	}
	// A slide with no tardigrades has none to give, and an empty stage neither.
	book, w, _ = newMicroBook()
	if got, _ := book.capture(w, storageEye, microAt("", "5")); got.Amount != 0 {
		t.Fatalf("empty stage: %+v", got)
	}
	book.prepare(w, storageEye, microAt("dirt", "6"))
	if got, _ := book.capture(w, storageEye, microAt("", "7")); got.Amount != 0 {
		t.Fatalf("no tardigrade: %+v", got)
	}
}

func TestTubeAndTunSlides(t *testing.T) {
	book, w, _ := newMicroBook()
	book.prepare(w, storageEye, microAt(tardigradeTun, "1"))
	prep := book.blocks[blockKey(0, 0, 0)].Prep
	if prep.Tardigrades != 1 || book.clock()-prep.WetAt < microscopeDrySeconds {
		t.Fatalf("a tun's slide is dry, with one: %+v", prep)
	}
	book.dropWater(w, storageEye, microAt("", "2"))
	if !book.blocks[blockKey(0, 0, 0)].Prep.Revived {
		t.Fatal("a drop on a tun revives it")
	}
	if got, _ := book.capture(w, storageEye, microAt("", "3")); got.Type != tardigradeTube {
		t.Fatalf("wet again it is active: %+v", got)
	}
}

// The freezer's row, and what it does.
func TestFreezerMakesATun(t *testing.T) {
	if freezeChanges[tardigradeTube] != tardigradeTun {
		t.Fatal("no freezer row")
	}
	slots := []StorageSlot{{Type: tardigradeTube, Count: 2}}
	coldStep(slots, freezeChanges, freezeSeconds, true, freezeSeconds)
	if slots[0].Type != tardigradeTun || slots[0].Count != 2 {
		t.Fatalf("frozen: %+v", slots[0])
	}
}

// A watcher is told of the slide, and only a microscope has one.
func TestSnapshotCarriesTheSlide(t *testing.T) {
	book, w, _ := newMicroBook()
	place, _ := book.locate(w, 0, 0, 0)
	if snapshot := book.snapshotLocked(place); snapshot.Microscope != nil || snapshot.Capacity != 1 {
		t.Fatalf("empty: %+v", snapshot)
	}
	book.prepare(w, storageEye, microAt("cheek", "1"))
	snapshot := book.snapshotLocked(place)
	if snapshot.Microscope == nil || snapshot.Microscope.Source != "cheek" {
		t.Fatalf("with a slide: %+v", snapshot)
	}
	data, err := json.Marshal(snapshot)
	if err != nil || !strings.Contains(string(data), `"microscope":{"source":"cheek"`) || !strings.Contains(string(data), `"age":`) {
		t.Fatalf("message: %s, %v", data, err)
	}
	other, chest := newTestBook()
	chestPlace, _ := other.locate(chest, 0, 0, 0)
	if other.snapshotLocked(chestPlace).Microscope != nil {
		t.Fatal("a chest has a slide")
	}
}

func TestMechanicsDoNotMoveAMicroscope(t *testing.T) {
	if mechMovable("microscope") || mechMovable("microscope:e") {
		t.Fatal("a ram would leave the slide behind")
	}
}

// A plate goes on the stage itself, with no slide: it never dries, takes no drop, stain or pipette, comes
// back as it went, and a broken microscope gives it back too.
func TestPlatesGoOnTheStageThemselves(t *testing.T) {
	for plate := range microscopePlates {
		book, w, clock := newMicroBook()
		got, changed := book.prepare(w, storageEye, microAt(plate, "on"))
		if got.Amount != 1 || !changed {
			t.Fatalf("%s: %+v", plate, got)
		}
		block := book.blocks[blockKey(0, 0, 0)]
		if block.Slots[0].Type != plate || block.Slots[0].Count != 1 {
			t.Fatalf("%s: the stage holds %+v", plate, block.Slots)
		}
		*clock = clock.Add(10 * time.Minute)
		if view := book.microscopeViewOf(block); view.Age != 0 {
			t.Fatalf("%s dried on the stage: %v", plate, view.Age)
		}
		if got, _ := book.dropWater(w, storageEye, microAt("", "drop")); got.Reason != "not a slide" {
			t.Fatalf("%s took a drop: %+v", plate, got)
		}
		if got, _ := book.stainSlide(w, storageEye, microAt("methylene_blue", "stain")); got.Reason != "not a slide" {
			t.Fatalf("%s took a stain: %+v", plate, got)
		}
		if got, _ := book.capture(w, storageEye, microAt("", "capture")); got.Reason != "not a slide" {
			t.Fatalf("%s gave something to the pipette: %+v", plate, got)
		}
		// A saved stage that claims a slide under a plate holds the plate again.
		saved := *block
		saved.Slots = []StorageSlot{{Type: glassSlide, Count: 3}}
		microscopeCleanLoaded(&saved)
		if saved.Slots[0].Type != plate || saved.Slots[0].Count != 1 {
			t.Fatalf("%s: a cleaned stage holds %+v", plate, saved.Slots)
		}
		if got, _ := book.clearSlide(w, storageEye, microAt("", "off")); got.Amount != 1 || got.Type != plate {
			t.Fatalf("%s came back as %+v", plate, got)
		}
		book.prepare(w, storageEye, microAt(plate, "again"))
		spill, _, err := book.replace(w, 0, 0, 0, "", func() (bool, error) {
			delete(w, [3]int{0, 0, 0})
			return true, nil
		})
		if err != nil || len(spill) != 1 || spill[0].Type != plate {
			t.Fatalf("%s: a broken microscope gives %+v %v", plate, spill, err)
		}
	}
	// Every culture an incubator gives, and every dish it can, is one of them: nothing a player takes out
	// of an incubator is ever impossible to look at.
	for _, kind := range cultureSpecies {
		if !microscopePlates[kind.Item] {
			t.Errorf("%s does not go on the stage", kind.Item)
		}
	}
	for plate := range culturePlates {
		if !microscopePlates[plate] {
			t.Errorf("%s does not go on the stage", plate)
		}
	}
	if !microscopePlates[usedDish] {
		t.Error("a used dish does not go on the stage")
	}
	// One thing on the stage at a time.
	book, w, _ := newMicroBook()
	book.prepare(w, storageEye, microAt("culture_yeast", "x"))
	if got, _ := book.prepare(w, storageEye, microAt("dirt", "y")); got.Reason != "occupied" {
		t.Fatalf("a slide on a plate: %+v", got)
	}
	// A dish is no inoculum, though it goes on the stage; a culture plate is.
	for _, dish := range []string{"agar_plate", "agar_plate_unsterile", usedDish} {
		if species, ok := cultureInoculum(dish); ok {
			t.Errorf("%s inoculates %s", dish, species)
		}
	}
	if species, ok := cultureInoculum("culture_mould"); !ok || species != mouldSpecies {
		t.Error("a mould plate does not inoculate mould")
	}
}
