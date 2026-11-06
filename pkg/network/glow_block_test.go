package network

import "testing"

func TestGlowValidName(t *testing.T) {
	for _, name := range []string{"glow_block", "glow_block:k2700", "glow_block:k4000", "glow_block:k5000", "glow_block:k6500", "glow_block:rgb000", "glow_block:rgb555", "glow_block:rgb503"} {
		if !glowValidName(name) {
			t.Errorf("%q refused", name)
		}
	}
	for _, name := range []string{"", "stone", "glow_block:", "glow_block:k3000", "glow_block:k1000", "glow_block:k02700", "glow_block:rgb", "glow_block:rgb56", "glow_block:rgb600", "glow_block:rgb0000", "glow_block:rgbabc", "glow_block:on", "glow_blocks:rgb000", "glow_block:rgb000:x"} {
		if glowValidName(name) {
			t.Errorf("%q accepted", name)
		}
	}
	// 5 temperatures and 6 levels per channel.
	count := 0
	for _, kelvin := range glowKelvins {
		if kelvin == 3000 || glowValidName("glow_block:k"+itoaForTest(kelvin)) {
			count++
		}
	}
	if count != 5 || glowLevels != 6 {
		t.Fatalf("%d temperatures, %d levels", count, glowLevels)
	}
}

func itoaForTest(v int) string {
	digits := ""
	for ; v > 0; v /= 10 {
		digits = string(rune('0'+v%10)) + digits
	}
	return digits
}

func TestGlowSanitizeName(t *testing.T) {
	cases := map[string]string{
		"glow_block:rgb503": "glow_block:rgb503", "glow_block:rgb999": "glow_block", "glow_block:hack": "glow_block",
		"glow_block": "glow_block", "stone": "stone", "electric_lamp:on": "electric_lamp:on",
	}
	for name, want := range cases {
		if got := glowSanitizeName(name); got != want {
			t.Errorf("%q became %q, want %q", name, got, want)
		}
	}
}

func TestGlowApply(t *testing.T) {
	book, _ := newTestBook()
	w := fakeCropWorld{{0, 0, 0}: "glow_block", {1, 0, 0}: "stone"}
	eye := &[3]float64{0.5, 1.5, 0.5}
	write := func(x, y, z int, name string) func() (bool, error) {
		return func() (bool, error) { return true, w.SetBlock(x, y, z, name) }
	}

	block, done := glowApply(book, w, eye, 0, 0, 0, "glow_block:rgb503", write(0, 0, 0, "glow_block:rgb503"))
	if !done || block.BlockType != "glow_block:rgb503" || w[[3]int{0, 0, 0}] != "glow_block:rgb503" {
		t.Fatalf("change: %+v, %v, %q", block, done, w[[3]int{0, 0, 0}])
	}
	// The same colour: nothing to tell anyone.
	if _, done := glowApply(book, w, eye, 0, 0, 0, "glow_block:rgb503", write(0, 0, 0, "glow_block:rgb503")); done {
		t.Fatal("no change announced as one")
	}
	// A name that is no colour, or asked of another block, changes nothing.
	if _, done := glowApply(book, w, eye, 0, 0, 0, "glow_block:rgb777", write(0, 0, 0, "glow_block:rgb777")); done || w[[3]int{0, 0, 0}] != "glow_block:rgb503" {
		t.Fatal("a bad name went through")
	}
	if _, done := glowApply(book, w, eye, 0, 0, 0, "stone", write(0, 0, 0, "stone")); done {
		t.Fatal("it turned a glow block into stone")
	}
	if _, done := glowApply(book, w, eye, 1, 0, 0, "glow_block:k6500", write(1, 0, 0, "glow_block:k6500")); done || w[[3]int{1, 0, 0}] != "stone" {
		t.Fatal("it turned stone into a glow block")
	}
	// Too far, or from a player who has not joined.
	if _, done := glowApply(book, w, &[3]float64{30, 0, 0}, 0, 0, 0, "glow_block", write(0, 0, 0, "glow_block")); done {
		t.Fatal("too far went through")
	}
	if _, done := glowApply(book, w, nil, 0, 0, 0, "glow_block", write(0, 0, 0, "glow_block")); done {
		t.Fatal("no position went through")
	}
	// Broken just before: nothing brings it back.
	delete(w, [3]int{0, 0, 0})
	if _, done := glowApply(book, w, eye, 0, 0, 0, "glow_block", write(0, 0, 0, "glow_block")); done || w[[3]int{0, 0, 0}] != "" {
		t.Fatal("a broken block came back")
	}
}

func TestGlowBlockIsNotElectric(t *testing.T) {
	if powerKindOf("glow_block:rgb503") != "" || powerKindOf("glow_block") != "" {
		t.Fatal("a glow block needs no power")
	}
	// As any plain block, a ram can push it, colour and all.
	if !mechMovable("glow_block:rgb503") {
		t.Fatal("a ram should move it")
	}
}
