package network

import (
	"encoding/json"
	"strings"
	"testing"
)

// The left hand travels in playerMove: what comes in goes out, and a client that knows nothing of it
// (or an empty hand) adds nothing to the message.
func TestPlayerOffhandItemRoundTrip(t *testing.T) {
	var player Player
	if err := json.Unmarshal([]byte(`{"id":"a","heldItem":"stone","offhandItem":"torch","x":1}`), &player); err != nil {
		t.Fatal(err)
	}
	if player.OffhandItem != "torch" || player.HeldItem != "stone" {
		t.Fatalf("read %+v", player)
	}
	out, err := json.Marshal(player)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `"offhandItem":"torch"`) {
		t.Fatalf("not sent on: %s", out)
	}

	var old Player
	if err := json.Unmarshal([]byte(`{"id":"a","heldItem":"stone"}`), &old); err != nil {
		t.Fatal(err)
	}
	out, err = json.Marshal(old)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), "offhandItem") {
		t.Fatalf("an empty left hand should add nothing: %s", out)
	}
}
