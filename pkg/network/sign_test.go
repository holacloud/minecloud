package network

import (
	"strings"
	"testing"
)

func TestIsSignBlockSeesEveryState(t *testing.T) {
	for _, name := range []string{"sign", "sign:e:post", "sign:n:wall", "sign:w:post"} {
		if !isSignBlock(name) {
			t.Errorf("%s is a sign", name)
		}
	}
	for _, name := range []string{"", "signal", "sign_post", "bed", "oak_door:upper:n:left:open"} {
		if isSignBlock(name) {
			t.Errorf("%s is not a sign", name)
		}
	}
}

func TestPlacedSignKeepsTextAndVotesInEveryState(t *testing.T) {
	for _, name := range []string{"sign", "sign:e:post", "sign:s:wall"} {
		payload := Block{BlockType: name, Text: strings.Repeat("x", 400)}
		sanitizeSignPayload(&payload)
		if len(payload.Text) != 288 {
			t.Errorf("%s: %d bytes of text kept", name, len(payload.Text))
		}
		if payload.Votes == nil || len(payload.Votes) != 5 {
			t.Errorf("%s: votes %v", name, payload.Votes)
		}
		if !hasBlockMetadata(payload) {
			t.Errorf("%s: its text must be saved in world.json", name)
		}
	}
	other := Block{BlockType: "stone", Text: "nope", Votes: map[string]int{"star": 1}}
	sanitizeSignPayload(&other)
	if other.Text != "" || other.Votes != nil {
		t.Errorf("a stone keeps no text: %+v", other)
	}
}

func TestSignsAndBedsStayOutOfRamsAndSunlight(t *testing.T) {
	for _, name := range []string{"sign", "sign:e:post", "sign:n:wall", "bed", "bed:e", "bed:w"} {
		if mechMovable(name) {
			t.Errorf("a ram must not move %s", name)
		}
	}
	for _, name := range []string{"sign", "sign:e:post", "sign:n:wall", "glass", "air"} {
		if !powerLetsSunThrough(name) {
			t.Errorf("%s lets the sun through", name)
		}
	}
	if powerLetsSunThrough("stone") {
		t.Error("stone is a roof")
	}
}
