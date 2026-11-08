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
//   - storagePut    {x, y, z, type, amount, reqId, compartment}: the client has already taken the
//     items out of its inventory; storageResult says how many landed and it gives the rest back.
//   - storageTake   {x, y, z, slot, type, amount, reqId, compartment}: storageResult says how many
//     left the chest and the client adds them. `type` must match the slot (someone may have
//     emptied it). `compartment` is "" for the main slots or "freezer" (a fridge's second tab).
//   - storageSync   {reqIds}: "I never heard back about these". Each is answered from the log,
//     or marked dead if it never arrived (it can then never apply), so a lost message, a
//     reconnection or a page reload neither loses nor duplicates what was on its way.
//   - storageContents goes to everyone watching after each change, storageClosed when the block
//     is gone, and storageDrop {x, y, z, items} to the one client that broke or replaced a chest
//     (drops are client-side pickups: sent to everyone, everyone could collect a copy).
//   - constructionStock fills empty storage once a /build is done, for a creative session only
//     (construction_stock.go).
//
// A move is applied, saved, and only then answered. The log of answers is saved in the same
// file as the contents, so after a crash they still agree. Ovens, foundries, arc furnaces and cold
// furniture are chests that also change what they hold on their own: appliances.go.
//
// A culture plate is the exception: each is one plate with a record of what grew on it (plates.go).
// It lies alone in its slot (StorageSlot.Plate), a put names it with `plate` and the `token` its holder
// was given, and a take names the plate and answers with a new token in `plates`; storageContents
// carries what is on each plate in `cultures`, and a break hands each out in its spilt item's `grant`.
//
// What this does NOT protect: the player's inventory lives in the browser and the server has no
// way to know what it holds. A modified client can put items it never had, and the position the
// reach check reads is reported by the client too. The server only guarantees that what is in a
// chest stays consistent: an item is either in the chest or handed to one client, never both. A
// culture plate's record cannot be made up at all, nor put in two places (plates.go).
//
// storageKinds and storageFreezers are mirrored by STORAGE_KINDS and STORAGE_FREEZERS in
// js/game/storage.js (test/js/furniture.test.js).

var storageKinds = map[string]int{
	"arc_furnace":   3,
	"autoclave":     3,
	"barrel":        18,
	"chest":         27,
	"chest_freezer": 36,
	"foundry":       3,
	"fridge":        18,
	"incubator":     3,
	"microscope":    1,
	"oven":          3,
	"wardrobe":      45,
}

// storageFreezers: kinds with a second compartment, "freezer", and how many slots it has.
var storageFreezers = map[string]int{
	"fridge": 9,
}

// storageTall: kinds of two cells, which keep their contents in the lower one.
var storageTall = map[string]bool{"fridge": true, "wardrobe": true}

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
	// The name of a fridge's second compartment.
	storageFreezerTab = "freezer"
)

var (
	storageItemName = regexp.MustCompile(`^[a-z0-9_]{1,64}$`)
	storageRequest  = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
)

// StorageSlot is one stack; an empty slot has no type.
type StorageSlot struct {
	Type  string `json:"type,omitempty"`
	Count int    `json:"count,omitempty"`
	// Seconds this stack has spent turning cold (appliances.go); 0 anywhere else.
	Chill float64 `json:"chill,omitempty"`
	// A culture plate's id (plates.go): it is alone in its slot, and its record says what is on it.
	Plate string `json:"plate,omitempty"`
	// Only in what a broken block spills: the plate handed to whoever broke it. Never saved.
	Grant *PlateGrant `json:"grant,omitempty"`
}

// StorageBlock is the contents of one chest, by the position of its base cell. Only blocks that
// hold something have an entry.
type StorageBlock struct {
	X     int           `json:"x"`
	Y     int           `json:"y"`
	Z     int           `json:"z"`
	Slots []StorageSlot `json:"slots"`
	// Appliances only (appliances.go): what it is, so that the server knows after a restart which
	// ones have work to do without reading every chest's chunk.
	Kind string `json:"kind,omitempty"`
	// A fridge's second compartment.
	Freezer []StorageSlot `json:"freezer,omitempty"`
	// A machine: seconds of fire left, of the fuel that lit it, and seconds the batch has cooked.
	Burn    float64 `json:"burn,omitempty"`
	BurnMax float64 `json:"burnMax,omitempty"`
	Cook    float64 `json:"cook,omitempty"`
	// A microscope (microscope.go): what lies on the slide in its one slot.
	Prep *MicroscopePrep `json:"prep,omitempty"`
	// An incubator (microbes.go): what lives on the plate in each slot, the temperature it is set to (0 for
	// the default) and the one inside it now (nil until it has run).
	Plates []*CulturePlate `json:"plates,omitempty"`
	Target float64         `json:"target,omitempty"`
	Inside *float64        `json:"inside,omitempty"`
}

// storageOutcome answers one request: how many items moved (0 when refused).
type storageOutcome struct {
	ReqID  string `json:"reqId"`
	Type   string `json:"type,omitempty"`
	Amount int    `json:"amount"`
	Reason string `json:"reason,omitempty"`
	// A second item that comes with the first, one of it (a culture's dirty dish: microbes.go).
	Also string `json:"also,omitempty"`
	// The culture plates that came out, each with the token that makes it this client's (plates.go).
	Plates []PlateGrant `json:"plates,omitempty"`
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
	// "" (the main slots) or "freezer".
	Compartment string `json:"compartment"`
	// A culture plate (plates.go): which one, and on a put the token that says the client holds it.
	Plate string `json:"plate,omitempty"`
	Token string `json:"token,omitempty"`
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
	// Appliances (appliances.go): the second compartment, whether this is cold furniture, whether
	// its network has power now, and a machine's fire and work.
	Freezer []StorageSlot `json:"freezer,omitempty"`
	Cold    bool          `json:"cold,omitempty"`
	Powered bool          `json:"powered,omitempty"`
	Oven    *ovenStatus   `json:"oven,omitempty"`
	// A microscope: what lies on the slide.
	Microscope *microscopeView `json:"microscope,omitempty"`
	// An incubator: its temperatures, light and plates.
	Incubator *incubatorView `json:"incubator,omitempty"`
	// What lies on each culture plate in it, by the plate's id (plates.go).
	Cultures map[string]*CulturePlate `json:"cultures,omitempty"`
}

// storageBase is a block name without its states.
func storageBase(name string) string {
	base, _, _ := strings.Cut(name, ":")
	return base
}

// storageIsUpper: the upper half of a piece of two cells (js/game/furniture.js: half, facing).
func storageIsUpper(name string) bool {
	base := storageBase(name)
	return storageTall[base] && strings.HasPrefix(name, base+":upper")
}

// storageCell finds the base cell and size of the storage block `name` at (x, y, z). A wardrobe
// or a fridge is two cells and keeps its contents in the lower one.
func storageCell(x, y, z int, name string) (cell [3]int, capacity int, ok bool) {
	capacity, ok = storageKinds[storageBase(name)]
	if !ok {
		return cell, 0, false
	}
	if storageIsUpper(name) {
		y--
	}
	return [3]int{x, y, z}, capacity, true
}

// storagePlace is a storage block found in the world: its base cell, size and kind.
type storagePlace struct {
	cell     [3]int
	capacity int
	kind     string
}

// slots says how many slots a compartment of this block has; ok is false if it has no such one.
func (p storagePlace) slots(compartment string) (int, bool) {
	switch compartment {
	case "":
		return p.capacity, true
	case storageFreezerTab:
		n := storageFreezers[p.kind]
		return n, n > 0
	}
	return 0, false
}

// compartment is the list of slots of one compartment.
func (s *StorageBlock) compartment(name string) *[]StorageSlot {
	if name == storageFreezerTab {
		return &s.Freezer
	}
	return &s.Slots
}

// holdsNothing: no item in it, and no fire that must burn out.
func (s *StorageBlock) holdsNothing() bool {
	return storageIsEmpty(s.Slots) && storageIsEmpty(s.Freezer) && s.Burn <= 0 && s.Target == 0
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
	// Appliances with work to do (appliances.go), by the key of their entry in blocks; the power
	// each viewed cold block last showed; for how many ticks each electric machine has asked the
	// grid for power (up to 2); and blocks whose names changed, to broadcast.
	active      map[string]bool
	asked       map[string]int
	shownPower  map[[3]int]bool
	nameChanges []Block
	// Sends a message to a watcher (replaced by the tests).
	deliver func(*Client, []byte) bool
	// Whether the cold block at this base cell has power, and telling the grid of a block it may
	// not know, and an electric machine asking for its watts or no longer (appliances.go; replaced
	// by the tests).
	powered   func(cell [3]int) bool
	adopt     func(x, y, z int, name string)
	wantPower func(cell [3]int, on bool)
	// The clock slides dry by, and where their seeds come from (microscope.go; replaced by the tests).
	now  func() time.Time
	seed func() uint32
	// The temperature where a block stands, and whether light reaches it (microbes.go; replaced by the tests).
	ambient func(w cropWorld, cell [3]int) float64
	lit     func(w cropWorld, cell [3]int) bool
	// The world the book last read, for what a panel shows of the place (nil until then).
	world cropWorld
	// Every culture plate, by its id (plates.go).
	plates map[string]*PlateRecord
}

func newStorageBook() *storageBook {
	return &storageBook{
		blocks:     make(map[string]*StorageBlock),
		log:        make(map[string]storageOutcome),
		viewers:    make(map[[3]int]map[*Client]bool),
		viewing:    make(map[*Client][3]int),
		active:     make(map[string]bool),
		asked:      make(map[string]int),
		shownPower: make(map[[3]int]bool),
		plates:     make(map[string]*PlateRecord),
		deliver:    storageDeliver,
		powered:    powerRunsAt,
		adopt:      powerAdopt,
		wantPower:  powerAsk,
		now:        time.Now,
		seed:       microscopeNewSeed,
		ambient:    incubatorAmbient,
		lit:        incubatorLight,
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

// locate proves the block at (x, y, z) is storage. The upper half of a wardrobe or a fridge only
// counts over its lower half: while the two halves of a broken one are removed one message after
// the other, nothing can land in a cell that is already gone. Caller holds mu.
func (b *storageBook) locate(w cropWorld, x, y, z int) (place storagePlace, ok bool) {
	name, err := w.Block(x, y, z)
	if err != nil {
		log.Printf("storage: %v", err)
		return place, false
	}
	place.cell, place.capacity, ok = storageCell(x, y, z, name)
	place.kind = storageBase(name)
	if ok && place.cell[1] != y {
		below, err := w.Block(x, y-1, z)
		if err != nil {
			log.Printf("storage: %v", err)
			return place, false
		}
		if storageBase(below) != place.kind || storageIsUpper(below) {
			return place, false
		}
	}
	return place, ok
}

func storageInReach(eye [3]float64, x, y, z int) bool {
	dx := eye[0] - (float64(x) + 0.5)
	dy := eye[1] - (float64(y) + 0.5)
	dz := eye[2] - (float64(z) + 0.5)
	return math.Sqrt(dx*dx+dy*dy+dz*dz) <= storageReach
}

// snapshotLocked copies the contents of a cell, padded to its capacity.
func (b *storageBook) snapshotLocked(place storagePlace) storageSnapshot {
	cell := place.cell
	block := b.blocks[storageKeyOf(cell)]
	slots := make([]StorageSlot, place.capacity)
	if block != nil {
		copy(slots, block.Slots)
	}
	snapshot := storageSnapshot{X: cell[0], Y: cell[1], Z: cell[2], Capacity: place.capacity, Slots: slots, Rev: b.rev}
	if n := storageFreezers[place.kind]; n > 0 {
		snapshot.Freezer = make([]StorageSlot, n)
		if block != nil {
			copy(snapshot.Freezer, block.Freezer)
		}
	}
	snapshot.Cold = applianceIsCold(place.kind)
	if applianceUsesPower(place.kind) {
		snapshot.Powered = b.powered(cell)
		b.shownPower[cell] = snapshot.Powered
	}
	if m := machines[place.kind]; m != nil {
		snapshot.Oven = ovenStatusOf(m, block)
		snapshot.Oven.Starting = m.electric() && snapshot.Oven.CookMax > 0 && b.asked[storageKeyOf(cell)] < 2
	}
	if place.kind == microscopeKind {
		snapshot.Microscope = b.microscopeViewOf(block)
	}
	if place.kind == incubatorKind {
		snapshot.Incubator = b.incubatorViewOf(b.world, cell, block)
	}
	snapshot.Cultures = b.culturesOfLocked(snapshot.Slots, snapshot.Freezer)
	return snapshot
}

// notifyLocked tells everyone watching a cell what it holds now.
func (b *storageBook) notifyLocked(place storagePlace) {
	if len(b.viewers[place.cell]) == 0 {
		return
	}
	data := createMessage("storageContents", b.snapshotLocked(place))
	for client := range b.viewers[place.cell] {
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
	// Only culture plates are one plate each (plates.go).
	if move.Plate != "" && !plateIdentified(move.Type) {
		return "bad item"
	}
	return ""
}

// beginMoveLocked runs the checks a put and a take share. It returns the chest, or the answer to
// send instead (already in the log if it needs to be).
func (b *storageBook) beginMoveLocked(w cropWorld, eye *[3]float64, move storageMove) (place storagePlace, done *storageOutcome) {
	if !storageRequest.MatchString(move.ReqID) {
		return place, &storageOutcome{Reason: "bad request"}
	}
	if known, ok := b.log[move.ReqID]; ok {
		return place, &known
	}
	reason := storageCheckMove(move)
	if reason == "" && (eye == nil || !storageInReach(*eye, move.X, move.Y, move.Z)) {
		reason = "too far"
	}
	if reason == "" {
		var ok bool
		if place, ok = b.locate(w, move.X, move.Y, move.Z); !ok {
			reason = "not a storage block"
		} else if _, ok := place.slots(move.Compartment); !ok {
			reason = "bad compartment"
		} else if place.kind == microscopeKind {
			// A slide and what lies on it only move together (microscope.go).
			reason = "not for the microscope"
		} else if place.kind == incubatorKind {
			// Nor a plate and what lives on it (microbes.go).
			reason = "not for the incubator"
		}
	}
	if reason != "" {
		outcome := b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Reason: reason})
		return place, &outcome
	}
	return place, nil
}

// put adds up to move.Amount items, onto stacks of the same type first and then into empty
// slots (in a machine, only into the one slot that item belongs in). Returns the answer and whether
// the contents changed (and must be saved).
func (b *storageBook) put(w cropWorld, eye *[3]float64, move storageMove) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, done := b.beginMoveLocked(w, eye, move)
	if done != nil {
		return *done, false
	}
	capacity, _ := place.slots(move.Compartment)
	first, last := 0, capacity
	if m := machines[place.kind]; m != nil {
		slot := m.slotFor(move.Type)
		if slot < 0 {
			return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Reason: "not for the " + m.Name}), false
		}
		first, last = slot, slot+1
	}
	key := storageKeyOf(place.cell)
	block := b.blocks[key]
	if block == nil {
		block = &StorageBlock{X: place.cell[0], Y: place.cell[1], Z: place.cell[2]}
	}
	list := block.compartment(move.Compartment)
	for len(*list) < capacity {
		*list = append(*list, StorageSlot{})
	}
	if plateIdentified(move.Type) {
		moved, reason := b.putPlateLocked(list, first, last, move)
		if moved == 0 {
			return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Reason: reason}), false
		}
		b.blocks[key] = block
		b.wakeLocked(place, block)
		b.rev++
		b.notifyLocked(place)
		return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Amount: moved}), true
	}
	slots := (*list)[first:last]
	left := move.Amount
	for i := range slots {
		if slot := &slots[i]; left > 0 && slot.Type == move.Type && slot.Plate == "" && slot.Count < storageMaxStack {
			n := min(left, storageMaxStack-slot.Count)
			slot.Count += n
			left -= n
		}
	}
	for i := range slots {
		if slot := &slots[i]; left > 0 && slot.Count == 0 {
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
	b.wakeLocked(place, block)
	b.rev++
	b.notifyLocked(place)
	return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Amount: moved}), true
}

// take removes up to move.Amount items from one slot, if it still holds move.Type.
func (b *storageBook) take(w cropWorld, eye *[3]float64, move storageMove) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, done := b.beginMoveLocked(w, eye, move)
	if done != nil {
		return *done, false
	}
	refuse := func(reason string) (storageOutcome, bool) {
		return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Reason: reason}), false
	}
	capacity, _ := place.slots(move.Compartment)
	if move.Slot < 0 || move.Slot >= capacity {
		return refuse("bad slot")
	}
	key := storageKeyOf(place.cell)
	block := b.blocks[key]
	if block == nil {
		return refuse("gone")
	}
	list := *block.compartment(move.Compartment)
	if move.Slot >= len(list) || list[move.Slot].Type != move.Type || list[move.Slot].Count <= 0 {
		return refuse("gone")
	}
	slot := &list[move.Slot]
	var grants []PlateGrant
	moved := 0
	if slot.Plate != "" || plateIdentified(slot.Type) {
		var reason string
		if moved, grants, reason = b.takePlatesLocked(slot, move); moved == 0 {
			return refuse(reason)
		}
	} else {
		moved = min(move.Amount, slot.Count)
		slot.Count -= moved
		if slot.Count == 0 {
			*slot = StorageSlot{}
		}
	}
	if block.holdsNothing() {
		delete(b.blocks, key)
		b.emptiedLocked(w, place)
	} else {
		b.wakeLocked(place, block)
	}
	b.rev++
	b.notifyLocked(place)
	return b.rememberLocked(storageOutcome{ReqID: move.ReqID, Type: move.Type, Amount: moved, Plates: grants}), true
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
	place, ok := b.locate(w, x, y, z)
	if !ok {
		return storageSnapshot{}, false
	}
	b.closeLocked(client)
	cell := place.cell
	if b.viewers[cell] == nil {
		b.viewers[cell] = make(map[*Client]bool)
	}
	b.viewers[cell][client] = true
	b.viewing[client] = cell
	b.settleOnOpenLocked(w, place)
	b.world = w
	return b.snapshotLocked(place), true
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
		delete(b.shownPower, cell)
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
	var place storagePlace
	stored := false
	if here || below || len(b.viewers) > 0 {
		place, stored = b.locate(w, x, y, z)
	}
	changed, err := set()
	if err != nil || !stored {
		return nil, changed, err
	}
	had := place.cell
	if now, _, ok := storageCell(x, y, z, name); ok && now == had && storageBase(name) == place.kind {
		return nil, changed, nil
	}

	key := storageKeyOf(had)
	var spill []StorageSlot
	if block := b.blocks[key]; block != nil {
		if block.Kind == incubatorKind {
			spill = b.incubatorSpillLocked(block)
		} else {
			spill = append(b.spillSlotsLocked(block.Slots), b.spillSlotsLocked(block.Freezer)...)
		}
		delete(b.blocks, key)
		delete(b.active, key)
		b.stopAskingLocked(had, key)
	}
	b.rev++
	if watchers := b.viewers[had]; len(watchers) > 0 {
		data := createMessage("storageClosed", map[string]int{"x": had[0], "y": had[1], "z": had[2]})
		for client := range watchers {
			b.deliver(client, data)
			delete(b.viewing, client)
		}
		delete(b.viewers, had)
		delete(b.shownPower, had)
	}
	return spill, changed, nil
}

// load restores the saved contents, dropping anything no valid request could have made.
func (b *storageBook) load(saved map[string]StorageBlock, savedLog []storageOutcome, savedPlates ...map[string]PlateRecord) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.plates = make(map[string]*PlateRecord)
	for _, plates := range savedPlates {
		for id, record := range plates {
			if clean := plateCleanRecord(id, record); clean != nil {
				b.plates[id] = clean
			}
		}
	}
	b.blocks = make(map[string]*StorageBlock, len(saved))
	b.active = make(map[string]bool)
	b.asked = make(map[string]int)
	for _, block := range saved {
		copied := block
		copied.Slots = storageCleanSlots(block.Slots)
		copied.Freezer = storageCleanSlots(block.Freezer)
		applianceCleanLoaded(&copied)
		microscopeCleanLoaded(&copied)
		cultureCleanLoaded(&copied)
		if copied.holdsNothing() {
			continue
		}
		key := blockKey(block.X, block.Y, block.Z)
		b.blocks[key] = &copied
		if copied.Kind != "" {
			b.active[key] = true
		}
	}
	b.migratePlatesLocked()
	b.log = make(map[string]storageOutcome, len(savedLog))
	b.logFIFO = nil
	for _, outcome := range savedLog {
		if storageRequest.MatchString(outcome.ReqID) {
			b.rememberLocked(outcome)
		}
	}
}

// storageCleanSlots drops what no valid request could have made. No slots stay no slots.
func storageCleanSlots(saved []StorageSlot) []StorageSlot {
	if len(saved) == 0 {
		return nil
	}
	slots := make([]StorageSlot, len(saved))
	for i, slot := range saved {
		if slot.Count > 0 && slot.Count <= storageMaxStack && storageItemName.MatchString(slot.Type) {
			slot.Chill = math.Max(0, slot.Chill)
			slot.Grant = nil
			if !plateIDPattern.MatchString(slot.Plate) {
				slot.Plate = ""
			}
			slots[i] = slot
		}
	}
	return slots
}

// snapshot copies the chests and the log for world.json.
func (b *storageBook) snapshot() (map[string]StorageBlock, []storageOutcome) {
	blocks, outcomes, _ := b.snapshotAll()
	return blocks, outcomes
}

// snapshotAll copies everything for world.json: the plates with the chests that hold them, in one go.
func (b *storageBook) snapshotAll() (map[string]StorageBlock, []storageOutcome, map[string]PlateRecord) {
	b.mu.Lock()
	defer b.mu.Unlock()
	blocks := make(map[string]StorageBlock, len(b.blocks))
	for key, block := range b.blocks {
		copied := *block
		copied.Slots = append([]StorageSlot(nil), block.Slots...)
		copied.Freezer = append([]StorageSlot(nil), block.Freezer...)
		if block.Prep != nil {
			prep := *block.Prep
			copied.Prep = &prep
		}
		copied.Plates = cultureCopyPlates(block.Plates)
		if block.Inside != nil {
			inside := *block.Inside
			copied.Inside = &inside
		}
		blocks[key] = copied
	}
	outcomes := make([]storageOutcome, 0, len(b.logFIFO))
	for _, id := range b.logFIFO {
		outcomes = append(outcomes, b.log[id])
	}
	plates := make(map[string]PlateRecord, len(b.plates))
	for id, record := range b.plates {
		copied := *record
		copied.Culture = cultureFrozen(record.Culture)
		plates[id] = copied
	}
	return blocks, outcomes, plates
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
		// An oven that opens with a stale name (a saved world's) goes out for everyone.
		for _, block := range storage.drainNameChanges() {
			broadcastToAll(createMessage("blockPlace", block))
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
