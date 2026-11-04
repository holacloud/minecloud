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
	Turns   int     `json:"turns"`
	Shaft   [2]int  `json:"shaft"`
	WinchY  int     `json:"winchY"`
	Floors  int     `json:"floors"`
	Step    int     `json:"step"`
	Cells   [][]any `json:"cells"`
	Buttons struct {
		Up        [3]int            `json:"up"`
		LobbyCall [3]int            `json:"lobbyCall"`
		Call      map[string][3]int `json:"call"`
		Stop      map[string][3]int `json:"stop"`
		Down      map[string][3]int `json:"down"`
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

// check holds on every tick: only two networks ever make power, each with a known load.
func (r *apartmentsRig) check() {
	r.t.Helper()
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
			if kinds["motor_ram"] > 0 {
				r.t.Fatalf("the winch shares a network with a ram: %v", kinds)
			}
			if network.gen > 0 && (network.gen != 80 || network.demand != 60 || !network.powered) {
				r.t.Fatalf("winch network: %v W for %v W, powered %v", network.gen, network.demand, network.powered)
			}
		case kinds["rtg"] > 0:
			if kinds["rtg"] != 1 {
				r.t.Fatalf("two generators in one network: %v", kinds)
			}
		default:
			if network.gen != 0 {
				r.t.Fatalf("power from nowhere: %v", kinds)
			}
		}
	}
}

func (r *apartmentsRig) press(at [3]int) {
	r.t.Helper()
	if _, ok := r.g.press(r.w, at[0], at[1], at[2], r.now); !ok {
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

// arms lists the heights of the arms out in the shaft.
func (r *apartmentsRig) arms() []int {
	var out []int
	for h := -1; h <= r.turn.WinchY; h++ {
		if strings.HasPrefix(r.w[[3]int{r.turn.Shaft[0], h, r.turn.Shaft[1]}], "ram_arm") {
			out = append(out, h)
		}
	}
	return out
}

func (r *apartmentsRig) stop(n int) [3]int { return r.turn.Buttons.Stop[strconv.Itoa(n)] }
func (r *apartmentsRig) call(n int) [3]int { return r.turn.Buttons.Call[strconv.Itoa(n)] }
func (r *apartmentsRig) down(n int) [3]int { return r.turn.Buttons.Down[strconv.Itoa(n)] }

// wait runs until the platform has rested at y for 3 s, and fails after a minute and a half.
func (r *apartmentsRig) waitRest(y int, what string) {
	r.t.Helper()
	for s := 0.0; s < 90; s += 0.2 {
		before := r.platform()
		r.seconds(0.2)
		if before == y && r.platform() == y {
			held := true
			for i := 0; i < 15 && held; i++ {
				r.seconds(0.2)
				held = r.platform() == y
			}
			// Still there after a long while: it is resting, not passing.
			if held {
				r.seconds(35)
				if r.platform() == y {
					return
				}
			}
		}
	}
	r.t.Fatalf("%s: the platform is at %d, not resting at %d (arms %v)", what, r.platform(), y, r.arms())
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
	}
}

func TestApartmentsLiftWaitsAfterTheBuild(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		r.seconds(10)
		if r.platform() != 0 || len(r.arms()) != 0 {
			t.Fatalf("it moved by itself: platform %d, arms %v", r.platform(), r.arms())
		}
		winch := powerPos{r.turn.Shaft[0], r.turn.WinchY, r.turn.Shaft[1]}
		if r.g.netOf[winch] == nil || r.g.netOf[winch].powered {
			t.Fatal("the winch is on the grid, and off")
		}
	})
}

func TestApartmentsLiftUpAndBack(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		// Up with nothing chosen: to the very top, then back to the lobby.
		r.press(r.turn.Buttons.Up)
		top := 0
		for s := 0.0; s < 34; s += 0.2 {
			r.seconds(0.2)
			if y := r.platform(); y > top {
				top = y
			}
		}
		if want := r.turn.Floors * r.turn.Step; top != want {
			t.Fatalf("it rose to %d, not %d", top, want)
		}
		r.waitRest(0, "back to the lobby")
		if len(r.arms()) != 0 {
			t.Fatalf("arms %v", r.arms())
		}
	})
}

func TestApartmentsLiftStopsAtEveryFloor(t *testing.T) {
	for _, turn := range apartmentsLoad(t)[:2] {
		for n := 1; n <= turn.Floors; n++ {
			t.Run("turn"+strconv.Itoa(turn.Turns)+"_floor"+strconv.Itoa(n), func(t *testing.T) {
				r := newApartmentsRig(t, turn, 200*time.Millisecond)
				// A rider in the lobby presses up, then green as the floor goes by.
				r.press(r.turn.Buttons.Up)
				y := n * turn.Step
				for r.platform() < y-2 {
					r.seconds(0.2)
				}
				r.press(r.stop(n))
				r.waitRest(y, "stop on the way up")
				if arms := r.arms(); len(arms) != 1 || arms[0] != y-1 {
					t.Fatalf("arms %v", arms)
				}
				// Red, from there: to the lobby.
				r.press(r.down(n))
				r.waitRest(0, "down")
			})
		}
	}
}

func TestApartmentsLiftComesWhenCalled(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		step := r.turn.Step
		r.press(r.call(5))
		r.waitRest(5*step, "called to 5")
		// From a floor to another, above and below; to the top, which needs its arm too.
		r.press(r.call(9))
		r.waitRest(9*step, "called to 9")
		r.press(r.call(2))
		r.waitRest(2*step, "called to 2")
		r.press(r.call(r.turn.Floors))
		r.waitRest(r.turn.Floors*step, "called to the top")
		// The lobby's button brings it down.
		r.press(r.turn.Buttons.LobbyCall)
		r.waitRest(0, "called to the lobby")
		if len(r.arms()) != 0 {
			t.Fatalf("arms %v", r.arms())
		}
		r.press(r.call(1))
		r.waitRest(step, "called to 1")
	})
}

func TestApartmentsLiftStopsOnTheWayDown(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		step := r.turn.Step
		r.press(r.call(10))
		r.waitRest(10*step, "called to 10")
		r.press(r.down(10))
		for r.platform() > 6*step {
			r.seconds(0.2)
		}
		r.press(r.stop(4))
		r.waitRest(4*step, "green on the way down")
	})
}

// Green for a floor already passed puts an arm over the platform: that cuts the rope, so it hangs
// where it is, between floors. Red, always within reach, lets it go.
func TestApartmentsLiftGreenForAFloorPassed(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		step := r.turn.Step
		r.press(r.call(10))
		r.waitRest(10*step, "called to 10")
		r.press(r.down(10))
		for r.platform() > 6*step+2 {
			r.seconds(0.2)
		}
		r.press(r.stop(9))
		r.seconds(1)
		hanging := r.platform()
		r.seconds(30)
		if r.platform() != hanging || hanging%step == 0 {
			t.Fatalf("at %d, then at %d", hanging, r.platform())
		}
		r.press(r.down(6))
		r.waitRest(0, "red after hanging")
	})
}

func TestApartmentsLiftTwoStopsAndThree(t *testing.T) {
	apartmentsEach(t, func(r *apartmentsRig) {
		step := r.turn.Step
		// Two chosen: the higher one catches it, the rams on their 80 W.
		r.press(r.turn.Buttons.Up)
		r.seconds(1)
		r.press(r.stop(3))
		r.press(r.stop(6))
		r.waitRest(6*step, "two stops")
		if arms := r.arms(); len(arms) != 2 {
			t.Fatalf("arms %v", arms)
		}
		// A third is too much for the rtg: a blackout, every arm in, down to the lobby.
		r.press(r.stop(8))
		r.waitRest(0, "three stops")
		if len(r.arms()) != 0 {
			t.Fatalf("arms %v", r.arms())
		}
		// Red clears it, and all works again.
		r.press(r.down(8))
		r.seconds(4)
		r.press(r.call(7))
		r.waitRest(7*step, "after the blackout")
	})
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
	turn := apartmentsLoad(t)[0]
	r := newApartmentsRig(t, turn, 200*time.Millisecond)
	// At rest on a floor: it stays, and answers.
	r.press(r.call(6))
	r.waitRest(6*turn.Step, "before")
	r.restart()
	r.seconds(10)
	if r.platform() != 6*turn.Step {
		t.Fatalf("the platform is at %d after the restart", r.platform())
	}
	r.press(r.call(3))
	r.waitRest(3*turn.Step, "after a restart")

	// A restart during a climb forgets the timer: it stays up on its power until the next press,
	// which brings it back when that press's timer ends.
	r.press(r.turn.Buttons.Up)
	r.seconds(8)
	r.restart()
	r.seconds(40)
	if want := turn.Floors * turn.Step; r.platform() != want {
		t.Fatalf("the platform is at %d, not holding at %d", r.platform(), want)
	}
	r.press(r.call(4))
	r.waitRest(4*turn.Step, "the next press after a restart in a climb")
}

// The bare names a build places are the ones the grid and the rules read.
func TestApartmentsLiftNames(t *testing.T) {
	for _, turn := range apartmentsLoad(t) {
		rams, latches, delays := 0, 0, 0
		for _, cell := range turn.Cells {
			name := cell[3].(string)
			base, _, _ := strings.Cut(name, ":")
			if base == "lift_platform" {
				continue
			}
			if powerKindOf(name) == "" {
				t.Fatalf("%s is not electric on the server", name)
			}
			switch base {
			case "motor_ram":
				rams++
				if _, ok := ramParse(name); !ok {
					t.Fatalf("ram %s", name)
				}
			case "latch":
				latches++
			case "delay_gate":
				delays++
			}
			if powerKinds[base].Role == powerLogic {
				if block, ok := logicParse(name); !ok || block.on() {
					t.Fatalf("logic block %s", name)
				}
			}
		}
		if rams != turn.Floors || latches != turn.Floors+1 || delays != turn.Floors*2+8 {
			t.Fatalf("%d rams, %d latches, %d delays", rams, latches, delays)
		}
	}
}
