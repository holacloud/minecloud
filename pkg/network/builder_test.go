package network

import (
	"testing"
)

// A blockPlace from builder mode's palette.
type builderPlace struct {
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Z         int    `json:"z"`
	BlockType string `json:"blockType"`
	Palette   bool   `json:"palette,omitempty"`
}

// builderTry sends a placement and says what came back: the refusal (nil if none) and what the cell holds.
func builderTry(t *testing.T, client *Client, place builderPlace) (*claimRefusal, string) {
	t.Helper()
	claimSend(t, client, "blockPlace", place)
	refusal := claimRefusalOf(t, claimHeard(client))
	return refusal, claimBlockAt(t, place.X, place.Y, place.Z)
}

func TestThePaletteIsBuildingAndDecorationOnly(t *testing.T) {
	for _, in := range []string{"stone", "planks", "oak_door", "oak_door:upper:e", "red_curtain:w:open", "glass", "chest", "torch", "white_sofa", "ladder"} {
		if !builderPaletteType(in) {
			t.Errorf("%s is in the palette", in)
		}
	}
	for _, out := range []string{"claim_marker", "oven", "microscope", "iron_ore", "coal_ore", "bread", "wooden_pickaxe", "battery", "electric_lamp",
		"lever", "incubator", "foundry", "fridge", "element_fe", "cow_egg", "wheat_seeds", "agar_plate", "", "air"} {
		if builderPaletteType(out) {
			t.Errorf("%s is not in the palette", out)
		}
	}
	if len(builderPalette) != 243 {
		t.Errorf("the palette has %d items; test/js/builder.test.js lists what it should be", len(builderPalette))
	}
}

func TestPalettePlacementsOnlyInsideAPlotOfTheSendersAndOnlyForPaletteTypes(t *testing.T) {
	claimWorld(t)
	ana, beto, cris := claimWithGuest(t)
	admin := claimClient(t, "Admin", plrAdm, 0.5, 121.6, 0.5)
	admin.creative.Store(true)

	// The owner and her guest build from the palette in her plot.
	if r, got := builderTry(t, ana, builderPlace{X: 101, Y: 120, Z: 101, BlockType: "stone_bricks", Palette: true}); r != nil || got != "stone_bricks" {
		t.Fatalf("Ana in her plot: %+v, %q", r, got)
	}
	if r, got := builderTry(t, beto, builderPlace{X: 102, Y: 120, Z: 101, BlockType: "glass", Palette: true}); r != nil || got != "glass" {
		t.Fatalf("Beto as a guest: %+v, %q", r, got)
	}
	// The whole plot, to its edges.
	for _, cell := range [][2]int{{92, 92}, {108, 108}, {92, 108}} {
		if r, got := builderTry(t, ana, builderPlace{X: cell[0], Y: 120, Z: cell[1], BlockType: "planks", Palette: true}); r != nil || got != "planks" {
			t.Fatalf("%v is in Ana's plot: %+v, %q", cell, r, got)
		}
	}

	// Not what is outside the palette, even there; and nothing is given back.
	for _, item := range []string{"oven", "microscope", "iron_ore", "claim_marker"} {
		r, got := builderTry(t, ana, builderPlace{X: 103, Y: 120, Z: 101, BlockType: item, Palette: true})
		if r == nil || r.Reason != claimReasonPalette || r.Placed != "" || (got != "air" && got != "") {
			t.Fatalf("%s from the palette: %+v, %q", item, r, got)
		}
	}
	if claims.holds(plrBeto) {
		t.Fatal("a marker from the palette claimed a plot")
	}

	// Not by a stranger in Ana's plot, not outside any plot, not at spawn; the admin neither.
	cases := []struct {
		who    *Client
		x, z   int
		reason string
		owner  string
	}{
		{cris, 104, 101, claimReasonPlot, "Ana"},
		{ana, 109, 100, claimReasonBuilder, ""},
		{ana, 300, 300, claimReasonBuilder, ""},
		{beto, 300, 300, claimReasonBuilder, ""},
		{ana, 0, 0, claimReasonSpawn, ""},
		{admin, 300, 300, claimReasonBuilder, ""},
		{admin, 0, 0, claimReasonSpawn, ""},
	}
	for _, c := range cases {
		r, got := builderTry(t, c.who, builderPlace{X: c.x, Y: 120, Z: c.z, BlockType: "stone", Palette: true})
		if r == nil || r.Reason != c.reason || r.Owner != c.owner || r.Placed != "" || (got != "air" && got != "") {
			t.Fatalf("%s at %d,%d: %+v, %q", c.who.username, c.x, c.z, r, got)
		}
	}

	// The marker stays its owner's: a guest's palette block does not cover it.
	if r, _ := builderTry(t, beto, builderPlace{X: 100, Y: 120, Z: 100, BlockType: "stone", Palette: true}); r == nil || r.Reason != claimReasonOwnerOnly {
		t.Fatalf("Beto over the marker: %+v", r)
	}
	if !claims.holds(plrAna) {
		t.Fatal("Ana's plot is gone")
	}
}

func TestNormalPlacementsAreUnchangedByBuilderMode(t *testing.T) {
	claimWorld(t)
	ana, _, cris := claimWithGuest(t)
	// Anything, palette type or not, outside plots and in her own plot.
	for _, place := range []builderPlace{{X: 300, Y: 120, Z: 300, BlockType: "stone"}, {X: 301, Y: 120, Z: 300, BlockType: "oven"}, {X: 101, Y: 120, Z: 102, BlockType: "microscope"}} {
		if r, got := builderTry(t, ana, place); r != nil || got != place.BlockType {
			t.Fatalf("%+v: %+v, %q", place, r, got)
		}
	}
	// A stranger is refused as always, and gets the block back.
	if r, _ := builderTry(t, cris, builderPlace{X: 104, Y: 120, Z: 104, BlockType: "stone"}); r == nil || r.Reason != claimReasonPlot || r.Placed != "stone" {
		t.Fatalf("Cris in Ana's plot: %+v", r)
	}
}
