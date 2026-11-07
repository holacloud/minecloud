package network

import (
	"log"
	"sort"
	"strings"
	"time"

	"minecloud/pkg/terrain"
)

// Motor-driven mechanics: blocks that MOVE other blocks, driven by electricity (power.go).
// The blocks are drawn by js/game/mechanics.js; the server moves everything, so every player
// sees the same blocks in the same places, also while nobody is near them.
//
//   - Motor ram (motor_ram) and sticky ram (sticky_ram): an electric consumer with a facing
//     (n, e, s, w, u = up, d = down). While its network is powered it is OUT: it pushes the
//     line of blocks in front of it one block further (up to ramMaxPush blocks) and fills the
//     cell it emptied with its arm (ram_arm). Unpowered it pulls the arm back in; the sticky
//     ram also pulls back the block stuck to the arm. A push that cannot be made (an immovable
//     block, too long a line, the top or bottom of the world) waits: it is tried again every
//     tick while there is power, so a ram never half-moves anything.
//   - Lift winch (lift_winch): an electric consumer that hangs a lift platform (lift_platform)
//     on a rope straight below it (up to liftMaxRope blocks of air between them). Powered, it
//     hoists the platform one block every liftStepTime until it is two blocks below the winch
//     (room for a player standing on it); unpowered, the brake lets it down at the same pace
//     until it rests on something. It never lowers the platform onto a player.
//   - Lift stop (lift_stop, a logic block of logic.go): a block in the wall of the shaft, on any
//     of its four sides. Right click it, or give its TOP face a signal, and it is called: it says
//     so in its name (lift_stop:called:off) and remembers it. The last stop called in a shaft
//     wins, the others are freed. While its winch has power and the shaft has stops, the stop
//     decides, not the power: the platform goes up or down to 3 blocks below the called stop (as
//     it stops 3 below the winch: room for a player, the stop over the door) and holds there. No
//     stop called: it holds where it is. Without power the stops do not count: it comes down as
//     ever, and goes back to the called stop when the power returns. A shaft with no stops
//     works as it always has. A stop is ON (it conducts on every face but the top, and its
//     network has a signal) once the platform has stood at its height for liftStopSettle, so it
//     does not flicker as the platform goes by. An iron door or trapdoor touching a stop is its
//     landing door: open while the stop is on, shut otherwise, with no motor and no power
//     (js/game/logic.js does not let a hand move it).
//
// State lives in the world blocks, as for doors and lamps: motor_ram:e:out, sticky_ram:u,
// ram_arm:e:plain, and where the platform is. Every change is written to the chunk store
// (saved with the chunks) and broadcast with the normal blockPlace messages; the rams and
// winches themselves are electric blocks, kept in world.json ("power") like any other.
//
// Before the blockPlace messages of a move, everyone gets a mechMove message (kind "push",
// "pull" or "lift", the direction, the cells whose blocks moved and the cells they filled),
// so clients can carry the player standing on what moved (and draw the lift smoothly).
//
// Blocks that never move: bedrock, liquids, electric blocks, rams, arms and platforms, doors
// and beds (two cells), furniture of two cells, chests (storage.go keeps their contents by
// position), blocks with server metadata (signs, ladders, sound blocks) and crops with their
// farmland (crops.go keeps a registry of them). Air, water, lava and small plants
// are free space: a pushed line may end in them (the plant or the liquid is gone).
//
// mechanicsKinds is the table of these electric blocks; js/game/mechanics.js mirrors it
// (MECHANICS_KINDS) and test/js/mechanics.test.js checks both agree.

var mechanicsKinds = map[string]powerKind{
	"motor_ram":  {Role: powerConsumer, Watts: 40},
	"sticky_ram": {Role: powerConsumer, Watts: 40},
	"lift_winch": {Role: powerConsumer, Watts: 60},
}

const (
	// The longest line of blocks a ram pushes.
	ramMaxPush = 12
	// The most rams that move in one tick (the rest wait for the next one).
	ramMaxMoves = 64
	// Air between a winch and its platform at the most.
	liftMaxRope = 48
	// Free cells left above the platform at the top (a player standing on it).
	liftHeadroom = 2
	// One block of lift travel (2.5 blocks a second); js/game/mechanics.js draws the same speed.
	liftStepTime = 400 * time.Millisecond
	// How long the platform stands at a stop before the stop is on: longer than a step on the
	// slowest ticks (3 ticks of 199 ms), so a platform passing by never switches it on.
	liftStopSettle = 800 * time.Millisecond
)

func init() {
	for name, kind := range mechanicsKinds {
		powerKinds[name] = kind
	}
}

// Facings of a ram (horizontal as in logic.go, plus up and down), in name order.
var mechFacings = []string{"n", "e", "s", "w", "u", "d"}

var mechSteps = map[string]powerPos{
	"n": {0, 0, -1}, "e": {1, 0, 0}, "s": {0, 0, 1}, "w": {-1, 0, 0}, "u": {0, 1, 0}, "d": {0, -1, 0},
}

// Free space for a pushed line (destroyed when a block is pushed into it).
var mechSoft = map[string]bool{
	"air": true, "water": true, "lava": true, "tall_grass": true, "flower_red": true, "flower_yellow": true,
	"mushroom_red": true, "mushroom_brown": true,
}

// Blocks that never move (see the header); electric blocks, doors and crops are checked apart.
var mechFixed = map[string]bool{
	"bedrock": true, "lift_platform": true, "sign": true, "ladder": true, "sound_block": true,
	"bed": true, "farmland": true, "chest": true, "barrel": true, "wardrobe": true,
	"fridge": true, "chest_freezer": true, "oven": true, "foundry": true, "arc_furnace": true, "microscope": true, "incubator": true, "autoclave": true, "floor_lamp": true, "bathtub": true,
}

// mechMovable reports whether a ram may push or pull the block `name`.
func mechMovable(name string) bool {
	if name == "" || mechSoft[name] {
		return false
	}
	base, _, _ := strings.Cut(name, ":")
	if mechFixed[base] || powerKindOf(name) != "" || base == "ram_arm" || strings.HasSuffix(base, "_door") {
		return false
	}
	if _, _, crop := parseCrop(name); crop {
		return false
	}
	return true
}

// ramBlock is a ram's name split into its states: motor_ram (facing n, in), sticky_ram:u:out.
type ramBlock struct {
	kind   string
	facing string
	out    bool
}

func ramParse(name string) (ramBlock, bool) {
	parts := strings.Split(name, ":")
	if parts[0] != "motor_ram" && parts[0] != "sticky_ram" {
		return ramBlock{}, false
	}
	if len(parts) == 1 {
		return ramBlock{kind: parts[0], facing: "n"}, true
	}
	if len(parts) != 3 || mechSteps[parts[1]] == (powerPos{}) || (parts[2] != "in" && parts[2] != "out") {
		return ramBlock{}, false
	}
	return ramBlock{kind: parts[0], facing: parts[1], out: parts[2] == "out"}, true
}

func (r ramBlock) sticky() bool { return r.kind == "sticky_ram" }

// String is the block name: the bare kind when facing north and in (the default state).
func (r ramBlock) String() string {
	if r.facing == "n" && !r.out {
		return r.kind
	}
	arm := "in"
	if r.out {
		arm = "out"
	}
	return r.kind + ":" + r.facing + ":" + arm
}

// ramArmName is the arm in front of an extended ram (always with its states: it is never an
// item, so it has no bare name).
func ramArmName(facing string, sticky bool) string {
	if sticky {
		return "ram_arm:" + facing + ":sticky"
	}
	return "ram_arm:" + facing + ":plain"
}

func ramArmFacing(name string) (string, bool) {
	parts := strings.Split(name, ":")
	if len(parts) != 3 || parts[0] != "ram_arm" || mechSteps[parts[1]] == (powerPos{}) {
		return "", false
	}
	return parts[1], true
}

func mechAdd(p, d powerPos, n int) powerPos {
	return powerPos{p[0] + d[0]*n, p[1] + d[1]*n, p[2] + d[2]*n}
}

func mechInWorld(p powerPos) bool {
	return p[1] >= terrain.WorldMinY && p[1] <= terrain.WorldMaxY
}

// mechMove tells clients what moved (see the header), sent before the blockPlace messages.
type mechMove struct {
	Kind   string   `json:"kind"`
	Dir    [3]int   `json:"dir"`
	Moved  [][3]int `json:"moved"`
	Filled [][3]int `json:"filled"`
}

// mechState is what the mechanics remember besides the block names (not saved).
type mechState struct {
	// Extended rams as last seen (facing, sticky), to take the arm away if the ram is broken.
	extended map[powerPos]ramBlock
	// When each winch may move its platform again.
	liftNext map[powerPos]time.Time
	// Moves of this tick, for runPowerGrid to broadcast.
	events []mechMove
}

func newMechState() *mechState {
	return &mechState{extended: make(map[powerPos]ramBlock), liftNext: make(map[powerPos]time.Time)}
}

// mechanicsStep moves what the rams and winches move this tick (after the energy balance, so
// network.powered is this tick's). Returns the blocks to broadcast.
func (g *powerGrid) mechanicsStep(w cropWorld, env powerEnvironment, now time.Time) []Block {
	var updates []Block
	set := func(p powerPos, name string) bool {
		if err := w.SetBlock(p[0], p[1], p[2], name); err != nil {
			log.Printf("mechanics: %v", err)
			return false
		}
		updates = append(updates, Block{X: p[0], Y: p[1], Z: p[2], BlockType: name})
		return true
	}

	// Arms left behind by rams that were broken (or replaced) while out.
	for p, ram := range g.mech.extended {
		if b := g.blocks[p]; b != nil && (b.Kind == "motor_ram" || b.Kind == "sticky_ram") {
			continue
		}
		delete(g.mech.extended, p)
		front := mechAdd(p, mechSteps[ram.facing], 1)
		if name, err := w.Block(front[0], front[1], front[2]); err == nil {
			if facing, ok := ramArmFacing(name); ok && facing == ram.facing {
				set(front, "air")
			}
		}
	}
	for p := range g.mech.liftNext {
		if b := g.blocks[p]; b == nil || b.Kind != "lift_winch" {
			delete(g.mech.liftNext, p)
		}
	}

	var positions []powerPos
	for p, b := range g.blocks {
		if _, ok := mechanicsKinds[b.Kind]; ok {
			positions = append(positions, p)
		}
	}
	sort.Slice(positions, func(i, j int) bool { return powerLess(positions[i], positions[j]) })

	moves := 0
	for _, p := range positions {
		b := g.blocks[p]
		current, err := w.Block(p[0], p[1], p[2])
		if err != nil {
			continue
		}
		if powerKindOf(current) != b.Kind {
			// Changed behind the registry's back: follow the world.
			g.track(p[0], p[1], p[2], current)
			continue
		}
		b.Name = current
		network := g.netOf[p]
		powered := network != nil && network.powered
		if b.Kind == "lift_winch" {
			g.liftStep(w, p, powered, env, now, set)
			continue
		}
		ram, ok := ramParse(current)
		if !ok || ram.out == powered || moves >= ramMaxMoves {
			if ok && ram.out {
				g.mech.extended[p] = ram
			}
			continue
		}
		moves++
		if powered {
			g.ramExtend(w, p, ram, set)
		} else {
			g.ramRetract(w, p, ram, set)
		}
	}
	return updates
}

// ramExtend pushes the line in front of the ram and puts the arm out (see the header).
func (g *powerGrid) ramExtend(w cropWorld, p powerPos, ram ramBlock, set func(powerPos, string) bool) {
	d := mechSteps[ram.facing]
	var line []string
	free := false
	for i := 1; i <= ramMaxPush+1; i++ {
		q := mechAdd(p, d, i)
		if !mechInWorld(q) {
			return
		}
		name, err := w.Block(q[0], q[1], q[2])
		if err != nil {
			return
		}
		if mechSoft[name] {
			free = true
			break
		}
		if i > ramMaxPush || !mechMovable(name) {
			return
		}
		line = append(line, name)
	}
	if !free {
		return
	}
	move := mechMove{Kind: "push", Dir: d}
	// From the far end back, so nothing is overwritten before it moved.
	for i := len(line); i >= 1; i-- {
		from, to := mechAdd(p, d, i), mechAdd(p, d, i+1)
		if !set(to, line[i-1]) {
			return
		}
		move.Moved = append(move.Moved, from)
		move.Filled = append(move.Filled, to)
	}
	front := mechAdd(p, d, 1)
	set(front, ramArmName(ram.facing, ram.sticky()))
	move.Filled = append(move.Filled, front)
	ram.out = true
	g.ramRename(p, ram, set)
	g.mech.extended[p] = ram
	g.mech.events = append(g.mech.events, move)
}

// ramRetract pulls the arm back; a sticky ram brings the block stuck to it.
func (g *powerGrid) ramRetract(w cropWorld, p powerPos, ram ramBlock, set func(powerPos, string) bool) {
	d := mechSteps[ram.facing]
	front := mechAdd(p, d, 1)
	if name, err := w.Block(front[0], front[1], front[2]); err == nil {
		if facing, ok := ramArmFacing(name); ok && facing == ram.facing {
			pulled := false
			if ram.sticky() {
				stuck := mechAdd(p, d, 2)
				if other, err := w.Block(stuck[0], stuck[1], stuck[2]); err == nil && mechInWorld(stuck) && mechMovable(other) {
					if set(front, other) && set(stuck, "air") {
						pulled = true
						g.mech.events = append(g.mech.events, mechMove{
							Kind: "pull", Dir: [3]int{-d[0], -d[1], -d[2]}, Moved: [][3]int{stuck}, Filled: [][3]int{front},
						})
					}
				}
			}
			if !pulled {
				set(front, "air")
			}
		}
	}
	ram.out = false
	g.ramRename(p, ram, set)
	delete(g.mech.extended, p)
}

func (g *powerGrid) ramRename(p powerPos, ram ramBlock, set func(powerPos, string) bool) {
	name := ram.String()
	if set(p, name) {
		g.blocks[p].Name = name
		g.energyChanged = true // the registry's names are saved with world.json
	}
}

// liftFindPlatform returns the platform hanging below the winch at p: the first block under
// it, through air only, if it is a lift_platform.
func liftFindPlatform(w cropWorld, p powerPos) (powerPos, bool) {
	for dy := 1; dy <= liftMaxRope+1; dy++ {
		q := powerPos{p[0], p[1] - dy, p[2]}
		if !mechInWorld(q) {
			return powerPos{}, false
		}
		name, err := w.Block(q[0], q[1], q[2])
		if err != nil {
			return powerPos{}, false
		}
		if name == "air" {
			continue
		}
		return q, name == "lift_platform"
	}
	return powerPos{}, false
}

// liftPlayerIn reports whether a player's body (eye positions) is in the cell q.
func liftPlayerIn(q powerPos, players [][3]float64) bool {
	const margin = 0.3
	for _, player := range players {
		feet, head := player[1]-1.62, player[1]+0.2
		if player[0] > float64(q[0])-margin && player[0] < float64(q[0])+1+margin &&
			player[2] > float64(q[2])-margin && player[2] < float64(q[2])+1+margin &&
			feet < float64(q[1])+1 && head > float64(q[1]) {
			return true
		}
	}
	return false
}

// liftStopDrop: how far below a stop the platform holds, the same as below its winch.
const liftStopDrop = liftHeadroom + 1

// liftStopSides are the four cells around a shaft's column, where its stops are.
var liftStopSides = [4]powerPos{{1, 0, 0}, {-1, 0, 0}, {0, 0, 1}, {0, 0, -1}}

// liftStops lists the stops of the winch at p, highest first: those around its column from the
// winch's own height down to the lowest one the rope can serve.
func (g *powerGrid) liftStops(p powerPos) []powerPos {
	var stops []powerPos
	for dy := 0; dy <= liftMaxRope+1-liftStopDrop; dy++ {
		for _, side := range liftStopSides {
			q := powerPos{p[0] + side[0], p[1] - dy, p[2] + side[2]}
			if b := g.blocks[q]; b != nil && b.Kind == "lift_stop" {
				stops = append(stops, q)
			}
		}
	}
	return stops
}

// liftCalled returns the height the called stop asks the platform to hold at. If two are called
// (in one tick, or while a block cut the shaft in two) the last one stays and the others are freed.
func (g *powerGrid) liftCalled(stops []powerPos, set func(powerPos, string) bool) (int, bool) {
	var called *PowerBlock
	var calledAt time.Time
	for _, q := range stops {
		b := g.blocks[q]
		block, ok := logicParse(b.Name)
		if !ok || block.get("call") != "called" {
			continue
		}
		var at time.Time
		if memory := g.logic.stops[q]; memory != nil {
			at = memory.calledAt
		}
		loser := b
		if called == nil || at.After(calledAt) {
			loser, called, calledAt = called, b, at
		}
		if loser != nil {
			free, _ := logicParse(loser.Name)
			name := free.with("call", "free").String()
			if set(loser.pos(), name) {
				loser.Name = name
				g.energyChanged = true
			}
		}
	}
	if called == nil {
		return 0, false
	}
	return called.Y - liftStopDrop, true
}

// liftStep moves the platform of the winch at p one block, if it is time and there is room.
func (g *powerGrid) liftStep(w cropWorld, p powerPos, powered bool, env powerEnvironment, now time.Time, set func(powerPos, string) bool) {
	stops := g.liftStops(p)
	target, called := g.liftCalled(stops, set)
	if next, ok := g.mech.liftNext[p]; ok && now.Before(next) {
		return
	}
	car, ok := liftFindPlatform(w, p)
	if !ok {
		return
	}
	up := powered
	if powered && len(stops) > 0 {
		if !called || target == car[1] {
			return // holding
		}
		up = target > car[1]
	}
	var to powerPos
	if up {
		to = powerPos{car[0], car[1] + 1, car[2]}
		if to[1]+liftHeadroom >= p[1] {
			return // at the top
		}
	} else {
		to = powerPos{car[0], car[1] - 1, car[2]}
		if !mechInWorld(to) {
			return
		}
		name, err := w.Block(to[0], to[1], to[2])
		if err != nil || name != "air" || liftPlayerIn(to, env.Players) {
			return // resting on something (or someone)
		}
	}
	if !set(to, "lift_platform") || !set(car, "air") {
		return
	}
	g.mech.liftNext[p] = now.Add(liftStepTime)
	g.mech.events = append(g.mech.events, mechMove{
		Kind: "lift", Dir: [3]int{0, to[1] - car[1], 0}, Moved: [][3]int{car}, Filled: [][3]int{to},
	})
}

// liftStopMemory is what a stop remembers besides its name (not saved).
type liftStopMemory struct {
	input    bool      // the top face as last seen: a call is the signal coming on
	calledAt time.Time // when it was last called: the last one called wins
	here     time.Time // since when the platform is at its height
}

// liftStopMemoryOf finds or starts the memory of a stop. Seen for the first time (just placed, or
// after a restart) a signal already there is no new call, and a stop that was on stays on.
func (g *powerGrid) liftStopMemoryOf(p powerPos, block logicBlock, now time.Time) *liftStopMemory {
	memory := g.logic.stops[p]
	if memory == nil {
		memory = &liftStopMemory{input: g.logicInput(p, logicFace("", "top"))}
		if block.on() {
			memory.here = now.Add(-liftStopSettle)
		}
		g.logic.stops[p] = memory
	}
	return memory
}

// liftStopHere reports whether a platform has stood at the height a stop at p holds it, in any of
// the columns around the stop, for liftStopSettle.
func liftStopHere(w cropWorld, p powerPos, memory *liftStopMemory, now time.Time) bool {
	for _, side := range liftStopSides {
		name, err := w.Block(p[0]+side[0], p[1]-liftStopDrop, p[2]+side[2])
		if err == nil && name == "lift_platform" {
			if memory.here.IsZero() {
				memory.here = now
			}
			return now.Sub(memory.here) >= liftStopSettle
		}
	}
	memory.here = time.Time{}
	return false
}

// liftStopStep is a stop's tick (from logicStep, with this tick's signals): a call, whether the
// platform is here, and the doors touching it. Returns the blocks to broadcast.
func (g *powerGrid) liftStopStep(w cropWorld, p powerPos, now time.Time) []Block {
	b := g.blocks[p]
	block, ok := logicParse(b.Name)
	if !ok {
		return nil
	}
	memory := g.liftStopMemoryOf(p, block, now)
	input := g.logicInput(p, logicFace("", "top"))
	next := block
	if input && !memory.input {
		memory.calledAt = now
		next = next.with("call", "called")
	}
	memory.input = input
	next = next.with("power", logicPower(liftStopHere(w, p, memory, now)))
	var updates []Block
	if name := next.String(); name != b.Name {
		if update, ok := g.logicRename(w, b, name); ok {
			updates = append(updates, update)
		}
	}
	return append(updates, powerMoveDoors(w, b, next.on())...)
}

// mechanicsDrain returns (and forgets) the moves of the last tick.
func (g *powerGrid) mechanicsDrain() []mechMove {
	events := g.mech.events
	g.mech.events = nil
	return events
}
