package network

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

// Who each client is told about, and when (player_moves.go).

type movesHeard struct {
	Players []map[string]any `json:"players"`
	Gone    []string         `json:"gone"`
}

func (h movesHeard) ids() string {
	ids := make([]string, 0, len(h.Players))
	for _, player := range h.Players {
		ids = append(ids, player["id"].(string))
	}
	return strings.Join(ids, " ")
}

func (h movesHeard) of(id string) map[string]any {
	for _, player := range h.Players {
		if player["id"] == id {
			return player
		}
	}
	return nil
}

// A world with nobody in it, where a client is told about the 2 nearest within 100 blocks.
func movesWorld(t *testing.T) {
	t.Helper()
	fresh := func() {
		stateMu.Lock()
		gameState.Players = make(map[string]Player)
		playerClients = make(map[string]*Client)
		stateMu.Unlock()
	}
	fresh()
	before := movesConfig
	movesConfig = MovesConfig{Near: 2, Range: 100, FarEvery: time.Second, Every: 100 * time.Millisecond}
	t.Cleanup(func() {
		movesConfig = before
		fresh()
	})
}

func movesJoin(id string, x, y, z float64) *Client {
	client := &Client{ID: id, username: strings.ToUpper(id), send: make(chan []byte, 64)}
	movesMove(client, x, y, z, "")
	return client
}

func movesMove(client *Client, x, y, z float64, more string) {
	payload := fmt.Sprintf(`{"id":%q,"x":%v,"y":%v,"z":%v,"shirtColor":"#fff"%s}`, client.ID, x, y, z, more)
	handleMessage(client, Message{Type: "playerMove", Payload: json.RawMessage(payload)})
}

// What the client was sent since it was last asked: one playerMoves at most, and nothing else.
func movesTold(t *testing.T, client *Client) (heard movesHeard, told bool) {
	t.Helper()
	for {
		select {
		case data := <-client.send:
			var message Message
			if err := json.Unmarshal(data, &message); err != nil || message.Type != "playerMoves" || told {
				t.Fatalf("sent %s", data)
			}
			if err := json.Unmarshal(message.Payload, &heard); err != nil {
				t.Fatal(err)
			}
			told = true
		default:
			return heard, told
		}
	}
}

func TestAMoveIsToldToNobodyUntilTheRoundAndNeverToWhoMadeIt(t *testing.T) {
	movesWorld(t)
	ana := movesJoin("ana", 0, 70, 0)
	beto := movesJoin("beto", 5, 70, 0)
	if _, told := movesTold(t, ana); told {
		t.Fatal("a move was passed on as it came")
	}
	if _, told := movesTold(t, beto); told {
		t.Fatal("a move was passed on as it came")
	}

	now := time.Now()
	playerMovesTick(now)
	heard, _ := movesTold(t, ana)
	if heard.ids() != "beto" || len(heard.Gone) != 0 {
		t.Fatalf("ana hears of %q, gone %v", heard.ids(), heard.Gone)
	}
	// The first time, with name and looks.
	if got := heard.of("beto"); got["username"] != "BETO" || got["shirtColor"] != "#fff" || got["x"] != 5.0 {
		t.Fatalf("beto, first: %+v", got)
	}
	if heard, _ := movesTold(t, beto); heard.ids() != "ana" {
		t.Fatalf("beto hears of %q", heard.ids())
	}
}

func TestAPlayerStandingStillCostsNothingAndLooksGoOnlyWhenTheyChange(t *testing.T) {
	movesWorld(t)
	ana := movesJoin("ana", 0, 70, 0)
	beto := movesJoin("beto", 5, 70, 0)
	now := time.Now()
	playerMovesTick(now)
	movesTold(t, ana)

	// The same place said again, ten times a second: no news.
	movesMove(beto, 5, 70, 0, "")
	movesMove(beto, 5, 70, 0, "")
	playerMovesTick(now.Add(100 * time.Millisecond))
	if heard, told := movesTold(t, ana); told {
		t.Fatalf("told of a player who did not move: %+v", heard)
	}

	// A step: where it is, to the centimetre, and nothing of what ana already knows.
	movesMove(beto, 6.123456789, 70, 0, `,"heldItem":"stone","yaw":1.23456789`)
	playerMovesTick(now.Add(200 * time.Millisecond))
	heard, _ := movesTold(t, ana)
	got := heard.of("beto")
	if got == nil || got["x"] != 6.12 || got["yaw"] != 1.235 || got["heldItem"] != "stone" {
		t.Fatalf("after a step: %+v", got)
	}
	for _, field := range []string{"username", "shirtColor", "hairStyle", "hairColor"} {
		if _, sent := got[field]; sent {
			t.Errorf("%s sent again without having changed", field)
		}
	}

	// A new shirt: the looks again, once.
	movesMove(beto, 6.123456789, 70, 0, `,"heldItem":"stone","yaw":1.23456789,"hairColor":"#000"`)
	playerMovesTick(now.Add(300 * time.Millisecond))
	heard, _ = movesTold(t, ana)
	if got := heard.of("beto"); got == nil || got["hairColor"] != "#000" || got["username"] != "BETO" {
		t.Fatalf("after a change of looks: %+v", got)
	}
}

func TestOnlyTheNearestAreToldEveryRoundAndTheOthersInRangeNowAndThen(t *testing.T) {
	movesWorld(t)
	ana := movesJoin("ana", 0, 70, 0)
	others := map[string]*Client{}
	// Two near, two further in range, one beyond it (Manhattan: 60 + 50 is out of 100).
	for id, at := range map[string][2]float64{"n1": {3, 0}, "n2": {0, 6}, "f1": {40, 0}, "f2": {30, 30}, "out": {60, 50}} {
		others[id] = movesJoin(id, at[0], 70, at[1])
	}
	now := time.Now()
	playerMovesTick(now)
	heard, _ := movesTold(t, ana)
	if len(heard.Players) != 4 || heard.of("out") != nil {
		t.Fatalf("at first ana hears of everybody in range, once: %q", heard.ids())
	}

	// Everybody walks. The next rounds bring the two nearest, and the others only after FarEvery.
	step := func(n float64) {
		movesMove(others["n1"], 3, 70+n, 0, "")
		movesMove(others["n2"], 0, 70+n, 6, "")
		movesMove(others["f1"], 40, 70+n, 0, "")
		movesMove(others["f2"], 30, 70+n, 30, "")
		movesMove(others["out"], 60, 70+n, 50, "")
	}
	for round := 1; round <= 9; round++ {
		step(float64(round) / 10)
		playerMovesTick(now.Add(time.Duration(round) * 100 * time.Millisecond))
		heard, _ := movesTold(t, ana)
		if len(heard.Players) != 2 || heard.of("n1") == nil || heard.of("n2") == nil {
			t.Fatalf("round %d: ana hears of %q", round, heard.ids())
		}
	}
	step(1)
	playerMovesTick(now.Add(time.Second))
	heard, _ = movesTold(t, ana)
	if len(heard.Players) != 4 || heard.of("f1")["y"] != 71.0 {
		t.Fatalf("after a second ana hears of %q", heard.ids())
	}

	// A far one comes closer than a near one: it takes its place at the full rate.
	movesMove(others["f1"], 1, 71, 0, "")
	playerMovesTick(now.Add(1100 * time.Millisecond))
	movesTold(t, ana)
	for round := 12; round <= 14; round++ {
		movesMove(others["f1"], 1, 71+float64(round)/100, 0, "")
		movesMove(others["n2"], 0, 71+float64(round)/100, 6, "")
		playerMovesTick(now.Add(time.Duration(round) * 100 * time.Millisecond))
		heard, _ := movesTold(t, ana)
		if heard.ids() != "f1" {
			t.Fatalf("round %d: ana hears of %q", round, heard.ids())
		}
	}
}

func TestAPlayerOutOfRangeOrGoneIsSaidToBeGoneOnce(t *testing.T) {
	movesWorld(t)
	ana := movesJoin("ana", 0, 70, 0)
	beto := movesJoin("beto", 90, 70, 0)
	now := time.Now()
	playerMovesTick(now)
	movesTold(t, ana)

	// Just past the range he stays (the edge has some give), and well past it he is gone.
	movesMove(beto, 110, 70, 0, "")
	playerMovesTick(now.Add(2 * time.Second))
	if heard, _ := movesTold(t, ana); heard.ids() != "beto" || len(heard.Gone) != 0 {
		t.Fatalf("at the edge: %q gone %v", heard.ids(), heard.Gone)
	}
	movesMove(beto, 130, 70, 0, "")
	playerMovesTick(now.Add(4 * time.Second))
	if heard, _ := movesTold(t, ana); len(heard.Players) != 0 || len(heard.Gone) != 1 || heard.Gone[0] != "beto" {
		t.Fatalf("out of range: %q gone %v", heard.ids(), heard.Gone)
	}
	playerMovesTick(now.Add(5 * time.Second))
	if heard, told := movesTold(t, ana); told {
		t.Fatalf("told again of somebody gone: %+v", heard)
	}
	// Coming in at the edge he is not there yet; in range he is, and with his looks, as a new one.
	movesMove(beto, 105, 70, 0, "")
	playerMovesTick(now.Add(6 * time.Second))
	if _, told := movesTold(t, ana); told {
		t.Fatal("somebody not known is told of from beyond the range")
	}
	movesMove(beto, 95, 70, 0, "")
	playerMovesTick(now.Add(7 * time.Second))
	if heard, _ := movesTold(t, ana); heard.of("beto")["username"] != "BETO" {
		t.Fatalf("back in range: %+v", heard)
	}

	// He leaves the game, as readPump does.
	stateMu.Lock()
	delete(gameState.Players, "beto")
	delete(playerClients, "beto")
	stateMu.Unlock()
	playerMovesTick(now.Add(8 * time.Second))
	if heard, _ := movesTold(t, ana); len(heard.Gone) != 1 || heard.Gone[0] != "beto" {
		t.Fatalf("after leaving: %+v", heard)
	}
}

// A crowd on one spot: everybody is as near as anybody, and still only Near of them are "the nearest".
func TestACrowdOnOneSpotIsNotAllNearest(t *testing.T) {
	movesWorld(t)
	ana := movesJoin("ana", 0, 70, 0)
	var crowd []*Client
	for i := 0; i < 30; i++ {
		crowd = append(crowd, movesJoin(fmt.Sprintf("p%02d", i), 1, 70, 1))
	}
	now := time.Now()
	playerMovesTick(now)
	if heard, _ := movesTold(t, ana); len(heard.Players) != 30 {
		t.Fatalf("at first: %d", len(heard.Players))
	}
	total := 0
	for round := 1; round <= 9; round++ {
		for _, client := range crowd {
			movesMove(client, 1, 70, 1, fmt.Sprintf(`,"yaw":%d`, round))
		}
		playerMovesTick(now.Add(time.Duration(round) * 100 * time.Millisecond))
		heard, _ := movesTold(t, ana)
		if len(heard.Players) != 2 {
			t.Fatalf("round %d: told of %d of the crowd", round, len(heard.Players))
		}
		total += len(heard.Players)
	}
	if total != 18 {
		t.Fatalf("%d entries in nine rounds", total)
	}
}

func TestAClientMovesItsOwnPlayerAndNobodyElses(t *testing.T) {
	movesWorld(t)
	ana := movesJoin("ana", 0, 70, 0)
	movesJoin("beto", 5, 70, 0)
	handleMessage(ana, Message{Type: "playerMove", Payload: json.RawMessage(`{"id":"beto","x":999,"y":70,"z":999}`)})
	handleMessage(ana, Message{Type: "playerMove", Payload: json.RawMessage(`{"id":"","x":999,"y":70,"z":999}`)})
	stateMu.RLock()
	beto, players := gameState.Players["beto"], len(gameState.Players)
	stateMu.RUnlock()
	if beto.X != 5 || players != 2 {
		t.Fatalf("beto at %v, %d players", beto.X, players)
	}
}

// A client that does not read is dropped, as with any broadcast, and the server goes on.
func TestAClientThatCannotKeepUpIsDropped(t *testing.T) {
	movesWorld(t)
	slow := &Client{ID: "slow", username: "Slow", send: make(chan []byte)}
	movesMove(slow, 0, 70, 0, "")
	movesJoin("beto", 5, 70, 0)
	playerMovesTick(time.Now())
	playerMovesTick(time.Now())
}

func TestConfigureMovesKeepsTheDefaultsForWhatIsNotSaid(t *testing.T) {
	before := movesConfig
	defer func() { movesConfig = before }()
	ConfigureMoves(MovesConfig{Near: 25})
	if movesConfig.Near != 25 || movesConfig.Range != before.Range || movesConfig.FarEvery != before.FarEvery {
		t.Fatalf("%+v", movesConfig)
	}
	ConfigureMoves(MovesConfig{Range: -1, FarEvery: 10 * time.Second})
	if movesConfig.Near != 25 || movesConfig.Range != before.Range || movesConfig.FarEvery != 10*time.Second {
		t.Fatalf("%+v", movesConfig)
	}
	// The time between rounds, with a floor: there is no "as it comes".
	if movesConfig.Every != 50*time.Millisecond {
		t.Fatalf("by default: %s", movesConfig.Every)
	}
	ConfigureMoves(MovesConfig{Every: 200 * time.Millisecond})
	if movesConfig.Every != 200*time.Millisecond {
		t.Fatalf("%s", movesConfig.Every)
	}
	ConfigureMoves(MovesConfig{Every: time.Millisecond})
	if movesConfig.Every != movesEveryLeast {
		t.Fatalf("under the floor: %s", movesConfig.Every)
	}
}
