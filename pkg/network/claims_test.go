package network

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"minecloud/pkg/world"
)

// The tests of every other mechanic build around the origin, which is the spawn zone: they run with it off.
// The tests of plots turn it on (claimWorld).
func TestMain(m *testing.M) {
	spawnZoneOn = false
	os.Exit(m.Run())
}

// claimWorld gives a test the real handlers and chunk store, an empty book of plots and the spawn zone on.
// The plot tests stand at y=120, in the air over any terrain.
func claimWorld(t *testing.T) {
	t.Helper()
	storage = newStorageBook()
	t.Cleanup(func() { storage = newStorageBook() })
	claimWorldKeepingStorage(t)
}

// claimWorldKeepingStorage leaves the storage book alone: a connection's goroutines read it when they close,
// after the test is over.
func claimWorldKeepingStorage(t *testing.T) {
	t.Helper()
	t.Chdir(t.TempDir())
	previous, previousClaims := chunkStore, claims
	store, err := world.Open(filepath.Join(t.TempDir(), "chunks"), nil)
	if err != nil {
		t.Fatal(err)
	}
	chunkStore = store
	claims = newClaimBook()
	spawnZoneOn = true
	t.Cleanup(func() {
		chunkStore, claims = previous, previousClaims
		spawnZoneOn = false
	})
}

// A connected client: its page id and name, its stable player, where it stands.
func claimClient(t *testing.T, name, player string, x, y, z float64) *Client {
	t.Helper()
	client := &Client{ID: "page_" + name, username: name, send: make(chan []byte, 512), chunks: make(chan []byte, 4), done: make(chan struct{})}
	client.setStablePlayerID(player)
	clientsMu.Lock()
	clients[client] = true
	clientsMu.Unlock()
	stateMu.Lock()
	gameState.Players[client.ID] = Player{ID: client.ID, Username: name, X: x, Y: y, Z: z, Located: true}
	stateMu.Unlock()
	t.Cleanup(func() {
		clientsMu.Lock()
		delete(clients, client)
		clientsMu.Unlock()
		stateMu.Lock()
		delete(gameState.Players, client.ID)
		stateMu.Unlock()
	})
	return client
}

func claimMove(client *Client, x, y, z float64) {
	stateMu.Lock()
	player := gameState.Players[client.ID]
	player.X, player.Y, player.Z = x, y, z
	gameState.Players[client.ID] = player
	stateMu.Unlock()
}

func claimSend(t *testing.T, client *Client, kind string, payload interface{}) {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	handleMessage(client, Message{Type: kind, Payload: data})
}

// Everything the client was sent since the last call, by type.
func claimHeard(client *Client) map[string][]json.RawMessage {
	heard := map[string][]json.RawMessage{}
	for {
		select {
		case raw := <-client.send:
			var message Message
			if json.Unmarshal(raw, &message) == nil {
				heard[message.Type] = append(heard[message.Type], message.Payload)
			}
		default:
			return heard
		}
	}
}

func claimRefusalOf(t *testing.T, heard map[string][]json.RawMessage) *claimRefusal {
	t.Helper()
	list := heard["claimRefused"]
	if len(list) == 0 {
		return nil
	}
	var refusal claimRefusal
	if err := json.Unmarshal(list[len(list)-1], &refusal); err != nil {
		t.Fatal(err)
	}
	return &refusal
}

func claimBlockAt(t *testing.T, x, y, z int) string {
	t.Helper()
	name, err := chunkStore.Block(x, y, z)
	if err != nil {
		t.Fatal(err)
	}
	return name
}

func claimLastList(t *testing.T, heard map[string][]json.RawMessage) []claimView {
	t.Helper()
	list := heard["claimList"]
	if len(list) == 0 {
		t.Fatal("no claimList")
	}
	var payload struct {
		Claims []claimView `json:"claims"`
		Spawn  *claimRect  `json:"spawn"`
	}
	if err := json.Unmarshal(list[len(list)-1], &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Spawn == nil || *payload.Spawn != spawnZone {
		t.Fatalf("the spawn zone goes with the list: %+v", payload.Spawn)
	}
	return payload.Claims
}

const (
	plrAna  = "plr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	plrBeto = "plr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	plrAdm  = "plr_cccccccccccccccccccccccccccccccc"
)

// Ana claims the plot of a marker at (100, 120, 100), standing next to it.
func claimAnaPlot(t *testing.T) (ana *Client) {
	t.Helper()
	ana = claimClient(t, "Ana", plrAna, 101, 121.6, 101)
	claimSend(t, ana, "blockPlace", Block{X: 100, Y: 120, Z: 100, BlockType: claimMarkerBlock})
	if refusal := claimRefusalOf(t, claimHeard(ana)); refusal != nil {
		t.Fatalf("Ana's claim refused: %+v", refusal)
	}
	if !claims.holds(plrAna) {
		t.Fatal("Ana has no plot")
	}
	return ana
}

func TestClaimMarkerClaimsAPlotOfSeventeenAndTellsEveryone(t *testing.T) {
	claimWorld(t)
	beto := claimClient(t, "Beto", plrBeto, 300, 121.6, 300)
	claimHeard(beto)
	ana := claimAnaPlot(t)
	if claimBlockAt(t, 100, 120, 100) != claimMarkerBlock {
		t.Fatal("the marker is not in the world")
	}
	c, ok := claims.at(100, 100)
	if !ok || c.Owner != plrAna || c.OwnerName != "Ana" {
		t.Fatalf("plot %+v", c)
	}
	if r := c.rect(); r != (claimRect{MinX: 92, MinZ: 92, MaxX: 108, MaxZ: 108}) || r.MaxX-r.MinX+1 != 17 {
		t.Fatalf("17 x 17 around the marker: %+v", r)
	}
	for _, edge := range [][2]int{{92, 92}, {108, 108}, {92, 108}, {100, 92}} {
		if _, ok := claims.at(edge[0], edge[1]); !ok {
			t.Fatalf("%v is in the plot", edge)
		}
	}
	for _, out := range [][2]int{{91, 100}, {109, 100}, {100, 91}, {100, 109}} {
		if _, ok := claims.at(out[0], out[1]); ok {
			t.Fatalf("%v is outside the plot", out)
		}
	}
	betoSees := claimLastList(t, claimHeard(beto))
	if len(betoSees) != 1 || betoSees[0].Mine || betoSees[0].Owner != "Ana" || betoSees[0].MinX != 92 {
		t.Fatalf("Beto sees %+v", betoSees)
	}
	anaHeard := claimHeard(ana)
	_ = anaHeard
	claimsSendTo(ana)
	anaSees := claimLastList(t, claimHeard(ana))
	if len(anaSees) != 1 || !anaSees[0].Mine {
		t.Fatalf("Ana sees %+v", anaSees)
	}
	// The owner's player id never goes out in the list.
	raw := claimListMessage(claims.list(), "")
	if json.Valid(raw) && containsString(string(raw), plrAna) {
		t.Fatal("the list carries the owner's player id")
	}
}

func containsString(haystack, needle string) bool {
	return len(needle) > 0 && len(haystack) >= len(needle) && (func() bool {
		for i := 0; i+len(needle) <= len(haystack); i++ {
			if haystack[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	})()
}

func TestClaimRulesAreCheckedByTheServer(t *testing.T) {
	claimWorld(t)
	ana := claimAnaPlot(t)
	place := func(client *Client, x, z int) *claimRefusal {
		claimMove(client, float64(x)+1, 121.6, float64(z)+1)
		claimSend(t, client, "blockPlace", Block{X: x, Y: 120, Z: z, BlockType: claimMarkerBlock})
		return claimRefusalOf(t, claimHeard(client))
	}

	// One plot per player.
	if r := place(ana, 200, 200); r == nil || r.Reason != claimReasonAlready {
		t.Fatalf("a second plot: %+v", r)
	}
	if claimBlockAt(t, 200, 120, 200) == claimMarkerBlock {
		t.Fatal("a refused marker stays")
	}

	beto := claimClient(t, "Beto", plrBeto, 0, 0, 0)
	// Overlapping Ana's: 16 apart still overlaps (8 + 8 + the marker's own column), 17 apart does not.
	for _, x := range []int{100, 110, 116} {
		r := place(beto, x, 116)
		if r == nil || r.Reason != claimReasonOverlap || r.Owner != "Ana" {
			t.Fatalf("x=%d overlaps Ana's plot: %+v", x, r)
		}
		if len(r.Blocks) != 1 || r.Blocks[0].BlockType != "" || r.Placed != claimMarkerBlock {
			t.Fatalf("the refusal puts the cell back and names the item: %+v", r)
		}
	}
	// Overlapping the spawn zone (x, z in -16..15): a marker 23 away from it on z still touches it.
	if r := place(beto, 0, 23); r == nil || r.Reason != claimReasonOverlapSpawn {
		t.Fatalf("over the spawn zone: %+v", r)
	}
	// Out of reach.
	claimMove(beto, 400, 121.6, 400)
	claimSend(t, beto, "blockPlace", Block{X: 420, Y: 120, Z: 400, BlockType: claimMarkerBlock})
	if r := claimRefusalOf(t, claimHeard(beto)); r == nil || r.Reason != claimReasonReach {
		t.Fatalf("out of reach: %+v", r)
	}
	// A connection with no stable player can own nothing.
	nobody := claimClient(t, "Nadie", "", 500, 121.6, 500)
	if r := place(nobody, 500, 500); r == nil || r.Reason != claimReasonNoPlayer {
		t.Fatalf("without a player: %+v", r)
	}
	// Right next to the spawn zone (its border at 15, the plot from 16) and 17 from Ana's: fine.
	if r := place(beto, 24, 0); r != nil {
		t.Fatalf("next to the spawn zone: %+v", r)
	}
	if r := place(claimClient(t, "Cris", "plr_dddddddddddddddddddddddddddddddd", 0, 0, 0), 117, 100); r != nil {
		t.Fatalf("17 from Ana's marker: %+v", r)
	}
	if len(claims.list()) != 3 {
		t.Fatalf("%d plots", len(claims.list()))
	}
}

// Every message that changes the world or takes from it, at a cell of Ana's plot.
type claimPath struct {
	kind    string
	payload func() interface{}
	// What else a stranger hears, besides claimRefused.
	answer string
}

func claimPaths() []claimPath {
	at := map[string]int{"x": 103, "y": 120, "z": 103}
	req := func(extra map[string]interface{}) func() interface{} {
		return func() interface{} {
			payload := map[string]interface{}{"x": 103, "y": 120, "z": 103, "reqId": fmt.Sprintf("req_%d", time.Now().UnixNano())}
			for k, v := range extra {
				payload[k] = v
			}
			return payload
		}
	}
	return []claimPath{
		{kind: "blockPlace", payload: func() interface{} { return Block{X: 104, Y: 120, Z: 104, BlockType: "stone"} }},
		{kind: "blockBreak", payload: func() interface{} { return map[string]int{"x": 105, "y": 120, "z": 105} }},
		{kind: "curtainStrip", payload: func() interface{} {
			return curtainStripPayload{Blocks: []Block{{X: 106, Y: 120, Z: 106, BlockType: "red_curtain:s:open"}}}
		}},
		{kind: "glowSet", payload: func() interface{} { return Block{X: 107, Y: 120, Z: 107, BlockType: "glow_block:k6500"} }},
		{kind: "sprayPaint", payload: func() interface{} {
			return SprayPaint{X: 104, Y: 120, Z: 104, Face: "px", Color: "green"}
		}},
		{kind: "logicPress", payload: func() interface{} { return map[string]int{"x": 102, "y": 120, "z": 98} }},
		{kind: "storageOpen", payload: func() interface{} { return at }, answer: "storageClosed"},
		{kind: "storagePut", payload: req(map[string]interface{}{"type": "stone", "amount": 1}), answer: "storageResult"},
		{kind: "storageTake", payload: req(map[string]interface{}{"type": "dirt", "amount": 1, "slot": 0}), answer: "storageResult"},
		{kind: "microscopePrepare", payload: req(map[string]interface{}{"x": 98, "z": 98, "source": "cheek"}), answer: "storageResult"},
		{kind: "microscopeClear", payload: req(map[string]interface{}{"x": 98, "z": 98}), answer: "storageResult"},
		{kind: "microscopeDrop", payload: req(map[string]interface{}{"x": 98, "z": 98}), answer: "storageResult"},
		{kind: "microscopeCapture", payload: req(map[string]interface{}{"x": 98, "z": 98}), answer: "storageResult"},
		{kind: "microscopeStain", payload: req(map[string]interface{}{"x": 98, "z": 98, "source": "iodine_tincture"}), answer: "storageResult"},
		{kind: "cultureLoad", payload: req(map[string]interface{}{"x": 99, "z": 99, "slot": 0, "source": "agar_plate"}), answer: "storageResult"},
		{kind: "cultureInoculate", payload: req(map[string]interface{}{"x": 99, "z": 99, "slot": 0, "source": "sample_moss_a"}), answer: "storageResult"},
		{kind: "cultureHarvest", payload: req(map[string]interface{}{"x": 99, "z": 99, "slot": 0}), answer: "storageResult"},
		{kind: "cultureSet", payload: req(map[string]interface{}{"x": 99, "z": 99, "target": 30}), answer: "storageResult"},
	}
}

// Ana's plot with something to change in it: a chest with dirt, a block to break, a curtain, a glow block,
// a lever, a microscope and an incubator.
func claimFurnish(t *testing.T) {
	t.Helper()
	for _, block := range []Block{
		{X: 103, Y: 120, Z: 103, BlockType: "chest"}, {X: 105, Y: 120, Z: 105, BlockType: "dirt"},
		{X: 106, Y: 120, Z: 106, BlockType: "red_curtain:s:closed"}, {X: 107, Y: 120, Z: 107, BlockType: "glow_block"},
		{X: 102, Y: 120, Z: 98, BlockType: "lever"}, {X: 98, Y: 120, Z: 98, BlockType: "microscope"},
		{X: 99, Y: 120, Z: 99, BlockType: "incubator"}, {X: 104, Y: 119, Z: 104, BlockType: "stone"},
	} {
		if err := chunkStore.SetBlock(block.X, block.Y, block.Z, block.BlockType); err != nil {
			t.Fatal(err)
		}
	}
	storage.mu.Lock()
	storage.blocks[blockKey(103, 120, 103)] = &StorageBlock{X: 103, Y: 120, Z: 103, Slots: []StorageSlot{{Type: "dirt", Count: 5}}}
	storage.mu.Unlock()
}

func TestEveryProtectedPathRefusesAStrangerAndLetsTheOwnerAndTheAdmin(t *testing.T) {
	claimWorld(t)
	ana := claimAnaPlot(t)
	beto := claimClient(t, "Beto", plrBeto, 101, 121.6, 101)
	admin := claimClient(t, "Admin", plrAdm, 101, 121.6, 101)
	admin.creative.Store(true)
	claimFurnish(t)

	for _, path := range claimPaths() {
		claimHeard(beto)
		claimSend(t, beto, path.kind, path.payload())
		heard := claimHeard(beto)
		refusal := claimRefusalOf(t, heard)
		if refusal == nil || refusal.Reason != claimReasonPlot || refusal.Owner != "Ana" {
			t.Errorf("%s: a stranger is not refused: %+v", path.kind, refusal)
			continue
		}
		if path.answer != "" && len(heard[path.answer]) == 0 {
			t.Errorf("%s: no %s for the stranger", path.kind, path.answer)
		}
		if path.answer == "storageResult" {
			var outcome storageOutcome
			json.Unmarshal(heard["storageResult"][0], &outcome)
			if outcome.Amount != 0 || outcome.Reason != "protected" {
				t.Errorf("%s: %+v", path.kind, outcome)
			}
		}
	}
	// Nothing changed.
	for cell, want := range map[[3]int]string{{104, 120, 104}: "air", {105, 120, 105}: "dirt", {106, 120, 106}: "red_curtain:s:closed", {107, 120, 107}: "glow_block", {102, 120, 98}: "lever"} {
		if got := claimBlockAt(t, cell[0], cell[1], cell[2]); got != want {
			t.Errorf("%v: %q, want %q", cell, got, want)
		}
	}
	stateMu.RLock()
	painted := len(gameState.SprayPaints)
	stateMu.RUnlock()
	if painted != 0 {
		t.Error("the stranger painted")
	}
	storage.mu.Lock()
	if slots := storage.blocks[blockKey(103, 120, 103)].Slots; slots[0].Count != 5 {
		t.Errorf("the stranger took from the chest: %+v", slots)
	}
	storage.mu.Unlock()

	// The owner and the admin go through: never a claimRefused.
	for _, who := range []*Client{ana, admin} {
		for _, path := range claimPaths() {
			claimHeard(who)
			claimSend(t, who, path.kind, path.payload())
			if refusal := claimRefusalOf(t, claimHeard(who)); refusal != nil {
				t.Errorf("%s refused to %s: %+v", path.kind, who.username, refusal)
			}
		}
	}
	if claimBlockAt(t, 104, 120, 104) != "stone" || claimBlockAt(t, 105, 120, 105) != "air" {
		t.Error("the owner's place and break did not land")
	}
}

func TestARefusedBreakGivesTheSenderTheBlockBackWithItsMetadata(t *testing.T) {
	claimWorld(t)
	claimAnaPlot(t)
	beto := claimClient(t, "Beto", plrBeto, 101, 121.6, 101)
	sign := Block{X: 104, Y: 120, Z: 104, BlockType: "sign", Text: "Casa de Ana"}
	if err := chunkStore.SetBlock(sign.X, sign.Y, sign.Z, "sign"); err != nil {
		t.Fatal(err)
	}
	stateMu.Lock()
	gameState.Blocks[blockKey(sign.X, sign.Y, sign.Z)] = sign
	stateMu.Unlock()
	t.Cleanup(func() {
		stateMu.Lock()
		delete(gameState.Blocks, blockKey(sign.X, sign.Y, sign.Z))
		stateMu.Unlock()
	})
	claimSend(t, beto, "blockBreak", map[string]int{"x": 104, "y": 120, "z": 104})
	heard := claimHeard(beto)
	refusal := claimRefusalOf(t, heard)
	if refusal == nil || len(refusal.Blocks) != 1 || refusal.Blocks[0].BlockType != "sign" || refusal.Blocks[0].Text != "Casa de Ana" {
		t.Fatalf("refusal %+v", refusal)
	}
	if len(heard["blockBreak"]) != 0 {
		t.Fatal("a refused break is announced")
	}
}

func TestTheSpawnZoneIsNobodysAndOnlyTheAdminChangesIt(t *testing.T) {
	claimWorld(t)
	ana := claimClient(t, "Ana", plrAna, 0.5, 121.6, 0.5)
	admin := claimClient(t, "Admin", plrAdm, 0.5, 121.6, 0.5)
	admin.creative.Store(true)
	for _, cell := range [][2]int{{0, 0}, {-16, -16}, {15, 15}, {-16, 15}} {
		claimSend(t, ana, "blockPlace", Block{X: cell[0], Y: 120, Z: cell[1], BlockType: "stone"})
		if r := claimRefusalOf(t, claimHeard(ana)); r == nil || r.Reason != claimReasonSpawn || r.Owner != "" {
			t.Fatalf("%v: %+v", cell, r)
		}
	}
	for _, cell := range [][2]int{{16, 0}, {-17, 0}, {0, 16}, {0, -17}} {
		claimSend(t, ana, "blockPlace", Block{X: cell[0], Y: 120, Z: cell[1], BlockType: "stone"})
		if r := claimRefusalOf(t, claimHeard(ana)); r != nil {
			t.Fatalf("%v is outside the spawn zone: %+v", cell, r)
		}
	}
	claimSend(t, admin, "blockPlace", Block{X: 0, Y: 120, Z: 0, BlockType: "stone"})
	if r := claimRefusalOf(t, claimHeard(admin)); r != nil || claimBlockAt(t, 0, 120, 0) != "stone" {
		t.Fatalf("the admin builds at spawn: %+v", r)
	}
	// Turning creative off ends the bypass.
	claimSend(t, admin, "creativeOff", map[string]string{})
	claimSend(t, admin, "blockBreak", map[string]int{"x": 0, "y": 120, "z": 0})
	if r := claimRefusalOf(t, claimHeard(admin)); r == nil || claimBlockAt(t, 0, 120, 0) != "stone" {
		t.Fatalf("no longer the admin: %+v", r)
	}
}

func TestOnlyTheOwnerOrTheAdminBreaksTheMarkerAndThatRemovesThePlot(t *testing.T) {
	claimWorld(t)
	ana := claimAnaPlot(t)
	beto := claimClient(t, "Beto", plrBeto, 101, 121.6, 101)
	claimSend(t, beto, "blockBreak", map[string]int{"x": 100, "y": 120, "z": 100})
	if r := claimRefusalOf(t, claimHeard(beto)); r == nil || !claims.holds(plrAna) || claimBlockAt(t, 100, 120, 100) != claimMarkerBlock {
		t.Fatalf("Beto broke Ana's marker: %+v", r)
	}
	claimSend(t, ana, "blockBreak", map[string]int{"x": 100, "y": 120, "z": 100})
	if claims.holds(plrAna) || playerHolds(plrAna) {
		t.Fatal("the plot outlived its marker")
	}
	if list := claimLastList(t, claimHeard(beto)); len(list) != 0 {
		t.Fatalf("Beto still sees %+v", list)
	}
	// Now anyone may build there, and Ana may claim again.
	claimSend(t, beto, "blockPlace", Block{X: 101, Y: 120, Z: 101, BlockType: "stone"})
	if r := claimRefusalOf(t, claimHeard(beto)); r != nil {
		t.Fatalf("wild again: %+v", r)
	}
	claimSend(t, ana, "blockPlace", Block{X: 100, Y: 120, Z: 100, BlockType: claimMarkerBlock})
	if !claims.holds(plrAna) {
		t.Fatal("Ana claims again")
	}
	// The admin can break it too.
	admin := claimClient(t, "Admin", plrAdm, 101, 121.6, 101)
	admin.creative.Store(true)
	claimSend(t, admin, "blockBreak", map[string]int{"x": 100, "y": 120, "z": 100})
	if claims.holds(plrAna) {
		t.Fatal("the admin's break leaves the plot")
	}
}

func TestPlayerHoldsIsHavingAPlot(t *testing.T) {
	claimWorld(t)
	if playerHolds(plrAna) || playerHolds("") {
		t.Fatal("nothing held yet")
	}
	ana := claimAnaPlot(t)
	if !playerHolds(plrAna) || playerHolds(plrBeto) {
		t.Fatal("Ana holds her plot")
	}
	claimSend(t, ana, "blockBreak", map[string]int{"x": 100, "y": 120, "z": 100})
	if playerHolds(plrAna) {
		t.Fatal("nothing held after removing it")
	}
}

func TestPlotsSurviveARestart(t *testing.T) {
	claimWorld(t)
	claimAnaPlot(t)
	before := claims.list()
	saveWorldState()
	data, err := os.ReadFile(worldStatePath)
	if err != nil {
		t.Fatal(err)
	}
	var saved struct {
		Claims map[string]Claim `json:"claims"`
	}
	if err := json.Unmarshal(data, &saved); err != nil || len(saved.Claims) != 1 {
		t.Fatalf("world.json claims: %v %+v", err, saved.Claims)
	}

	claims = newClaimBook()
	if err := loadWorldState(); err != nil {
		t.Fatal(err)
	}
	after := claims.list()
	if len(after) != 1 || after[0].ID != before[0].ID || after[0].Owner != plrAna || !after[0].CreatedAt.Equal(before[0].CreatedAt) {
		t.Fatalf("after a restart: %+v", after)
	}
	beto := claimClient(t, "Beto", plrBeto, 101, 121.6, 101)
	claimSend(t, beto, "blockPlace", Block{X: 104, Y: 120, Z: 104, BlockType: "stone"})
	if r := claimRefusalOf(t, claimHeard(beto)); r == nil {
		t.Fatal("the plot protects after a restart")
	}
	if !playerHolds(plrAna) {
		t.Fatal("the index of owners is rebuilt")
	}
}

func TestLoadDropsPlotsThatCouldNotHaveBeenMade(t *testing.T) {
	book := newClaimBook()
	old := time.Unix(100, 0)
	book.load(map[string]Claim{
		"clm_a": {X: 0, Z: 0, Owner: plrAna, CreatedAt: old},
		"clm_b": {X: 10, Z: 0, Owner: plrBeto, CreatedAt: old.Add(time.Second)},     // overlaps a
		"clm_c": {X: 100, Z: 0, Owner: plrAna, CreatedAt: old.Add(2 * time.Second)}, // Ana's second
		"clm_d": {X: 200, Z: 0, Owner: "", CreatedAt: old},                          // nobody's
		"clm_e": {X: 300, Z: 0, Owner: plrBeto, OwnerName: "Beto\x00\x07", CreatedAt: old},
	})
	got := book.list()
	if len(got) != 2 || got[0].ID != "clm_a" || got[1].ID != "clm_e" || got[1].OwnerName != "Beto" {
		t.Fatalf("%+v", got)
	}
}

func TestTheChunkIndexFindsEveryColumnAndForgetsRemovedPlots(t *testing.T) {
	book := newClaimBook()
	var made []Claim
	// A grid of touching plots, across negative and positive chunks.
	for i := -3; i <= 3; i++ {
		for j := -3; j <= 3; j++ {
			c, reason, _ := book.create(fmt.Sprintf("plr_%d_%d", i, j), "", i*claimSize+5, 60, j*claimSize-3)
			if reason != "" {
				t.Fatalf("(%d, %d): %s", i, j, reason)
			}
			made = append(made, c)
		}
	}
	for _, c := range made {
		r := c.rect()
		for x := r.MinX; x <= r.MaxX; x++ {
			for z := r.MinZ; z <= r.MaxZ; z++ {
				got, ok := book.at(x, z)
				if !ok || got.ID != c.ID {
					t.Fatalf("(%d, %d) should be %s, is %+v", x, z, c.ID, got)
				}
			}
		}
	}
	// No chunk holds more than 4 plots: a lookup is a few comparisons.
	for chunk, list := range book.byChunk {
		if len(list) > 4 {
			t.Fatalf("chunk %v holds %d plots", chunk, len(list))
		}
	}
	for _, c := range made {
		book.remove(c.ID)
	}
	if len(book.byChunk) != 0 || len(book.byID) != 0 || len(book.byOwner) != 0 || len(book.byMarker) != 0 {
		t.Fatalf("left over: %d chunks", len(book.byChunk))
	}
	if claimChunkOf(-1) != -1 || claimChunkOf(-16) != -1 || claimChunkOf(-17) != -2 || claimChunkOf(15) != 0 || claimChunkOf(16) != 1 {
		t.Fatal("chunk of a column")
	}
}

// --- Mechanics across borders ---

// A ram facing east at (x, 0, 0) with a crank behind it and stone in front, in a fake world; the plots are
// in the global book.
func claimRamWorld(x int, sticky bool) (fakeCropWorld, *powerGrid, powerPos) {
	w := fakeCropWorld{}
	ram := "motor_ram:e:in"
	if sticky {
		ram = "sticky_ram:e:in"
	}
	g := newTestGrid(w, map[powerPos]string{{x, 0, 1}: "hand_crank", {x, 0, 0}: ram})
	w.SetBlock(x+1, 0, 0, "stone")
	return w, g, powerPos{x, 0, 1}
}

func claimPlotAt(t *testing.T, owner string, x, z int) Claim {
	t.Helper()
	c, reason, _ := claims.create(owner, owner, x, 0, z)
	if reason != "" {
		t.Fatal(reason)
	}
	return c
}

func TestRamsDoNotMoveBlocksAcrossAPlotBorder(t *testing.T) {
	claimWorld(t)
	// Ana's plot spans x 92..108 (marker at 100); Beto's x 109..125.
	claimPlotAt(t, plrAna, 100, 0)
	claimPlotAt(t, plrBeto, 117, 0)
	cases := []struct {
		name  string
		ramX  int
		moves bool
	}{
		{"in the wild, stopping short of the plot", 89, true}, // stone 90 -> 91, both wild
		{"from the wild into Ana's plot", 90, false},          // stone 91 -> 92
		{"from the wild, a block inside the plot", 91, false}, // stone 92 -> 93
		{"inside Ana's plot", 100, true},                      // 101 -> 102
		{"inside, up to its last column", 106, true},          // 107 -> 108
		{"from Ana's plot into Beto's", 107, false},           // 108 -> 109
		{"from Beto's plot out to the wild", 124, false},      // 125 -> 126
		{"far in the wild", 300, true},
	}
	for _, tc := range cases {
		w, g, crank := claimRamWorld(tc.ramX, false)
		now := time.Unix(1000, 0)
		mechRun(g, w, &crank, &now, 1)
		moved := w[[3]int{tc.ramX + 2, 0, 0}] == "stone"
		if moved != tc.moves {
			t.Errorf("%s: moved %v", tc.name, moved)
		}
		if !tc.moves && (w[[3]int{tc.ramX, 0, 0}] != "motor_ram:e:in" || w[[3]int{tc.ramX + 1, 0, 0}] != "stone") {
			t.Errorf("%s: the ram changed something: %q %q", tc.name, w[[3]int{tc.ramX, 0, 0}], w[[3]int{tc.ramX + 1, 0, 0}])
		}
	}
}

func TestAStickyRamDoesNotPullABlockOutOfAnotherPlot(t *testing.T) {
	claimWorld(t)
	claimPlotAt(t, plrAna, 100, 0) // x 92..108
	// A sticky ram in the wild at 89 pushes stone from 90 to 91 (both wild), then a plot is claimed over 91:
	// pulling it back would take a block out of the plot.
	w, g, crank := claimRamWorld(89, true)
	claims.remove(claims.list()[0].ID)
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 1)
	if w[[3]int{91, 0, 0}] != "stone" {
		t.Fatalf("pushed: %+v", w)
	}
	claimPlotAt(t, plrAna, 99, 0) // x 91..107: the stone is now in Ana's plot, the arm (90) is not
	mechRun(g, w, nil, &now, 70)
	if w[[3]int{91, 0, 0}] != "stone" || w[[3]int{90, 0, 0}] != "air" || w[[3]int{89, 0, 0}] != "sticky_ram:e:in" {
		t.Fatalf("the stone was pulled out of the plot, or the ram did not retract: %+v", w)
	}
}

func TestALiftOnlyCountsStopsInItsOwnZone(t *testing.T) {
	claimWorld(t)
	w := fakeCropWorld{}
	winch := powerPos{108, 20, 0} // the last column of Ana's plot
	claimPlotAt(t, plrAna, 100, 0)
	g := newTestGrid(w, map[powerPos]string{winch: "lift_winch", {108, 10, 1}: "lift_stop", {109, 12, 0}: "lift_stop"})
	stops := g.liftStops(winch)
	if len(stops) != 1 || stops[0] != (powerPos{108, 10, 1}) {
		t.Fatalf("stops %v", stops)
	}
}

// --- Admin ---

func TestAdminListsRemovesAndGivesPlots(t *testing.T) {
	claimWorld(t)
	claimAnaPlot(t)
	beto := claimClient(t, "Beto", plrBeto, 300, 121.6, 300)
	admin := claimClient(t, "Admin", plrAdm, 0, 121.6, 0)

	// Not an admin: ignored, as an unknown message.
	claimSend(t, beto, "claimAdmin", map[string]string{"action": "list"})
	if len(claimHeard(beto)["claimAdminResult"]) != 0 {
		t.Fatal("a player who is no admin got an answer")
	}
	admin.creative.Store(true)
	result := func() (out struct {
		OK     bool             `json:"ok"`
		Error  string           `json:"error"`
		Claims []claimAdminView `json:"claims"`
	}) {
		heard := claimHeard(admin)["claimAdminResult"]
		if len(heard) == 0 {
			t.Fatal("no answer")
		}
		json.Unmarshal(heard[len(heard)-1], &out)
		return out
	}
	claimSend(t, admin, "claimAdmin", map[string]string{"action": "list"})
	list := result()
	if !list.OK || len(list.Claims) != 1 || list.Claims[0].OwnerID != plrAna || list.Claims[0].Owner != "Ana" {
		t.Fatalf("list %+v", list)
	}
	id := list.Claims[0].ID

	claimSend(t, admin, "claimAdmin", map[string]string{"action": "owner", "id": id, "player": "beto"})
	if got := result(); !got.OK || got.Claims[0].OwnerID != plrBeto || got.Claims[0].Owner != "Beto" {
		t.Fatalf("owner %+v", got)
	}
	if !playerHolds(plrBeto) || playerHolds(plrAna) {
		t.Fatal("the plot is Beto's now")
	}
	if l := claimLastList(t, claimHeard(beto)); len(l) != 1 || !l[0].Mine {
		t.Fatalf("Beto sees it as his: %+v", l)
	}
	claimSend(t, admin, "claimAdmin", map[string]string{"action": "owner", "id": id, "player": "nobody-here"})
	if got := result(); got.OK || got.Error != "player" {
		t.Fatalf("unknown player %+v", got)
	}

	claimSend(t, admin, "claimAdmin", map[string]string{"action": "remove", "id": id})
	if got := result(); !got.OK || len(got.Claims) != 0 {
		t.Fatalf("remove %+v", got)
	}
	if claimBlockAt(t, 100, 120, 100) != "air" {
		t.Fatal("the marker of a removed plot stays")
	}
	claimSend(t, admin, "claimAdmin", map[string]string{"action": "remove", "id": id})
	if got := result(); got.OK || got.Error != "unknown" {
		t.Fatalf("remove twice %+v", got)
	}
}

// --- Concurrency ---

func TestClaimingIsAtomicUnderContention(t *testing.T) {
	claimWorld(t)
	const players = 24
	var wg sync.WaitGroup
	clientsList := make([]*Client, players)
	for i := range clientsList {
		clientsList[i] = claimClient(t, fmt.Sprintf("P%d", i), fmt.Sprintf("plr_%032d", i), 200, 121.6, 200)
	}
	// Everybody at once, all overlapping, and some readers checking columns meanwhile.
	for i, client := range clientsList {
		wg.Add(2)
		go func() {
			defer wg.Done()
			data, _ := json.Marshal(Block{X: 200 + i%5, Y: 120, Z: 200 - i%3, BlockType: claimMarkerBlock})
			handleMessage(client, Message{Type: "blockPlace", Payload: data})
		}()
		go func() {
			defer wg.Done()
			for k := 0; k < 50; k++ {
				claimCheck(client, 200+k%20, 200)
				claimZoneKey(200, 200+k%20)
				playerHolds(client.stablePlayerID())
			}
		}()
	}
	wg.Wait()
	if n := len(claims.list()); n != 1 {
		t.Fatalf("%d overlapping plots", n)
	}
	markers := 0
	for x := 200; x < 205; x++ {
		for z := 198; z <= 200; z++ {
			if claimBlockAt(t, x, 120, z) == claimMarkerBlock {
				markers++
			}
		}
	}
	if markers != 1 {
		t.Fatalf("%d markers in the world for one plot", markers)
	}
}

// --- Two browsers, two cookie jars, over real connections ---

func TestPlotsOverWebSocketsWithTwoBrowsers(t *testing.T) {
	claimWorldKeepingStorage(t)
	setupIdentity(t)
	mux := http.NewServeMux()
	mux.Handle("/", SessionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})))
	mux.HandleFunc("/ws", HandleWebSocket)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	ana, beto := newTestBrowser(t, server), newTestBrowser(t, server)
	ana.connect()
	beto.connect()
	// The server's goroutines outlive the handlers: they are gone before the world is put back.
	t.Cleanup(func() {
		ana.conn.Close()
		beto.conn.Close()
		for deadline := time.Now().Add(5 * time.Second); time.Now().Before(deadline); time.Sleep(10 * time.Millisecond) {
			clientsMu.RLock()
			left := len(clients)
			clientsMu.RUnlock()
			if left == 0 {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
	})
	ana.await("claimList")
	beto.await("claimList")
	ana.send("playerJoin", map[string]string{"playerId": "page_ana", "username": "Ana"})
	beto.send("playerJoin", map[string]string{"playerId": "page_beto", "username": "Beto"})
	ana.await("init")
	beto.await("init")
	ana.send("playerMove", Player{ID: "page_ana", X: 401, Y: 121.6, Z: 401})
	beto.send("playerMove", Player{ID: "page_beto", X: 402, Y: 121.6, Z: 402})
	ana.await("playerMove")
	beto.await("playerMove")

	ana.send("blockPlace", Block{X: 400, Y: 120, Z: 400, BlockType: claimMarkerBlock})
	ana.await("claimMade")
	payload, _ := beto.await("claimList")
	var list struct{ Claims []claimView }
	json.Unmarshal(payload, &list)
	if len(list.Claims) != 1 || list.Claims[0].Mine || list.Claims[0].Owner != "Ana" {
		t.Fatalf("Beto sees %+v", list.Claims)
	}

	beto.send("blockPlace", Block{X: 403, Y: 120, Z: 403, BlockType: "stone"})
	payload, _ = beto.await("claimRefused")
	var refusal claimRefusal
	json.Unmarshal(payload, &refusal)
	if refusal.Reason != claimReasonPlot || refusal.Owner != "Ana" {
		t.Fatalf("refusal %+v", refusal)
	}
	ana.send("blockPlace", Block{X: 403, Y: 120, Z: 403, BlockType: "stone"})
	for {
		payload, seen := ana.await("blockPlace")
		for _, raw := range seen {
			if containsString(raw, "claimRefused") {
				t.Fatalf("Ana refused in her own plot: %s", raw)
			}
		}
		var placed Block
		json.Unmarshal(payload, &placed)
		if placed.BlockType == "stone" && placed.X == 403 {
			break
		}
	}
}

// --- The viewer ---

func TestViewerClaimsPayloadHasNoPlayerIDs(t *testing.T) {
	claimWorld(t)
	claimAnaPlot(t)
	get := func(etag string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/viewer-api/claims", nil)
		request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "x"})
		if etag != "" {
			request.Header.Set("If-None-Match", etag)
		}
		ViewerAPI().ServeHTTP(recorder, request)
		return recorder
	}
	recorder := get("")
	if recorder.Code != http.StatusOK {
		t.Fatalf("status %d", recorder.Code)
	}
	body := recorder.Body.String()
	if containsString(body, plrAna) || containsString(body, "clm_") {
		t.Fatalf("ids in %s", body)
	}
	var answer struct {
		Spawn  map[string]int               `json:"spawn"`
		Claims []map[string]json.RawMessage `json:"claims"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &answer); err != nil {
		t.Fatal(err)
	}
	if answer.Spawn["minX"] != -16 || answer.Spawn["maxZ"] != 15 || len(answer.Claims) != 1 {
		t.Fatalf("%s", body)
	}
	if len(answer.Claims[0]) != 6 || string(answer.Claims[0]["owner"]) != `"Ana"` || string(answer.Claims[0]["y"]) != "120" {
		t.Fatalf("exactly the owner, the square and y: %s", body)
	}
	if again := get(recorder.Header().Get("ETag")); again.Code != http.StatusNotModified {
		t.Fatalf("unchanged plots: %d", again.Code)
	}
}
