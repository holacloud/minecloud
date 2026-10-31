package network

import (
	"math"
	"sort"
	"time"
)

// Proximity voice chat. Audio flows peer to peer between browsers (WebRTC); the server only
// decides who talks to whom. Once a second it pairs up the players with voice on that are close
// to each other, nearest first, with at most MaxPeers links per player, and tells every player
// whose set changed with a "voicePeers" message. Links are symmetric (if A hears B, B hears A).
// A link is made within Range blocks and kept until DropRange, so players at the edge do not
// connect and disconnect over and over.

type VoiceConfig struct {
	MaxPeers  int
	Range     float64
	DropRange float64
}

var voiceConfig = VoiceConfig{MaxPeers: 8, Range: 24, DropRange: 32}

func ConfigureVoice(config VoiceConfig) {
	if config.MaxPeers > 0 {
		voiceConfig.MaxPeers = config.MaxPeers
	}
	if config.Range > 0 {
		voiceConfig.Range = config.Range
		voiceConfig.DropRange = math.Max(config.Range, config.DropRange)
	}
}

type voicePlayer struct {
	ID      string
	X, Y, Z float64
}

type voiceLinks map[string]map[string]bool

func (links voiceLinks) add(a, b string) {
	if links[a] == nil {
		links[a] = map[string]bool{}
	}
	if links[b] == nil {
		links[b] = map[string]bool{}
	}
	links[a][b] = true
	links[b][a] = true
}

// planVoiceLinks decides the links for the next second. Existing links that are still within
// DropRange go first (so a newcomer never breaks a conversation), then new pairs within Range,
// each group nearest first; a pair is linked while both players have room left. It also
// reports which players had more candidates in range than room (they hear only the nearest).
func planVoiceLinks(players []voicePlayer, current voiceLinks, config VoiceConfig) (voiceLinks, map[string]bool) {
	type pair struct {
		a, b     string
		distance float64
		kept     bool
	}
	pairs := []pair{}
	for i := 0; i < len(players); i++ {
		for j := i + 1; j < len(players); j++ {
			a, b := players[i], players[j]
			distance := math.Sqrt((a.X-b.X)*(a.X-b.X) + (a.Y-b.Y)*(a.Y-b.Y) + (a.Z-b.Z)*(a.Z-b.Z))
			kept := current[a.ID][b.ID] && distance <= config.DropRange
			if kept || distance <= config.Range {
				pairs = append(pairs, pair{a.ID, b.ID, distance, kept})
			}
		}
	}
	sort.SliceStable(pairs, func(i, j int) bool {
		if pairs[i].kept != pairs[j].kept {
			return pairs[i].kept
		}
		return pairs[i].distance < pairs[j].distance
	})

	links := voiceLinks{}
	full := map[string]bool{}
	for _, p := range pairs {
		if len(links[p.a]) >= config.MaxPeers || len(links[p.b]) >= config.MaxPeers {
			if len(links[p.a]) >= config.MaxPeers {
				full[p.a] = true
			}
			if len(links[p.b]) >= config.MaxPeers {
				full[p.b] = true
			}
			continue
		}
		links.add(p.a, p.b)
	}
	return links, full
}

func sameVoicePeers(a, b map[string]bool) bool {
	if len(a) != len(b) {
		return false
	}
	for id := range a {
		if !b[id] {
			return false
		}
	}
	return true
}

// runVoiceMesh recomputes the links every second and sends each player its peers when they
// (or its "full" state) change.
func runVoiceMesh() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	current := voiceLinks{}
	wasFull := map[string]bool{}
	for range ticker.C {
		clientsMu.RLock()
		voiceOn := map[string]bool{}
		for client := range clients {
			if client.voiceEnabled {
				voiceOn[client.ID] = true
			}
		}
		clientsMu.RUnlock()

		stateMu.Lock()
		players := []voicePlayer{}
		for id := range voiceOn {
			if player, ok := gameState.Players[id]; ok {
				players = append(players, voicePlayer{ID: id, X: player.X, Y: player.Y, Z: player.Z})
			}
		}
		stateMu.Unlock()

		next, full := planVoiceLinks(players, current, voiceConfig)
		notify := map[string]bool{}
		for id := range current {
			notify[id] = true
		}
		for id := range next {
			notify[id] = true
		}
		for id := range full {
			notify[id] = true
		}
		for id := range wasFull {
			notify[id] = true
		}
		for id := range notify {
			if sameVoicePeers(current[id], next[id]) && full[id] == wasFull[id] {
				continue
			}
			peers := []string{}
			for peer := range next[id] {
				peers = append(peers, peer)
			}
			sort.Strings(peers)
			sendToPlayer(id, createMessage("voicePeers", map[string]interface{}{
				"peers": peers,
				"full":  full[id],
				"range": voiceConfig.DropRange,
			}))
		}
		current = next
		wasFull = full
	}
}
