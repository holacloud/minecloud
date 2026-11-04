package network

import (
	"encoding/json"
	"log"
	"math"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Furniture that really stores items (js/game/storage.js draws the panel). The contents live
// here: they are saved in world.json ("storage"), shared by all players, and every change goes
// through storageBook under one mutex, together with the chunk read that proves the block is
// still there. So a move and a break of the same chest are always in some order: either the
// move lands first and the items are in what the break spills, or the break lands first and
// the move finds no chest and moves nothing.
//
//   - storageOpen   {x, y, z}: start watching a chest; answers storageContents.
//   - storageClose  {}: stop watching.
//   - storagePut    {x, y, z, type, amount, reqId}: the client has already taken the items out
//     of its inventory; storageResult says how many landed and it gives the rest back.
//   - storageTake   {x, y, z, slot, type, amount, reqId}: storageResult says how many left the
//     chest and the client adds them. `type` must match the slot (someone may have emptied it).
//   - storageSync   {reqIds}: "I never heard back about these". Each is answered from the log,
//     or marked dead if it never arrived (it can then never apply), so a lost message, a
//     reconnection or a page reload neither loses nor duplicates what was on its way.
//   - storageContents goes to everyone watching after each change, storageClosed when the block
//     is gone, and storageDrop {x, y, z, items} to the one client that broke or replaced a chest
//     (drops are client-side pickups: sent to everyone, everyone could collect a copy).
//
// A move is applied, saved, and only then answered. The log of answers is saved in the same
// file as the contents, so after a crash they still agree.
//
// What this does NOT protect: the player's inventory lives in the browser and the server has no
// way to know what it holds. A modified client can put items it never had, and the position the
// reach check reads is reported by the client too. The server only guarantees that what is in a
// chest stays consistent: an item is either in the chest or handed to one client, never both.
//
// storageKinds is mirrored by STORAGE_KINDS in js/game/storage.js (test/js/furniture.test.js).

var storageKinds = map[string]int{
	"barrel":   18,
	"chest":    27,
	"wardrobe": 45,
}

const (
	// The most one slot holds, and the most one message moves.
	storageMaxStack  = 999
	storageMaxAmount = 9999
	// From the player's eye to the middle of the block: the client's own reach is 4.5, and
	// positions arrive every 100 ms, so a running player must not get a false refusal.
	storageReach = 9.0
	// How many answers are remembered (a client asks again within seconds, or at its next visit).
	storageLogSize = 512
	// The most ids one storageSync asks about.
	storageSyncMax = 64
	// The longest message: 64 ids of 64 characters, and room to spare. The websocket has no limit.
	storageMaxPayload = 8192
)

var (
	storageItemName = regexp.MustCompile(`^[a-z0-9_]{1,64}$`)
	storageRequest  = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
)

// StorageSlot is one stack; an empty slot has no type.
type StorageSlot struct {
	Type  string `json:"type,omitempty"`
	Count int    `json:"count,omitempty"`
}

// StorageBlock is the contents of one chest, by the position of its base cell. Only blocks that
// hold something have an entry.
type StorageBlock struct {
	X     int           `json:"x"`
	Y     int           `json:"y"`
	Z     int           `json:"z"`
	Slots []StorageSlot `json:"slots"`
}

// storageOutcome answers one request: how many items moved (0 when refused).
type storageOutcome struct {
	ReqID  string `json:"reqId"`
	Type   string `json:"type,omitempty"`
	Amount int    `json:"amount"`
	Reason string `json:"reason,omitempty"`
}

// storageMove is a storagePut or storageTake message.
type storageMove struct {
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Z      int    `json:"z"`
	Slot   int    `json:"slot"`
	Type   string `json:"type"`
	Amount int    `json:"amount"`
	ReqID  string `json:"reqId"`
}

// storageSnapshot is what a storageContents message carries; Rev grows with every change, so a
// client can ignore one that arrives late.
type storageSnapshot struct {
	X        int           `json:"x"`
	Y        int           `json:"y"`
	Z        int           `json:"z"`
	Capacity int           `json:"capacity"`
	Slots    []StorageSlot `json:"slots"`
	Rev      int64         `json:"rev"`
}

// storageBase is a block name without its states.
func storageBase(name string) string {
	base, _, _ := strings.Cut(name, ":")
	return base
}

// storageCell finds the base cell and size of the storage block `name` at (x, y, z). A wardrobe
// is two cells (js/game/furniture.js: half, facing) and keeps its contents in the lower one.
func storageCell(x, y, z int, name string) (cell [3]int, capacity int, ok bool) {
	capacity, ok = storageKinds[storageBase(name)]
	if !ok {
		return cell, 0, false
	}
	if strings.HasPrefix(name, "wardrobe:upper") {
		y--
	}
	return [3]int{x, y, z}, capacity, true
}

// storageBook holds every chest's contents and who is watching them. Lock order: mu, then
// cropMu and powerMu (setBlockTracked), then the chunk store, then stateMu and clientsMu.
// Never call saveWorldState while holding mu.
type storageBook struct {
	mu      sync.Mutex
	blocks  map[string]*StorageBlock
	log     map[string]storageOutcome
	logFIFO []string
	rev     int64
	viewers map[[3]int]map[*Client]bool
	viewing map[*Client][3]int
	// Sends a message to a watcher (replaced by the tests).
	deliver func(*Client, []byte) bool
}

func newStorageBook() *storageBook {
	return &storageBook{
		blocks:  make(map[string]*StorageBlock),
		log:     make(map[string]storageOutcome),
		viewers: make(map[[3]int]map[*Client]bool),
		viewing: make(map[*Client][3]int),
		deliver: storageDeliver,
	}
}

var storage = newStorageBook()

// storageDeliver sends without blocking, and never to a channel broadcastToAll has closed.
func storageDeliver(client *Client, data []byte) bool {
	clientsMu.RLock()
	defer clientsMu.RUnlock()
	if !clients[client] {
		return false
	}
	select {
	case client.send <- data:
		return true
	default:
		return false
	}
}

func storageKeyOf(cell [3]int) string {
	return blockKey(cell[0], cell[1], cell[2])
}

// locate proves the block at (x, y, z) is storage. The upper half of a wardrobe only counts over
// its lower half: while the two halves of a broken wardrobe are removed one message after the
// other, nothing can land in a cell that is already gone. Caller holds mu.
func (b *storageBook) locate(w cropWorld, x, y, z int) (cell [3]int, capacity int, ok bool) {
	name, err := w.Block(x, y, z)
	if err != nil {
		log.Printf("storage: %v", err)
		return cell, 0, false
	}
	cell, capacity, ok = storageCell(x, y, z, name)
	if ok && cell[1] != y {
		below, err := w.Block(x, y-1, z)
		if err != nil {
			log.Printf("storage: %v", err)
			return cell, 0, false
		}
		if !strings.HasPrefix(below, "wardrobe") || strings.HasPrefix(below, "wardrobe:upper") {
			return cell, 0, false
		}
	}
	return cell, capacity, ok
}

func storageInReach(eye [3]float64, x, y, z int) bool {
	dx := eye[0] - (float64(x) + 0.5)
	dy := eye[1] - (float64(y) + 0.5)
	dz := eye[2] - (float64(z) + 0.5)
	return math.Sqrt(dx*dx+dy*dy+dz*dz) <= storageReach
}

// snapshotLocked copies the contents of a cell, padded to its capacity.
func (b *storageBook) snapshotLocked(cell [3]int, capacity int) storageSnapshot {
	slots := make([]StorageSlot, capacity)
	if block := b.blocks[storageKeyOf(cell)]; block != nil {
		copy(slots, block.Slots)
	}
	return storageSnapshot{X: cell[0], Y: cell[1], Z: cell[2], Capacity: capacity, Slots: slots, Rev: b.rev}
}

// notifyLocked tells everyone watching a cell what it holds now.
func (b *storageBook) notifyLocked(cell [3]int, capacity int) {
	if len(b.viewers[cell]) == 0 {
		return
	}
	data := createMessage("storageContents", b.snapshotLocked(cell, capacity))
	for client := range b.viewers[cell] {
		b.deliver(client, data)
	}
}

func (b *storageBook) rememberLocked(outcome storageOutcome) storageOutcome {
	if _, known := b.log[outcome.ReqID]; !known {
		b.logFIFO = append(b.logFIFO, outcome.ReqID)
		for len(b.logFIFO) > storageLogSize {
			delete(b.log, b.logFIFO[0])
			b.logFIFO = b.logFIFO[1:]
		}
	}
	b.log[outcome.ReqID] = outcome
	return outcome
}

// storageCheckMove is what any move must pass before it touches anything: "" when valid.
func storageCheckMove(move storageMove) string {
	if move.Amount < 1 || move.Amount > storageMaxAmount {
		return "bad amount"
	}
	if !storageItemName.MatchString(move.Type) || move.Type == "air" {
		return "bad item"
	}
	return ""
}

// beginMoveLocked runs the checks a put and a take share. It returns the chest, or the answer to
// send instead (already in the log if it needs to be).
func (b *storageBook) beginMoveLocked(w cropWorld, eye *[3]float64, move storageMove) (cell [3]int, capacity int, done *storageOutcome) {
	if !storageRequest.MatchString(move.ReqID) {
		return cell, 0, &storageOutcome{Reason: "bad request"}
	}
	if known, ok := b.log[move.ReqID]; ok {
		return cell, 0, &known
	}
	reason := storageCheckMove(move)
	if reason == "" && (eye == nil || !storageInReach(*eye, move.X, move.Y, move.Z)) {
		reason = "too far"
	}
	if reason == "" {
		var ok bool
		if cell, capacity, ok = b.locate(w, move.X, move.Y, move.Z); !ok {
			reason = "not a storage block"
		}
	}
	if reason != "" {
		outcome := b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Reason: reason})
		return cell, 0, &outcome
	}
	return cell, capacity, nil
}

// put adds up to move.Amount items, onto stacks of the same type first and then into empty
// slots. Returns the answer and whether the contents changed (and must be saved).
func (b *storageBook) put(w cropWorld, eye *[3]float64, move storageMove) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	cell, capacity, done := b.beginMoveLocked(w, eye, move)
	if done != nil {
		return *done, false
	}
	key := storageKeyOf(cell)
	block := b.blocks[key]
	if block == nil {
		block = &StorageBlock{X: cell[0], Y: cell[1], Z: cell[2]}
	}
	for len(block.Slots) < capacity {
		block.Slots = append(block.Slots, StorageSlot{})
	}
	left := move.Amount
	for i := range block.Slots {
		if slot := &block.Slots[i]; left > 0 && slot.Type == move.Type && slot.Count < storageMaxStack {
			n := min(left, storageMaxStack-slot.Count)
			slot.Count += n
			left -= n
		}
	}
	for i := range block.Slots {
		if slot := &block.Slots[i]; left > 0 && slot.Count == 0 {
			n := min(left, storageMaxStack)
			*slot = StorageSlot{Type: move.Type, Count: n}
			left -= n
		}
	}
	moved := move.Amount - left
	if moved == 0 {
		return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Reason: "full"}), false
	}
	b.blocks[key] = block
	b.rev++
	b.notifyLocked(cell, capacity)
	return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Amount: moved}), true
}

// take removes up to move.Amount items from one slot, if it still holds move.Type.
func (b *storageBook) take(w cropWorld, eye *[3]float64, move storageMove) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	cell, capacity, done := b.beginMoveLocked(w, eye, move)
	if done != nil {
		return *done, false
	}
	refuse := func(reason string) (storageOutcome, bool) {
		return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Reason: reason}), false
	}
	if move.Slot < 0 || move.Slot >= capacity {
		return refuse("bad slot")
	}
	key := storageKeyOf(cell)
	block := b.blocks[key]
	if block == nil || move.Slot >= len(block.Slots) || block.Slots[move.Slot].Type != move.Type || block.Slots[move.Slot].Count <= 0 {
		return refuse("gone")
	}
	slot := &block.Slots[move.Slot]
	moved := min(move.Amount, slot.Count)
	slot.Count -= moved
	if slot.Count == 0 {
		*slot = StorageSlot{}
	}
	if storageIsEmpty(block.Slots) {
		delete(b.blocks, key)
	}
	b.rev++
	b.notifyLocked(cell, capacity)
	return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Amount: moved}), true
}

func storageIsEmpty(slots []StorageSlot) bool {
	for _, slot := range slots {
		if slot.Count > 0 {
			return false
		}
	}
	return true
}

// sync answers requests the client heard nothing about: from the log, or dead if unknown.
func (b *storageBook) sync(ids []string) []storageOutcome {
	b.mu.Lock()
	defer b.mu.Unlock()
	answers := make([]storageOutcome, 0, len(ids))
	for i, id := range ids {
		if i >= storageSyncMax || !storageRequest.MatchString(id) {
			continue
		}
		if known, ok := b.log[id]; ok {
			answers = append(answers, known)
			continue
		}
		answers = append(answers, b.rememberLocked(storageOutcome{ReqID: id, Reason: "lost"}))
	}
	return answers
}

// open adds a watcher (one chest per client) and returns what the chest holds.
func (b *storageBook) open(w cropWorld, eye *[3]float64, client *Client, x, y, z int) (storageSnapshot, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if eye == nil || !storageInReach(*eye, x, y, z) {
		return storageSnapshot{}, false
	}
	cell, capacity, ok := b.locate(w, x, y, z)
	if !ok {
		return storageSnapshot{}, false
	}
	b.closeLocked(client)
	if b.viewers[cell] == nil {
		b.viewers[cell] = make(map[*Client]bool)
	}
	b.viewers[cell][client] = true
	b.viewing[client] = cell
	return b.snapshotLocked(cell, capacity), true
}

func (b *storageBook) closeLocked(client *Client) {
	cell, ok := b.viewing[client]
	if !ok {
		return
	}
	delete(b.viewing, client)
	delete(b.viewers[cell], client)
	if len(b.viewers[cell]) == 0 {
		delete(b.viewers, cell)
	}
}

// forget stops a client watching (storageClose, or it disconnected).
func (b *storageBook) forget(client *Client) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.closeLocked(client)
}

// replace runs `set`, which changes the block at (x, y, z) to `name` ("" for air), atomically
// with the moves above. When that ends a chest it returns the items to hand to whoever did it
// (see the header) and closes the panels on it. A new state of the same chest keeps its contents.
func (b *storageBook) replace(w cropWorld, x, y, z int, name string, set func() (bool, error)) ([]StorageSlot, bool, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	// Only a cell with contents (or the upper half over them), or a chest somebody has open,
	// needs a look at the chunk store: other blocks stay as cheap as they were (/build sends
	// thousands).
	_, here := b.blocks[blockKey(x, y, z)]
	_, below := b.blocks[blockKey(x, y-1, z)]
	var had [3]int
	stored := false
	if here || below || len(b.viewers) > 0 {
		had, _, stored = b.locate(w, x, y, z)
	}
	changed, err := set()
	if err != nil || !stored {
		return nil, changed, err
	}
	if now, _, ok := storageCell(x, y, z, name); ok && now == had {
		return nil, changed, nil
	}

	key := storageKeyOf(had)
	var spill []StorageSlot
	if block := b.blocks[key]; block != nil {
		for _, slot := range block.Slots {
			if slot.Count > 0 {
				spill = append(spill, slot)
			}
		}
		delete(b.blocks, key)
	}
	b.rev++
	if watchers := b.viewers[had]; len(watchers) > 0 {
		data := createMessage("storageClosed", map[string]int{"x": had[0], "y": had[1], "z": had[2]})
		for client := range watchers {
			b.deliver(client, data)
			delete(b.viewing, client)
		}
		delete(b.viewers, had)
	}
	return spill, changed, nil
}

// load restores the saved contents, dropping anything no valid request could have made.
func (b *storageBook) load(saved map[string]StorageBlock, savedLog []storageOutcome) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.blocks = make(map[string]*StorageBlock, len(saved))
	for _, block := range saved {
		slots := make([]StorageSlot, len(block.Slots))
		for i, slot := range block.Slots {
			if slot.Count > 0 && slot.Count <= storageMaxStack && storageItemName.MatchString(slot.Type) {
				slots[i] = slot
			}
		}
		if storageIsEmpty(slots) {
			continue
		}
		copied := block
		copied.Slots = slots
		b.blocks[blockKey(block.X, block.Y, block.Z)] = &copied
	}
	b.log = make(map[string]storageOutcome, len(savedLog))
	b.logFIFO = nil
	for _, outcome := range savedLog {
		if storageRequest.MatchString(outcome.ReqID) {
			b.rememberLocked(outcome)
		}
	}
}

// snapshot copies everything for world.json.
func (b *storageBook) snapshot() (map[string]StorageBlock, []storageOutcome) {
	b.mu.Lock()
	defer b.mu.Unlock()
	blocks := make(map[string]StorageBlock, len(b.blocks))
	for key, block := range b.blocks {
		copied := *block
		copied.Slots = append([]StorageSlot(nil), block.Slots...)
		blocks[key] = copied
	}
	outcomes := make([]storageOutcome, 0, len(b.logFIFO))
	for _, id := range b.logFIFO {
		outcomes = append(outcomes, b.log[id])
	}
	return blocks, outcomes
}

// storagePlayerEye is the position the client last reported (nil if it has not joined).
func storagePlayerEye(client *Client) *[3]float64 {
	stateMu.RLock()
	defer stateMu.RUnlock()
	player, ok := gameState.Players[client.ID]
	if !ok {
		return nil
	}
	return &[3]float64{player.X, player.Y, player.Z}
}

// storageSendDrop hands over what a broken chest held. A full send buffer gets a moment to
// drain: unlike other messages, nothing would ever replace this one.
func storageSendDrop(client *Client, x, y, z int, items []StorageSlot) {
	if len(items) == 0 {
		return
	}
	data := createMessage("storageDrop", map[string]interface{}{"x": x, "y": y, "z": z, "items": items})
	for try := 0; try < 40; try++ {
		if storageDeliver(client, data) {
			return
		}
		clientsMu.RLock()
		gone := !clients[client]
		clientsMu.RUnlock()
		if gone {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	log.Printf("storage: %d stacks from %d,%d,%d could not reach %s", len(items), x, y, z, client.ID)
}

func storageReply(client *Client, outcome storageOutcome) {
	storageDeliver(client, createMessage("storageResult", outcome))
}

// handleStorageMessage serves the messages in the header. Refusals are answered like any other
// outcome (0 moved), so the client's items always come back.
func handleStorageMessage(client *Client, msg Message) {
	if len(msg.Payload) > storageMaxPayload {
		return
	}
	switch msg.Type {
	case "storageOpen":
		var at powerTarget
		if err := json.Unmarshal(msg.Payload, &at); err != nil {
			return
		}
		if snapshot, ok := storage.open(chunkStore, storagePlayerEye(client), client, at.X, at.Y, at.Z); ok {
			storageDeliver(client, createMessage("storageContents", snapshot))
		} else {
			storageDeliver(client, createMessage("storageClosed", at))
		}

	case "storageClose":
		storage.forget(client)

	case "storagePut", "storageTake":
		var move storageMove
		if err := json.Unmarshal(msg.Payload, &move); err != nil {
			return
		}
		apply := storage.put
		if msg.Type == "storageTake" {
			apply = storage.take
		}
		outcome, changed := apply(chunkStore, storagePlayerEye(client), move)
		if outcome.ReqID == "" {
			return
		}
		// Saved before it is answered (see the header).
		if changed {
			saveWorldState()
		}
		storageReply(client, outcome)

	case "storageSync":
		var request struct {
			ReqIDs []string `json:"reqIds"`
		}
		if err := json.Unmarshal(msg.Payload, &request); err != nil {
			return
		}
		for _, outcome := range storage.sync(request.ReqIDs) {
			storageReply(client, outcome)
		}
	}
}
