package network

import (
	"encoding/json"
	"log"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Electricity: generators, wires, batteries and consumers that form networks. The blocks
// are drawn by js/game/electricity.js; the simulation is authoritative here, so every player
// sees the same lamps lit and the same battery charge, also while nobody is near them.
//
// - Every electric block is a world block. Its kind is the part of the name before ':'
//   (water_wheel:z is a water_wheel). The server remembers each one (placed or broken
//   through setBlockTracked) and saves them in world.json ("power"), batteries with their
//   charge.
// - Blocks that touch on a face (6 neighbours) belong to the same network. Every electric
//   block conducts, so a lamp next to a solar panel works without a wire.
// - Five times a second (powerTickInterval), for each network: generation (W) from the sun,
//   the wind, the water, the hand cranks, eels in their tanks and radioisotope generators; demand (W) of every consumer; then the batteries
//   take the surplus or cover the deficit (energy scaled by the tick's length). A network
//   is all or nothing: if generation plus what the batteries can give does not cover the
//   whole demand, every consumer goes off (a blackout) and what is generated charges the
//   batteries.
// - What players see is part of the block name, changed through the chunk store and a normal
//   blockPlace broadcast (only when it changes): "electric_lamp:on", "battery_block:3"
//   (charge in quarters). Lit lamps then light the world like torches.
// - A motor that switches on opens the iron doors and trapdoors it touches; switching off
//   closes them. Lit grow lamps make the wheat under them grow twice as fast (crops.go).
// - Rams and lift winches (mechanics.go) are consumers that move blocks: a powered ram pushes
//   the blocks in front of it, a powered winch hoists its lift platform.
// - Logic blocks (logic.go: levers, buttons, plates, sensors, gates) are switches: they
//   conduct only while they are on, and a gate never conducts through its input faces. So
//   networks are built from face neighbours that both conduct towards each other (joins),
//   and rebuilt (relink) whenever a switch changes.
//
// powerKinds is the one table of electric blocks. js/game/electricity.js mirrors it
// (ELECTRIC_KINDS) and test/js/electricity.test.js checks both agree. Logic blocks are added
// to it by logic.go (init) with the role "logic", mirrored by js/game/logic.js.

type powerRole string

const (
	powerGenerator powerRole = "generator"
	powerConductor powerRole = "conductor"
	powerStorage   powerRole = "storage"
	powerConsumer  powerRole = "consumer"
	// powerLogic: switches, sensors and gates (logic.go); they conduct only while on.
	powerLogic powerRole = "logic"
)

type powerKind struct {
	Role powerRole
	// Generators: what drives them ("solar", "wind", "water", "crank", "eel", "radioisotope")
	// and their peak power.
	Source string
	// Generators: peak power (W). Consumers: demand (W).
	Watts float64
	// Storage: capacity (J) and the most it charges or discharges (W).
	Capacity float64
	Rate     float64
	// Consumers whose block name shows ":on" while powered.
	Switch bool
	// Storage whose block name shows the charge in quarters (":1" .. ":4").
	Levels int
}

// Game time runs fast (a day is 240 s, a night about 120 s), so the numbers are scaled for
// play: one small generator fills a battery in about a day, and a full battery keeps a 10 W
// lamp lit for two and a half nights.
var powerKinds = map[string]powerKind{
	"copper_wire":    {Role: powerConductor},
	"wire_post":      {Role: powerConductor},
	"solar_panel":    {Role: powerGenerator, Source: "solar", Watts: 40},
	"wind_turbine":   {Role: powerGenerator, Source: "wind", Watts: 150},
	"water_wheel":    {Role: powerGenerator, Source: "water", Watts: 105},
	"hand_crank":     {Role: powerGenerator, Source: "crank", Watts: 100},
	"battery_block":  {Role: powerStorage, Capacity: 3000, Rate: 200, Levels: 4},
	"electric_lamp":  {Role: powerConsumer, Watts: 10, Switch: true},
	"grow_lamp":      {Role: powerConsumer, Watts: 30, Switch: true},
	"electric_motor": {Role: powerConsumer, Watts: 50, Switch: true},
	// --- Living generators (task #14, js/game/eel.js) ---
	// An electric eel in its glass tank ("eel_tank:full" while occupied): powerEelSteady W all
	// the time, Watts (the peak) for powerEelFeedBurst after it is fed (powerFeed).
	"eel_tank": {Role: powerGenerator, Source: "eel", Watts: 50},
	// --- Radioisotope generator (RTG, guide 220) ---
	// Decay heat through thermocouples: Watts all the time, day and night, with no fuel and
	// nothing to do. 80 W runs a 60 W winch or a 50 W motor on its own, without batteries, but
	// it is twice what a solar panel gives at noon, so its recipe is dear.
	"rtg": {Role: powerGenerator, Source: "radioisotope", Watts: 80},
}

const (
	// Logic (switches, gates) needs to feel immediate, so the grid runs 5 times a second.
	powerTickInterval = 200 * time.Millisecond
	// A network bigger than this does not work at all (the multimeter says so).
	powerMaxNetwork = 512
	// The most electric blocks the server tracks in the whole world.
	powerMaxBlocks = 16384
	// A network that has just switched off waits this long before switching on again.
	powerSwitchHold = 3 * time.Second
	// How often the surroundings of a generator (water, sky) are looked at again.
	powerEnvRefresh = 10 * time.Second
	// One turn of a hand crank: power for this long, up to powerCrankMax ahead.
	powerCrankBurst = 4 * time.Second
	powerCrankMax   = 12 * time.Second
	// Eel tank: steady power while occupied, the peak (Watts) for a while after a meal, up to
	// powerEelFeedMax ahead.
	powerEelSteady    = 25.0
	powerEelFeedBurst = 10 * time.Second
	powerEelFeedMax   = 30 * time.Second
	// Water wheel: power per side touching water.
	powerWaterPerSide = 35.0
	// Wind turbine: P = powerWindFactor * v^3 (W, v in m/s), nothing below powerWindCutIn.
	powerWindFactor = 0.6
	powerWindCutIn  = 1.0
	// Solar panel: what rain leaves of the sunshine.
	powerSolarRain = 0.3
	// Blocks scanned above a solar panel or a turbine.
	powerSkyScan   = 48
	powerCoverScan = 16
	// Seconds between saves of battery charges alone.
	powerSaveEvery = 30 * time.Second
)

// Blocks the sun shines through (everything else is a roof for a solar panel).
var powerSeeThrough = map[string]bool{
	"air": true, "glass": true, "glass_pane": true, "torch": true, "tall_grass": true, "flower_red": true,
	"flower_yellow": true, "copper_wire": true, "wire_post": true, "iron_bars": true, "ladder": true, "sign": true,
}

// powerLetsSunThrough looks at the block whatever its state (sign:e:post is a sign).
func powerLetsSunThrough(name string) bool {
	base, _, _ := strings.Cut(name, ":")
	return powerSeeThrough[base]
}

// PowerBlock is an electric block in the world. Energy (J) is the charge of a battery.
type PowerBlock struct {
	X      int     `json:"x"`
	Y      int     `json:"y"`
	Z      int     `json:"z"`
	Kind   string  `json:"kind"`
	Name   string  `json:"name"`
	Energy float64 `json:"energy,omitempty"`
}

type powerPos [3]int

func (b *PowerBlock) pos() powerPos { return powerPos{b.X, b.Y, b.Z} }

// powerKindOf returns the electric kind of a block name ("" when it is not electric).
func powerKindOf(name string) string {
	base, _, _ := strings.Cut(name, ":")
	if _, ok := powerKinds[base]; ok {
		return base
	}
	return ""
}

// powerEnvironment is what the weather and the clock give the generators this second.
type powerEnvironment struct {
	Days float64 // worldDay + timeOfDay
	Time float64 // timeOfDay: 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight
	Rain float64 // 0..1
	// Players' eye positions, for pressure plates and proximity sensors (logic.go).
	Players [][3]float64
}

// Surroundings of a generator, looked at every powerEnvRefresh.
type powerSurroundings struct {
	waterSides int
	skyOpen    bool
	cover      int
	checked    time.Time
}

type powerNetwork struct {
	members  []powerPos
	root     powerPos // smallest member: names the network while its shape stays
	tooBig   bool
	gen      float64
	demand   float64
	stored   float64
	capacity float64
	powered  bool
	sources  map[string]float64
	// signal: the network has power available or holds a switched-on logic block (logic.go).
	signal bool
}

// size: members of the network when the hold was taken. A network whose shape changed (a
// switch joined or split it) starts afresh, so a light switch acts at once.
type powerHold struct {
	powered bool
	since   time.Time
	size    int
}

// powerGrid holds every electric block and the networks they form.
type powerGrid struct {
	blocks    map[powerPos]*PowerBlock
	dirty     bool // blocks were added or removed: networks must be rebuilt (and saved)
	relink    bool // a switch changed: networks must be rebuilt (nothing new to save)
	networks  []*powerNetwork
	netOf     map[powerPos]*powerNetwork
	env       map[powerPos]*powerSurroundings
	crank     map[powerPos]time.Time
	holds     map[powerPos]powerHold
	growLamps map[powerPos]bool
	logic     *logicState
	mech      *mechState
	// Battery charge (or a logic block's name) changed since the last save.
	energyChanged bool
}

func newPowerGrid() *powerGrid {
	return &powerGrid{
		blocks:    make(map[powerPos]*PowerBlock),
		dirty:     true,
		netOf:     make(map[powerPos]*powerNetwork),
		env:       make(map[powerPos]*powerSurroundings),
		crank:     make(map[powerPos]time.Time),
		holds:     make(map[powerPos]powerHold),
		growLamps: make(map[powerPos]bool),
		logic:     newLogicState(),
		mech:      newMechState(),
	}
}

var (
	// powerMu guards grid. Order: cropMu, then powerMu, then the chunk store, then stateMu.
	// Never call saveWorldState while holding it.
	powerMu sync.Mutex
	grid    = newPowerGrid()
)

// track updates the registry after the block at (x, y, z) became name ("" when removed).
// Returns whether it changed.
func (g *powerGrid) track(x, y, z int, name string) bool {
	p := powerPos{x, y, z}
	kind := powerKindOf(name)
	old, had := g.blocks[p]
	if kind == "" {
		if !had {
			return false
		}
		g.forget(p)
		return true
	}
	if had && old.Kind == kind {
		if old.Name != name && powerKinds[kind].Role == powerLogic {
			g.relink = true // a lever set from a blueprint, say
		}
		old.Name = name
		return false
	}
	if !had && len(g.blocks) >= powerMaxBlocks {
		return false
	}
	if had {
		g.forget(p)
	}
	// A battery placed from a blueprint or a /give arrives empty, whatever its name says.
	g.blocks[p] = &PowerBlock{X: x, Y: y, Z: z, Kind: kind, Name: name}
	g.dirty = true
	return true
}

func (g *powerGrid) forget(p powerPos) {
	delete(g.blocks, p)
	delete(g.env, p)
	delete(g.crank, p)
	delete(g.growLamps, p)
	g.dirty = true
}

var powerSteps = [6]powerPos{{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}}

// rebuild groups the blocks into networks (flood fill over face neighbours that join, see
// logic.go: switches that are off do not).
func (g *powerGrid) rebuild() {
	g.networks = g.networks[:0]
	g.netOf = make(map[powerPos]*powerNetwork, len(g.blocks))
	keys := make([]powerPos, 0, len(g.blocks))
	for p := range g.blocks {
		keys = append(keys, p)
	}
	sort.Slice(keys, func(i, j int) bool { return powerLess(keys[i], keys[j]) })
	for _, start := range keys {
		if g.netOf[start] != nil {
			continue
		}
		network := &powerNetwork{root: start}
		g.netOf[start] = network
		queue := []powerPos{start}
		for len(queue) > 0 {
			p := queue[0]
			queue = queue[1:]
			network.members = append(network.members, p)
			for _, step := range powerSteps {
				n := powerPos{p[0] + step[0], p[1] + step[1], p[2] + step[2]}
				if g.blocks[n] == nil || g.netOf[n] != nil || !g.joins(p, n) {
					continue
				}
				g.netOf[n] = network
				queue = append(queue, n)
			}
		}
		network.tooBig = len(network.members) > powerMaxNetwork
		g.networks = append(g.networks, network)
	}
	// Forget holds of networks that no longer exist.
	roots := make(map[powerPos]bool, len(g.networks))
	for _, network := range g.networks {
		roots[network.root] = true
	}
	for root := range g.holds {
		if !roots[root] {
			delete(g.holds, root)
		}
	}
	g.dirty = false
	g.relink = false
}

func powerLess(a, b powerPos) bool {
	if a[0] != b[0] {
		return a[0] < b[0]
	}
	if a[1] != b[1] {
		return a[1] < b[1]
	}
	return a[2] < b[2]
}

// surroundings returns (refreshing when stale) what is around a generator.
func (g *powerGrid) surroundings(b *PowerBlock, w cropWorld, now time.Time) *powerSurroundings {
	p := b.pos()
	s := g.env[p]
	if s != nil && now.Sub(s.checked) < powerEnvRefresh {
		return s
	}
	if s == nil {
		s = &powerSurroundings{}
		g.env[p] = s
	}
	s.checked = now
	switch powerKinds[b.Kind].Source {
	case "water":
		s.waterSides = 0
		for _, step := range powerSteps {
			if step[1] > 0 {
				continue // water above does not turn the wheel
			}
			if name, err := w.Block(b.X+step[0], b.Y+step[1], b.Z+step[2]); err == nil && name == "water" {
				s.waterSides++
			}
		}
	case "solar":
		s.skyOpen = true
		for dy := 1; dy <= powerSkyScan; dy++ {
			name, err := w.Block(b.X, b.Y+dy, b.Z)
			if err != nil || !powerLetsSunThrough(name) {
				s.skyOpen = false
				break
			}
		}
	case "wind":
		s.cover = 0
		for dy := 1; dy <= powerCoverScan; dy++ {
			name, err := w.Block(b.X, b.Y+dy, b.Z)
			if err == nil && !powerLetsSunThrough(name) && name != "water" {
				s.cover++
			}
		}
	}
	return s
}

// generation is the power (W) a generator gives right now.
func (g *powerGrid) generation(b *PowerBlock, w cropWorld, env powerEnvironment, now time.Time) float64 {
	kind := powerKinds[b.Kind]
	switch kind.Source {
	case "solar":
		if !g.surroundings(b, w, now).skyOpen {
			return 0
		}
		sun := math.Max(0, math.Sin(env.Time*2*math.Pi))
		return kind.Watts * sun * (1 - (1-powerSolarRain)*env.Rain)
	case "wind":
		// The rotor turns two blocks above the turbine block.
		return powerWindWatts(powerWindSpeed(env, float64(b.Y)+2, g.surroundings(b, w, now).cover), kind.Watts)
	case "water":
		return math.Min(kind.Watts, powerWaterPerSide*float64(g.surroundings(b, w, now).waterSides))
	case "crank":
		if until, ok := g.crank[b.pos()]; ok && now.Before(until) {
			return kind.Watts
		}
	case "eel":
		// Only an occupied tank; a fed eel is livelier (its deadline shares the crank map).
		if !powerEelInside(b.Name) {
			return 0
		}
		if until, ok := g.crank[b.pos()]; ok && now.Before(until) {
			return kind.Watts
		}
		return powerEelSteady
	case "radioisotope":
		// The isotope decays at the same pace whatever happens around it.
		return kind.Watts
	}
	return 0
}

// powerWindSpeed is the wind (m/s) at height y with `cover` blocks overhead, as
// Game.weatherGetWind in js/game/weather.js.
func powerWindSpeed(env powerEnvironment, y float64, cover int) float64 {
	speed := weatherWindSpeed(env.Days, y, env.Rain)
	switch {
	case cover >= 3:
		return speed * 0.05
	case cover > 0:
		return speed * 0.3
	}
	return speed
}

func powerWindWatts(speed, peak float64) float64 {
	if speed < powerWindCutIn {
		return 0
	}
	return math.Min(peak, powerWindFactor*speed*speed*speed)
}

// tick runs one step of dt seconds. Returns the blocks whose names changed (to broadcast) and
// whether world.json should be saved.
func (g *powerGrid) tick(w cropWorld, env powerEnvironment, now time.Time, dt float64) ([]Block, bool) {
	save := false
	if g.dirty {
		g.followLogicNames(w)
		g.rebuild()
		save = true
	} else if g.relink {
		g.rebuild()
	}
	for p, until := range g.crank {
		if !now.Before(until) {
			delete(g.crank, p)
		}
	}
	var updates []Block
	litGrowLamps := make(map[powerPos]bool)
	for _, network := range g.networks {
		g.simulate(network, w, env, now, dt)
		for _, p := range network.members {
			b := g.blocks[p]
			if b == nil {
				continue
			}
			kind := powerKinds[b.Kind]
			want := b.Name
			switch {
			case kind.Switch:
				want = b.Kind
				if network.powered {
					want = b.Kind + ":on"
				}
			case kind.Levels > 0:
				want = powerLevelName(b.Kind, b.Energy/kind.Capacity, kind.Levels)
			}
			if b.Kind == "grow_lamp" && network.powered {
				litGrowLamps[p] = true
			}
			if want == b.Name {
				continue
			}
			current, err := w.Block(b.X, b.Y, b.Z)
			if err != nil {
				log.Printf("power: %v", err)
				continue
			}
			if current != b.Name {
				// Changed behind the registry's back: follow the world.
				if g.track(b.X, b.Y, b.Z, current) {
					save = true
				}
				continue
			}
			if err := w.SetBlock(b.X, b.Y, b.Z, want); err != nil {
				log.Printf("power: %v", err)
				continue
			}
			wasOn := strings.HasSuffix(b.Name, ":on")
			b.Name = want
			updates = append(updates, Block{X: b.X, Y: b.Y, Z: b.Z, BlockType: want})
			if b.Kind == "electric_motor" && wasOn != network.powered {
				updates = append(updates, powerMoveDoors(w, b, network.powered)...)
			}
		}
	}
	g.growLamps = litGrowLamps
	updates = append(updates, g.mechanicsStep(w, env, now)...)
	updates = append(updates, g.logicStep(w, env, now)...)
	return updates, save
}

// followLogicNames reads the logic blocks' names from the world before the networks are
// rebuilt (after loading world.json, a lever switched in a saved chunk is what counts).
func (g *powerGrid) followLogicNames(w cropWorld) {
	for _, b := range g.blocks {
		if powerKinds[b.Kind].Role != powerLogic {
			continue
		}
		if current, err := w.Block(b.X, b.Y, b.Z); err == nil && current != b.Name {
			g.track(b.X, b.Y, b.Z, current)
		}
	}
}

// simulate balances one network for dt seconds (see the header).
func (g *powerGrid) simulate(network *powerNetwork, w cropWorld, env powerEnvironment, now time.Time, dt float64) {
	network.gen, network.demand, network.stored, network.capacity = 0, 0, 0, 0
	network.sources = make(map[string]float64)
	var batteries []*PowerBlock
	rate := 0.0
	for _, p := range network.members {
		b := g.blocks[p]
		if b == nil {
			continue
		}
		kind := powerKinds[b.Kind]
		switch kind.Role {
		case powerGenerator:
			if network.tooBig {
				continue
			}
			watts := g.generation(b, w, env, now)
			network.gen += watts
			network.sources[kind.Source] += watts
		case powerConsumer:
			network.demand += kind.Watts
		case powerStorage:
			batteries = append(batteries, b)
			network.stored += b.Energy
			network.capacity += kind.Capacity
			rate += kind.Rate
		}
	}
	powered, stored := powerBalance(network.gen, network.demand, network.stored, network.capacity, rate, dt)
	if network.tooBig {
		powered = false
		stored = network.stored
	}
	// Switching on again waits powerSwitchHold after the last change (no flicker in gusts).
	hold, known := g.holds[network.root]
	if known && hold.size != len(network.members) {
		known = false
	}
	if known && powered && !hold.powered && now.Sub(hold.since) < powerSwitchHold {
		powered = false
		_, stored = powerBalance(network.gen, 0, network.stored, network.capacity, rate, dt)
	}
	if !known || hold.powered != powered {
		g.holds[network.root] = powerHold{powered: powered, since: now, size: len(network.members)}
	}
	network.powered = powered && network.demand > 0
	if len(batteries) > 0 {
		if math.Abs(stored-network.stored) > 1e-9 {
			g.energyChanged = true
		}
		share := stored / float64(len(batteries))
		for _, b := range batteries {
			b.Energy = share
		}
	}
	network.stored = stored
}

// powerBalance decides one step: whether the consumers run, and the energy left in the
// batteries. gen and demand in W, stored and capacity in J, rate the most the batteries
// move per second (W).
func powerBalance(gen, demand, stored, capacity, rate, dt float64) (powered bool, after float64) {
	surplus := gen - demand
	if surplus >= 0 {
		charge := math.Min(surplus, rate) * dt
		return true, math.Min(capacity, stored+charge)
	}
	deficit := -surplus
	if deficit <= rate && deficit*dt <= stored {
		return true, stored - deficit*dt
	}
	// Blackout: nothing runs, and what is generated charges the batteries.
	charge := math.Min(gen, rate) * dt
	return false, math.Min(capacity, stored+charge)
}

// powerLevelName shows a battery's charge (fraction 0..1) in its name: battery_block,
// battery_block:1 .. battery_block:4.
func powerLevelName(kind string, fraction float64, levels int) string {
	level := int(math.Floor(fraction*float64(levels) + 0.5))
	if level <= 0 {
		return kind
	}
	if level > levels {
		level = levels
	}
	return kind + ":" + strconv.Itoa(level)
}

// ---------------------------------------------------------------------------------------
// Doors moved by motors (names as in js/blockShapes.js: base, then each state in order, the
// default state being the bare base name).

type powerShape struct {
	states [][]string // values per state, the first is the default
	open   int        // index of the "open" state
	half   int        // index of the door half state, -1 when none
}

var powerDoorShapes = map[string]powerShape{
	"iron_door":     {states: [][]string{{"lower", "upper"}, {"n", "e", "s", "w"}, {"left", "right"}, {"closed", "open"}}, open: 3, half: 0},
	"iron_trapdoor": {states: [][]string{{"n", "e", "s", "w"}, {"bottom", "top"}, {"closed", "open"}}, open: 2, half: -1},
}

// powerParseShaped splits a shaped block name into its base and state values.
func powerParseShaped(name string) (string, []string, bool) {
	parts := strings.Split(name, ":")
	shape, ok := powerDoorShapes[parts[0]]
	if !ok {
		return "", nil, false
	}
	if len(parts) == 1 {
		values := make([]string, len(shape.states))
		for i, options := range shape.states {
			values[i] = options[0]
		}
		return parts[0], values, true
	}
	if len(parts) != len(shape.states)+1 {
		return "", nil, false
	}
	return parts[0], parts[1:], true
}

func powerShapedName(base string, values []string) string {
	shape := powerDoorShapes[base]
	isDefault := true
	for i, options := range shape.states {
		if values[i] != options[0] {
			isDefault = false
		}
	}
	if isDefault {
		return base
	}
	return base + ":" + strings.Join(values, ":")
}

// powerMoveDoors opens (or closes) the iron doors and trapdoors touching a motor.
func powerMoveDoors(w cropWorld, motor *PowerBlock, open bool) []Block {
	var updates []Block
	seen := make(map[powerPos]bool)
	state := "closed"
	if open {
		state = "open"
	}
	set := func(p powerPos) {
		if seen[p] {
			return
		}
		seen[p] = true
		name, err := w.Block(p[0], p[1], p[2])
		if err != nil {
			return
		}
		base, values, ok := powerParseShaped(name)
		if !ok {
			return
		}
		shape := powerDoorShapes[base]
		if values[shape.open] == state {
			return
		}
		next := append([]string(nil), values...)
		next[shape.open] = state
		nextName := powerShapedName(base, next)
		if err := w.SetBlock(p[0], p[1], p[2], nextName); err != nil {
			return
		}
		updates = append(updates, Block{X: p[0], Y: p[1], Z: p[2], BlockType: nextName})
	}
	for _, step := range powerSteps {
		p := powerPos{motor.X + step[0], motor.Y + step[1], motor.Z + step[2]}
		name, err := w.Block(p[0], p[1], p[2])
		if err != nil {
			continue
		}
		base, values, ok := powerParseShaped(name)
		if !ok {
			continue
		}
		set(p)
		// The other half of a door moves with it.
		if shape := powerDoorShapes[base]; shape.half >= 0 {
			dy := 1
			if values[shape.half] == "upper" {
				dy = -1
			}
			other := powerPos{p[0], p[1] + dy, p[2]}
			if otherName, err := w.Block(other[0], other[1], other[2]); err == nil {
				if otherBase, _, ok := powerParseShaped(otherName); ok && otherBase == base {
					set(other)
				}
			}
		}
	}
	return updates
}

// growLampNear reports whether a lit grow lamp shines on (x, y, z): up to 4 blocks above it
// and 2 to the sides.
func (g *powerGrid) growLampNear(x, y, z int) bool {
	for p := range g.growLamps {
		dx, dy, dz := p[0]-x, p[1]-y, p[2]-z
		if dy >= 1 && dy <= 4 && dx >= -2 && dx <= 2 && dz >= -2 && dz <= 2 {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------------------
// The multimeter and the hand crank

type powerReport struct {
	X         int                `json:"x"`
	Y         int                `json:"y"`
	Z         int                `json:"z"`
	Found     bool               `json:"found"`
	Kind      string             `json:"kind,omitempty"`
	Blocks    int                `json:"blocks,omitempty"`
	TooBig    bool               `json:"tooBig,omitempty"`
	MaxBlocks int                `json:"maxBlocks,omitempty"`
	Gen       float64            `json:"generation"`
	Demand    float64            `json:"demand"`
	Stored    float64            `json:"stored"`
	Capacity  float64            `json:"capacity"`
	Powered   bool               `json:"powered"`
	Signal    bool               `json:"signal"`
	Counts    map[string]int     `json:"counts,omitempty"`
	Sources   map[string]float64 `json:"sources,omitempty"`
	// What this block gives or takes right now (W).
	Own float64 `json:"own"`
}

func (g *powerGrid) probe(x, y, z int, w cropWorld, env powerEnvironment, now time.Time) powerReport {
	report := powerReport{X: x, Y: y, Z: z}
	p := powerPos{x, y, z}
	b := g.blocks[p]
	if b == nil {
		return report
	}
	if g.dirty {
		g.rebuild()
	}
	network := g.netOf[p]
	if network == nil {
		return report
	}
	kind := powerKinds[b.Kind]
	report.Found = true
	report.Kind = b.Kind
	report.Blocks = len(network.members)
	report.TooBig = network.tooBig
	report.MaxBlocks = powerMaxNetwork
	report.Gen = network.gen
	report.Demand = network.demand
	report.Stored = network.stored
	report.Capacity = network.capacity
	report.Powered = network.powered
	report.Signal = network.signal
	report.Sources = network.sources
	report.Counts = make(map[string]int)
	for _, member := range network.members {
		report.Counts[g.blocks[member].Kind]++
	}
	switch kind.Role {
	case powerGenerator:
		if !network.tooBig {
			report.Own = g.generation(b, w, env, now)
		}
	case powerConsumer:
		if network.powered {
			report.Own = -kind.Watts
		}
	case powerStorage:
		report.Own = b.Energy
	}
	return report
}

// crankTurn turns a hand crank: it gives power for a few more seconds.
func (g *powerGrid) crankTurn(x, y, z int, now time.Time) bool {
	p := powerPos{x, y, z}
	b := g.blocks[p]
	if b == nil || powerKinds[b.Kind].Source != "crank" {
		return false
	}
	until := g.crank[p]
	if until.Before(now) {
		until = now
	}
	until = until.Add(powerCrankBurst)
	if limit := now.Add(powerCrankMax); until.After(limit) {
		until = limit
	}
	g.crank[p] = until
	return true
}

// ---------------------------------------------------------------------------------------
// Eel tanks (task #14, js/game/eel.js)

// powerEelInside reports whether an eel_tank block name holds an eel.
func powerEelInside(name string) bool {
	return strings.HasSuffix(name, ":full")
}

// eelFeed feeds the eel in an occupied tank: it gives its peak power for powerEelFeedBurst
// more, up to powerEelFeedMax ahead. Returns whether there was an eel to feed.
func (g *powerGrid) eelFeed(x, y, z int, now time.Time) bool {
	p := powerPos{x, y, z}
	b := g.blocks[p]
	if b == nil || powerKinds[b.Kind].Source != "eel" || !powerEelInside(b.Name) {
		return false
	}
	until := g.crank[p]
	if until.Before(now) {
		until = now
	}
	until = until.Add(powerEelFeedBurst)
	if limit := now.Add(powerEelFeedMax); until.After(limit) {
		until = limit
	}
	g.crank[p] = until
	return true
}

// handlePowerFeed feeds the eel of a tank (a player gave it raw fish).
func handlePowerFeed(raw json.RawMessage) {
	var target powerTarget
	if err := json.Unmarshal(raw, &target); err != nil {
		return
	}
	powerMu.Lock()
	grid.eelFeed(target.X, target.Y, target.Z, time.Now())
	powerMu.Unlock()
}

// ---------------------------------------------------------------------------------------
// The weather, as js/game/environment.js and js/game/weather.js compute it

const (
	weatherDaySeconds = 240.0
	weatherHour       = 1.0 / 24
	rainDayChance     = 0.05
)

// rainWindow is environmentRainWindow: the day's shower (timeOfDay fractions), if any.
func rainWindow(day int) (start, end float64, ok bool) {
	random := func(salt uint32) float64 {
		h := uint32(int32(day))*374761393 ^ salt*668265263
		h = (h ^ (h >> 13)) * 1274126177
		h ^= h >> 16
		return float64(h) / 4294967296
	}
	if random(1) >= rainDayChance {
		return 0, 0, false
	}
	length := (60 + random(2)*90) / weatherDaySeconds
	start = random(3) * (1 - length)
	return start, start + length, true
}

func weatherSmoothstep(a, b, x float64) float64 {
	t := math.Min(1, math.Max(0, (x-a)/(b-a)))
	return t * t * (3 - 2*t)
}

// rainLevel is weatherRainLevel: how rainy the air is (0..1).
func rainLevel(day int, time float64) float64 {
	start, end, ok := rainWindow(day)
	if !ok {
		return 0
	}
	if time < start {
		return weatherSmoothstep(start-weatherHour, start, time)
	}
	if time < end {
		return 1
	}
	return 1 - weatherSmoothstep(end, end+weatherHour, time)
}

// weatherWindSpeed is the speed of weatherWindModel (m/s) in the open.
func weatherWindSpeed(days, y, rain float64) float64 {
	tau := math.Pi * 2
	base := 3.4 + 1.8*math.Sin(tau*0.53*days+2) + 0.9*math.Sin(tau*2.3*days+0.7)
	gust := 1 + 0.15*math.Sin(tau*days*240/7) + 0.1*math.Sin(tau*days*240/3.1+1)
	altitude := 1 + math.Max(0, y-6)*0.035
	return math.Max(0, (base*(1+0.6*rain)+4*rain)*altitude*gust)
}

func powerEnvironmentAt(day int, time float64) powerEnvironment {
	return powerEnvironment{Days: float64(day) + time, Time: time, Rain: rainLevel(day, time)}
}

// ---------------------------------------------------------------------------------------
// Server glue

func currentPowerEnvironment() powerEnvironment {
	stateMu.RLock()
	day, time := gameState.WorldDay, gameState.WorldTime
	stateMu.RUnlock()
	env := powerEnvironmentAt(day, time)
	env.Players = logicPlayers()
	return env
}

func runPowerGrid() {
	ticker := time.NewTicker(powerTickInterval)
	defer ticker.Stop()
	lastSave := time.Now()
	for now := range ticker.C {
		env := currentPowerEnvironment()
		powerMu.Lock()
		updates, save := grid.tick(chunkStore, env, now, powerTickInterval.Seconds())
		moves := grid.mechanicsDrain()
		if grid.energyChanged && now.Sub(lastSave) >= powerSaveEvery {
			save = true
		}
		if save {
			grid.energyChanged = false
		}
		powerMu.Unlock()
		if save {
			lastSave = now
			saveWorldState()
		}
		// What moved first (mechanics.go), so clients carry players before the blocks arrive.
		for _, move := range moves {
			broadcastToAll(createMessage("mechMove", move))
		}
		for _, block := range updates {
			broadcastToAll(createMessage("blockPlace", block))
		}
	}
}

// powerGrowLampNear is for crops.go (called with cropMu held, which may be taken before powerMu).
func powerGrowLampNear(x, y, z int) bool {
	powerMu.Lock()
	defer powerMu.Unlock()
	return grid.growLampNear(x, y, z)
}

type powerTarget struct {
	X int `json:"x"`
	Y int `json:"y"`
	Z int `json:"z"`
}

// handlePowerProbe answers a multimeter reading to the player who asked.
func handlePowerProbe(client *Client, raw json.RawMessage) {
	var target powerTarget
	if err := json.Unmarshal(raw, &target); err != nil {
		return
	}
	env := currentPowerEnvironment()
	powerMu.Lock()
	report := grid.probe(target.X, target.Y, target.Z, chunkStore, env, time.Now())
	powerMu.Unlock()
	select {
	case client.send <- createMessage("powerProbe", report):
	default:
	}
}

// handlePowerCrank turns a hand crank.
func handlePowerCrank(raw json.RawMessage) {
	var target powerTarget
	if err := json.Unmarshal(raw, &target); err != nil {
		return
	}
	powerMu.Lock()
	grid.crankTurn(target.X, target.Y, target.Z, time.Now())
	powerMu.Unlock()
}

// loadPower installs the electric blocks read from world.json.
func loadPower(saved map[string]PowerBlock) {
	powerMu.Lock()
	defer powerMu.Unlock()
	grid = newPowerGrid()
	for _, b := range saved {
		if powerKindOf(b.Name) != b.Kind || b.Kind == "" {
			continue
		}
		block := b
		if kind := powerKinds[b.Kind]; kind.Role == powerStorage {
			block.Energy = math.Max(0, math.Min(kind.Capacity, block.Energy))
		} else {
			block.Energy = 0
		}
		grid.blocks[block.pos()] = &block
	}
}

// snapshotPower copies the registry for saving.
func snapshotPower() map[string]PowerBlock {
	powerMu.Lock()
	defer powerMu.Unlock()
	out := make(map[string]PowerBlock, len(grid.blocks))
	for p, b := range grid.blocks {
		out[blockKey(p[0], p[1], p[2])] = *b
	}
	return out
}
