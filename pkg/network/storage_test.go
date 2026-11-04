package network

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"minecloud/pkg/world"
)

var storageEye = &[3]float64{0.5, 1.5, 0.5}

func newTestBook() (*storageBook, fakeCropWorld) {
	book := newStorageBook()
	book.deliver = func(*Client, []byte) bool { return true }
	book.powered = func([3]int) bool { return false }
	book.adopt = func(int, int, int, string) {}
	book.wantPower = func([3]int, bool) {}
	return book, fakeCropWorld{{0, 0, 0}: "chest"}
}

func testPut(book *storageBook, w cropWorld, id, item string, amount int) storageOutcome {
	outcome, _ := book.put(w, storageEye, storageMove{Type: item, Amount: amount, ReqID: id})
	return outcome
}

func testTake(book *storageBook, w cropWorld, id, item string, slot, amount int) storageOutcome {
	outcome, _ := book.take(w, storageEye, storageMove{Slot: slot, Type: item, Amount: amount, ReqID: id})
	return outcome
}

func TestStorageCell(t *testing.T) {
	cases := []struct {
		name string
		y    int
		cap  int
		ok   bool
	}{
		{"chest", 5, 27, true},
		{"chest:e", 5, 27, true},
		{"barrel", 5, 18, true},
		{"wardrobe", 5, 45, true},
		{"wardrobe:lower:e", 5, 45, true},
		{"wardrobe:upper:n", 4, 45, true},
		{"fridge", 5, 18, true},
		{"fridge:lower:e", 5, 18, true},
		{"fridge:upper:e", 4, 18, true},
		{"chest_freezer:w", 5, 36, true},
		{"oven:e:on", 5, 3, true},
		{"oven", 5, 3, true},
		{"stone", 5, 0, false},
		{"chest_of_sorts", 5, 0, false},
	}
	for _, c := range cases {
		cell, capacity, ok := storageCell(1, 5, 2, c.name)
		if ok != c.ok || capacity != c.cap || (ok && cell != [3]int{1, c.y, 2}) {
			t.Errorf("storageCell(%q) = %v, %d, %v", c.name, cell, capacity, ok)
		}
	}
}

func TestStoragePutMergesAndFills(t *testing.T) {
	book, w := newTestBook()
	if got := testPut(book, w, "request-1", "stone", 10); got.Amount != 10 {
		t.Fatalf("put: %+v", got)
	}
	if got := testPut(book, w, "request-2", "stone", 5); got.Amount != 5 {
		t.Fatalf("put: %+v", got)
	}
	slots := book.blocks[blockKey(0, 0, 0)].Slots
	if len(slots) != 27 || slots[0].Count != 15 || slots[1].Count != 0 {
		t.Fatalf("stacks did not merge: %+v", slots[:2])
	}
	// More than a stack spills into the next slot.
	if got := testPut(book, w, "request-3", "stone", storageMaxStack); got.Amount != storageMaxStack {
		t.Fatalf("put: %+v", got)
	}
	if slots[0].Count != storageMaxStack || slots[1].Count != 15 {
		t.Fatalf("stack limit: %+v", slots[:2])
	}
}

func TestStorageFullTakesWhatFits(t *testing.T) {
	book, _ := newTestBook()
	w := fakeCropWorld{{0, 0, 0}: "barrel"}
	got := testPut(book, w, "request-1", "stone", storageMaxAmount)
	if got.Amount != storageMaxAmount {
		t.Fatalf("put: %+v", got)
	}
	for i := 0; i < 18; i++ {
		testPut(book, w, fmt.Sprintf("filler-%03d", i), fmt.Sprintf("item_%d", i), storageMaxStack)
	}
	got = testPut(book, w, "request-2", "dirt", 1)
	if got.Amount != 0 || got.Reason != "full" {
		t.Fatalf("a full barrel: %+v", got)
	}
}

func TestStorageTake(t *testing.T) {
	book, w := newTestBook()
	testPut(book, w, "request-1", "stone", 10)
	if got := testTake(book, w, "request-2", "dirt", 0, 1); got.Amount != 0 || got.Reason != "gone" {
		t.Fatalf("wrong type in the slot: %+v", got)
	}
	if got := testTake(book, w, "request-3", "stone", 0, 4); got.Amount != 4 {
		t.Fatalf("take: %+v", got)
	}
	if got := testTake(book, w, "request-4", "stone", 0, 100); got.Amount != 6 {
		t.Fatalf("take more than there is: %+v", got)
	}
	if got := testTake(book, w, "request-5", "stone", 0, 1); got.Amount != 0 {
		t.Fatalf("take from empty: %+v", got)
	}
	if len(book.blocks) != 0 {
		t.Fatalf("an emptied chest keeps no entry: %+v", book.blocks)
	}
}

func TestStorageValidation(t *testing.T) {
	book, w := newTestBook()
	w[[3]int{50, 0, 0}] = "chest"
	cases := []struct {
		name   string
		eye    *[3]float64
		move   storageMove
		reason string
	}{
		{"amount zero", storageEye, storageMove{Type: "stone", Amount: 0, ReqID: "case-0001"}, "bad amount"},
		{"amount negative", storageEye, storageMove{Type: "stone", Amount: -5, ReqID: "case-0002"}, "bad amount"},
		{"amount huge", storageEye, storageMove{Type: "stone", Amount: storageMaxAmount + 1, ReqID: "case-0003"}, "bad amount"},
		{"no item", storageEye, storageMove{Amount: 1, ReqID: "case-0004"}, "bad item"},
		{"air", storageEye, storageMove{Type: "air", Amount: 1, ReqID: "case-0005"}, "bad item"},
		{"item with a state", storageEye, storageMove{Type: "chest:e", Amount: 1, ReqID: "case-0006"}, "bad item"},
		{"item too long", storageEye, storageMove{Type: strings.Repeat("a", 65), Amount: 1, ReqID: "case-0007"}, "bad item"},
		{"markup", storageEye, storageMove{Type: "<img>", Amount: 1, ReqID: "case-0008"}, "bad item"},
		{"nobody", nil, storageMove{Type: "stone", Amount: 1, ReqID: "case-0009"}, "too far"},
		{"too far", storageEye, storageMove{X: 50, Type: "stone", Amount: 1, ReqID: "case-0010"}, "too far"},
		{"no block", storageEye, storageMove{X: 1, Type: "stone", Amount: 1, ReqID: "case-0011"}, "not a storage block"},
	}
	for _, c := range cases {
		for name, apply := range map[string]func(cropWorld, *[3]float64, storageMove) (storageOutcome, bool){"put": book.put, "take": book.take} {
			c.move.ReqID += name
			got, changed := apply(w, c.eye, c.move)
			if got.Amount != 0 || changed || got.Reason != c.reason {
				t.Errorf("%s %s: %+v, changed %v", name, c.name, got, changed)
			}
		}
	}
	if len(book.blocks) != 0 {
		t.Fatalf("nothing should be stored: %+v", book.blocks)
	}
	// Bad request ids are not even remembered.
	before := len(book.log)
	for _, id := range []string{"", "short", strings.Repeat("x", 65), "with space 1", "../../etc"} {
		if got, _ := book.put(w, storageEye, storageMove{Type: "stone", Amount: 1, ReqID: id}); got.Amount != 0 || got.ReqID != "" {
			t.Errorf("request id %q: %+v", id, got)
		}
	}
	if len(book.log) != before {
		t.Fatal("bad ids reached the log")
	}
	// Slots out of range.
	testPut(book, w, "request-1", "stone", 3)
	for i, slot := range []int{-1, 27, 1 << 30} {
		if got := testTake(book, w, fmt.Sprintf("slot-%04d", i), "stone", slot, 1); got.Amount != 0 || got.Reason != "bad slot" {
			t.Errorf("slot %d: %+v", slot, got)
		}
	}
}

// A repeated request (a retry, a replay) moves nothing twice: it gets the first answer again.
func TestStorageRequestsApplyOnce(t *testing.T) {
	book, w := newTestBook()
	first := testPut(book, w, "request-1", "stone", 10)
	again := testPut(book, w, "request-1", "stone", 10)
	if first != again || book.blocks[blockKey(0, 0, 0)].Slots[0].Count != 10 {
		t.Fatalf("a put applied twice: %+v %+v %+v", first, again, book.blocks)
	}
	took := testTake(book, w, "request-2", "stone", 0, 3)
	if again := testTake(book, w, "request-2", "stone", 0, 3); again != took || book.blocks[blockKey(0, 0, 0)].Slots[0].Count != 7 {
		t.Fatalf("a take applied twice: %+v", again)
	}
}

// A client that heard nothing asks. What was applied is answered; what never arrived dies, and
// can no longer apply if it turns up late on the old connection.
func TestStorageSync(t *testing.T) {
	book, w := newTestBook()
	testPut(book, w, "request-1", "stone", 10)
	answers := book.sync([]string{"request-1", "request-2", "bad id!"})
	if len(answers) != 2 || answers[0].Amount != 10 || answers[1].Amount != 0 || answers[1].ReqID != "request-2" {
		t.Fatalf("sync: %+v", answers)
	}
	if got := testPut(book, w, "request-2", "stone", 5); got.Amount != 0 {
		t.Fatalf("a dead request applied: %+v", got)
	}
	if book.blocks[blockKey(0, 0, 0)].Slots[0].Count != 10 {
		t.Fatalf("contents changed: %+v", book.blocks)
	}
	if many := book.sync(make([]string, storageSyncMax*2)); len(many) != 0 {
		t.Fatalf("empty ids answered: %+v", many)
	}
}

func TestStorageLogIsBounded(t *testing.T) {
	book, w := newTestBook()
	for i := 0; i < storageLogSize+50; i++ {
		testPut(book, w, fmt.Sprintf("request-%d", i), "stone", 1)
	}
	if len(book.log) != storageLogSize || len(book.logFIFO) != storageLogSize {
		t.Fatalf("log grew to %d, %d", len(book.log), len(book.logFIFO))
	}
}

func TestStorageBreakSpillsOnceAndClosesPanels(t *testing.T) {
	book, w := newTestBook()
	var mu sync.Mutex
	var sent []string
	book.deliver = func(_ *Client, data []byte) bool {
		mu.Lock()
		defer mu.Unlock()
		sent = append(sent, string(data))
		return true
	}
	viewer := &Client{}
	if _, ok := book.open(w, storageEye, viewer, 0, 0, 0); !ok {
		t.Fatal("open")
	}
	testPut(book, w, "request-1", "stone", 10)
	testPut(book, w, "request-2", "dirt", 3)
	if len(sent) != 2 || !strings.Contains(sent[1], "storageContents") {
		t.Fatalf("the viewer should have seen both moves: %v", sent)
	}

	breakChest := func() []StorageSlot {
		spill, _, err := book.replace(w, 0, 0, 0, "", func() (bool, error) {
			return false, w.SetBlock(0, 0, 0, "")
		})
		if err != nil {
			t.Fatal(err)
		}
		return spill
	}
	spill := breakChest()
	if len(spill) != 2 || spill[0] != (StorageSlot{Type: "stone", Count: 10}) || spill[1] != (StorageSlot{Type: "dirt", Count: 3}) {
		t.Fatalf("spill: %+v", spill)
	}
	if !strings.Contains(sent[len(sent)-1], "storageClosed") || len(book.viewers) != 0 || len(book.viewing) != 0 {
		t.Fatalf("panels not closed: %v", sent)
	}
	// A move that loses the race finds no chest: nothing is lost, it is refused and refunded.
	if got := testPut(book, w, "request-3", "stone", 1); got.Amount != 0 || got.Reason != "not a storage block" {
		t.Fatalf("put after the break: %+v", got)
	}
	if got := testTake(book, w, "request-4", "stone", 0, 1); got.Amount != 0 {
		t.Fatalf("take after the break: %+v", got)
	}
	// Breaking the empty cell again spills nothing, and a new chest there starts empty.
	if again := breakChest(); len(again) != 0 {
		t.Fatalf("spilled twice: %+v", again)
	}
	w[[3]int{0, 0, 0}] = "chest"
	if snapshot, _ := book.open(w, storageEye, viewer, 0, 0, 0); !storageIsEmpty(snapshot.Slots) {
		t.Fatalf("a new chest should be empty: %+v", snapshot)
	}
}

func TestStorageReplaceKeepsContentsOfTheSameChest(t *testing.T) {
	book, w := newTestBook()
	testPut(book, w, "request-1", "stone", 10)
	set := func(name string) func() (bool, error) {
		return func() (bool, error) { return false, w.SetBlock(0, 0, 0, name) }
	}
	if spill, _, _ := book.replace(w, 0, 0, 0, "chest:e", set("chest:e")); spill != nil {
		t.Fatalf("turning a chest spilled it: %+v", spill)
	}
	if book.blocks[blockKey(0, 0, 0)] == nil {
		t.Fatal("contents gone")
	}
	// Another block in its place hands the items over.
	if spill, _, _ := book.replace(w, 0, 0, 0, "stone", set("stone")); len(spill) != 1 || spill[0].Count != 10 {
		t.Fatalf("replacing a chest: %+v", spill)
	}
	if len(book.blocks) != 0 {
		t.Fatalf("entry left behind: %+v", book.blocks)
	}
}

func TestStorageWardrobeKeepsContentsInTheLowerCell(t *testing.T) {
	book, _ := newTestBook()
	w := fakeCropWorld{{0, 0, 0}: "wardrobe:lower:e", {0, 1, 0}: "wardrobe:upper:e"}
	// Clicking either half reaches the same contents.
	if got, _ := book.put(w, storageEye, storageMove{Y: 1, Type: "stone", Amount: 5, ReqID: "request-1"}); got.Amount != 5 {
		t.Fatalf("put through the upper half: %+v", got)
	}
	if got := testTake(book, w, "request-2", "stone", 0, 2); got.Amount != 2 {
		t.Fatalf("take through the lower half: %+v", got)
	}
	if len(book.blocks) != 1 || book.blocks[blockKey(0, 0, 0)] == nil {
		t.Fatalf("not in the lower cell: %+v", book.blocks)
	}
	// Breaking the upper half spills; the lower half that goes after it has nothing left.
	spill, _, _ := book.replace(w, 0, 1, 0, "", func() (bool, error) { return false, w.SetBlock(0, 1, 0, "") })
	if len(spill) != 1 || spill[0].Count != 3 {
		t.Fatalf("spill: %+v", spill)
	}
	spill, _, _ = book.replace(w, 0, 0, 0, "", func() (bool, error) { return false, w.SetBlock(0, 0, 0, "") })
	if len(spill) != 0 {
		t.Fatalf("spilled twice: %+v", spill)
	}
}

func TestStorageOpenValidation(t *testing.T) {
	book, w := newTestBook()
	client := &Client{}
	if _, ok := book.open(w, nil, client, 0, 0, 0); ok {
		t.Error("nobody can open")
	}
	if _, ok := book.open(w, &[3]float64{100, 0, 0}, client, 0, 0, 0); ok {
		t.Error("too far")
	}
	if _, ok := book.open(w, storageEye, client, 3, 0, 0); ok {
		t.Error("not a chest")
	}
	snapshot, ok := book.open(w, storageEye, client, 0, 0, 0)
	if !ok || snapshot.Capacity != 27 || len(snapshot.Slots) != 27 {
		t.Fatalf("open: %+v", snapshot)
	}
	// One chest at a time; forgetting leaves no trace.
	w[[3]int{1, 0, 0}] = "barrel"
	book.open(w, storageEye, client, 1, 0, 0)
	if len(book.viewers) != 1 || book.viewing[client] != [3]int{1, 0, 0} {
		t.Fatalf("viewers: %+v", book.viewers)
	}
	book.forget(client)
	if len(book.viewers) != 0 || len(book.viewing) != 0 {
		t.Fatalf("left behind: %+v %+v", book.viewers, book.viewing)
	}
}

func TestStoragePersistence(t *testing.T) {
	book, w := newTestBook()
	testPut(book, w, "request-1", "stone", 10)
	blocks, outcomes := book.snapshot()
	data, err := json.Marshal(persistedWorldState{Storage: blocks, StorageLog: outcomes})
	if err != nil {
		t.Fatal(err)
	}
	var saved persistedWorldState
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatal(err)
	}
	restored, _ := newTestBook()
	restored.load(saved.Storage, saved.StorageLog)
	if got := testTake(restored, w, "request-2", "stone", 0, 4); got.Amount != 4 {
		t.Fatalf("contents did not survive: %+v", got)
	}
	// The answers survive too: the client that never heard about request-1 learns it landed.
	if answers := restored.sync([]string{"request-1"}); answers[0].Amount != 10 {
		t.Fatalf("log did not survive: %+v", answers)
	}
	// Hand-edited or damaged slots do not load.
	restored.load(map[string]StorageBlock{
		"1,0,0": {X: 1, Slots: []StorageSlot{{Type: "stone", Count: -5}, {Count: 3}, {Type: "bad name", Count: 1}, {Type: "stone", Count: storageMaxStack + 1}}},
		"2,0,0": {X: 2, Slots: []StorageSlot{{}, {Type: "stone", Count: 2}}},
	}, nil)
	if len(restored.blocks) != 1 || restored.blocks[blockKey(2, 0, 0)].Slots[1].Count != 2 {
		t.Fatalf("load: %+v", restored.blocks)
	}
}

// Many players on one chest while it is broken and rebuilt: every item ends up in exactly one
// place. Run with -race.
func TestStorageConcurrentConservation(t *testing.T) {
	book, w := newTestBook()
	var mu sync.Mutex
	var put, taken, spilled int
	var wg sync.WaitGroup
	for player := 0; player < 8; player++ {
		wg.Add(1)
		go func(player int) {
			defer wg.Done()
			for i := 0; i < 400; i++ {
				got := testPut(book, w, fmt.Sprintf("put-%d-%d", player, i), "stone", 3)
				mu.Lock()
				put += got.Amount
				mu.Unlock()
				got = testTake(book, w, fmt.Sprintf("take-%d-%d", player, i), "stone", i%3, 2)
				mu.Lock()
				taken += got.Amount
				mu.Unlock()
			}
		}(player)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 400; i++ {
			name, block := "", "air"
			if i%2 == 1 {
				name, block = "chest", "chest"
			}
			spill, _, err := book.replace(w, 0, 0, 0, name, func() (bool, error) { return false, w.SetBlock(0, 0, 0, block) })
			if err != nil {
				t.Error(err)
			}
			mu.Lock()
			for _, slot := range spill {
				spilled += slot.Count
			}
			mu.Unlock()
		}
	}()
	wg.Wait()

	left := 0
	blocks, _ := book.snapshot()
	for _, block := range blocks {
		for _, slot := range block.Slots {
			left += slot.Count
		}
	}
	if put != taken+spilled+left {
		t.Fatalf("put %d != taken %d + spilled %d + left %d", put, taken, spilled, left)
	}
	if put == 0 || taken == 0 {
		t.Fatalf("the race never happened: put %d, taken %d, spilled %d", put, taken, spilled)
	}
}

// Rams never move storage or furniture of two cells (their contents and other half stay where
// they are), and a ram with a chest in its line simply waits.
func TestStorageIgnoresOversizedMessages(t *testing.T) {
	id := "request-oversized"
	payload := `{"reqIds":["` + id + `"]` + strings.Repeat(" ", storageMaxPayload) + `}`
	handleStorageMessage(&Client{}, Message{Type: "storageSync", Payload: []byte(payload)})
	if _, known := storage.log[id]; known {
		t.Fatal("an oversized message was read")
	}
}

// While a broken wardrobe's halves go one message after the other, nothing lands in the gone cell.
func TestStorageUpperHalfAloneIsNotStorage(t *testing.T) {
	book, _ := newTestBook()
	w := fakeCropWorld{{0, 1, 0}: "wardrobe:upper:e"}
	got, changed := book.put(w, storageEye, storageMove{Y: 1, Type: "stone", Amount: 5, ReqID: "request-1"})
	if got.Amount != 0 || changed || got.Reason != "not a storage block" {
		t.Fatalf("put: %+v", got)
	}
	if len(book.blocks) != 0 {
		t.Fatalf("orphan contents: %+v", book.blocks)
	}
	// Nor can a lone upper half reach into the chest below it.
	w = fakeCropWorld{{0, 0, 0}: "chest", {0, 1, 0}: "wardrobe:upper:e"}
	if got, _ := book.put(w, storageEye, storageMove{Y: 1, Type: "stone", Amount: 5, ReqID: "request-2"}); got.Amount != 0 {
		t.Fatalf("put through a lone half: %+v", got)
	}
}

func TestRamsDoNotMoveStorage(t *testing.T) {
	for _, name := range []string{"chest", "chest:e", "barrel", "wardrobe", "wardrobe:upper:s", "fridge", "fridge:upper:e", "chest_freezer", "chest_freezer:e", "oven", "oven:e:on",
		"floor_lamp", "floor_lamp:upper", "bathtub", "bathtub:head:e",
		"bed", "bed:e", "bed:n:foot", "bed:n:head", "bed:e:foot", "bed:w:head"} {
		if mechMovable(name) {
			t.Errorf("%s should not move", name)
		}
	}
	for _, name := range []string{"oak_chair", "oak_chair:e", "table", "white_stained_glass", "red_carpet"} {
		if !mechMovable(name) {
			t.Errorf("%s should move", name)
		}
	}
	w, g, crank := newRamWorld("motor_ram:e:in", "stone", "chest")
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 3)
	if w[[3]int{1, 0, 0}] != "stone" || w[[3]int{2, 0, 0}] != "chest" {
		t.Fatalf("the chest moved: %+v", w)
	}
}

// The real message handlers and chunk store: returns a player standing next to (2, 120, 2), a way to
// make new ones, and how to talk to them.
func storageMessages(t *testing.T) (newClient func(string) *Client, send func(*Client, string, interface{}), expect func(*Client, string) json.RawMessage) {
	t.Helper()
	t.Chdir(t.TempDir())
	previous := chunkStore
	store, err := world.Open(filepath.Join(t.TempDir(), "chunks"), nil)
	if err != nil {
		t.Fatal(err)
	}
	chunkStore = store
	storage = newStorageBook()
	t.Cleanup(func() {
		chunkStore = previous
		storage = newStorageBook()
	})

	newClient = func(id string) *Client {
		client := &Client{ID: id, username: id, send: make(chan []byte, 256), done: make(chan struct{})}
		clientsMu.Lock()
		clients[client] = true
		clientsMu.Unlock()
		stateMu.Lock()
		gameState.Players[id] = Player{ID: id, Username: id, X: 2, Y: 121, Z: 2}
		stateMu.Unlock()
		t.Cleanup(func() {
			clientsMu.Lock()
			delete(clients, client)
			clientsMu.Unlock()
			stateMu.Lock()
			delete(gameState.Players, id)
			stateMu.Unlock()
		})
		return client
	}
	send = func(client *Client, kind string, payload interface{}) {
		data, _ := json.Marshal(payload)
		handleMessage(client, Message{Type: kind, Payload: data})
	}
	expect = func(client *Client, kind string) json.RawMessage {
		for {
			select {
			case data := <-client.send:
				var message Message
				if err := json.Unmarshal(data, &message); err != nil {
					t.Fatal(err)
				}
				if message.Type == kind {
					return message.Payload
				}
			default:
				t.Fatalf("no %s for %s", kind, client.ID)
			}
		}
	}
	return newClient, send, expect
}

// A single player of storageMessages.
func storageMessageRig(t *testing.T) (*Client, func(*Client, string, interface{}), func(*Client, string) json.RawMessage) {
	t.Helper()
	newClient, send, expect := storageMessages(t)
	return newClient("alice"), send, expect
}

// The whole path through the real message handlers and chunk store.
func TestStorageThroughMessages(t *testing.T) {
	newClient, send, expect := storageMessages(t)
	at := map[string]int{"x": 2, "y": 120, "z": 2}

	alice, bob := newClient("alice"), newClient("bob")
	send(alice, "blockPlace", Block{X: 2, Y: 120, Z: 2, BlockType: "chest"})
	send(alice, "storageOpen", at)
	expect(alice, "storageContents")
	send(bob, "storageOpen", at)
	expect(bob, "storageContents")

	send(alice, "storagePut", map[string]interface{}{"x": 2, "y": 120, "z": 2, "type": "stone", "amount": 7, "reqId": "alice-put-1"})
	var outcome storageOutcome
	json.Unmarshal(expect(alice, "storageResult"), &outcome)
	if outcome.Amount != 7 {
		t.Fatalf("put: %+v", outcome)
	}
	// Bob sees it in his open panel, and it is on disk already.
	var seen storageSnapshot
	json.Unmarshal(expect(bob, "storageContents"), &seen)
	if seen.Slots[0] != (StorageSlot{Type: "stone", Count: 7}) || seen.Capacity != 27 {
		t.Fatalf("bob sees: %+v", seen)
	}
	saved, err := os.ReadFile(worldStatePath)
	if err != nil || !strings.Contains(string(saved), `"stone"`) {
		t.Fatalf("not saved: %v %s", err, saved)
	}

	// Bob breaks it: the items reach him alone, and both panels close.
	send(bob, "blockBreak", at)
	var drop struct {
		Items []StorageSlot `json:"items"`
	}
	json.Unmarshal(expect(bob, "storageDrop"), &drop)
	if len(drop.Items) != 1 || drop.Items[0].Count != 7 {
		t.Fatalf("drop: %+v", drop)
	}
	expect(alice, "storageClosed")
	for len(alice.send) > 0 {
		var message Message
		json.Unmarshal(<-alice.send, &message)
		if message.Type == "storageDrop" {
			t.Fatal("alice got a copy of the drop")
		}
	}

	// Alice's move races with the break and loses: refused, so her client refunds it.
	send(alice, "storagePut", map[string]interface{}{"x": 2, "y": 120, "z": 2, "type": "stone", "amount": 1, "reqId": "alice-put-2"})
	json.Unmarshal(expect(alice, "storageResult"), &outcome)
	if outcome.Amount != 0 {
		t.Fatalf("put on nothing: %+v", outcome)
	}
}
