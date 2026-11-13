package network

import (
	"bytes"
	"encoding/json"
	"math"
	"strconv"
	"sync"
	"time"
)

// Where the other players are, told to each client. A client says where its player is ten times a second
// (playerMove); telling every one of those to everybody is as many messages as the square of the players,
// and with a hundred of them each child's tablet gets a thousand a second. So nothing is passed on as it
// comes: every movesConfig.Every (a fiftieth of a second) each client gets one message, playerMoves, with
//
//   - the players near it that have changed since it was last told: the movesConfig.Near nearest within
//     movesConfig.Range blocks (Manhattan), every time;
//   - the others within that range that have changed, each at most once every movesConfig.FarEvery;
//   - in `gone`, the ids of those it was told about that are no longer within range, or have left.
//
// What a client hears is then bounded by Near, however many are playing, and a player who stands still
// costs nothing. A player's name and looks go with the first time a client hears of them, and again only
// when they change (js/websocket.js keeps them).
//
// A move waits for its round, some more than others: told as they come out, a player walking straight
// would be seen going in jerks. So each goes with its `age`, the milliseconds since the server heard of
// it, and the client puts it back at its time (js/game/avatars.js).
//
// {players: [{id, x, y, z, yaw, pitch, heldItem?, offhandItem?, action?, mount?, mountYaw?,
//             username?, shirtColor?, hairStyle?, hairColor?, age?}], gone?: [id]}

type MovesConfig struct {
	// How many of the nearest players a client is told about at the full rate.
	Near int
	// How far, in blocks (|dx| + |dy| + |dz|), a client is told about a player at all.
	Range float64
	// How often, at most, it is told about those in range beyond the nearest.
	FarEvery time.Duration
	// The time between two rounds: what a move waits, at most, before the others are told. A shorter
	// one is less wait and more messages, each with fewer players in it. Never under movesEveryLeast.
	Every time.Duration
}

var movesConfig = MovesConfig{Near: 10, Range: 160, FarEvery: time.Second, Every: 20 * time.Millisecond}

// ConfigureMoves sets who a client is told about, before the server starts. A zero or negative value
// keeps the default.
func ConfigureMoves(config MovesConfig) {
	if config.Near > 0 {
		movesConfig.Near = config.Near
	}
	if config.Range > 0 {
		movesConfig.Range = config.Range
	}
	if config.FarEvery > 0 {
		movesConfig.FarEvery = config.FarEvery
	}
	if config.Every > 0 {
		movesConfig.Every = max(config.Every, movesEveryLeast)
	}
}

const (
	// Under this a round is no longer a way of putting moves together: telling each move as it comes
	// would be another mechanism (who is watching whom), and this is already less than a home network adds.
	movesEveryLeast = 20 * time.Millisecond
	// A player a client already knows of stays this much further: walking along the edge of the range
	// does not make them come and go.
	movesRangeSlack = 16.0
	movesAgeMost    = 2000
)

// What a client was last told of a player.
type movesSeen struct {
	rev, look uint64
	at        time.Time
	tick      uint64
}

// A player in one round: who it is, whose it is, and its entry of the message, made once for everybody.
type movesPlayer struct {
	player     Player
	client     *Client
	age        int64 // milliseconds its move has waited, in this round
	slim, full []byte
}

func movesRound(value, unit float64) float64 {
	return math.Round(value*unit) / unit
}

// entry is the player as it goes in playerMoves: without name and looks (slim) or with them.
func (p *movesPlayer) entry(full bool) []byte {
	if full && p.full != nil {
		return p.full
	}
	if !full && p.slim != nil {
		return p.slim
	}
	out := p.player
	// A centimetre and a twentieth of a degree: nobody sees less, and the numbers are a third as long.
	out.X, out.Y, out.Z = movesRound(out.X, 100), movesRound(out.Y, 100), movesRound(out.Z, 100)
	out.Yaw, out.Pitch, out.MountYaw = movesRound(out.Yaw, 1000), movesRound(out.Pitch, 1000), movesRound(out.MountYaw, 1000)
	if !full {
		out.Username, out.ShirtColor, out.HairStyle, out.HairColor = "", "", "", ""
	}
	data, _ := json.Marshal(out)
	if p.age > 0 {
		data = append(data[:len(data)-1], `,"age":`...)
		data = strconv.AppendInt(data, p.age, 10)
		data = append(data, '}')
	}
	if full {
		p.full = data
	} else {
		p.slim = data
	}
	return data
}

type movesCandidate struct {
	index    int
	distance float64
}

var (
	// One round at a time: everything below, and Client.moves, belongs to the round.
	movesMu         sync.Mutex
	movesTick       uint64
	movesPlayers    []movesPlayer
	movesCandidates []movesCandidate
	movesNearest    []float64
	movesGone       []string
	movesBuffer     bytes.Buffer
)

// playerMovesTick tells every client what has changed around it since the last round.
func playerMovesTick(now time.Time) {
	movesMu.Lock()
	defer movesMu.Unlock()
	config := movesConfig
	movesTick++

	players := movesPlayers[:0]
	stateMu.RLock()
	for id, player := range gameState.Players {
		// Until its first move a player is nowhere (the title screen).
		if player.Located {
			// No more than movesAgeMost: beyond it the move is old news, and when exactly says nothing.
			age := min(max(now.Sub(player.at).Milliseconds(), 0), movesAgeMost)
			players = append(players, movesPlayer{player: player, client: playerClients[id], age: age})
		}
	}
	stateMu.RUnlock()
	movesPlayers = players

	for i := range players {
		client := players[i].client
		if client == nil {
			continue
		}
		if client.moves == nil {
			client.moves = make(map[string]*movesSeen)
		}
		me := &players[i].player

		// Who is in range, and how far the Near-th nearest of them is.
		candidates := movesCandidates[:0]
		nearest := movesNearest[:0]
		for j := range players {
			if j == i {
				continue
			}
			other := &players[j].player
			distance := math.Abs(other.X-me.X) + math.Abs(other.Y-me.Y) + math.Abs(other.Z-me.Z)
			if distance > config.Range {
				if distance > config.Range+movesRangeSlack || client.moves[other.ID] == nil {
					continue
				}
			}
			candidates = append(candidates, movesCandidate{index: j, distance: distance})
			// Kept in order, and never longer than Near: a handful of comparisons for each.
			if len(nearest) < config.Near || distance < nearest[len(nearest)-1] {
				if len(nearest) < config.Near {
					nearest = append(nearest, distance)
				}
				at := len(nearest) - 1
				for at > 0 && nearest[at-1] > distance {
					nearest[at] = nearest[at-1]
					at--
				}
				nearest[at] = distance
			}
		}
		movesCandidates, movesNearest = candidates, nearest
		// With more in range than Near, those at the very distance of the last one share what is left
		// (a crowd standing on one spot is not all "nearest").
		limit, ties := math.Inf(1), 0
		if len(candidates) > config.Near && len(nearest) > 0 {
			limit = nearest[len(nearest)-1]
			for _, distance := range nearest {
				if distance == limit {
					ties++
				}
			}
		}

		movesBuffer.Reset()
		movesBuffer.WriteString(`{"type":"playerMoves","payload":{"players":[`)
		told := 0
		for _, candidate := range candidates {
			near := candidate.distance < limit
			if !near && candidate.distance == limit && ties > 0 {
				near = true
				ties--
			}
			other := &players[candidate.index]
			seen := client.moves[other.player.ID]
			if seen == nil {
				seen = &movesSeen{}
				client.moves[other.player.ID] = seen
			} else {
				seen.tick = movesTick
				if seen.rev == other.player.rev || (!near && now.Sub(seen.at) < config.FarEvery) {
					continue
				}
			}
			if told > 0 {
				movesBuffer.WriteByte(',')
			}
			movesBuffer.Write(other.entry(seen.look != other.player.look))
			told++
			seen.rev, seen.look, seen.at, seen.tick = other.player.rev, other.player.look, now, movesTick
		}
		movesBuffer.WriteByte(']')

		gone := movesGone[:0]
		for id, seen := range client.moves {
			if seen.tick != movesTick {
				gone = append(gone, id)
				delete(client.moves, id)
			}
		}
		movesGone = gone
		if told == 0 && len(gone) == 0 {
			continue
		}
		if len(gone) > 0 {
			ids, _ := json.Marshal(gone)
			movesBuffer.WriteString(`,"gone":`)
			movesBuffer.Write(ids)
		}
		movesBuffer.WriteString(`}}`)
		// A client that cannot keep up is dropped, as broadcastToAll does: what it was told and what it
		// was not could no longer be known.
		if !client.trySend(append([]byte(nil), movesBuffer.Bytes()...)) {
			client.drop()
		}
	}
}

func runPlayerMoves() {
	ticker := time.NewTicker(movesConfig.Every)
	defer ticker.Stop()
	for now := range ticker.C {
		playerMovesTick(now)
	}
}

func init() {
	registerLoop(runPlayerMoves)
}
