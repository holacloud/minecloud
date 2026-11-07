package network

import (
	"cmp"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"math"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"
)

// handleViewerPlayers tells the viewer who is in the world and where, for its "Show players"
// option. Like the rest of /viewer-api/ it needs no login, so whoever can open the viewer can read
// this. A name and a position per player and nothing else: an id, a session or an address must
// never be added here (TestViewerPlayersPayloadHasExactlyTheseFields fails if one is).
//
//	GET players  {"players":[{"name":"Ana","x":1.5,"y":70,"z":-3.2}, ...]}
//
// The answer is built on request and shared by all viewers for viewerPlayersMaxAge, so any number
// of them costs the game one read of the state per second at most, and none costs nothing: no
// goroutine or timer runs for this.
const (
	viewerPlayersMaxAge = time.Second
	// A bound on the answer: anyone can join the world, as many times as they like.
	viewerMaxPlayers = 256
	// The game's own limit (appearance-name in index.html); a client can send anything.
	viewerPlayerNameRunes = 20
	// As far as the game asks for chunks; a position beyond this is not a place in the world.
	viewerPlayerCoordLimit = 1 << 20
)

// Field for field what goes out.
type viewerPlayer struct {
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Z    float64 `json:"z"`
}

type viewerPlayers struct {
	Players []viewerPlayer `json:"players"`
}

var viewerPlayersCache struct {
	sync.Mutex
	builtAt time.Time
	body    []byte
	etag    string
}

// The clock of the cache, for the tests.
var viewerPlayersNow = time.Now

// viewerPlayerName is the name to show, "" if the player has none. A player who gave no name goes
// by their id on the server (playerJoin), which is not a name and stays here.
func viewerPlayerName(player Player) string {
	name := strings.Map(func(r rune) rune {
		if unicode.IsGraphic(r) {
			return r
		}
		return -1
	}, player.Username)
	name = strings.TrimSpace(name)
	if name == player.ID {
		return ""
	}
	if runes := []rune(name); len(runes) > viewerPlayerNameRunes {
		name = strings.TrimSpace(string(runes[:viewerPlayerNameRunes]))
	}
	return name
}

// viewerPlayerCoord rounds a coordinate to a tenth of a block, or says it is no place in the world.
// NaN and infinities would also make the whole answer fail to encode.
func viewerPlayerCoord(value float64) (float64, bool) {
	if !(math.Abs(value) <= viewerPlayerCoordLimit) {
		return 0, false
	}
	return math.Round(value*10) / 10, true
}

// viewerPlayersList reads the players who are somewhere: one on the title screen, or back from a
// reconnection, has joined but stands at the placeholder of playerJoin until their first move. The
// order does not depend on the map's, so an unchanged list keeps its ETag.
func viewerPlayersList() []viewerPlayer {
	list := []viewerPlayer{}
	stateMu.RLock()
	for _, player := range gameState.Players {
		if !player.Located {
			continue
		}
		x, okX := viewerPlayerCoord(player.X)
		y, okY := viewerPlayerCoord(player.Y)
		z, okZ := viewerPlayerCoord(player.Z)
		if okX && okY && okZ {
			list = append(list, viewerPlayer{Name: viewerPlayerName(player), X: x, Y: y, Z: z})
		}
	}
	stateMu.RUnlock()
	slices.SortFunc(list, func(a, b viewerPlayer) int {
		return cmp.Or(cmp.Compare(a.Name, b.Name), cmp.Compare(a.X, b.X), cmp.Compare(a.Y, b.Y), cmp.Compare(a.Z, b.Z))
	})
	if len(list) > viewerMaxPlayers {
		list = list[:viewerMaxPlayers]
	}
	return list
}

// viewerPlayersSnapshot is the shared answer, rebuilt when it is too old. Whoever finds it old
// holds the others until it is done, so a crowd of viewers rebuilds it once. Nothing takes this
// lock while holding stateMu.
func viewerPlayersSnapshot() (body []byte, etag string, err error) {
	cache := &viewerPlayersCache
	cache.Lock()
	defer cache.Unlock()
	now := viewerPlayersNow()
	if cache.body != nil && now.Sub(cache.builtAt) < viewerPlayersMaxAge {
		return cache.body, cache.etag, nil
	}
	body, err = json.Marshal(viewerPlayers{Players: viewerPlayersList()})
	if err != nil {
		return nil, "", err
	}
	hash := fnv.New64a()
	hash.Write(body)
	cache.body, cache.etag, cache.builtAt = body, fmt.Sprintf(`"%x"`, hash.Sum64()), now
	return cache.body, cache.etag, nil
}

func handleViewerPlayers(w http.ResponseWriter, r *http.Request) {
	body, etag, err := viewerPlayersSnapshot()
	if err != nil {
		log.Printf("viewer players: %v", err)
		http.Error(w, "players unavailable", http.StatusInternalServerError)
		return
	}
	writeViewerBody(w, r, etag, "application/json", true, func() []byte { return body })
}
