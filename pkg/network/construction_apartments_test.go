package network

import (
	"encoding/json"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The lift of /build apartments on the real grid: the rules of power.go, logic.go and mechanics.go,
// with the design's own electric blocks (testdata/apartments_lift.json, written and checked against
// the design by test/js/construction_apartments.test.js), in each of its four turns.

type apartmentsTurn struct {
	Turns   int               `json:"turns"`
	Shaft   [2]int            `json:"shaft"`
	WinchY  int               `json:"winchY"`
	Floors  int               `json:"floors"`
	Step    int               `json:"step"`
	Cells   [][]any           `json:"cells"`
	Stops   map[string][3]int `json:"stops"`
	Buttons struct {
		Green     map[string][3]int `json:"green"`
		Red       map[string][3]int `json:"red"`
		LobbyStop [3]int            `json:"lobbyStop"`
	} `json:"buttons"`
}

func apartmentsLoad(t *testing.T) []apartmentsTurn {
	t.Helper()
	data, err := os.ReadFile("testdata/apartments_lift.json")
	if err != nil {
		t.Fatal(err)
	}
	var turns []apartmentsTurn
	if err := json.Unmarshal(data, &turns); err != nil {
		t.Fatal(err)
	}
	if len(turns) != 4 {
		t.Fatalf("%d turns", len(turns))
	}
	return turns
}

// apartmentsRig is a built block, with its clock.
type apartmentsRig struct {
	t    *testing.T
	turn apartmentsTurn
	w    fakeCropWorld
	g    *powerGrid
	now  time.Time
	tick time.Duration
}

// As a build: the blocks go in from the bottom up, one blockPlace at a time, with the grid running.
func newApartmentsRig(t *testing.T, turn apartmentsTurn, tick time.Duration) *apartmentsRig {
	t.Helper()
	r := &apartmentsRig{t: t, turn: turn, w: fakeCropWorld{}, g: newPowerGrid(), now: time.Unix(1000, 0), tick: tick}
	// The ground under the shaft: the foundation, or the terrain.
	r.w.SetBlock(turn.Shaft[0], -1, turn.Shaft[1], "stone")
	cells := append([][]any(nil), turn.Cells...)
	sort.SliceStable(cells, func(i, j int) bool { return cells[i][1].(float64) < cells[j][1].(float64) })
	for i, cell := range cells {
		x, y, z := int(cell[0].(float64)), int(cell[1].(float64)), int(cell[2].(float64))
		name := cell[3].(string)
		r.w.SetBlock(x, y, z, name)
		r.g.track(x, y, z, name)
		if i%8 == 0 {
			r.run(1)
		}
	}
	return r
}

func (r *apartmentsRig) run(ticks int) {
	for i := 0; i < ticks; i++ {
		r.now = r.now.Add(r.tick)
		r.g.tick(r.w, powerMidnight, r.now, r.tick.Seconds())
		r.check()
	}
}

func (r *apartmentsRig) seconds(s float64) {
	r.run(int(s*float64(time.Second)/float64(r.tick)) + 1)
}

// check holds on every tick: one rtg for the winch, always with power; no door open but the one of
// the floor the platform stands at.
func (r *apartmentsRig) check() {
	r.t.Helper()
	y := r.platform()
	for _, network := range r.g.networks {
		if network.tooBig {
			r.t.Fatalf("network at %v is too big: %d", network.root, len(network.members))
		}
		kinds := map[string]int{}
		for _, p := range network.members {
			kinds[r.g.blocks[p].Kind]++
		}
		switch {
		case kinds["fridge"] > 0:
			// Fridges stand alone, without power: plain cupboards.
			if network.gen != 0 || len(network.members) != kinds["fridge"] {
				r.t.Fatalf("a fridge in a network of %v, %v W", kinds, network.gen)
			}
		case kinds["lift_winch"] > 0:
			if network.gen > 0 && (network.gen != 80 || network.demand != 60 || !network.powered) {
				r.t.Fatalf("winch network: %v W for %v W, powered %v", network.gen, network.demand, network.powered)
			}
		case network.gen != 0:
			r.t.Fatalf("power away from the winch: %v", kinds)
		}
	}
	for n := 0; n <= r.turn.Floors; n++ {
		if r.doorOpen(n) && y != n*r.turn.Step {
			r.t.Fatalf("the door of floor %d is open with the platform at %d", n, y)
		}
	}
}

// The doors of a floor (its two halves) are always in step; open reports them.
func (r *apartmentsRig) doorOpen(n int) bool {
	r.t.Helper()
	stop := r.stopAt(n)
	lower, upper := r.w[[3]int{stop[0], stop[1] - 2, stop[2]}], r.w[[3]int{stop[0], stop[1] - 1, stop[2]}]
	if !strings.HasPrefix(lower, "iron_door") || !strings.HasPrefix(upper, "iron_door") {
		// Being built, from the bottom up.
		return false
	}
	if strings.HasSuffix(lower, ":open") != strings.HasSuffix(upper, ":open") {
		r.t.Fatalf("door of floor %d: %s, %s", n, lower, upper)
	}
	return strings.HasSuffix(lower, ":open")
}

func (r *apartmentsRig) press(at [3]int) {
	r.t.Helper()
	// A stop already called has nothing to change; a button already on neither.
	if _, ok := r.g.press(r.w, at[0], at[1], at[2], r.now); !ok && !strings.Contains(r.w[at], "called") && !strings.HasSuffix(r.w[at], ":on") {
		r.t.Fatalf("nothing to press at %v (%s)", at, r.w[at])
	}
}

// platform is the height of the platform in its column; there is always exactly one.
func (r *apartmentsRig) platform() int {
	r.t.Helper()
	found, y := 0, 0
	for h := -1; h <= r.turn.WinchY; h++ {
		if r.w[[3]int{r.turn.Shaft[0], h, r.turn.Shaft[1]}] == "lift_platform" {
			found++
			y = h
		}
	}
	if found != 1 {
		r.t.Fatalf("%d platforms", found)
	}
	return y
}

func (r *apartmentsRig) stopAt(n int) [3]int { return r.turn.Stops[strconv.Itoa(n)] }
func (r *apartmentsRig) green(n int) [3]int  { return r.turn.Buttons.Green[strconv.Itoa(n)] }
func (r *apartmentsRig) red(n int) [3]int    { return r.turn.Buttons.Red[strconv.Itoa(n)] }

// trip times a trip of the platform to floor n: straight there, never away, at the lift's speed, and
// then the stop is lit and only this floor's door is open.
func (r *apartmentsRig) trip(n int, what string) {
	r.t.Helper()
	want := n * r.turn.Step
	start := r.platform()
	blocks := want - start
	if blocks < 0 {
		blocks = -blocks
	}
	// Three ticks a block at worst (0.6 s), and the settling at the end.
	limit := time.Duration(blocks)*3*r.tick + liftStopSettle + 2*r.tick
	began := r.now
	last := start
	for r.now.Sub(began) < limit && !r.doorOpen(n) {
		r.run(1)
		y := r.platform()
		if (want-y)*(want-y) > (want-last)*(want-last) {
			r.t.Fatalf("%s: going away from %d: %d, then %d", what, want, last, y)
		}
		last = y
	}
	if r.platform() != want || !r.doorOpen(n) {
		r.t.Fatalf("%s: after %v the platform is at %d, not %d (door %v)", what, r.now.Sub(began), r.platform(), want, r.doorOpen(n))
	}
	if !strings.HasSuffix(r.w[r.stopAt(n)], ":on") {
		r.t.Fatalf("%s: the stop says %s", what, r.w[r.stopAt(n)])
	}
	// It holds.
	r.seconds(1)
	if r.platform() != want || !r.doorOpen(n) {
		r.t.Fatalf("%s: it did not hold: %d", what, r.platform())
	}
}

// The slowest ticks (a step every 3 ticks: 0.6 s a block), the fastest (2 ticks: 0.4 s), all turns.
var apartmentsTicks = []time.Duration{199 * time.Millisecond, 200 * time.Millisecond}

func apartmentsEach(t *testing.T, test func(r *apartmentsRig)) {
	for _, turn := range apartmentsLoad(t) {
		for _, tick := range apartmentsTicks {
			name := "turn" + strconv.Itoa(turn.Turns) + "_" + tick.String()
			t.Run(name, func(t *testing.T) {
				test(newApartmentsRig(t, turn, tick))
			})
		}
	}
}

func TestApartmentsLiftGeometry(t *testing.T) {
	for _, turn := range apartmentsLoad(t) {
		if turn.WinchY-0-1 > liftMaxRope {
			t.Fatalf("%d of rope at the bottom: at most %d", turn.WinchY-1, liftMaxRope)
		}
		if top := turn.WinchY - liftHeadroom - 1; top != turn.Floors*turn.Step {
			t.Fatalf("the platform stops at %d, floor %d is at %d", top, turn.Floors, turn.Floors*turn.Step)
		}
		// That is the most it can do: one floor more would not fit in the rope.
		if (turn.Floors+1)*turn.Step <= liftMaxRope-liftHeadroom {
			t.Fatal("one more floor would fit")
		}
		for n := 0; n <= turn.Floors; n++ {
			if y := turn.Stops[strconv.Itoa(n)][1]; y-liftStopDrop != n*turn.Step {
				t.Fatalf("the stop of floor %d is at %d", n, y)
			}
		}
	}
}

func TestApartmentsLiftWaitsAfterTheBuild(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		r.seconds(10)
		if r.platform() != 0 {
			t.Fatalf("it moved by itself: platform %d", r.platform())
		}
		winch := powerPos{r.turn.Shaft[0], r.turn.WinchY, r.turn.Shaft[1]}
		if r.g.netOf[winch] == nil || !r.g.netOf[winch].powered {
			t.Fatal("the winch is on its rtg, with power")
		}
		// In the lobby, with its door open and the stop green, ready.
		if !r.doorOpen(0) || !strings.HasSuffix(r.w[r.stopAt(0)], ":on") {
			t.Fatalf("the lobby's door %v, its stop %s", r.doorOpen(0), r.w[r.stopAt(0)])
		}
	})
}

// Every landing's button, from below and from above, and across the building.
func TestApartmentsLiftEveryCall(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		r.seconds(2)
		top := r.turn.Floors
		for n := 1; n <= top; n++ {
			r.press(r.stopAt(n))
			r.trip(n, "up, floor by floor")
		}
		for n := top - 1; n >= 0; n-- {
			r.press(r.stopAt(n))
			r.trip(n, "down, floor by floor")
		}
		for n := 1; n <= top; n++ {
			r.press(r.stopAt(n))
			r.trip(n, "from the lobby")
			r.press(r.stopAt(0))
			r.trip(0, "back to the lobby")
		}
		// Already there: nothing moves, and it stays open.
		r.press(r.stopAt(0))
		r.seconds(1)
		if r.platform() != 0 || !r.doorOpen(0) {
			t.Fatalf("called where it is: %d", r.platform())
		}
	})
}

// A rider's buttons, from every floor: green to the top, red to the lobby, and the floor's stop on the
// way, in reach as the platform comes to it.
func TestApartmentsLiftInside(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		top := r.turn.Floors
		step := r.turn.Step
		for n := 0; n < top; n++ {
			r.press(r.stopAt(n))
			r.seconds(float64(top) * 0.6 * float64(step))
			r.press(r.green(n))
			r.trip(top, "green")
		}
		for n := 1; n <= top; n++ {
			r.press(r.stopAt(n))
			r.seconds(float64(top) * 0.6 * float64(step))
			r.press(r.red(n))
			r.trip(0, "red")
		}
		// Green, then the floor's stop as it comes: a stop the rider sees above.
		r.press(r.green(0))
		for r.platform() < 5*step-3 {
			r.run(1)
		}
		r.press(r.stopAt(5))
		r.trip(5, "green and then floor 5")
		// Red, then the stop of floor 2 once it is above the platform; clicked late, it comes back.
		r.press(r.red(5))
		for r.platform() > 2*step-1 {
			r.run(1)
		}
		r.press(r.stopAt(2))
		for r.platform() != 2*step || !r.doorOpen(2) {
			r.run(1)
		}
		// A call from another landing wins over a ride: the last call.
		r.press(r.green(2))
		r.seconds(2)
		r.press(r.stopAt(1))
		for !r.doorOpen(1) {
			r.run(1)
		}
		if strings.Contains(r.w[r.stopAt(top)], "called") {
			t.Fatalf("the top stop is still called: %s", r.w[r.stopAt(top)])
		}
	})
}

// The hidden stop and the lintel of the lobby are one floor: the lintel lights too.
func TestApartmentsLiftLobbysTwoStops(t *testing.T) {
	turn := apartmentsLoad(t)[0]
	r := newApartmentsRig(t, turn, 200*time.Millisecond)
	r.press(r.stopAt(3))
	r.trip(3, "up")
	r.press(r.red(3))
	r.trip(0, "red")
	if r.w[r.turn.Buttons.LobbyStop] != "lift_stop:called:on" || r.w[r.stopAt(0)] != "lift_stop:free:on" {
		t.Fatalf("hidden %s, over the door %s", r.w[r.turn.Buttons.LobbyStop], r.w[r.stopAt(0)])
	}
	r.press(r.stopAt(0))
	r.seconds(1)
	if r.w[r.turn.Buttons.LobbyStop] != "lift_stop:free:on" || r.w[r.stopAt(0)] != "lift_stop:called:on" {
		t.Fatalf("hidden %s, over the door %s", r.w[r.turn.Buttons.LobbyStop], r.w[r.stopAt(0)])
	}
	if r.platform() != 0 {
		t.Fatalf("at %d", r.platform())
	}
}

// Lobby to floor 1: a couple of seconds at the lift's speed; to the top, what 44 blocks take.
func TestApartmentsLiftTakesWhatItShould(t *testing.T) {
	turn := apartmentsLoad(t)[0]
	r := newApartmentsRig(t, turn, 200*time.Millisecond)
	r.seconds(2)
	began := r.now
	r.press(r.stopAt(1))
	for !r.doorOpen(1) {
		r.run(1)
	}
	// 4 blocks of 0.4 s, and the door opens as it settles.
	if took := r.now.Sub(began); took > 2800*time.Millisecond {
		t.Fatalf("lobby to floor 1: %v", took)
	}
	r.press(r.stopAt(0))
	for !r.doorOpen(0) {
		r.run(1)
	}
	began = r.now
	r.press(r.stopAt(r.turn.Floors))
	for !r.doorOpen(r.turn.Floors) {
		r.run(1)
	}
	if took := r.now.Sub(began); took > 19*time.Second {
		t.Fatalf("lobby to the top: %v", took)
	}
}

// Saved and loaded as the server does it (snapshotPower, loadPower); chunks hold the block names.
func (r *apartmentsRig) restart() {
	powerMu.Lock()
	grid = r.g
	powerMu.Unlock()
	saved := snapshotPower()
	loadPower(saved)
	powerMu.Lock()
	r.g = grid
	grid = newPowerGrid()
	powerMu.Unlock()
}

func TestApartmentsLiftSurvivesARestart(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		step := r.turn.Step
		// At rest on a floor: it stays, with its door open, and answers.
		r.press(r.stopAt(6))
		r.trip(6, "before")
		r.restart()
		for i := 0; i < 50; i++ {
			r.run(1)
			if r.platform() != 6*step || !r.doorOpen(6) {
				t.Fatalf("after the restart: at %d, door %v", r.platform(), r.doorOpen(6))
			}
		}
		// Mid-trip, up and down: the call is in the stop's name, and it goes on.
		r.press(r.stopAt(9))
		r.seconds(2)
		r.restart()
		r.trip(9, "a restart going up")
		r.press(r.stopAt(3))
		r.seconds(3)
		r.restart()
		r.trip(3, "a restart going down")
	})
}

// The names a build places are the ones the grid and the rules read.
func TestApartmentsLiftNames(t *testing.T) {
	for _, turn := range apartmentsLoad(t) {
		stops, buttons, doors, generators := 0, 0, 0, 0
		for _, cell := range turn.Cells {
			name := cell[3].(string)
			base, _, _ := strings.Cut(name, ":")
			switch base {
			case "lift_platform":
				continue
			case "iron_door":
				doors++
				if _, _, ok := powerParseShaped(name); !ok {
					t.Fatalf("door %s", name)
				}
				continue
			case "lift_stop":
				stops++
			case "push_button":
				buttons++
			case "rtg":
				generators++
			}
			if powerKindOf(name) == "" {
				t.Fatalf("%s is not electric on the server", name)
			}
			if powerKinds[base].Role == powerLogic {
				if block, ok := logicParse(name); !ok || block.on() {
					t.Fatalf("logic block %s", name)
				}
			}
		}
		floors := turn.Floors + 1
		if stops != floors+1 || buttons != 2*turn.Floors || doors != 2*floors || generators != 1 {
			t.Fatalf("%d stops, %d buttons, %d door halves, %d generators", stops, buttons, doors, generators)
		}
	}
}
