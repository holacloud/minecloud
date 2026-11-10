package network

// Plots (PLAN_PARCELAS.md, phase 2): a player claims a square of the world by placing a claim marker
// (claim_marker, js/game/claims.js), and from then on only they can change anything in it.
//
//   - A plot is claimSize x claimSize columns (17 x 17) centred on its marker, from bedrock to the sky:
//     protection only ever looks at x and z. One plot per player for now.
//   - The spawn zone, spawnZone (32 x 32 around the spawn point, which is (0, 0)), is protected too and
//     belongs to nobody: nobody but the admin changes it.
//   - Claiming: a blockPlace of a claim_marker is the claim. Under blockEditMu, so in order with every
//     other edit, the server checks the reach, that the player has no plot yet, that the square overlaps
//     no other plot nor the spawn zone, creates the plot and only then writes the block (and removes the
//     plot again if the write fails). A refusal is answered with claimRefused (below) and nothing changes.
//   - Removing: breaking the marker removes the plot. Only the owner can break it, because the marker
//     stands in the middle of its own plot (and the admin, who can break anything). Overwriting the
//     marker with another block does the same. A marker left with no plot (the admin removed the plot)
//     is a plain block.
//   - Kept in world.json ("claims", by id), with an index by chunk (byChunk): a plot covers at most 3 x 3
//     chunks and a chunk is touched by at most 4 plots, so finding the plot of a column is a map lookup
//     and a few comparisons, whatever the number of plots.
//
// Protection (claimCheck): a change at column (x, z) by a client is allowed when the column is in no
// zone, when the column is in the client's own plot, or when the client is the admin: a session that
// passed creative auth (Client.creative), the one explicit bypass, decided in claimAdmin and nowhere
// else. Everybody else can walk in, look, read signs, but every message that would change the world or
// take something out of it is refused. The paths that check it are listed in claimProtectedMessages
// (claims_test.go walks them all with a stranger, the owner and the admin):
//
//   - blockPlace, blockBreak (claimPlaceBlock, claimBreakBlock), curtainStrip, glowSet, sprayPaint,
//     logicPress (a lever or a button is a change too).
//   - storageOpen, storagePut, storageTake (chests, fridges, wardrobes, ovens, foundries, arc furnaces,
//     the autoclave, the incubator and the microscope are all storage): opening and moving.
//   - microscopePrepare, microscopeClear, microscopeDrop, microscopeCapture, microscopeStain, and
//     cultureLoad, cultureInoculate, cultureHarvest, cultureSet.
//   - constructionStock: only a creative session sends it, which is the admin, but each fill goes through
//     the same check so the bypass stays the one in claimAdmin.
//   - Mechanics (mechanics.go): a ram only moves blocks within the zone it stands in (wild, spawn or one
//     plot), so nothing is pushed or pulled into, out of or within a plot from outside, nor between two
//     plots. A lift moves in its winch's own column, which is always one zone; its stops only count in
//     that zone.
//   - Robots, beavers and copper golems live in their owner's browser and act through that client's
//     blockPlace and blockBreak, so they are checked as their owner.
//
// What is not checked, on purpose: sampleTake (the water or the moss stays where it was), signVote (a
// visitor may read and vote a sign), powerCrank and powerFeed (cranking or feeding an eel only adds
// energy), powerProbe (reading), soundBlockPlay (a sound). What cannot be checked: whatever the browser
// decides alone, because the server never hears of it: pets and tamed animals, mobs, traps and cages,
// ant jars, pickups, the inventory. A pressure plate or a proximity sensor reacts to whoever stands on or
// near it, by design.
//
// A refusal goes back to the sender only, as claimRefused {reason, owner, blocks, placed}: reason is
// claimReason*, owner the plot owner's name, blocks what the refused cells really hold (blockType ""
// for air), so the client puts its copy back, and placed what a refused blockPlace asked for, so the
// client can give the item back. Storage and microscope requests also get their usual storageResult
// with reason "protected", so their items come back as for any refusal.
//
// The client hears every plot as claimList {claims, spawn, radius} on connecting, after a recovery and
// after any change: each plot with its marker, its square, its owner's name and `mine` for its own one.
// The owner's player id never leaves the server (identity.go keeps those private), except to the admin.
//
// Going home: claimHome {} asks where the sender's own plot is, from anywhere. Only an owner gets an
// answer with a place (a guest of a plot, or anybody else, hears reason "none"): claimHomeResult {ok, x, y,
// z, minX, minZ, maxX, maxZ} with the marker and the square, and the client lands the player on solid
// ground inside the plot near the marker (js/game/claims.js). At most once every claimHomeCooldown per
// player, whatever page asks: sooner is reason "wait" with the seconds left. It costs nothing.

import (
	"encoding/json"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"minecloud/pkg/terrain"
)

const (
	claimMarkerBlock = "claim_marker"
	// Blocks on each side of the marker: a plot is 17 x 17.
	claimRadius = 8
	claimSize   = 2*claimRadius + 1
	// The longest owner name kept (the game cuts names at 20).
	claimNameRunes = 20
	// What admin messages may carry at most.
	claimMaxPayload = 4 * 1024
	// How often a player may go home to their plot.
	claimHomeCooldown = 30 * time.Second
)

// Why something was refused (claimRefused.reason).
const (
	claimReasonPlot         = "claim"        // someone else's plot
	claimReasonSpawn        = "spawn"        // the spawn zone
	claimReasonOverlap      = "overlap"      // a new plot would overlap another
	claimReasonOverlapSpawn = "overlapSpawn" // a new plot would overlap the spawn zone
	claimReasonAlready      = "already"      // the player has a plot already
	claimReasonReach        = "reach"        // too far to place the marker
	claimReasonNoPlayer     = "noPlayer"     // no stable player: no plot can be theirs
)

// claimRect is a square of columns, both ends included.
type claimRect struct {
	MinX int `json:"minX"`
	MinZ int `json:"minZ"`
	MaxX int `json:"maxX"`
	MaxZ int `json:"maxZ"`
}

func (r claimRect) contains(x, z int) bool {
	return x >= r.MinX && x <= r.MaxX && z >= r.MinZ && z <= r.MaxZ
}

func (r claimRect) overlaps(o claimRect) bool {
	return r.MinX <= o.MaxX && o.MinX <= r.MaxX && r.MinZ <= o.MaxZ && o.MinZ <= r.MaxZ
}

// The spawn zone: 32 x 32 columns around the spawn point (0, 0). spawnZoneOn is off only in the tests of
// other mechanics, which happen to be built around the origin (TestMain).
var (
	spawnZone   = claimRect{MinX: -16, MinZ: -16, MaxX: 15, MaxZ: 15}
	spawnZoneOn = true
)

// Claim is one plot.
type Claim struct {
	ID        string    `json:"id"`
	X         int       `json:"x"`
	Y         int       `json:"y"`
	Z         int       `json:"z"`
	Owner     string    `json:"owner"`
	OwnerName string    `json:"ownerName,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

func (c Claim) rect() claimRect {
	return claimRect{MinX: c.X - claimRadius, MinZ: c.Z - claimRadius, MaxX: c.X + claimRadius, MaxZ: c.Z + claimRadius}
}

// claimBook holds every plot. Lock order: blockEditMu, then mu; never take clientsMu, stateMu or the chunk
// store while holding mu.
type claimBook struct {
	mu       sync.RWMutex
	byID     map[string]*Claim
	byOwner  map[string]*Claim
	byMarker map[[3]int]*Claim
	byChunk  map[[2]int][]*Claim
}

func newClaimBook() *claimBook {
	return &claimBook{
		byID:     make(map[string]*Claim),
		byOwner:  make(map[string]*Claim),
		byMarker: make(map[[3]int]*Claim),
		byChunk:  make(map[[2]int][]*Claim),
	}
}

var claims = newClaimBook()

func claimChunkOf(v int) int {
	if v < 0 {
		return -((-v + terrain.ChunkSize - 1) / terrain.ChunkSize)
	}
	return v / terrain.ChunkSize
}

// claimChunks lists the chunks a square touches.
func claimChunks(r claimRect) [][2]int {
	var chunks [][2]int
	for cx := claimChunkOf(r.MinX); cx <= claimChunkOf(r.MaxX); cx++ {
		for cz := claimChunkOf(r.MinZ); cz <= claimChunkOf(r.MaxZ); cz++ {
			chunks = append(chunks, [2]int{cx, cz})
		}
	}
	return chunks
}

func (b *claimBook) indexLocked(c *Claim) {
	b.byID[c.ID] = c
	b.byOwner[c.Owner] = c
	b.byMarker[[3]int{c.X, c.Y, c.Z}] = c
	for _, chunk := range claimChunks(c.rect()) {
		b.byChunk[chunk] = append(b.byChunk[chunk], c)
	}
}

func (b *claimBook) unindexLocked(c *Claim) {
	delete(b.byID, c.ID)
	if b.byOwner[c.Owner] == c {
		delete(b.byOwner, c.Owner)
	}
	delete(b.byMarker, [3]int{c.X, c.Y, c.Z})
	for _, chunk := range claimChunks(c.rect()) {
		list := b.byChunk[chunk]
		kept := list[:0]
		for _, other := range list {
			if other != c {
				kept = append(kept, other)
			}
		}
		if len(kept) == 0 {
			delete(b.byChunk, chunk)
		} else {
			b.byChunk[chunk] = kept
		}
	}
}

// atLocked is the plot of a column, nil if none.
func (b *claimBook) atLocked(x, z int) *Claim {
	for _, c := range b.byChunk[[2]int{claimChunkOf(x), claimChunkOf(z)}] {
		if c.rect().contains(x, z) {
			return c
		}
	}
	return nil
}

// at is a copy of the plot of a column.
func (b *claimBook) at(x, z int) (Claim, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if c := b.atLocked(x, z); c != nil {
		return *c, true
	}
	return Claim{}, false
}

// overlapLocked is a plot overlapping this square, nil if none.
func (b *claimBook) overlapLocked(r claimRect) *Claim {
	for _, chunk := range claimChunks(r) {
		for _, c := range b.byChunk[chunk] {
			if c.rect().overlaps(r) {
				return c
			}
		}
	}
	return nil
}

// ofOwner is a copy of an owner's plot.
func (b *claimBook) ofOwner(owner string) (Claim, bool) {
	if owner == "" {
		return Claim{}, false
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	if c := b.byOwner[owner]; c != nil {
		return *c, true
	}
	return Claim{}, false
}

func (b *claimBook) holds(owner string) bool {
	if owner == "" {
		return false
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.byOwner[owner] != nil
}

// create makes the plot of a marker at (x, y, z) for owner, or says why not (a claimReason, and the owner of
// the plot it would overlap).
func (b *claimBook) create(owner, ownerName string, x, y, z int) (Claim, string, string) {
	if owner == "" {
		return Claim{}, claimReasonNoPlayer, ""
	}
	c := &Claim{ID: newRandomID("clm"), X: x, Y: y, Z: z, Owner: owner, OwnerName: claimCleanName(ownerName), CreatedAt: time.Now().UTC()}
	r := c.rect()
	if spawnZoneOn && r.overlaps(spawnZone) {
		return Claim{}, claimReasonOverlapSpawn, ""
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.byOwner[owner] != nil {
		return Claim{}, claimReasonAlready, ""
	}
	if other := b.overlapLocked(r); other != nil {
		return Claim{}, claimReasonOverlap, other.OwnerName
	}
	b.indexLocked(c)
	return *c, "", ""
}

func (b *claimBook) remove(id string) (Claim, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	c := b.byID[id]
	if c == nil {
		return Claim{}, false
	}
	b.unindexLocked(c)
	return *c, true
}

// removeAtMarker removes the plot whose marker is at (x, y, z), if there is one.
func (b *claimBook) removeAtMarker(x, y, z int) (Claim, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	c := b.byMarker[[3]int{x, y, z}]
	if c == nil {
		return Claim{}, false
	}
	b.unindexLocked(c)
	return *c, true
}

// setOwner gives a plot to another player (admin). Returns a claimReason when it cannot.
func (b *claimBook) setOwner(id, owner, ownerName string) (Claim, string, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	c := b.byID[id]
	if c == nil {
		return Claim{}, "", false
	}
	if owner == "" {
		return *c, claimReasonNoPlayer, true
	}
	if other := b.byOwner[owner]; other != nil && other != c {
		return *c, claimReasonAlready, true
	}
	b.unindexLocked(c)
	c.Owner = owner
	c.OwnerName = claimCleanName(ownerName)
	b.indexLocked(c)
	return *c, "", true
}

// rename keeps an owner's shown name up to date (the name they last played with). Says whether it changed.
func (b *claimBook) rename(owner, name string) bool {
	name = claimCleanName(name)
	if owner == "" || name == "" {
		return false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	c := b.byOwner[owner]
	if c == nil || c.OwnerName == name {
		return false
	}
	c.OwnerName = name
	return true
}

// list copies every plot, in a stable order.
func (b *claimBook) list() []Claim {
	b.mu.RLock()
	out := make([]Claim, 0, len(b.byID))
	for _, c := range b.byID {
		out = append(out, *c)
	}
	b.mu.RUnlock()
	sort.Slice(out, func(i, j int) bool {
		if !out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].CreatedAt.Before(out[j].CreatedAt)
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func (b *claimBook) snapshot() map[string]Claim {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.byID) == 0 {
		return nil
	}
	out := make(map[string]Claim, len(b.byID))
	for id, c := range b.byID {
		out[id] = *c
	}
	return out
}

// load installs the saved plots, dropping any that could not have been made (no owner, a second one of the
// same owner, an overlap): the oldest stays.
func (b *claimBook) load(saved map[string]Claim) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.byID = make(map[string]*Claim)
	b.byOwner = make(map[string]*Claim)
	b.byMarker = make(map[[3]int]*Claim)
	b.byChunk = make(map[[2]int][]*Claim)
	ordered := make([]Claim, 0, len(saved))
	for id, c := range saved {
		c.ID = id
		ordered = append(ordered, c)
	}
	sort.Slice(ordered, func(i, j int) bool {
		if !ordered[i].CreatedAt.Equal(ordered[j].CreatedAt) {
			return ordered[i].CreatedAt.Before(ordered[j].CreatedAt)
		}
		return ordered[i].ID < ordered[j].ID
	})
	for _, c := range ordered {
		if c.ID == "" || c.Owner == "" || b.byOwner[c.Owner] != nil || b.overlapLocked(c.rect()) != nil {
			log.Printf("claims: dropping saved plot %q", c.ID)
			continue
		}
		c.OwnerName = claimCleanName(c.OwnerName)
		claim := c
		b.indexLocked(&claim)
	}
}

// claimCleanName is a name to show: printable, trimmed, not too long.
func claimCleanName(name string) string {
	name = strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsGraphic(r) {
			return r
		}
		return -1
	}, name))
	if runes := []rune(name); len(runes) > claimNameRunes {
		name = strings.TrimSpace(string(runes[:claimNameRunes]))
	}
	return name
}

// ---------------------------------------------------------------------------------------
// Protection

// claimAdmin is the one bypass of every plot and of the spawn zone: a session that passed creative auth.
func claimAdmin(client *Client) bool {
	return client != nil && client.creative.Load()
}

// claimZoneKey names the zone of a column: "" for none, "spawn", or the plot's id. Mechanics compare them.
func claimZoneKey(x, z int) string {
	if spawnZoneOn && spawnZone.contains(x, z) {
		return "spawn"
	}
	if c, ok := claims.at(x, z); ok {
		return "plot:" + c.ID
	}
	return ""
}

// claimRefusal is what a refused change sends back (see the header).
type claimRefusal struct {
	Reason string  `json:"reason"`
	Owner  string  `json:"owner,omitempty"`
	Blocks []Block `json:"blocks,omitempty"`
	Placed string  `json:"placed,omitempty"`
}

// claimCheck says whether this client may change column (x, z): nil when it may.
func claimCheck(client *Client, x, z int) *claimRefusal {
	if claimAdmin(client) {
		return nil
	}
	if spawnZoneOn && spawnZone.contains(x, z) {
		return &claimRefusal{Reason: claimReasonSpawn}
	}
	c, ok := claims.at(x, z)
	if !ok {
		return nil
	}
	if client != nil {
		if me := client.stablePlayerID(); me != "" && me == c.Owner {
			return nil
		}
	}
	return &claimRefusal{Reason: claimReasonPlot, Owner: c.OwnerName}
}

// claimTruth is what a cell really holds, with its metadata, for a client to put its copy right.
func claimTruth(x, y, z int) (Block, bool) {
	name, err := chunkStore.Block(x, y, z)
	if err != nil {
		return Block{}, false
	}
	if name == "air" {
		name = ""
	}
	stateMu.RLock()
	block, ok := gameState.Blocks[blockKey(x, y, z)]
	stateMu.RUnlock()
	if ok && block.BlockType == name {
		return block, true
	}
	return Block{X: x, Y: y, Z: z, BlockType: name}, true
}

// claimRefuse tells the sender, and only them, that a change was refused, with what the cells really hold.
func claimRefuse(client *Client, refusal *claimRefusal, cells ...[3]int) {
	if client == nil || refusal == nil {
		return
	}
	for _, cell := range cells {
		if truth, ok := claimTruth(cell[0], cell[1], cell[2]); ok {
			refusal.Blocks = append(refusal.Blocks, truth)
		}
	}
	log.Printf("claims: refused %s for %s at %v", refusal.Reason, client.ID, cells)
	storageDeliver(client, createMessage("claimRefused", refusal))
}

// claimPlaceBlock is a blockPlace with the plots' rules: the check, and the claim when it is a marker. The
// caller holds blockEditMu. Returns what was placed, the refusal if any, and whether it was placed.
func claimPlaceBlock(client *Client, payload Block) (Block, *claimRefusal, bool) {
	if !blockEditable(payload.X, payload.Y, payload.Z) {
		return payload, nil, false
	}
	if refusal := claimCheck(client, payload.X, payload.Z); refusal != nil {
		return payload, refusal, false
	}
	current, _ := chunkStore.Block(payload.X, payload.Y, payload.Z)
	isMarker := storageBase(payload.BlockType) == claimMarkerBlock
	wasMarker := storageBase(current) == claimMarkerBlock
	var made *Claim
	if isMarker && !wasMarker {
		eye := storagePlayerEye(client)
		if eye == nil || !storageInReach(*eye, payload.X, payload.Y, payload.Z) {
			return payload, &claimRefusal{Reason: claimReasonReach}, false
		}
		owner := ""
		if client != nil {
			owner = client.stablePlayerID()
		}
		c, reason, other := claims.create(owner, client.username, payload.X, payload.Y, payload.Z)
		if reason != "" {
			return payload, &claimRefusal{Reason: reason, Owner: other}, false
		}
		made = &c
		payload.BlockType = claimMarkerBlock
	}
	placed, ok := placeBlock(client, payload)
	if !ok {
		if made != nil {
			claims.remove(made.ID)
		}
		return placed, nil, false
	}
	changed := made != nil
	if wasMarker && !isMarker {
		_, changed = claims.removeAtMarker(payload.X, payload.Y, payload.Z)
	}
	if changed {
		if made != nil {
			log.Printf("claims: %s claimed %s at %d,%d,%d", client.ID, made.ID, made.X, made.Y, made.Z)
			storageDeliver(client, createMessage("claimMade", claimViewOf(*made, made.Owner)))
		}
		saveWorldState()
		claimsBroadcast()
	}
	return placed, nil, true
}

// claimBreakAllowed checks a blockBreak (caller holds blockEditMu); claimBroken removes the plot of a marker
// that was broken. The marker stands inside its own plot, so only its owner (or the admin) gets this far.
func claimBreakAllowed(client *Client, x, z int) *claimRefusal {
	return claimCheck(client, x, z)
}

func claimBroken(was string, x, y, z int) {
	if storageBase(was) != claimMarkerBlock {
		return
	}
	if c, ok := claims.removeAtMarker(x, y, z); ok {
		log.Printf("claims: plot %s removed with its marker", c.ID)
		saveWorldState()
		claimsBroadcast()
	}
}

// claimGuardTarget is the check for a message about one cell: {x, y, z} somewhere in the payload.
func claimGuardTarget(client *Client, payload []byte) (*claimRefusal, powerTarget) {
	var at powerTarget
	if json.Unmarshal(payload, &at) != nil {
		return nil, at
	}
	return claimCheck(client, at.X, at.Z), at
}

// claimGuardRequest refuses a storage, microscope or culture request in someone else's plot: it answers the
// storageResult (from the log if it was already answered) and says why. Returns whether it was refused.
func claimGuardRequest(client *Client, payload []byte, answer string) bool {
	refusal, _ := claimGuardTarget(client, payload)
	if refusal == nil {
		return false
	}
	var request struct {
		ReqID  string `json:"reqId"`
		Type   string `json:"type"`
		Source string `json:"source"`
	}
	json.Unmarshal(payload, &request)
	item := request.Type
	if item == "" {
		item = request.Source
	}
	if outcome, ok := storage.refuse(request.ReqID, item, "protected"); ok {
		storageDeliver(client, createMessage(answer, outcome))
	}
	claimRefuse(client, refusal)
	return true
}

// refuse answers a request refused before it reached the book: from the log if it was answered already, so a
// resent request never gets two different answers.
func (b *storageBook) refuse(reqID, item, reason string) (storageOutcome, bool) {
	if !storageRequest.MatchString(reqID) {
		return storageOutcome{}, false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if known, ok := b.log[reqID]; ok {
		return known, true
	}
	return b.rememberLocked(storageOutcome{ReqID: reqID, Type: item, Reason: reason}), true
}

// ---------------------------------------------------------------------------------------
// What clients hear

type claimView struct {
	ID    string `json:"id"`
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Z     int    `json:"z"`
	Owner string `json:"owner"`
	Mine  bool   `json:"mine,omitempty"`
	claimRect
}

func claimViewOf(c Claim, me string) claimView {
	return claimView{ID: c.ID, X: c.X, Y: c.Y, Z: c.Z, Owner: c.OwnerName, Mine: me != "" && me == c.Owner, claimRect: c.rect()}
}

func claimListMessage(list []Claim, me string) []byte {
	views := make([]claimView, 0, len(list))
	for _, c := range list {
		views = append(views, claimViewOf(c, me))
	}
	payload := map[string]interface{}{"claims": views, "radius": claimRadius}
	if spawnZoneOn {
		payload["spawn"] = spawnZone
	}
	return createMessage("claimList", payload)
}

// claimsSendTo tells one client every plot.
func claimsSendTo(client *Client) {
	storageDeliver(client, claimListMessage(claims.list(), client.stablePlayerID()))
}

// claimsBroadcast tells every client every plot, each with its own one marked.
func claimsBroadcast() {
	list := claims.list()
	clientsMu.RLock()
	targets := make([]*Client, 0, len(clients))
	for client := range clients {
		targets = append(targets, client)
	}
	clientsMu.RUnlock()
	for _, client := range targets {
		storageDeliver(client, claimListMessage(list, client.stablePlayerID()))
	}
}

// claimRenameOwner follows the name an owner plays with (playerJoin).
func claimRenameOwner(client *Client) {
	if claims.rename(client.stablePlayerID(), client.username) {
		saveWorldState()
		claimsBroadcast()
	}
}

// ---------------------------------------------------------------------------------------
// Going home (see the header)

var (
	claimHomeMu   sync.Mutex
	claimHomeLast = map[string]time.Time{}
	// The clock of the cooldown; the tests move it.
	claimNow = time.Now
)

func handleClaimHome(client *Client) {
	me := client.stablePlayerID()
	answer := map[string]interface{}{"ok": false}
	reply := func() { storageDeliver(client, createMessage("claimHomeResult", answer)) }
	c, ok := claims.ofOwner(me)
	if !ok {
		answer["reason"] = "none"
		reply()
		return
	}
	now := claimNow()
	claimHomeMu.Lock()
	last, seen := claimHomeLast[me]
	if seen && now.Sub(last) < claimHomeCooldown {
		claimHomeMu.Unlock()
		left := claimHomeCooldown - now.Sub(last)
		answer["reason"] = "wait"
		answer["wait"] = int((left + time.Second - 1) / time.Second)
		reply()
		return
	}
	claimHomeLast[me] = now
	claimHomeMu.Unlock()
	r := c.rect()
	answer["ok"] = true
	answer["x"], answer["y"], answer["z"] = c.X, c.Y, c.Z
	answer["minX"], answer["minZ"], answer["maxX"], answer["maxZ"] = r.MinX, r.MinZ, r.MaxX, r.MaxZ
	answer["cooldown"] = int(claimHomeCooldown / time.Second)
	log.Printf("claims: %s goes home to %s", client.ID, c.ID)
	reply()
}

// ---------------------------------------------------------------------------------------
// Admin: claimAdmin {action, id, player} from a creative session; any other client is ignored, as an
// unknown message would be. Answers claimAdminResult {action, ok, error, claims}.
//   - "list": every plot, with its owner's player id.
//   - "remove" {id}: removes a plot, and its marker block.
//   - "owner" {id, player}: gives it to another player: the name of a connected player, or a player id.

type claimAdminView struct {
	claimView
	OwnerID string `json:"ownerId"`
}

func handleClaimAdmin(client *Client, payload []byte) {
	if !claimAdmin(client) || len(payload) > claimMaxPayload {
		return
	}
	var request struct {
		Action string `json:"action"`
		ID     string `json:"id"`
		Player string `json:"player"`
	}
	if json.Unmarshal(payload, &request) != nil {
		return
	}
	answer := map[string]interface{}{"action": request.Action, "ok": false}
	reply := func() { storageDeliver(client, createMessage("claimAdminResult", answer)) }
	switch request.Action {
	case "list":
	case "remove":
		blockEditMu.Lock()
		c, ok := claims.remove(request.ID)
		if ok {
			claimClearMarker(client, c)
		}
		blockEditMu.Unlock()
		if !ok {
			answer["error"] = "unknown"
			reply()
			return
		}
		log.Printf("claims: admin %s removed plot %s of %s", client.ID, c.ID, c.Owner)
		saveWorldState()
		claimsBroadcast()
	case "owner":
		owner, name := claimFindPlayer(request.Player)
		if owner == "" {
			answer["error"] = "player"
			reply()
			return
		}
		c, reason, ok := claims.setOwner(request.ID, owner, name)
		if !ok {
			answer["error"] = "unknown"
			reply()
			return
		}
		if reason != "" {
			answer["error"] = reason
			reply()
			return
		}
		log.Printf("claims: admin %s gave plot %s to %s", client.ID, c.ID, owner)
		saveWorldState()
		claimsBroadcast()
	default:
		return
	}
	views := []claimAdminView{}
	for _, c := range claims.list() {
		views = append(views, claimAdminView{claimView: claimViewOf(c, client.stablePlayerID()), OwnerID: c.Owner})
	}
	answer["ok"] = true
	answer["claims"] = views
	reply()
}

// claimClearMarker takes away the marker of a plot the admin removed. Caller holds blockEditMu.
func claimClearMarker(client *Client, c Claim) {
	name, err := chunkStore.Block(c.X, c.Y, c.Z)
	if err != nil || storageBase(name) != claimMarkerBlock {
		return
	}
	if _, _, err := storage.replace(chunkStore, c.X, c.Y, c.Z, "", func() (bool, error) {
		return setBlockTracked(c.X, c.Y, c.Z, "")
	}); err != nil {
		log.Printf("claims: %v", err)
		return
	}
	broadcastToAll(createMessage("blockBreak", map[string]int{"x": c.X, "y": c.Y, "z": c.Z}))
}

// claimFindPlayer finds a player by the name of a connected one (any case), or takes a player id as it is.
func claimFindPlayer(who string) (id, name string) {
	who = strings.TrimSpace(who)
	if who == "" {
		return "", ""
	}
	clientsMu.RLock()
	defer clientsMu.RUnlock()
	for client := range clients {
		player := client.stablePlayerID()
		if player == "" {
			continue
		}
		if strings.EqualFold(client.username, who) || player == who {
			return player, client.username
		}
	}
	if strings.HasPrefix(who, "plr_") && getPlayer(who) != nil {
		if record := getPlayer(who); record != nil {
			return who, record.Nick
		}
	}
	return "", ""
}
