package network

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// ---- Stains ----

func TestStainIsSavedOnTheSlideAndSharedWithWatchers(t *testing.T) {
	book, w, clock := newMicroBook()
	book.prepare(w, storageEye, microAt("cheek", "1"))
	*clock = clock.Add(10 * time.Second)
	got, changed := book.stainSlide(w, storageEye, microAt("methylene_blue", "2"))
	// Amount 1 is what makes the client hand the bottle's glass back; the bottle itself is used up.
	if got.Amount != 1 || got.Type != "methylene_blue" || !changed {
		t.Fatalf("stain: %+v, changed %v", got, changed)
	}
	prep := book.blocks[blockKey(0, 0, 0)].Prep
	if prep.Stain != "methylene_blue" || prep.StainedAt != float64(clock.Unix()) {
		t.Fatalf("prep: %+v", prep)
	}
	place, _ := book.locate(w, 0, 0, 0)
	data, err := json.Marshal(book.snapshotLocked(place))
	if err != nil || !strings.Contains(string(data), `"stain":"methylene_blue"`) {
		t.Fatalf("what a watcher is told: %s, %v", data, err)
	}
	// A slide with no stain says nothing about it.
	fresh, freshWorld, _ := newMicroBook()
	fresh.prepare(freshWorld, storageEye, microAt("cheek", "1"))
	freshPlace, _ := fresh.locate(freshWorld, 0, 0, 0)
	if data, _ := json.Marshal(fresh.snapshotLocked(freshPlace)); strings.Contains(string(data), "stain") {
		t.Fatalf("an unstained slide: %s", data)
	}
}

// The same request is answered from the log: the bottle is not spent twice, and its glass not given twice.
func TestStainRepeatedIsNotDoneTwice(t *testing.T) {
	book, w, _ := newMicroBook()
	book.prepare(w, storageEye, microAt("cheek", "1"))
	first, _ := book.stainSlide(w, storageEye, microAt("iodine_tincture", "2"))
	again, changed := book.stainSlide(w, storageEye, microAt("iodine_tincture", "2"))
	if again != first || changed {
		t.Fatalf("repeat: %+v, changed %v", again, changed)
	}
}

func TestStainRefusals(t *testing.T) {
	book, w, _ := newMicroBook()
	// An empty stage has nothing to stain, and the client gives the bottle back.
	if got, changed := book.stainSlide(w, storageEye, microAt("iodine_tincture", "1")); got.Amount != 0 || got.Reason != "gone" || changed {
		t.Fatalf("empty stage: %+v", got)
	}
	book.prepare(w, storageEye, microAt("cheek", "2"))
	for _, source := range []string{"", "water_flask", "ink", "IODINE_TINCTURE", "cheek"} {
		if got, changed := book.stainSlide(w, storageEye, microAt(source, "bad"+strings.ToLower(source))); got.Amount != 0 || got.Reason != "not a stain" || changed {
			t.Errorf("%q: %+v", source, got)
		}
	}
	if got, _ := book.stainSlide(w, &[3]float64{30, 0, 0}, microAt("iodine_tincture", "far")); got.Amount != 0 || got.Reason != "too far" {
		t.Errorf("too far: %+v", got)
	}
	if got, _ := book.stainSlide(w, nil, microAt("iodine_tincture", "nopos")); got.Reason != "too far" {
		t.Errorf("no position: %+v", got)
	}
	if got, _ := book.stainSlide(fakeCropWorld{{0, 0, 0}: "chest"}, storageEye, microAt("iodine_tincture", "chest")); got.Reason != "not a microscope" {
		t.Errorf("on a chest: %+v", got)
	}
	if prep := book.blocks[blockKey(0, 0, 0)].Prep; prep.Stain != "" {
		t.Fatalf("a refusal stained it: %+v", prep)
	}
	// One to a slide, even of the same bottle.
	book.stainSlide(w, storageEye, microAt("iodine_tincture", "good"))
	for _, source := range []string{"iodine_tincture", "methylene_blue"} {
		if got, changed := book.stainSlide(w, storageEye, microAt(source, "second"+source)); got.Amount != 0 || got.Reason != "stained" || changed {
			t.Errorf("second stain %s: %+v", source, got)
		}
	}
	if prep := book.blocks[blockKey(0, 0, 0)].Prep; prep.Stain != "iodine_tincture" {
		t.Fatalf("the second one replaced it: %+v", prep)
	}
}

// What the lesson costs: nothing comes off a stained slide, and nothing on it comes back.
func TestStainedSlideRefusesCaptureAndDrop(t *testing.T) {
	book, w, _ := newMicroBook()
	book.prepare(w, storageEye, microAt("sample_moss_a", "1"))
	book.stainSlide(w, storageEye, microAt("iodine_tincture", "2"))
	prep := book.blocks[blockKey(0, 0, 0)].Prep
	before := *prep
	if got, changed := book.capture(w, storageEye, microAt("", "3")); got.Amount != 0 || got.Reason != "stained" || changed {
		t.Fatalf("capture: %+v", got)
	}
	if got, changed := book.dropWater(w, storageEye, microAt("", "4")); got.Amount != 0 || got.Reason != "stained" || changed {
		t.Fatalf("drop: %+v", got)
	}
	if *prep != before {
		t.Fatalf("a refusal changed the slide: %+v", prep)
	}
}

// A tun stained on a dry slide stays a tun for good: the drop that would revive it is refused.
func TestStainedTunIsNotRevived(t *testing.T) {
	book, w, _ := newMicroBook()
	book.prepare(w, storageEye, microAt(tardigradeTun, "1"))
	book.stainSlide(w, storageEye, microAt("methylene_blue", "2"))
	if got, _ := book.dropWater(w, storageEye, microAt("", "3")); got.Reason != "stained" {
		t.Fatalf("drop: %+v", got)
	}
	if book.blocks[blockKey(0, 0, 0)].Prep.Revived {
		t.Fatal("it came back")
	}
	if got, _ := book.capture(w, storageEye, microAt("", "4")); got.Reason != "stained" {
		t.Fatalf("capture: %+v", got)
	}
}

// Its clock stops when it is stained: as wet as it was, however long it stays on the stage.
func TestStainedSlideStopsDrying(t *testing.T) {
	book, w, clock := newMicroBook()
	book.prepare(w, storageEye, microAt("sample_moss_a", "1"))
	*clock = clock.Add(40 * time.Second)
	book.stainSlide(w, storageEye, microAt("iodine_tincture", "2"))
	*clock = clock.Add(10 * microscopeDrySeconds * time.Second)
	view := book.microscopeViewOf(book.blocks[blockKey(0, 0, 0)])
	if view.Age != 40 || view.Woke != -1 {
		t.Fatalf("view: %+v", view)
	}
	// Stained in the middle of coming back, it stays there too.
	book, w, clock = newMicroBook()
	book.prepare(w, storageEye, microAt(tardigradeTun, "1"))
	book.dropWater(w, storageEye, microAt("", "2"))
	*clock = clock.Add(5 * time.Second)
	book.stainSlide(w, storageEye, microAt("iodine_tincture", "3"))
	*clock = clock.Add(100 * time.Second)
	if view := book.microscopeViewOf(book.blocks[blockKey(0, 0, 0)]); view.Woke != 5 || view.Age != 5 {
		t.Fatalf("waking view: %+v", view)
	}
}

// Taking the slide off clears the stain: the next one starts clean.
func TestClearingTakesTheStainAway(t *testing.T) {
	book, w, _ := newMicroBook()
	book.prepare(w, storageEye, microAt("cheek", "1"))
	book.stainSlide(w, storageEye, microAt("methylene_blue", "2"))
	if got, changed := book.clearSlide(w, storageEye, microAt("", "3")); got.Amount != 1 || got.Type != glassSlide || !changed {
		t.Fatalf("clear: %+v", got)
	}
	if _, ok := book.blocks[blockKey(0, 0, 0)]; ok {
		t.Fatal("the slide is still there")
	}
	book.prepare(w, storageEye, microAt("sample_moss_a", "4"))
	prep := book.blocks[blockKey(0, 0, 0)].Prep
	if prep.Stain != "" || prep.StainedAt != 0 {
		t.Fatalf("the new slide is stained: %+v", prep)
	}
	if got, _ := book.capture(w, storageEye, microAt("", "5")); got.Amount != 1 {
		t.Fatalf("the new slide is not fixed: %+v", got)
	}
}

// Breaking the microscope gives the same as taking it off: the slide, and no stain behind.
func TestBreakingAStainedMicroscopeGivesTheSlideBack(t *testing.T) {
	book, w, _ := newMicroBook()
	book.prepare(w, storageEye, microAt("cheek", "1"))
	book.stainSlide(w, storageEye, microAt("methylene_blue", "2"))
	spill, _, err := book.replace(w, 0, 0, 0, "", func() (bool, error) {
		delete(w, [3]int{0, 0, 0})
		return true, nil
	})
	if err != nil || len(spill) != 1 || spill[0].Type != glassSlide || spill[0].Count != 1 {
		t.Fatalf("spill: %+v %v", spill, err)
	}
}

// A stained slide lasts through a save and a restart.
func TestStainPersists(t *testing.T) {
	book, w, clock := newMicroBook()
	book.prepare(w, storageEye, microAt("sample_mountain_lake_b", "1"))
	*clock = clock.Add(30 * time.Second)
	book.stainSlide(w, storageEye, microAt("iodine_tincture", "2"))
	*clock = clock.Add(500 * time.Second)

	blocks, outcomes := book.snapshot()
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
	if block.Prep == nil || block.Prep.Stain != "iodine_tincture" {
		t.Fatalf("lost: %+v", block.Prep)
	}
	if view := restarted.microscopeViewOf(block); view.Age != 30 {
		t.Fatalf("view: %+v", view)
	}
	if got, _ := restarted.capture(w, storageEye, microAt("", "3")); got.Reason != "stained" {
		t.Fatalf("still fixed: %+v", got)
	}
}

func TestLoadLimitsWhatASavedStainClaims(t *testing.T) {
	slots := []StorageSlot{{Type: glassSlide, Count: 1}}
	book, _, _ := newMicroBook()
	book.load(map[string]StorageBlock{
		blockKey(0, 0, 0): {Slots: slots, Prep: &MicroscopePrep{Source: "cheek", Stain: "gold_block", StainedAt: 50}},
		blockKey(1, 0, 0): {X: 1, Slots: slots, Prep: &MicroscopePrep{Source: "cheek", WetAt: 100, Stain: "iodine_tincture", StainedAt: 5}},
	}, nil)
	if prep := book.blocks[blockKey(0, 0, 0)].Prep; prep.Stain != "" || prep.StainedAt != 0 {
		t.Errorf("unknown stain kept: %+v", prep)
	}
	if prep := book.blocks[blockKey(1, 0, 0)].Prep; prep.Stain != "iodine_tincture" || prep.StainedAt != 100 {
		t.Errorf("clock before it was wet: %+v", prep)
	}
}
