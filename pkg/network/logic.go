package network

import (
	"encoding/json"
	"log"
	"math"
	"sort"
	"strings"
	"time"
)

// Logic and sensors: switches, sensors and logic gates that join the electric networks of
// power.go (role "logic"). The blocks are drawn by js/game/logic.js; the server decides
// everything, so every player sees the same circuit and it keeps working while nobody is near.
//
// The model, in one sentence for the guide: a logic block is a SWITCH in the wire. While it
// is ON it conducts and joins the networks around it into one; while it is OFF it cuts them
// apart. What turns it on depends on the block:
//
//   - Manual: the lever (toggled by a right click), the push button (on for 1.5 s) and the
//     pressure plate (on while a player stands on it).
//   - Sensors: daylight (on by day, or by night in "night" mode), proximity (a player within
//     logicProximityRange blocks) and rain.
//   - Gates (oriented: the facing is the output arrow): their INPUT faces read a signal and
//     never conduct. AND, OR and XOR read the left and right faces, NOT and the delay read
//     the back face, the latch reads SET on the left and RESET on the right. Every other face
//     (front, the free sides, top and bottom) conducts while the gate is on.
//
// A SIGNAL is "this wire is on": an input is on when the block touching it (conducting
// towards it) belongs to a network that has power available (a working generator or charged
// batteries, and no blackout) or that holds a switched-on logic block. So a lever touching a
// gate is enough, and gates can feed other gates directly without batteries; to light lamps
// the switched network still needs real power (energy is accounted as in power.go).
//
// Logic runs on the power tick (powerTickInterval, 5 times a second): each tick first rebuilds
// the networks with the switches as they are, balances the energy, and then every logic block
// computes its new state from those networks at once (a synchronous update). So each gate
// adds one tick (0.2 s) of delay, the result never depends on the order of the blocks, loops
// cannot hang the server, and an oscillator (a NOT gate feeding itself) flips at most once a
// tick. At most logicMaxChanges blocks change per tick; the rest wait for the next one.
//
// State lives in the block NAME as for shaped blocks (js/blockShapes.js): the states listed
// in logicKinds, in order, the first value of each being the default, which is the bare name.
// lever / lever:on, and_gate:e:on, delay_gate:n:3:off, daylight_sensor:night:on. Changes are
// written to the chunk store and broadcast as blockPlace like lit lamps. The memory of a latch
// is its on/off state, so it survives a restart; signals in flight inside a delay do not.
//
// The lift stop (lift_stop, mechanics.go) is a logic block too: a stop calls the lift to its floor
// and remembers it, on while the platform stands there. Its only input is its top face.
//
// Mobs do not press plates: they live on the clients, and letting every client report them
// would make players disagree. Players' positions are on the server (playerMove).
//
// Hook for helpers (a future copper golem): the client message logicPress {x, y, z} does what
// a player's right click does (toggle a lever, press a button, switch a daylight sensor's
// mode, change a delay, call the lift to a stop). On the server, logicPressAt is the same thing.

// logicKind describes one logic block. Op is what it does; States names its block-name
// states in order (values in logicStateValues). js/game/logic.js mirrors this table
// (LOGIC_KINDS) and test/js/logic.test.js checks both agree.
type logicKind struct {
	Op     string
	States string
}

var logicKinds = map[string]logicKind{
	"lever":            {Op: "lever", States: "power"},
	"push_button":      {Op: "button", States: "power"},
	"pressure_plate":   {Op: "plate", States: "power"},
	"daylight_sensor":  {Op: "daylight", States: "mode,power"},
	"proximity_sensor": {Op: "proximity", States: "power"},
	"rain_sensor":      {Op: "rain", States: "power"},
	"and_gate":         {Op: "and", States: "facing,power"},
	"or_gate":          {Op: "or", States: "facing,power"},
	"xor_gate":         {Op: "xor", States: "facing,power"},
	"not_gate":         {Op: "not", States: "facing,power"},
	"delay_gate":       {Op: "delay", States: "facing,delay,power"},
	"latch":            {Op: "latch", States: "facing,power"},
	"lift_stop":        {Op: "stop", States: "call,power"},
}

// Values of each state; the first is the default.
var logicStateValues = map[string][]string{
	"power":  {"off", "on"},
	"mode":   {"day", "night"},
	"facing": {"n", "e", "s", "w"},
	"delay":  {"1", "2", "3", "4"},
	"call":   {"free", "called"},
}

const (
	// How long a push button stays on.
	logicButtonTime = 1500 * time.Millisecond
	// A player within this distance (blocks) switches a proximity sensor on.
	logicProximityRange = 5.0
	// Rain level from which the rain sensor is on.
	logicRainOn = 0.5
	// Sun height (sin of the day angle) above which it is day for the daylight sensor.
	logicDaylightOn = 0.05
	// The most logic blocks that change in one tick (bounds oscillators).
	logicMaxChanges = 256
	// The most changes a delay remembers (a fast oscillator feeding a long delay).
	logicDelayQueue = 64
)

// Input faces of each gate, relative to its facing.
var logicInputs = map[string][]string{
	"and": {"left", "right"}, "or": {"left", "right"}, "xor": {"left", "right"},
	"not": {"back"}, "delay": {"back"}, "latch": {"left", "right"}, "stop": {"top"},
}

func init() {
	for name := range logicKinds {
		powerKinds[name] = powerKind{Role: powerLogic}
	}
}

// logicBlock is a logic block's name split into its states.
type logicBlock struct {
	name   string
	kind   logicKind
	keys   []string
	values []string
}

// logicParse splits a logic block name (lever:on, and_gate:e:off) into its states.
func logicParse(name string) (logicBlock, bool) {
	parts := strings.Split(name, ":")
	kind, ok := logicKinds[parts[0]]
	if !ok {
		return logicBlock{}, false
	}
	keys := strings.Split(kind.States, ",")
	block := logicBlock{name: parts[0], kind: kind, keys: keys, values: make([]string, len(keys))}
	if len(parts) == 1 {
		for i, key := range keys {
			block.values[i] = logicStateValues[key][0]
		}
		return block, true
	}
	if len(parts) != len(keys)+1 {
		return logicBlock{}, false
	}
	for i, key := range keys {
		if !logicValid(key, parts[i+1]) {
			return logicBlock{}, false
		}
		block.values[i] = parts[i+1]
	}
	return block, true
}

func logicValid(key, value string) bool {
	for _, option := range logicStateValues[key] {
		if option == value {
			return true
		}
	}
	return false
}

func (b logicBlock) get(key string) string {
	for i, k := range b.keys {
		if k == key {
			return b.values[i]
		}
	}
	return ""
}

func (b logicBlock) with(key, value string) logicBlock {
	next := b
	next.values = append([]string(nil), b.values...)
	for i, k := range b.keys {
		if k == key {
			next.values[i] = value
		}
	}
	return next
}

func (b logicBlock) on() bool { return b.get("power") == "on" }

// String is the block name: the bare name in the default state.
func (b logicBlock) String() string {
	isDefault := true
	for i, key := range b.keys {
		if b.values[i] != logicStateValues[key][0] {
			isDefault = false
		}
	}
	if isDefault {
		return b.name
	}
	return b.name + ":" + strings.Join(b.values, ":")
}

func logicPower(on bool) string {
	if on {
		return "on"
	}
	return "off"
}

var logicFacingSteps = map[string]powerPos{"n": {0, 0, -1}, "e": {1, 0, 0}, "s": {0, 0, 1}, "w": {-1, 0, 0}}

// logicFace is the step from a gate towards one of its faces ("front", "back", "left",
// "right"; left and right as seen by someone looking towards the facing; "top" needs no facing).
func logicFace(facing, face string) powerPos {
	f := logicFacingSteps[facing]
	switch face {
	case "top":
		return powerPos{0, 1, 0}
	case "back":
		return powerPos{-f[0], 0, -f[2]}
	case "right":
		return powerPos{-f[2], 0, f[0]}
	case "left":
		return powerPos{f[2], 0, -f[0]}
	}
	return f
}

// logicIsInput reports whether the step d from a gate lands on one of its input faces.
func logicIsInput(b logicBlock, d powerPos) bool {
	for _, face := range logicInputs[b.kind.Op] {
		if logicFace(b.get("facing"), face) == d {
			return true
		}
	}
	return false
}

// conducts reports whether the electric block at p lets current through towards its
// neighbour q (see the header). Plain electric blocks always do.
func (g *powerGrid) conducts(p, q powerPos) bool {
	b := g.blocks[p]
	if b == nil {
		return false
	}
	if powerKinds[b.Kind].Role != powerLogic {
		// A machine that reads a start signal on its top face (revival.go) does not conduct through it, as
		// a gate does not through its inputs: what stands on it never joins the network that feeds it.
		return !(powerKinds[b.Kind].SignalTop && q == powerPos{p[0], p[1] + 1, p[2]})
	}
	block, ok := logicParse(b.Name)
	if !ok || !block.on() {
		return false
	}
	return !logicIsInput(block, powerPos{q[0] - p[0], q[1] - p[1], q[2] - p[2]})
}

// joins reports whether two touching electric blocks belong to one network.
func (g *powerGrid) joins(p, q powerPos) bool {
	return g.conducts(p, q) && g.conducts(q, p)
}

// logicState is what the logic remembers besides the block names (not saved).
type logicState struct {
	buttons map[powerPos]time.Time // push buttons: on until
	delays  map[powerPos]*logicDelay
	stops   map[powerPos]*liftStopMemory // lift stops (mechanics.go)
}

type logicDelay struct {
	last   bool // the input as last seen
	events []logicEvent
}

type logicEvent struct {
	at time.Time
	on bool
}

func newLogicState() *logicState {
	return &logicState{buttons: make(map[powerPos]time.Time), delays: make(map[powerPos]*logicDelay), stops: make(map[powerPos]*liftStopMemory)}
}

// logicSignals works out, after the energy balance, which networks carry a signal.
func (g *powerGrid) logicSignals() {
	for _, network := range g.networks {
		live := !network.tooBig && (network.gen > 1e-9 || network.stored > 1e-9) && (network.demand == 0 || network.powered)
		network.signal = live
		if live {
			continue
		}
		for _, p := range network.members {
			b := g.blocks[p]
			if b == nil || powerKinds[b.Kind].Role != powerLogic {
				continue
			}
			if block, ok := logicParse(b.Name); ok && block.on() {
				network.signal = true
				break
			}
		}
	}
}

// logicInput reports whether the face of the block at p in direction d receives a signal.
func (g *powerGrid) logicInput(p, d powerPos) bool {
	q := powerPos{p[0] + d[0], p[1] + d[1], p[2] + d[2]}
	if g.blocks[q] == nil || !g.conducts(q, p) {
		return false
	}
	network := g.netOf[q]
	return network != nil && network.signal
}

// logicStep computes the new state of every logic block (see the header) and writes the
// ones that changed. Returns the blocks to broadcast.
func (g *powerGrid) logicStep(w cropWorld, env powerEnvironment, now time.Time) []Block {
	g.logicSignals()
	var positions []powerPos
	for p, b := range g.blocks {
		if powerKinds[b.Kind].Role == powerLogic {
			positions = append(positions, p)
		}
	}
	sort.Slice(positions, func(i, j int) bool { return powerLess(positions[i], positions[j]) })
	g.logicForgetGone()

	// First every new state from the current networks, then all the changes at once.
	type change struct {
		b    *PowerBlock
		name string
	}
	var changes []change
	var stops []powerPos
	for _, p := range positions {
		b := g.blocks[p]
		block, ok := logicParse(b.Name)
		if !ok {
			continue
		}
		if block.kind.Op == "stop" {
			stops = append(stops, p)
			continue
		}
		on := g.logicEvaluate(p, block, env, now)
		if on == block.on() {
			continue
		}
		changes = append(changes, change{b, block.with("power", logicPower(on)).String()})
	}
	var updates []Block
	for i, c := range changes {
		if i >= logicMaxChanges {
			break
		}
		if update, ok := g.logicRename(w, c.b, c.name); ok {
			updates = append(updates, update)
		}
	}
	for _, p := range stops {
		updates = append(updates, g.liftStopStep(w, p, now)...)
	}
	return updates
}

// logicEvaluate is whether the logic block at p should be on now.
func (g *powerGrid) logicEvaluate(p powerPos, block logicBlock, env powerEnvironment, now time.Time) bool {
	input := func(face string) bool {
		return g.logicInput(p, logicFace(block.get("facing"), face))
	}
	switch block.kind.Op {
	case "lever":
		return block.on()
	case "button":
		until, ok := g.logic.buttons[p]
		if ok && !now.Before(until) {
			delete(g.logic.buttons, p)
		}
		return ok && now.Before(until)
	case "plate":
		for _, player := range env.Players {
			if logicOnPlate(p, player) {
				return true
			}
		}
		return false
	case "proximity":
		cx, cy, cz := float64(p[0])+0.5, float64(p[1])+0.5, float64(p[2])+0.5
		for _, player := range env.Players {
			// The middle of the body, about a block below the eyes.
			dx, dy, dz := player[0]-cx, player[1]-1-cy, player[2]-cz
			if dx*dx+dy*dy+dz*dz <= logicProximityRange*logicProximityRange {
				return true
			}
		}
		return false
	case "rain":
		return env.Rain >= logicRainOn
	case "daylight":
		day := math.Sin(env.Time*2*math.Pi) > logicDaylightOn
		if block.get("mode") == "night" {
			return !day
		}
		return day
	case "and":
		return input("left") && input("right")
	case "or":
		return input("left") || input("right")
	case "xor":
		return input("left") != input("right")
	case "not":
		return !input("back")
	case "latch":
		if input("right") {
			return false // RESET wins
		}
		return input("left") || block.on()
	case "delay":
		return g.logicDelayed(p, block, input("back"), now)
	}
	return false
}

// logicOnPlate reports whether a player (eye position) stands on the plate at p.
func logicOnPlate(p powerPos, player [3]float64) bool {
	const margin = 0.1
	feet := player[1] - float64(p[1])
	if feet < 0.9 || feet > 2.1 {
		return false
	}
	return player[0] > float64(p[0])-margin && player[0] < float64(p[0])+1+margin &&
		player[2] > float64(p[2])-margin && player[2] < float64(p[2])+1+margin
}

// logicDelayed is a delay line: the output is what the input was `delay` seconds ago.
func (g *powerGrid) logicDelayed(p powerPos, block logicBlock, in bool, now time.Time) bool {
	d := g.logic.delays[p]
	if d == nil {
		d = &logicDelay{last: block.on()}
		g.logic.delays[p] = d
	}
	out := block.on()
	if in != d.last {
		seconds := time.Duration(strings.IndexByte("1234", block.get("delay")[0])+1) * time.Second
		if len(d.events) >= logicDelayQueue {
			d.events = d.events[2:]
		}
		d.events = append(d.events, logicEvent{at: now.Add(seconds), on: in})
		d.last = in
	}
	for len(d.events) > 0 && !now.Before(d.events[0].at) {
		out = d.events[0].on
		d.events = d.events[1:]
	}
	return out
}

// logicForgetGone drops the memory of logic blocks that are no longer there.
func (g *powerGrid) logicForgetGone() {
	gone := func(p powerPos, op string) bool {
		b := g.blocks[p]
		return b == nil || logicKinds[b.Kind].Op != op
	}
	for p := range g.logic.buttons {
		if gone(p, "button") {
			delete(g.logic.buttons, p)
		}
	}
	for p := range g.logic.delays {
		if gone(p, "delay") {
			delete(g.logic.delays, p)
		}
	}
	for p := range g.logic.stops {
		if gone(p, "stop") {
			delete(g.logic.stops, p)
		}
	}
}

// logicRename writes a logic block's new name to the world. The networks are rebuilt on the
// next tick (relink), and the registry saved lazily (the chunk store already holds it).
func (g *powerGrid) logicRename(w cropWorld, b *PowerBlock, name string) (Block, bool) {
	current, err := w.Block(b.X, b.Y, b.Z)
	if err != nil {
		log.Printf("logic: %v", err)
		return Block{}, false
	}
	if current != b.Name {
		// Changed behind the registry's back: follow the world.
		g.track(b.X, b.Y, b.Z, current)
		return Block{}, false
	}
	if err := w.SetBlock(b.X, b.Y, b.Z, name); err != nil {
		log.Printf("logic: %v", err)
		return Block{}, false
	}
	b.Name = name
	g.relink = true
	g.energyChanged = true
	return Block{X: b.X, Y: b.Y, Z: b.Z, BlockType: name}, true
}

// press does what a right click on a logic block does. Returns the changed block, if any.
func (g *powerGrid) press(w cropWorld, x, y, z int, now time.Time) (Block, bool) {
	p := powerPos{x, y, z}
	b := g.blocks[p]
	if b == nil || powerKinds[b.Kind].Role != powerLogic {
		return Block{}, false
	}
	block, ok := logicParse(b.Name)
	if !ok {
		return Block{}, false
	}
	var next logicBlock
	switch block.kind.Op {
	case "lever":
		next = block.with("power", logicPower(!block.on()))
	case "button":
		g.logic.buttons[p] = now.Add(logicButtonTime)
		if block.on() {
			return Block{}, false
		}
		next = block.with("power", "on")
	case "daylight":
		mode := "night"
		if block.get("mode") == "night" {
			mode = "day"
		}
		next = block.with("mode", mode)
	case "delay":
		values := logicStateValues["delay"]
		i := strings.Index(strings.Join(values, ""), block.get("delay"))
		next = block.with("delay", values[(i+1)%len(values)])
	case "stop":
		g.liftStopMemoryOf(p, block, now).calledAt = now
		if block.get("call") == "called" {
			return Block{}, false
		}
		next = block.with("call", "called")
	default:
		return Block{}, false
	}
	return g.logicRename(w, b, next.String())
}

// ---------------------------------------------------------------------------------------
// Server glue

// logicPlayers is where the players are (eye positions), for plates and proximity sensors.
func logicPlayers() [][3]float64 {
	stateMu.RLock()
	defer stateMu.RUnlock()
	players := make([][3]float64, 0, len(gameState.Players))
	for _, player := range gameState.Players {
		players = append(players, [3]float64{player.X, player.Y, player.Z})
	}
	return players
}

// logicInputAt says whether the face of the block at this cell towards d receives a signal now, for a
// mechanic that does not run on the grid's own tick (revival.go). The networks are those of the last tick.
func logicInputAt(cell [3]int, d powerPos) bool {
	powerMu.Lock()
	defer powerMu.Unlock()
	return grid.logicInput(powerPos(cell), d)
}

// logicPressAt presses the logic block at (x, y, z) for everyone (players' right clicks and,
// later, helpers such as a copper golem).
func logicPressAt(x, y, z int) {
	powerMu.Lock()
	update, ok := grid.press(chunkStore, x, y, z, time.Now())
	powerMu.Unlock()
	if ok {
		broadcastToAll(createMessage("blockPlace", update))
	}
}

// handleLogicPress is the logicPress message: {x, y, z}. Registered as plotGuarded (below): a lever or a
// button is a change, so in someone else's plot it never gets here.
func handleLogicPress(client *Client, raw json.RawMessage) {
	var target powerTarget
	if err := json.Unmarshal(raw, &target); err != nil {
		return
	}
	logicPressAt(target.X, target.Y, target.Z)
}

func init() {
	registerMessage(messageSpec{plot: plotGuarded, handle: func(c *Client, m Message) { handleLogicPress(c, m.Payload) }}, "logicPress")
}
