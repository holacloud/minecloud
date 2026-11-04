package network

import (
	"log"
	"math"
	"strings"
	"time"
)

// Appliances: chests that change what they hold on their own (js/game/appliances.js is the
// client's side). They live in storage.go's book, under its one lock, so every move, break and
// simulated step of the same block are in some order. Slots, messages, reach and the request log
// are those of any chest.
//
//   - The oven has three slots: 0 the food, 1 the fuel, 2 the result. A storagePut goes to the slot
//     that item belongs in (ovenSlotFor) and anything else is refused ("not for the oven"); nothing
//     can be put in the result slot. When there is food it can cook and no fire, it burns one piece
//     of fuel and lights; while it burns it cooks. Fire once lit burns out even if the food is taken
//     out. It needs no electricity, and its block name shows the fire (oven:e:on), which only this
//     file decides: settleOvenName overrides whatever a plan or a client places, so the light always
//     follows the real fire.
//   - Cold furniture is a consumer on the power grid (power.go, 30 W). While its network runs, every
//     stack in a compartment with a change in the table counts up, and all of it changes at once
//     when its time is up. A network in a blackout counts nothing: the block is a plain cupboard
//     until power comes back, and the time already counted stays. Nothing ever spoils, and what
//     comes out cold stays cold: the inventory is the browser's and nothing ticks there.
//   - Thawing is one rule: the oven does it, with fire, like any other recipe.
//
// Only what can change is ticked (`active`, rebuilt from saved entries with a Kind and woken by
// every move), once a second, and panels get the new contents only when something changed.
//
// Crashes: moves are saved before they are answered (storage.go), but a simulated step only marks
// the world as needing a save, at most every applianceSaveEvery. So a crash can roll back up to
// that long of cooking, burning and chilling: a fish that was cooked is raw again and its coal is
// back. Every save copies the whole book under the lock, so what a player moved is never lost or
// doubled. Oven names live in the chunks, which may be ahead of world.json: the first tick after a
// restart sets them right.
//
// ovenRecipes, ovenFuels, chillChanges and freezeChanges are mirrored by js/game/appliances.js
// (test/js/furniture.test.js checks them).

const (
	ovenKind = "oven"
	// Oven slots.
	ovenSlotFood   = 0
	ovenSlotFuel   = 1
	ovenSlotResult = 2

	applianceTickInterval = time.Second
	applianceSaveEvery    = 30 * time.Second

	// A day is 240 s: a drink chills in a quarter of a day, freezing takes half a day.
	chillSeconds  = 60.0
	freezeSeconds = 120.0
)

type ovenRecipe struct {
	Out     string
	In      int // how many of the food make one result
	Seconds float64
}

// What the oven takes, and what becomes of it. Frozen food and ice thaw here, in a little while.
var ovenRecipes = map[string]ovenRecipe{
	"raw_fish":           {Out: "cooked_fish", In: 1, Seconds: 20},
	"wheat":              {Out: "bread", In: 3, Seconds: 30},
	"mushroom_red":       {Out: "roast_mushroom", In: 1, Seconds: 15},
	"mushroom_brown":     {Out: "roast_mushroom", In: 1, Seconds: 15},
	"frozen_fish":        {Out: "raw_fish", In: 1, Seconds: 10},
	"frozen_cooked_fish": {Out: "cooked_fish", In: 1, Seconds: 10},
	"frozen_bread":       {Out: "bread", In: 1, Seconds: 10},
	"ice":                {Out: "water_flask", In: 1, Seconds: 10},
}

// Seconds of fire from one piece of fuel: coal burns longest, then planks, then logs.
var ovenFuels = map[string]float64{
	"coal_ore":        80,
	"planks":          30,
	"spruce_planks":   30,
	"birch_planks":    30,
	"jungle_planks":   30,
	"acacia_planks":   30,
	"dark_oak_planks": 30,
	"cherry_planks":   30,
	"maple_planks":    30,
	"willow_planks":   30,
	"wood":            20,
	"spruce_wood":     20,
	"birch_wood":      20,
	"jungle_wood":     20,
	"acacia_wood":     20,
	"dark_oak_wood":   20,
	"cherry_wood":     20,
	"maple_wood":      20,
	"willow_wood":     20,
}

// What a fridge compartment does in chillSeconds.
var chillChanges = map[string]string{
	"water_flask": "cold_water",
	"milk":        "cold_milk",
	"soda_water":  "cold_soda",
}

// What a freezer does in freezeSeconds. Soda and milk stay as they are: they would burst the bottle.
var freezeChanges = map[string]string{
	"water_flask": "ice",
	"cold_water":  "ice",
	"raw_fish":    "frozen_fish",
	"cooked_fish": "frozen_cooked_fish",
	"bread":       "frozen_bread",
}

// ovenStatus is an oven's fire in a storageContents message (seconds).
type ovenStatus struct {
	Burn    float64 `json:"burn"`
	BurnMax float64 `json:"burnMax"`
	Cook    float64 `json:"cook"`
	CookMax float64 `json:"cookMax"`
}

func applianceIsCold(kind string) bool {
	return kind == "fridge" || kind == "chest_freezer"
}

func applianceIsKind(kind string) bool {
	return kind == ovenKind || applianceIsCold(kind)
}

// ovenSlotFor says which slot takes this item: the food's, the fuel's, or -1.
func ovenSlotFor(item string) int {
	if _, ok := ovenRecipes[item]; ok {
		return ovenSlotFood
	}
	if _, ok := ovenFuels[item]; ok {
		return ovenSlotFuel
	}
	return -1
}

// ovenBlockName is an oven's block name with this fire, as js/blockShapes.js writes it: the default
// state is the bare name.
func ovenBlockName(name string, lit bool) string {
	facing := "n"
	if parts := strings.Split(name, ":"); len(parts) > 1 && len(parts[1]) == 1 && strings.Contains("nesw", parts[1]) {
		facing = parts[1]
	}
	if lit {
		return ovenKind + ":" + facing + ":on"
	}
	if facing == "n" {
		return ovenKind
	}
	return ovenKind + ":" + facing + ":off"
}

func ovenStatusOf(block *StorageBlock) *ovenStatus {
	status := &ovenStatus{}
	if block == nil {
		return status
	}
	status.Burn, status.BurnMax, status.Cook = block.Burn, block.BurnMax, block.Cook
	if recipe, ok := ovenCooking(block); ok {
		status.CookMax = recipe.Seconds
	}
	return status
}

// ovenCooking returns the recipe of the food in the oven, if it could be cooked right now: enough of
// it, and room for the result.
func ovenCooking(block *StorageBlock) (ovenRecipe, bool) {
	if len(block.Slots) <= ovenSlotResult {
		return ovenRecipe{}, false
	}
	food, result := block.Slots[ovenSlotFood], block.Slots[ovenSlotResult]
	recipe, ok := ovenRecipes[food.Type]
	if !ok || food.Count < recipe.In {
		return ovenRecipe{}, false
	}
	if result.Count > 0 && (result.Type != recipe.Out || result.Count >= storageMaxStack) {
		return ovenRecipe{}, false
	}
	return recipe, true
}

// ovenStep runs the oven for dt seconds. changed: something a panel shows changed. work: it still has
// something to do without anyone touching it.
func ovenStep(block *StorageBlock, dt float64) (changed, work bool) {
	for len(block.Slots) <= ovenSlotResult {
		block.Slots = append(block.Slots, StorageSlot{})
	}
	recipe, canCook := ovenCooking(block)
	fuel := &block.Slots[ovenSlotFuel]
	if block.Burn <= 0 && canCook && fuel.Count > 0 && ovenFuels[fuel.Type] > 0 {
		block.Burn, block.BurnMax = ovenFuels[fuel.Type], ovenFuels[fuel.Type]
		fuel.Count--
		if fuel.Count == 0 {
			*fuel = StorageSlot{}
		}
		changed = true
	}
	if !canCook && block.Cook > 0 {
		block.Cook = 0
		changed = true
	}
	if block.Burn > 0 {
		changed = true
		block.Burn = math.Max(0, block.Burn-dt)
		if canCook {
			block.Cook += dt
			if block.Cook >= recipe.Seconds {
				ovenFinish(block, recipe)
			}
		}
	}
	if block.Burn <= 0 {
		block.BurnMax = 0
	}
	// A dish that has just finished may leave room or food for the next one.
	_, canCook = ovenCooking(block)
	fuel = &block.Slots[ovenSlotFuel]
	work = block.Burn > 0 || (canCook && fuel.Count > 0 && ovenFuels[fuel.Type] > 0)
	return changed, work
}

func ovenFinish(block *StorageBlock, recipe ovenRecipe) {
	food, result := &block.Slots[ovenSlotFood], &block.Slots[ovenSlotResult]
	food.Count -= recipe.In
	if food.Count == 0 {
		*food = StorageSlot{}
	}
	result.Type = recipe.Out
	result.Count++
	block.Cook = 0
}

// coldTable is what one compartment does: its changes and how long they take.
func coldTable(kind, compartment string) (map[string]string, float64) {
	if kind == "fridge" && compartment == "" {
		return chillChanges, chillSeconds
	}
	return freezeChanges, freezeSeconds
}

// coldStep runs one compartment for dt seconds, if it has power. work: some stack in it can change.
func coldStep(slots []StorageSlot, changes map[string]string, seconds float64, powered bool, dt float64) (changed, work bool) {
	for i := range slots {
		slot := &slots[i]
		out, ok := changes[slot.Type]
		if !ok || slot.Count <= 0 {
			continue
		}
		if !powered {
			work = true
			continue
		}
		changed = true
		slot.Chill += dt
		if slot.Chill >= seconds {
			*slot = StorageSlot{Type: out, Count: slot.Count}
		}
		if _, more := changes[slot.Type]; more {
			work = true
		}
	}
	return changed, work
}

// wakeLocked notes that an appliance's contents changed, so it may have work to do.
func (b *storageBook) wakeLocked(place storagePlace, block *StorageBlock) {
	if applianceIsKind(place.kind) {
		block.Kind = place.kind
		b.active[storageKeyOf(place.cell)] = true
	}
}

// tickAppliances runs every appliance with work to do for dt seconds. Returns the blocks whose names
// changed, to broadcast, and whether world.json needs saving.
func (b *storageBook) tickAppliances(w cropWorld, dt float64) ([]Block, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	save := false
	for key := range b.active {
		block := b.blocks[key]
		if block == nil {
			delete(b.active, key)
			continue
		}
		cell := [3]int{block.X, block.Y, block.Z}
		name, err := w.Block(cell[0], cell[1], cell[2])
		if err != nil {
			log.Printf("appliances: %v", err)
			continue
		}
		if storageBase(name) != block.Kind {
			// Changed behind the book's back: not an appliance to run any more.
			delete(b.active, key)
			continue
		}
		var changed, work bool
		if block.Kind == ovenKind {
			changed, work = ovenStep(block, dt)
			b.showFireLocked(w, cell, name, block.Burn > 0)
			if block.holdsNothing() {
				delete(b.blocks, key)
				work = false
			}
		} else {
			powered := b.powered(cell)
			changes, seconds := coldTable(block.Kind, "")
			changed, work = coldStep(block.Slots, changes, seconds, powered, dt)
			changes, seconds = coldTable(block.Kind, storageFreezerTab)
			freezerChanged, freezerWork := coldStep(block.Freezer, changes, seconds, powered, dt)
			changed, work = changed || freezerChanged, work || freezerWork
		}
		if !work {
			delete(b.active, key)
		}
		if changed {
			save = true
			b.rev++
			b.notifyLocked(storagePlace{cell: cell, capacity: storageKinds[block.Kind], kind: block.Kind})
		}
	}
	// A panel on a fridge says whether it has power, also with nothing in it to change.
	for cell, shown := range b.shownPower {
		if b.powered(cell) == shown {
			continue
		}
		if place, ok := b.locate(w, cell[0], cell[1], cell[2]); ok {
			b.rev++
			b.notifyLocked(place)
		}
	}
	return b.drainNameChangesLocked(), save
}

// showFireLocked makes an oven's name show its fire.
func (b *storageBook) showFireLocked(w cropWorld, cell [3]int, name string, lit bool) {
	want := ovenBlockName(name, lit)
	if want == name {
		return
	}
	if err := w.SetBlock(cell[0], cell[1], cell[2], want); err != nil {
		log.Printf("appliances: %v", err)
		return
	}
	b.nameChanges = append(b.nameChanges, Block{X: cell[0], Y: cell[1], Z: cell[2], BlockType: want})
}

// settleOnOpenLocked looks after what a saved world can hold from before these blocks did anything:
// an oven left lit with no fire goes out, and a fridge the grid never heard of joins it.
func (b *storageBook) settleOnOpenLocked(w cropWorld, place storagePlace) {
	cell := place.cell
	if place.kind == ovenKind {
		block := b.blocks[storageKeyOf(cell)]
		if name, err := w.Block(cell[0], cell[1], cell[2]); err == nil {
			b.showFireLocked(w, cell, name, block != nil && block.Burn > 0)
		}
		return
	}
	if !applianceIsCold(place.kind) {
		return
	}
	for dy := 0; dy <= 1; dy++ {
		name, err := w.Block(cell[0], cell[1]+dy, cell[2])
		if err == nil && storageBase(name) == place.kind {
			b.adopt(cell[0], cell[1]+dy, cell[2], name)
		}
	}
}

func (b *storageBook) drainNameChangesLocked() []Block {
	changes := b.nameChanges
	b.nameChanges = nil
	return changes
}

func (b *storageBook) drainNameChanges() []Block {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.drainNameChangesLocked()
}

// settleOvenName is the name a placed block gets: an oven shows the fire it really has, none unless
// the oven standing there is burning. Other blocks keep their name, and pay nothing for this.
func (b *storageBook) settleOvenName(x, y, z int, name string) string {
	if storageBase(name) != ovenKind {
		return name
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	block := b.blocks[blockKey(x, y, z)]
	return ovenBlockName(name, block != nil && block.Burn > 0)
}

// applianceCleanLoaded limits what a saved appliance can claim.
func applianceCleanLoaded(block *StorageBlock) {
	if !applianceIsKind(block.Kind) {
		block.Kind = ""
	}
	if block.Kind != ovenKind {
		block.Burn, block.BurnMax, block.Cook = 0, 0, 0
		return
	}
	longest := 0.0
	for _, seconds := range ovenFuels {
		longest = math.Max(longest, seconds)
	}
	block.BurnMax = math.Max(0, math.Min(longest, block.BurnMax))
	block.Burn = math.Max(0, math.Min(block.BurnMax, block.Burn))
	block.Cook = math.Max(0, block.Cook)
}

// powerRunsAt says whether the consumer at this cell has power now (all or nothing, power.go).
func powerRunsAt(cell [3]int) bool {
	powerMu.Lock()
	defer powerMu.Unlock()
	return grid.runsAt(powerPos(cell))
}

func (g *powerGrid) runsAt(p powerPos) bool {
	network := g.netOf[p]
	return g.blocks[p] != nil && network != nil && network.powered
}

// powerAdopt tells the grid of a block it does not know: fridges placed before they used electricity
// were never registered, and scanning the whole world for them is not worth it.
func powerAdopt(x, y, z int, name string) {
	powerMu.Lock()
	defer powerMu.Unlock()
	grid.track(x, y, z, name)
}

func runAppliances() {
	ticker := time.NewTicker(applianceTickInterval)
	defer ticker.Stop()
	lastSave := time.Now()
	pending := false
	for now := range ticker.C {
		updates, changed := storage.tickAppliances(chunkStore, applianceTickInterval.Seconds())
		pending = pending || changed
		if pending && now.Sub(lastSave) >= applianceSaveEvery {
			pending = false
			lastSave = now
			saveWorldState()
		}
		for _, block := range updates {
			broadcastToAll(createMessage("blockPlace", block))
		}
	}
}
