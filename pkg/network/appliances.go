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
//   - The foundry and the arc furnace are ovens for hot work: a machine is an entry in `machines`
//     (its recipes, and what goes in its second slot), and they all run through machine.step. The
//     foundry burns coal like an oven burns fuel. The arc furnace has no fire: its second slot holds
//     the coal its recipes use up as an ingredient, and it runs on electricity (power.go, OnDemand:
//     it asks for its watts only while it has work, by wantPower). Without power it holds still and
//     keeps what it had done. Its name shows the arc (arc_furnace:e:on) only while it really runs.
//     The autoclave is an electric machine too, and its name shows its steam the same way: every machine's
//     block has `fire` in its name on the client, or a name settled here would be one it does not know
//     and the block would vanish (machineSettledNames in appliances_test.go, checked from both sides).
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
// ovenRecipes, ovenFuels, foundryRecipes, foundryFuels, arcRecipes, chillChanges and freezeChanges
// are mirrored by js/game/appliances.js (test/js/furniture.test.js checks them).

const (
	ovenKind    = "oven"
	foundryKind = "foundry"
	arcKind     = "arc_furnace"
	// The autoclave sterilises what cultures dirtied (microbes.go).
	autoclaveKind = "autoclave"
	// What the arc furnace's recipes use up, and what its second slot takes.
	arcReducer = "coal_ore"
	// The slots of every machine: what is worked on, the fuel (or the arc's coal), the result.
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
	In      int // how many of the food make one batch
	Seconds float64
	Yield   int // how many results one batch gives; 0 means 1
	Coal    int // an arc furnace: how much of its second slot one batch uses up
}

// yield is how many results one batch gives.
func (r ovenRecipe) yield() int {
	return max(1, r.Yield)
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

// What the foundry smelts. Glass and stone beat the C menu's yields for the same material: there, 3
// sand give 2 glass, and 1 cobblestone and 1 coal give 2 stone. So do the ores of the other metals:
// there, 1 ore and 1 coal give 1 metal (js/game/smelters.js). Tin and lead melt soonest of all; zinc,
// which boils away from the fire instead of pooling, takes longest.
var foundryRecipes = map[string]ovenRecipe{
	"sand":        {Out: "glass", In: 3, Yield: 4, Seconds: 12},
	"cobblestone": {Out: "stone", In: 1, Yield: 3, Seconds: 10},
	"limestone":   {Out: "quicklime", In: 1, Yield: 2, Seconds: 15},
	"iron_ore":    {Out: "iron_block", In: 1, Yield: 1, Seconds: 20},
	"gold_ore":    {Out: "gold_block", In: 1, Yield: 1, Seconds: 15},
	"copper_ore":  {Out: "copper_block", In: 1, Yield: 2, Seconds: 15},
	"tin_ore":     {Out: "element_sn", In: 1, Yield: 2, Seconds: 10},
	"zinc_ore":    {Out: "element_zn", In: 1, Yield: 2, Seconds: 18},
	"lead_ore":    {Out: "element_pb", In: 1, Yield: 2, Seconds: 10},
	"silver_ore":  {Out: "element_ag", In: 1, Yield: 2, Seconds: 15},
}

// Only coal burns hot enough to melt sand.
var foundryFuels = map[string]float64{
	"coal_ore": 80,
}

// What the arc furnace makes, with coal as an ingredient. SiO2 + 2 C -> Si + 2 CO at about 2000 C: in
// the C menu 1 stone and 1 coal give 1 silicon, so the same 2 coal give half as much again here.
var arcRecipes = map[string]ovenRecipe{
	"sand":     {Out: "element_si", In: 1, Coal: 2, Yield: 3, Seconds: 20},
	"iron_ore": {Out: "steel_ingot", In: 1, Coal: 1, Yield: 2, Seconds: 15},
}

// machine is what makes one block a machine: what it takes and what runs it.
type machine struct {
	Name    string // as it is said in a refusal
	Recipes map[string]ovenRecipe
	// Fire machines: what burns in the second slot. Without Fuels it runs on electricity.
	Fuels map[string]float64
	// Electric machines: the one item their second slot takes.
	Reducer string
}

// What the autoclave does: steam under pressure, about 121 C, kills every microbe and spore. A dish comes
// out sterile, and an unsterile plate a sterile one (labs sterilise their media before they pour them). A
// culture plate is a dish with its colonies, so it comes out an empty sterile dish too, as a lab's used
// cultures are autoclaved before anything else. Its water is its own, and its second slot takes nothing
// (microbes.go).
var autoclaveRecipes = map[string]ovenRecipe{
	"used_dish":             {Out: "petri_dish", In: 1, Yield: 1, Seconds: 10},
	"agar_plate_unsterile":  {Out: "agar_plate", In: 1, Yield: 1, Seconds: 15},
	"culture_yeast":         {Out: "petri_dish", In: 1, Yield: 1, Seconds: 10},
	"culture_lactobacillus": {Out: "petri_dish", In: 1, Yield: 1, Seconds: 10},
	"culture_soil":          {Out: "petri_dish", In: 1, Yield: 1, Seconds: 10},
	"culture_cyano":         {Out: "petri_dish", In: 1, Yield: 1, Seconds: 10},
	"culture_mould":         {Out: "petri_dish", In: 1, Yield: 1, Seconds: 10},
}

var machines = map[string]*machine{
	ovenKind:      {Name: "oven", Recipes: ovenRecipes, Fuels: ovenFuels},
	foundryKind:   {Name: "foundry", Recipes: foundryRecipes, Fuels: foundryFuels},
	arcKind:       {Name: "arc furnace", Recipes: arcRecipes, Reducer: arcReducer},
	autoclaveKind: {Name: "autoclave", Recipes: autoclaveRecipes},
}

func (m *machine) electric() bool {
	return m.Fuels == nil
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
	// Frozen slowly, a tardigrade curls into a tun and waits (js/game/microscope.js).
	"tardigrade_tube": "tardigrade_tun",
}

// ovenStatus is a machine's fire and work in a storageContents message (seconds).
type ovenStatus struct {
	Burn    float64 `json:"burn"`
	BurnMax float64 `json:"burnMax"`
	Cook    float64 `json:"cook"`
	CookMax float64 `json:"cookMax"`
	// An electric machine with work that has only just asked the grid for power: no answer yet.
	Starting bool `json:"starting,omitempty"`
}

func applianceIsCold(kind string) bool {
	return kind == "fridge" || kind == "chest_freezer"
}

func applianceIsKind(kind string) bool {
	return machines[kind] != nil || applianceIsCold(kind) || kind == incubatorKind
}

// applianceUsesPower: its panel says whether it has electricity.
func applianceUsesPower(kind string) bool {
	m := machines[kind]
	return applianceIsCold(kind) || kind == incubatorKind || (m != nil && m.electric())
}

// slotFor says which slot takes this item: the food's, the second one, or -1.
func (m *machine) slotFor(item string) int {
	if _, ok := m.Recipes[item]; ok {
		return ovenSlotFood
	}
	if _, ok := m.Fuels[item]; ok || (m.electric() && item == m.Reducer) {
		return ovenSlotFuel
	}
	return -1
}

// ovenBlockName is a machine's block name with this fire or arc, as js/blockShapes.js writes it: the
// default state is the bare name.
func ovenBlockName(name string, lit bool) string {
	base := storageBase(name)
	facing := "n"
	if parts := strings.Split(name, ":"); len(parts) > 1 && len(parts[1]) == 1 && strings.Contains("nesw", parts[1]) {
		facing = parts[1]
	}
	if lit {
		return base + ":" + facing + ":on"
	}
	if facing == "n" {
		return base
	}
	return base + ":" + facing + ":off"
}

func ovenStatusOf(m *machine, block *StorageBlock) *ovenStatus {
	status := &ovenStatus{}
	if block == nil {
		return status
	}
	status.Burn, status.BurnMax, status.Cook = block.Burn, block.BurnMax, block.Cook
	if recipe, ok := m.cooking(block); ok {
		status.CookMax = recipe.Seconds
	}
	return status
}

// cooking returns the recipe of what is in the machine, if it could be worked right now: enough of
// it, enough coal if the recipe uses any, and room for the whole result.
func (m *machine) cooking(block *StorageBlock) (ovenRecipe, bool) {
	if len(block.Slots) <= ovenSlotResult {
		return ovenRecipe{}, false
	}
	food, second, result := block.Slots[ovenSlotFood], block.Slots[ovenSlotFuel], block.Slots[ovenSlotResult]
	recipe, ok := m.Recipes[food.Type]
	if !ok || food.Count < recipe.In {
		return ovenRecipe{}, false
	}
	if recipe.Coal > 0 && (second.Type != m.Reducer || second.Count < recipe.Coal) {
		return ovenRecipe{}, false
	}
	if result.Count > 0 && (result.Type != recipe.Out || result.Count+recipe.yield() > storageMaxStack) {
		return ovenRecipe{}, false
	}
	return recipe, true
}

// step runs the machine for dt seconds; powered only matters to an electric one. changed: something a
// panel shows changed. work: it still has something to do without anyone touching it.
func (m *machine) step(block *StorageBlock, dt float64, powered bool) (changed, work bool) {
	for len(block.Slots) <= ovenSlotResult {
		block.Slots = append(block.Slots, StorageSlot{})
	}
	recipe, canCook := m.cooking(block)
	fuel := &block.Slots[ovenSlotFuel]
	if !m.electric() && block.Burn <= 0 && canCook && fuel.Count > 0 && m.Fuels[fuel.Type] > 0 {
		block.Burn, block.BurnMax = m.Fuels[fuel.Type], m.Fuels[fuel.Type]
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
	burning := block.Burn > 0
	if burning {
		changed = true
		block.Burn = math.Max(0, block.Burn-dt)
	}
	// It works while it burns or has power; without them, what it had done stays.
	if canCook && (burning || powered) {
		changed = true
		block.Cook += dt
		if block.Cook >= recipe.Seconds {
			ovenFinish(block, recipe)
		}
	}
	if block.Burn <= 0 {
		block.BurnMax = 0
	}
	// A dish that has just finished may leave room or food for the next one.
	_, canCook = m.cooking(block)
	if m.electric() {
		return changed, canCook
	}
	fuel = &block.Slots[ovenSlotFuel]
	work = block.Burn > 0 || (canCook && fuel.Count > 0 && m.Fuels[fuel.Type] > 0)
	return changed, work
}

func ovenFinish(block *StorageBlock, recipe ovenRecipe) {
	food, second, result := &block.Slots[ovenSlotFood], &block.Slots[ovenSlotFuel], &block.Slots[ovenSlotResult]
	food.Count -= recipe.In
	if food.Count == 0 {
		*food = StorageSlot{}
	}
	if recipe.Coal > 0 {
		second.Count -= recipe.Coal
		if second.Count == 0 {
			*second = StorageSlot{}
		}
	}
	result.Type = recipe.Out
	result.Count += recipe.yield()
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
			b.stopAskingLocked(cell, key)
			continue
		}
		var changed, work bool
		b.world = w
		if block.Kind == incubatorKind {
			changed, work = b.incubatorStepLocked(w, key, cell, block, dt)
			if !work {
				b.stopAskingLocked(cell, key)
			}
		} else if m := machines[block.Kind]; m != nil {
			// The grid has heard an electric machine only if it asked before this tick.
			changed, work = m.step(block, dt, m.electric() && b.asked[key] > 0 && b.powered(cell))
			b.showFireLocked(w, cell, name, b.litLocked(m, cell, block))
			if m.electric() {
				if work {
					b.askLocked(cell, key, &changed)
				} else {
					b.stopAskingLocked(cell, key)
				}
			}
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
	// A panel on a fridge or an arc furnace says whether it has power, also with nothing changing.
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

// litLocked says whether a machine is alight now: its fire, or an arc the grid is really feeding.
func (b *storageBook) litLocked(m *machine, cell [3]int, block *StorageBlock) bool {
	if block == nil {
		return false
	}
	if !m.electric() {
		return block.Burn > 0
	}
	_, canCook := m.cooking(block)
	return canCook && b.asked[storageKeyOf(cell)] > 0 && b.powered(cell)
}

// askLocked asks the grid for an electric machine's watts, again every tick, as a grid that was
// rebuilt or a block placed anew may not know. The grid balances 5 times a second, so one tick after
// the first asking its answer counts. A panel is told when that moment comes.
func (b *storageBook) askLocked(cell [3]int, key string, changed *bool) {
	b.wantPower(cell, true)
	if b.asked[key] < 2 {
		b.asked[key]++
		*changed = true
	}
}

// stopAskingLocked ends an electric machine's demand on the grid, once it has no work.
func (b *storageBook) stopAskingLocked(cell [3]int, key string) {
	if _, asking := b.asked[key]; asking {
		delete(b.asked, key)
		b.wantPower(cell, false)
	}
}

// emptiedLocked looks after an appliance whose last item was just taken out: nothing ticks it after
// this, so an arc that was on goes out here.
func (b *storageBook) emptiedLocked(w cropWorld, place storagePlace) {
	key := storageKeyOf(place.cell)
	delete(b.active, key)
	b.stopAskingLocked(place.cell, key)
	if m := machines[place.kind]; m != nil && m.electric() {
		cell := place.cell
		if name, err := w.Block(cell[0], cell[1], cell[2]); err == nil {
			b.showFireLocked(w, cell, name, false)
		}
	}
}

// showFireLocked makes a machine's name show its fire or arc.
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
// a machine left lit with no fire goes out, and a fridge the grid never heard of joins it.
func (b *storageBook) settleOnOpenLocked(w cropWorld, place storagePlace) {
	cell := place.cell
	if m := machines[place.kind]; m != nil {
		if name, err := w.Block(cell[0], cell[1], cell[2]); err == nil {
			b.showFireLocked(w, cell, name, b.litLocked(m, cell, b.blocks[storageKeyOf(cell)]))
		}
	}
	if !applianceUsesPower(place.kind) {
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

// settleOvenName is the name a placed block gets: a machine shows the fire or arc it really has, none
// unless the one standing there is alight. Other blocks keep their name, and pay nothing for this.
func (b *storageBook) settleOvenName(x, y, z int, name string) string {
	m := machines[storageBase(name)]
	if m == nil {
		return name
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return ovenBlockName(name, b.litLocked(m, [3]int{x, y, z}, b.blocks[blockKey(x, y, z)]))
}

// applianceCleanLoaded limits what a saved appliance can claim.
func applianceCleanLoaded(block *StorageBlock) {
	if !applianceIsKind(block.Kind) {
		block.Kind = ""
	}
	m := machines[block.Kind]
	if m == nil {
		block.Burn, block.BurnMax, block.Cook = 0, 0, 0
		return
	}
	longest := 0.0
	for _, seconds := range m.Fuels {
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

// powerAsk sets whether an electric machine asks for its watts (power.go, OnDemand).
func powerAsk(cell [3]int, on bool) {
	powerMu.Lock()
	defer powerMu.Unlock()
	p := powerPos(cell)
	if on && grid.blocks[p] != nil {
		grid.asks[p] = true
	} else {
		delete(grid.asks, p)
	}
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
