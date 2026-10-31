package network

import "testing"

func TestCheckCreativeKey(t *testing.T) {
	defer ConfigureCreative("")

	ConfigureCreative("")
	if checkCreativeKey("") || checkCreativeKey("anything") {
		t.Fatal("an empty creative key must disable creative mode")
	}

	ConfigureCreative(" 0F1E2D3C-4B5A-4978-8695-A4B3C2D1E0F9 ")
	cases := map[string]bool{
		"0f1e2d3c-4b5a-4978-8695-a4b3c2d1e0f9":    true,
		" 0F1E2D3C-4b5a-4978-8695-a4b3c2d1e0f9\n": true,
		"0f1e2d3c-4b5a-4978-8695-a4b3c2d1e0f8":    false,
		"":                                        false,
		"1234":                                    false,
	}
	for key, want := range cases {
		if got := checkCreativeKey(key); got != want {
			t.Errorf("checkCreativeKey(%q) = %v, want %v", key, got, want)
		}
	}
}
