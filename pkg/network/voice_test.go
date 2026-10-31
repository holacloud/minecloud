package network

import (
	"fmt"
	"testing"
)

func TestPlanVoiceLinksNearestFirstWithCap(t *testing.T) {
	config := VoiceConfig{MaxPeers: 2, Range: 24, DropRange: 32}
	players := []voicePlayer{
		{ID: "a", X: 0},
		{ID: "b", X: 5},
		{ID: "c", X: 10},
		{ID: "d", X: 15},
		{ID: "far", X: 100},
	}
	links, full := planVoiceLinks(players, voiceLinks{}, config)

	for id, peers := range links {
		if len(peers) > config.MaxPeers {
			t.Errorf("%s has %d peers, max %d", id, len(peers), config.MaxPeers)
		}
		for peer := range peers {
			if !links[peer][id] {
				t.Errorf("link %s-%s is not symmetric", id, peer)
			}
		}
	}
	if len(links["far"]) != 0 {
		t.Errorf("a player out of range got peers: %v", links["far"])
	}
	if !links["a"]["b"] || !links["b"]["c"] || !links["c"]["d"] {
		t.Errorf("nearest neighbours should be linked: %v", links)
	}
	if !full["b"] && !full["c"] {
		t.Errorf("someone with more candidates than room should be reported full: %v", full)
	}
}

func TestPlanVoiceLinksHysteresisAndStickiness(t *testing.T) {
	config := VoiceConfig{MaxPeers: 1, Range: 24, DropRange: 32}

	// 28 blocks apart: too far to connect, close enough to stay connected.
	apart := []voicePlayer{{ID: "a", X: 0}, {ID: "b", X: 28}}
	if links, _ := planVoiceLinks(apart, voiceLinks{}, config); len(links["a"]) != 0 {
		t.Errorf("new link beyond Range: %v", links)
	}
	existing := voiceLinks{}
	existing.add("a", "b")
	if links, _ := planVoiceLinks(apart, existing, config); !links["a"]["b"] {
		t.Errorf("existing link within DropRange was dropped")
	}
	gone := []voicePlayer{{ID: "a", X: 0}, {ID: "b", X: 40}}
	if links, _ := planVoiceLinks(gone, existing, config); len(links["a"]) != 0 {
		t.Errorf("link beyond DropRange was kept: %v", links)
	}

	// A closer newcomer does not break a running conversation when there is no room.
	crowd := []voicePlayer{{ID: "a", X: 0}, {ID: "b", X: 20}, {ID: "c", X: 2}}
	links, _ := planVoiceLinks(crowd, existing, config)
	if !links["a"]["b"] || links["a"]["c"] {
		t.Errorf("existing link should win over a closer newcomer: %v", links)
	}
}

func TestPlanVoiceLinksCrowd(t *testing.T) {
	config := VoiceConfig{MaxPeers: 8, Range: 24, DropRange: 32}
	players := []voicePlayer{}
	for i := 0; i < 30; i++ {
		players = append(players, voicePlayer{ID: fmt.Sprintf("p%02d", i), X: float64(i % 6), Z: float64(i / 6)})
	}
	links, _ := planVoiceLinks(players, voiceLinks{}, config)
	for _, player := range players {
		if n := len(links[player.ID]); n == 0 || n > 8 {
			t.Errorf("%s has %d peers, want 1..8", player.ID, n)
		}
	}
}
