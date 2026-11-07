package network

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

// An empty world and an empty cache whose clock only moves when told to.
func setupViewerPlayers(t *testing.T) (advance func(time.Duration)) {
	t.Helper()
	stateMu.Lock()
	previous := gameState.Players
	gameState.Players = make(map[string]Player)
	stateMu.Unlock()
	previousNow := viewerPlayersNow
	var clock sync.Mutex
	now := time.Unix(1000, 0)
	viewerPlayersNow = func() time.Time {
		clock.Lock()
		defer clock.Unlock()
		return now
	}
	resetViewerPlayersCache()
	t.Cleanup(func() {
		stateMu.Lock()
		gameState.Players = previous
		stateMu.Unlock()
		viewerPlayersNow = previousNow
		resetViewerPlayersCache()
	})
	return func(by time.Duration) {
		clock.Lock()
		defer clock.Unlock()
		now = now.Add(by)
	}
}

func resetViewerPlayersCache() {
	viewerPlayersCache.Lock()
	viewerPlayersCache.body, viewerPlayersCache.etag, viewerPlayersCache.builtAt = nil, "", time.Time{}
	viewerPlayersCache.Unlock()
}

func setViewerPlayer(player Player) {
	stateMu.Lock()
	gameState.Players[player.ID] = player
	stateMu.Unlock()
}

func viewerPlayersAt(t *testing.T) []viewerPlayer {
	t.Helper()
	recorder := viewerGet(t, "/viewer-api/players", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("players: %d %s", recorder.Code, recorder.Body.String())
	}
	var answer viewerPlayers
	if err := json.Unmarshal(recorder.Body.Bytes(), &answer); err != nil {
		t.Fatal(err)
	}
	return answer.Players
}

func TestViewerPlayersPayloadHasExactlyTheseFields(t *testing.T) {
	setupViewerPlayers(t)
	setViewerPlayer(Player{
		ID: "SECRET-ID", Username: "Ana", ShirtColor: "#SECRET-SHIRT", HairStyle: "SECRET-HAIR", HairColor: "#SECRET-HC",
		HeldItem: "SECRET-ITEM", Action: "SECRET-ACTION", Mount: "SECRET-MOUNT", MountYaw: 77,
		X: 1.5, Y: 70, Z: -3.25, Yaw: 88, Pitch: 99, Located: true,
	})
	clientsMu.Lock()
	client := &Client{ID: "SECRET-ID", username: "Ana", sessionID: "SECRET-SESSION", ip: "203.0.113.9", userAgent: "SECRET-AGENT"}
	clients[client] = true
	clientsMu.Unlock()
	defer func() {
		clientsMu.Lock()
		delete(clients, client)
		clientsMu.Unlock()
	}()

	recorder := viewerGet(t, "/viewer-api/players", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("%d %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("content type %q", got)
	}
	// As a generic value, so any field added anywhere shows up here.
	var got any
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"players": []any{map[string]any{"name": "Ana", "x": 1.5, "y": 70.0, "z": -3.3}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("payload\n got %s\nwant %v", recorder.Body.String(), want)
	}
	body := recorder.Body.String()
	for _, leak := range []string{"SECRET", "203.0.113.9", "88", "99", "77"} {
		if strings.Contains(body, leak) {
			t.Errorf("leaks %q: %s", leak, body)
		}
	}
	if len(recorder.Result().Cookies()) != 0 {
		t.Error("a cookie for a known visitor")
	}
}

func TestViewerPlayersNoPlayersIsAnEmptyList(t *testing.T) {
	setupViewerPlayers(t)
	recorder := viewerGet(t, "/viewer-api/players", nil)
	if recorder.Code != http.StatusOK || recorder.Body.String() != `{"players":[]}` {
		t.Fatalf("%d %s", recorder.Code, recorder.Body.String())
	}
}

func TestViewerPlayersIsReadOnly(t *testing.T) {
	setupViewerPlayers(t)
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch} {
		recorder := httptest.NewRecorder()
		ViewerAPI().ServeHTTP(recorder, httptest.NewRequest(method, "/viewer-api/players", nil))
		if recorder.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s: %d", method, recorder.Code)
		}
	}
}

// The cache: at most one read of the state per viewerPlayersMaxAge, for everybody.
func TestViewerPlayersIsSharedForASecond(t *testing.T) {
	advance := setupViewerPlayers(t)
	setViewerPlayer(Player{ID: "a", Username: "Ana", X: 1, Located: true})
	if got := viewerPlayersAt(t); len(got) != 1 || got[0].X != 1 {
		t.Fatalf("first: %+v", got)
	}
	setViewerPlayer(Player{ID: "a", Username: "Ana", X: 2, Located: true})
	advance(viewerPlayersMaxAge - time.Millisecond)
	if got := viewerPlayersAt(t); got[0].X != 1 {
		t.Fatalf("read the state again before its time: %+v", got)
	}
	advance(time.Millisecond)
	if got := viewerPlayersAt(t); got[0].X != 2 {
		t.Fatalf("stale after its time: %+v", got)
	}
}

// With the option off the browser asks nothing, and the server has nothing to do: playing does not
// touch the cache and only a request fills it.
func TestViewerPlayersWorksOnlyWhenAsked(t *testing.T) {
	setupViewerPlayers(t)
	client := &Client{ID: "a", username: "Ana", send: make(chan []byte, 8)}
	setViewerPlayer(Player{ID: "a", Username: "Ana"})
	handleMessage(client, Message{Type: "playerMove", Payload: json.RawMessage(`{"id":"a","x":5,"y":6,"z":7}`)})
	viewerGet(t, "/viewer-api/changes?since=0", nil)
	viewerPlayersCache.Lock()
	body := viewerPlayersCache.body
	viewerPlayersCache.Unlock()
	if body != nil {
		t.Fatalf("built without being asked: %s", body)
	}
	if got := viewerPlayersAt(t); len(got) != 1 || got[0].X != 5 {
		t.Fatalf("after asking: %+v", got)
	}
}

func TestViewerPlayersETag(t *testing.T) {
	advance := setupViewerPlayers(t)
	for i := range 20 {
		setViewerPlayer(Player{ID: fmt.Sprintf("p%d", i), Username: fmt.Sprintf("name%d", i), X: float64(i), Located: true})
	}
	first := viewerGet(t, "/viewer-api/players", nil)
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("no ETag")
	}
	// Rebuilt, nothing changed: the map's order must not change the answer.
	for range 10 {
		advance(viewerPlayersMaxAge)
		again := viewerGet(t, "/viewer-api/players", map[string]string{"If-None-Match": etag})
		if again.Code != http.StatusNotModified || again.Body.Len() != 0 {
			t.Fatalf("%d, %d bytes", again.Code, again.Body.Len())
		}
	}
	setViewerPlayer(Player{ID: "p0", Username: "name0", X: 100, Located: true})
	advance(viewerPlayersMaxAge)
	if moved := viewerGet(t, "/viewer-api/players", map[string]string{"If-None-Match": etag}); moved.Code != http.StatusOK {
		t.Fatalf("after moving: %d", moved.Code)
	}
}

func TestViewerPlayerNames(t *testing.T) {
	for _, test := range []struct {
		name string
		in   Player
		want string
	}{
		{"plain", Player{ID: "player_1", Username: "Ana"}, "Ana"},
		{"accents and emoji", Player{ID: "player_1", Username: "Peñón 🌲"}, "Peñón 🌲"},
		{"no name", Player{ID: "player_1"}, ""},
		{"the id is no name", Player{ID: "player_1", Username: "player_1"}, ""},
		{"blank", Player{ID: "player_1", Username: "   "}, ""},
		{"control and direction characters", Player{ID: "player_1", Username: "A\x00n‮a\n"}, "Ana"},
		{"too long", Player{ID: "player_1", Username: strings.Repeat("ñ", 500)}, strings.Repeat("ñ", viewerPlayerNameRunes)},
		// Markup is not touched here: the page only ever shows a name as text.
		{"markup stays text", Player{ID: "player_1", Username: "<b>x</b>"}, "<b>x</b>"},
	} {
		if got := viewerPlayerName(test.in); got != test.want {
			t.Errorf("%s: got %q, want %q", test.name, got, test.want)
		}
	}
}

func TestViewerPlayersSkipsImpossiblePositions(t *testing.T) {
	setupViewerPlayers(t)
	setViewerPlayer(Player{ID: "good", Username: "Good", X: 1, Y: 2, Z: 3, Located: true})
	for i, value := range []float64{math.NaN(), math.Inf(1), math.Inf(-1), 1e308, -1e308} {
		setViewerPlayer(Player{ID: fmt.Sprintf("x%d", i), Username: "Bad", X: value, Located: true})
		setViewerPlayer(Player{ID: fmt.Sprintf("y%d", i), Username: "Bad", Y: value, Located: true})
		setViewerPlayer(Player{ID: fmt.Sprintf("z%d", i), Username: "Bad", Z: value, Located: true})
	}
	if got := viewerPlayersAt(t); len(got) != 1 || got[0].Name != "Good" {
		t.Fatalf("%+v", got)
	}
}

func TestViewerPlayersBounded(t *testing.T) {
	setupViewerPlayers(t)
	for i := range viewerMaxPlayers + 50 {
		setViewerPlayer(Player{ID: fmt.Sprintf("p%d", i), Username: "Same", X: float64(i), Located: true})
	}
	if got := viewerPlayersAt(t); len(got) != viewerMaxPlayers {
		t.Fatalf("%d players", len(got))
	}
}

// Through the game's own messages: the title screen, moving, reconnecting and leaving.
func TestViewerPlayersFollowTheGame(t *testing.T) {
	advance := setupViewerPlayers(t)
	send := func(client *Client, kind, payload string) {
		t.Helper()
		handleMessage(client, Message{Type: kind, Payload: json.RawMessage(payload)})
		advance(viewerPlayersMaxAge)
	}
	join := func(client *Client, id, name string) {
		t.Helper()
		// sendInitialState and the list go to this channel; nobody reads them here.
		send(client, "playerJoin", fmt.Sprintf(`{"playerId":%q,"username":%q}`, id, name))
	}

	// On the title screen the game has joined but never moves: it is not at the spawn.
	ana := &Client{send: make(chan []byte, 16)}
	join(ana, "player_ana", "Ana")
	if got := viewerPlayersAt(t); len(got) != 0 {
		t.Fatalf("title screen: %+v", got)
	}

	// Playing.
	send(ana, "playerMove", `{"id":"player_ana","x":10,"y":70,"z":-4}`)
	if got := viewerPlayersAt(t); len(got) != 1 || got[0] != (viewerPlayer{Name: "Ana", X: 10, Y: 70, Z: -4}) {
		t.Fatalf("playing: %+v", got)
	}

	// No name: there is a marker, without the id.
	nameless := &Client{send: make(chan []byte, 16)}
	join(nameless, "player_x", "")
	send(nameless, "playerMove", `{"id":"player_x","x":1,"y":2,"z":3}`)
	if got := viewerPlayersAt(t); len(got) != 2 || got[0].Name != "" || got[1].Name != "Ana" {
		t.Fatalf("no name: %+v", got)
	}

	// Reconnecting: the placeholder again until the next move, never the spawn.
	back := &Client{send: make(chan []byte, 16)}
	join(back, "player_ana", "Ana")
	if got := viewerPlayersAt(t); len(got) != 1 {
		t.Fatalf("reconnecting: %+v", got)
	}
	send(back, "playerMove", `{"id":"player_ana","x":11,"y":70,"z":-4}`)

	// The old connection dies late and takes the entry: the next move brings it back.
	stateMu.Lock()
	delete(gameState.Players, "player_ana")
	stateMu.Unlock()
	send(back, "playerMove", `{"id":"player_ana","x":12,"y":70,"z":-4}`)
	got := viewerPlayersAt(t)
	if len(got) != 2 || got[1] != (viewerPlayer{Name: "Ana", X: 12, Y: 70, Z: -4}) {
		t.Fatalf("back after the old connection closed: %+v", got)
	}
	// But nobody brings back somebody else.
	send(back, "playerMove", `{"id":"player_gone","x":1,"y":1,"z":1}`)
	if got := viewerPlayersAt(t); len(got) != 2 {
		t.Fatalf("someone else's id: %+v", got)
	}

	// Leaving, as readPump does.
	stateMu.Lock()
	delete(gameState.Players, "player_ana")
	stateMu.Unlock()
	advance(viewerPlayersMaxAge)
	if got := viewerPlayersAt(t); len(got) != 1 || got[0].Name != "" {
		t.Fatalf("after leaving: %+v", got)
	}
}

// What marks a position as real never goes to other clients or into the game's messages.
func TestLocatedIsNotSentToClients(t *testing.T) {
	data, err := json.Marshal(Player{ID: "a", Located: true})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ToLower(string(data)), "located") {
		t.Fatalf("%s", data)
	}
	var fromClient Player
	if err := json.Unmarshal([]byte(`{"id":"a","Located":true,"located":true}`), &fromClient); err != nil {
		t.Fatal(err)
	}
	if fromClient.Located {
		t.Fatal("a client set it")
	}
}

// For go test -race: the game moving and leaving, under viewers asking all the time.
func TestViewerPlayersUnderLoad(t *testing.T) {
	setupViewerPlayers(t)
	viewerPlayersNow = time.Now
	handler := ViewerAPI()
	var wg sync.WaitGroup
	stop := make(chan struct{})
	for worker := range 4 {
		client := &Client{ID: fmt.Sprintf("p%d", worker), username: "Ana", send: make(chan []byte, 1)}
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; ; i++ {
				select {
				case <-stop:
					return
				default:
				}
				handleMessage(client, Message{Type: "playerMove", Payload: json.RawMessage(fmt.Sprintf(`{"id":%q,"x":%d,"y":70,"z":0}`, client.ID, i))})
				if i%10 == 0 {
					stateMu.Lock()
					delete(gameState.Players, client.ID)
					stateMu.Unlock()
				}
			}
		}()
	}
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				request := httptest.NewRequest(http.MethodGet, "/viewer-api/players", nil)
				request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "visitor"})
				recorder := httptest.NewRecorder()
				handler.ServeHTTP(recorder, request)
				if recorder.Code != http.StatusOK && recorder.Code != http.StatusServiceUnavailable {
					t.Errorf("%d", recorder.Code)
					return
				}
			}
		}()
	}
	time.Sleep(200 * time.Millisecond)
	close(stop)
	wg.Wait()
}
