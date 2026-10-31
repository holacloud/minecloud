package network

import (
	"testing"
	"time"
)

type fakeCropWorld map[[3]int]string

func (w fakeCropWorld) Block(x, y, z int) (string, error) {
	if name, ok := w[[3]int{x, y, z}]; ok {
		return name, nil
	}
	return "air", nil
}

func (w fakeCropWorld) SetBlock(x, y, z int, name string) error {
	if name == "" {
		name = "air"
	}
	w[[3]int{x, y, z}] = name
	return nil
}

func zeroRand() float64 { return 0 }

func TestParseCrop(t *testing.T) {
	cases := []struct {
		name  string
		kind  string
		stage int
		ok    bool
	}{
		{"wheat_0", "wheat", 0, true},
		{"wheat_3", "wheat", 3, true},
		{"wheat_4", "", 0, false},
		{"wheat_x", "", 0, false},
		{"wheat", "", 0, false},
		{"tall_grass", "", 0, false},
		{"farmland", "", 0, false},
		{"", "", 0, false},
	}
	for _, c := range cases {
		kind, stage, ok := parseCrop(c.name)
		if kind != c.kind || stage != c.stage || ok != c.ok {
			t.Errorf("parseCrop(%q) = %q, %d, %v; want %q, %d, %v", c.name, kind, stage, ok, c.kind, c.stage, c.ok)
		}
	}
}

func TestTrackBlock(t *testing.T) {
	registry := map[string]Crop{}
	now := time.Unix(1000, 0)

	if !trackBlockLocked(registry, 1, 2, 3, "wheat_0", now, zeroRand) {
		t.Fatal("planting a crop should change the registry")
	}
	crop, ok := registry[blockKey(1, 2, 3)]
	if !ok || crop.Stage != 0 || crop.Kind != "wheat" {
		t.Fatalf("crop not tracked: %+v", registry)
	}
	if crop.NextGrowth != now.Add(cropStageMin).Unix() {
		t.Errorf("next growth %d, want %d", crop.NextGrowth, now.Add(cropStageMin).Unix())
	}

	if trackBlockLocked(registry, 5, 5, 5, "stone", now, zeroRand) {
		t.Error("placing a plain block where no crop was should not change the registry")
	}
	if trackBlockLocked(registry, 5, 5, 5, "wheat_3", now, zeroRand) {
		t.Error("a ripe crop is not tracked")
	}
	if !trackBlockLocked(registry, 1, 2, 3, "", now, zeroRand) {
		t.Error("breaking a crop should change the registry")
	}
	if len(registry) != 0 {
		t.Errorf("registry should be empty: %+v", registry)
	}
}

func TestGrowCrops(t *testing.T) {
	w := fakeCropWorld{{0, 10, 0}: "farmland", {0, 11, 0}: "wheat_0"}
	registry := map[string]Crop{}
	now := time.Unix(1000, 0)
	trackBlockLocked(registry, 0, 11, 0, "wheat_0", now, zeroRand)

	// Not due yet.
	if grown, changed := growCropsLocked(registry, w, now, zeroRand); len(grown) != 0 || changed {
		t.Fatalf("crop grew too early: %+v", grown)
	}

	// Three stages later it is ripe and no longer tracked.
	for stage := 1; stage <= 3; stage++ {
		now = now.Add(cropStageMin)
		grown, changed := growCropsLocked(registry, w, now, zeroRand)
		want := "wheat_" + string(rune('0'+stage))
		if !changed || len(grown) != 1 || grown[0].BlockType != want {
			t.Fatalf("stage %d: grown %+v, changed %v", stage, grown, changed)
		}
		if w[[3]int{0, 11, 0}] != want {
			t.Fatalf("stage %d: world has %q", stage, w[[3]int{0, 11, 0}])
		}
	}
	if len(registry) != 0 {
		t.Errorf("ripe crop still tracked: %+v", registry)
	}
}

func TestGrowCropsForgetsChangedBlocks(t *testing.T) {
	now := time.Unix(1000, 0)
	w := fakeCropWorld{{0, 10, 0}: "farmland", {0, 11, 0}: "stone", {4, 10, 0}: "dirt", {4, 11, 0}: "wheat_1"}
	registry := map[string]Crop{}
	trackBlockLocked(registry, 0, 11, 0, "wheat_0", now, zeroRand) // replaced by stone
	trackBlockLocked(registry, 4, 11, 0, "wheat_1", now, zeroRand) // soil is no longer farmland

	grown, changed := growCropsLocked(registry, w, now.Add(time.Hour), zeroRand)
	if len(grown) != 0 || !changed || len(registry) != 0 {
		t.Fatalf("grown %+v, changed %v, registry %+v", grown, changed, registry)
	}
	if w[[3]int{0, 11, 0}] != "stone" || w[[3]int{4, 11, 0}] != "wheat_1" {
		t.Errorf("world was modified: %+v", w)
	}
}
