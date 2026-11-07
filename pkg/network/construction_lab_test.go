package network

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

// /build lab on the real grid: the rules of power.go, logic.go, mechanics.go and appliances.go, with the
// design's own blocks (testdata/lab_power.json, written and checked against the design by
// test/js/construction_lab.test.js), in each of its four turns. Every block goes in the way a build sends
// it, through track, as setBlockTracked does for a blockPlace.

type labLamp struct {
	Room   string `json:"room"`
	At     [3]int `json:"at"`
	Night  bool   `json:"night"`
	Manual bool   `json:"manual"`
}

type labTurn struct {
	Turns  int               `json:"turns"`
	Shaft  [2]int            `json:"shaft"`
	WinchY int               `json:"winchY"`
	Step   int               `json:"step"`
	Marks  map[string][3]int `json:"marks"`
	Lamps  []labLamp         `json:"lamps"`
	Cells  [][]any           `json:"cells"`
}

func labLoad(t *testing.T) []labTurn {
	t.Helper()
	data, err := os.ReadFile("testdata/lab_power.json")
	if err != nil {
		t.Fatal(err)
	}
	var turns []labTurn
	if err := json.Unmarshal(data, &turns); err != nil {
		t.Fatal(err)
	}
	if len(turns) != 4 {
		t.Fatalf("%d turns", len(turns))
	}
	return turns
}

// Noon and midnight on a day with no rain, and a wind the turbines cannot be counted on for.
var (
	labNoon     = powerEnvironment{Days: 2.25, Time: 0.25}
	labMidnight = powerEnvironment{Days: 2.75, Time: 0.75}
)

type labRig struct {
	t    *testing.T
	turn labTurn
	w    fakeCropWorld
	g    *powerGrid
	now  time.Time
	env  powerEnvironment
}

const labTick = 200 * time.Millisecond

func newLabRig(t *testing.T, turn labTurn, env powerEnvironment) *labRig {
	t.Helper()
	r := &labRig{t: t, turn: turn, w: fakeCropWorld{}, g: newPowerGrid(), now: time.Unix(1000, 0), env: env}
	cells := append([][]any(nil), turn.Cells...)
	sort.SliceStable(cells, func(i, j int) bool { return cells[i][1].(float64) < cells[j][1].(float64) })
	for i, cell := range cells {
		x, y, z, name := int(cell[0].(float64)), int(cell[1].(float64)), int(cell[2].(float64)), cell[3].(string)
		r.w.SetBlock(x, y, z, name)
		r.g.track(x, y, z, name)
		if i%64 == 0 {
			r.run(1)
		}
	}
	// Settled: the switch hold is 3 s.
	r.seconds(5)
	return r
}

func (r *labRig) run(ticks int) {
	for i := 0; i < ticks; i++ {
		r.now = r.now.Add(labTick)
		r.g.tick(r.w, r.env, r.now, labTick.Seconds())
		for _, network := range r.g.networks {
			if network.tooBig {
				r.t.Fatalf("network at %v has %d blocks", network.root, len(network.members))
			}
		}
	}
}

func (r *labRig) seconds(s float64) { r.run(int(s/labTick.Seconds()) + 1) }

func (r *labRig) mark(name string) [3]int {
	r.t.Helper()
	at, ok := r.turn.Marks[name]
	if !ok {
		r.t.Fatalf("no mark %s", name)
	}
	return at
}

func (r *labRig) name(mark string) string { return r.w[r.mark(mark)] }

func (r *labRig) lit(mark string) bool { return strings.HasSuffix(r.name(mark), ":on") }

func (r *labRig) wantLit(mark string, want bool, what string) {
	r.t.Helper()
	if r.lit(mark) != want {
		r.t.Fatalf("%s: %s is %s, wanted lit=%v", what, mark, r.name(mark), want)
	}
}

// press does what a right click does, and lets it settle.
func (r *labRig) press(mark string) {
	r.t.Helper()
	at := r.mark(mark)
	// A stop already called has nothing to change, as a button already on.
	if _, ok := r.g.press(r.w, at[0], at[1], at[2], r.now); !ok && !strings.Contains(r.w[at], "called") && !strings.HasSuffix(r.w[at], ":on") {
		r.t.Fatalf("nothing to press at %s (%s)", mark, r.w[at])
	}
}

func (r *labRig) throw(mark string) {
	r.t.Helper()
	r.press(mark)
	r.seconds(4)
}

func (r *labRig) networkOf(mark string) *powerNetwork {
	r.t.Helper()
	network := r.g.netOf[powerPos(r.mark(mark))]
	if network == nil {
		r.t.Fatalf("%s (%s) is in no network", mark, r.name(mark))
	}
	return network
}

func labEach(t *testing.T, env powerEnvironment, test func(r *labRig)) {
	for _, turn := range labLoad(t) {
		t.Run("turn"+strconv.Itoa(turn.Turns), func(t *testing.T) { test(newLabRig(t, turn, env)) })
	}
}

func (r *labRig) lampsOf(pick func(labLamp) bool) []labLamp {
	var out []labLamp
	for _, lamp := range r.turn.Lamps {
		if pick(lamp) {
			out = append(out, lamp)
		}
	}
	return out
}

func (r *labRig) lampLit(lamp labLamp) bool { return strings.HasSuffix(r.w[lamp.At], ":on") }

// ---------------------------------------------------------------------------------------

// Whatever a build places is known to the grid under its own name: nothing is left out by the tracking.
func TestLabEveryElectricBlockIsTracked(t *testing.T) {
	turn := labLoad(t)[0]
	r := newLabRig(t, turn, labMidnight)
	electric := 0
	for _, cell := range turn.Cells {
		x, y, z, name := int(cell[0].(float64)), int(cell[1].(float64)), int(cell[2].(float64)), cell[3].(string)
		if powerKindOf(name) == "" {
			continue
		}
		electric++
		b := r.g.blocks[powerPos{x, y, z}]
		if b == nil || b.Kind != powerKindOf(name) {
			t.Fatalf("%s at %d,%d,%d is not on the grid: %+v", name, x, y, z, b)
		}
		if powerKinds[b.Kind].Role == powerLogic {
			if _, ok := logicParse(name); !ok {
				t.Fatalf("the grid cannot read %s", name)
			}
		}
	}
	if electric < 1000 || electric > powerMaxBlocks {
		t.Fatalf("%d electric blocks", electric)
	}
	t.Logf("%d electric blocks, %d networks at midnight", electric, len(r.g.networks))
}

// No network comes near the limit, and each that can have demand covers it at midnight on rtgs alone, with
// no sun, whatever the wind, with the batteries a build leaves empty.
func TestLabEveryNetworkCoversItsDemandOnItsOwn(t *testing.T) {
	labEach(t, labMidnight, func(r *labRig) {
		for _, network := range r.g.networks {
			if len(network.members) > powerMaxNetwork {
				t.Fatalf("network at %v: %d blocks", network.root, len(network.members))
			}
			if network.demand == 0 {
				continue
			}
			counts := map[string]int{}
			for _, p := range network.members {
				counts[r.g.blocks[p].Kind]++
			}
			steady := float64(counts["rtg"])*powerKinds["rtg"].Watts + float64(counts["water_wheel"])*powerKinds["water_wheel"].Watts
			// What hangs behind a switch that is off, and the crank's bulb, which runs by hand.
			if steady == 0 && counts["solar_panel"] == 0 {
				continue
			}
			if steady < network.demand {
				t.Fatalf("network at %v asks %v W and has %v W it can count on: %v", network.root, network.demand, steady, counts)
			}
			if !network.powered {
				t.Fatalf("network at %v is off: %v W, %v W, %v", network.root, network.gen, network.demand, counts)
			}
		}
		sizes := []int{}
		for _, network := range r.g.networks {
			if network.gen > 0 {
				sizes = append(sizes, len(network.members))
			}
		}
		sort.Ints(sizes)
		t.Logf("live networks by size: %v", sizes)
	})
}

func TestLabTheNetworksAreSeparate(t *testing.T) {
	labEach(t, labMidnight, func(r *labRig) {
		sources := []string{"rtg:main", "rtg:floor1", "rtg:floor2", "rtg:cold", "rtg:arc", "rtg:grow", "rtg:bench", "rtg:overload"}
		seen := map[*powerNetwork]string{}
		for _, name := range sources {
			network := r.networkOf(name)
			if other, ok := seen[network]; ok && name != other {
				t.Fatalf("%s and %s are one network", name, other)
			}
			seen[network] = name
		}
		// With the winch's rtg alone, 80 W for 60 W.
		winch := r.networkOf("winch")
		if winch.gen != 80 || winch.demand != 60 || !winch.powered {
			t.Fatalf("winch: %v W for %v W, %v", winch.gen, winch.demand, winch.powered)
		}
	})
}

// Rooms light at once and stay lit, day and night; the night lights come on only at night.
func TestLabLightsDayAndNight(t *testing.T) {
	for _, env := range []struct {
		name string
		env  powerEnvironment
	}{{"noon", labNoon}, {"midnight", labMidnight}} {
		t.Run(env.name, func(t *testing.T) {
			labEach(t, env.env, func(r *labRig) {
				if len(r.turn.Lamps) < 80 {
					t.Fatalf("%d lamps", len(r.turn.Lamps))
				}
				night := env.env.Time > 0.5
				for _, lamp := range r.turn.Lamps {
					if lamp.Manual {
						continue
					}
					want := !lamp.Night || night
					if r.lampLit(lamp) != want {
						t.Fatalf("%s lamp at %v is %s (%s), wanted lit=%v", lamp.Room, lamp.At, r.w[lamp.At], env.name, want)
					}
				}
			})
		})
	}
}

// The sensors turn over by themselves as the world's clock goes round.
func TestLabNightLightsFollowTheClock(t *testing.T) {
	turn := labLoad(t)[0]
	r := newLabRig(t, turn, labNoon)
	nightLamps := r.lampsOf(func(l labLamp) bool { return l.Night })
	if len(nightLamps) < 15 {
		t.Fatalf("%d night lamps", len(nightLamps))
	}
	check := func(want bool) {
		t.Helper()
		for _, lamp := range nightLamps {
			if r.lampLit(lamp) != want {
				t.Fatalf("%s lamp at %v: %s, wanted lit=%v", lamp.Room, lamp.At, r.w[lamp.At], want)
			}
		}
	}
	check(false)
	r.env = labMidnight
	r.seconds(4)
	check(true)
	r.env = powerEnvironment{Days: 3.25, Time: 0.25}
	r.seconds(4)
	check(false)
}

// Every room's lever cuts that room and only that room.
func TestLabRoomSwitches(t *testing.T) {
	labEach(t, labMidnight, func(r *labRig) {
		for _, room := range []string{"hall", "canteen", "workshop", "powerhall", "microscopy", "samples", "library", "experiments", "offices", "chemistry", "hotbay"} {
			of := r.lampsOf(func(l labLamp) bool { return l.Room == room })
			if len(of) == 0 {
				t.Fatalf("%s has no lamps", room)
			}
			// Genetics hangs from the sample room's switch.
			of = append(of, r.lampsOf(func(l labLamp) bool { return room == "samples" && l.Room == "genetics" })...)
			others := r.lampsOf(func(l labLamp) bool { return l.Room != room && !l.Manual && !(room == "samples" && l.Room == "genetics") })
			r.throw("lever:" + room)
			for _, lamp := range of {
				if r.lampLit(lamp) {
					t.Fatalf("%s: lever off, and the lamp at %v is lit", room, lamp.At)
				}
			}
			for _, lamp := range others {
				if !r.lampLit(lamp) {
					t.Fatalf("%s off put out a lamp of %s at %v", room, lamp.Room, lamp.At)
				}
			}
			r.throw("lever:" + room)
			for _, lamp := range of {
				if !r.lampLit(lamp) {
					t.Fatalf("%s: lever on, and the lamp at %v is dark", room, lamp.At)
				}
			}
		}
	})
}

func TestLabFloorAndMainSwitches(t *testing.T) {
	labEach(t, labMidnight, func(r *labRig) {
		for _, floor := range []string{"floor1", "floor2"} {
			corridor := strings.Replace(floor, "floor", "floor ", 1) + " corridor"
			lamps := r.lampsOf(func(l labLamp) bool { return l.Room == corridor })
			if len(lamps) == 0 {
				t.Fatal(corridor)
			}
			r.throw("lever:" + floor)
			for _, lamp := range lamps {
				if r.lampLit(lamp) {
					t.Fatalf("%s off: %v lit", floor, lamp.At)
				}
			}
			r.throw("lever:" + floor)
			for _, lamp := range lamps {
				if !r.lampLit(lamp) {
					t.Fatalf("%s on: %v dark", floor, lamp.At)
				}
			}
		}
		ground := r.lampsOf(func(l labLamp) bool { return l.Room == "ground corridor" || l.Room == "lobby" || l.Room == "canteen" })
		terrace := r.lampsOf(func(l labLamp) bool { return l.Room == "terrace" })
		r.throw("lever:main")
		for _, lamp := range ground {
			if r.lampLit(lamp) {
				t.Fatalf("main off: %s %v lit", lamp.Room, lamp.At)
			}
		}
		// The roof stays on the riser, on the battery side of the main switch.
		for _, lamp := range terrace {
			if !r.lampLit(lamp) {
				t.Fatalf("main off: the terrace's %v went dark", lamp.At)
			}
		}
		r.throw("lever:main")
		for _, lamp := range ground {
			if !r.lampLit(lamp) {
				t.Fatalf("main on: %s %v dark", lamp.Room, lamp.At)
			}
		}
	})
}

// The plant: the sun charges the batteries by day; with the rtgs isolated, a charged bank carries the night.
func TestLabPlantSunAndBatteries(t *testing.T) {
	turn := labLoad(t)[0]
	r := newLabRig(t, turn, labNoon)
	main := r.networkOf("rtg:main")
	if main.sources["solar"] != 24*powerKinds["solar_panel"].Watts {
		t.Fatalf("at noon the panels give %v W", main.sources["solar"])
	}
	if main.sources["radioisotope"] != 6*powerKinds["rtg"].Watts {
		t.Fatalf("the rtgs give %v W", main.sources["radioisotope"])
	}
	if main.capacity != 8*powerKinds["battery_block"].Capacity {
		t.Fatalf("the bank holds %v J", main.capacity)
	}
	start := main.stored
	r.seconds(30)
	main = r.networkOf("rtg:main")
	if main.stored <= start {
		t.Fatalf("no charge: %v J, was %v J", main.stored, start)
	}
	if !main.powered {
		t.Fatal("off at noon")
	}
	// A full day's charge, then the rtgs out and the sun down: the bank carries it, and says so.
	r.seconds(90)
	r.env = labMidnight
	r.throw("lever:rtg")
	main = r.networkOf("battery:main")
	if main.sources["radioisotope"] != 0 {
		t.Fatalf("isolated, the rtgs still give %v W", main.sources["radioisotope"])
	}
	if !main.powered || main.demand <= main.gen {
		t.Fatalf("on batteries: %v W for %v W, powered %v", main.gen, main.demand, main.powered)
	}
	before := main.stored
	r.seconds(10)
	if after := r.networkOf("battery:main").stored; after >= before {
		t.Fatalf("the bank did not fall: %v J, was %v J", after, before)
	}
	if !strings.HasPrefix(r.name("battery:main"), "battery_block") {
		t.Fatal(r.name("battery:main"))
	}
	r.throw("lever:rtg")
	if !r.networkOf("rtg:main").powered {
		t.Fatal("rtgs back, and off")
	}
}

func TestLabTurbinesFeedTheMainNetwork(t *testing.T) {
	labEach(t, labNoon, func(r *labRig) {
		main := r.networkOf("rtg:main")
		for _, name := range []string{"turbine:40", "turbine:33", "solar"} {
			if r.networkOf(name) != main {
				t.Fatalf("%s is not on the main network", name)
			}
		}
		// Whatever the wind, on some day at noon they turn: over the first days it is not always nothing.
		spun := 0.0
		for day := 0; day < 30; day++ {
			r.env = powerEnvironment{Days: float64(day) + 0.25, Time: 0.25}
			r.g.env = map[powerPos]*powerSurroundings{}
			b := r.g.blocks[powerPos(r.mark("turbine:40"))]
			if w := r.g.generation(b, r.w, r.env, r.now); w > spun {
				spun = w
			}
		}
		if spun < 50 {
			t.Fatalf("the turbine never gave more than %v W", spun)
		}
	})
}

func TestLabPlazaRunsOnTheWheel(t *testing.T) {
	labEach(t, labMidnight, func(r *labRig) {
		network := r.networkOf("wheel")
		if network.sources["water"] != powerKinds["water_wheel"].Watts {
			t.Fatalf("the wheel gives %v W", network.sources["water"])
		}
		lamps := r.lampsOf(func(l labLamp) bool { return l.Room == "plaza" })
		if len(lamps) != 4 {
			t.Fatalf("%d street lamps", len(lamps))
		}
		for _, lamp := range lamps {
			if r.g.netOf[powerPos(lamp.At)] != network || !r.lampLit(lamp) {
				t.Fatalf("street lamp %v: %s", lamp.At, r.w[lamp.At])
			}
		}
		if network.demand != 40 {
			t.Fatalf("plaza demand %v", network.demand)
		}
		r.env = labNoon
		r.seconds(4)
		for _, lamp := range lamps {
			if r.lampLit(lamp) {
				t.Fatalf("a street lamp lit at noon: %v", lamp.At)
			}
		}
	})
}

// The darkroom: its lamp is off until its lever is thrown, the rest of the floor does not care.
func TestLabDarkroomLever(t *testing.T) {
	labEach(t, labNoon, func(r *labRig) {
		r.wantLit("lamp:darkroom", false, "lever off")
		if r.name("lever:darkroom") != "lever" {
			t.Fatal(r.name("lever:darkroom"))
		}
		r.throw("lever:darkroom")
		r.wantLit("lamp:darkroom", true, "lever on")
		r.throw("lever:darkroom")
		r.wantLit("lamp:darkroom", false, "lever off again")
	})
}

func TestLabColdChainAndArc(t *testing.T) {
	labEach(t, labMidnight, func(r *labRig) {
		cold := r.networkOf("rtg:cold")
		if cold.demand != 90 || cold.gen != 160 || !cold.powered {
			t.Fatalf("cold: %v W of %v W, %v", cold.demand, cold.gen, cold.powered)
		}
		for _, name := range []string{"fridge:1", "fridge:2", "freezer"} {
			if !r.g.runsAt(powerPos(r.mark(name))) {
				t.Fatalf("%s does not run", name)
			}
		}
		// The incubator and the autoclave share the chain and ask only with work: both at once still fit.
		r.g.asks[powerPos(r.mark("incubator"))] = true
		r.g.asks[powerPos(r.mark("autoclave"))] = true
		r.seconds(4)
		cold = r.networkOf("rtg:cold")
		want := 90 + powerKinds[incubatorKind].Watts + powerKinds[autoclaveKind].Watts
		if cold.demand != want || want > cold.gen || !cold.powered {
			t.Fatalf("cold with cultures: %v W of %v W, %v", cold.demand, cold.gen, cold.powered)
		}
		for _, name := range []string{"incubator", "autoclave", "freezer"} {
			if !r.g.runsAt(powerPos(r.mark(name))) {
				t.Fatalf("%s does not run with everything on", name)
			}
		}
		// Idle, the arc asks for nothing; given work, it runs on its 2 rtg.
		arc := r.networkOf("arc")
		if arc.demand != 0 || arc.gen != 160 {
			t.Fatalf("idle arc: %v W of %v W", arc.demand, arc.gen)
		}
		at := powerPos(r.mark("arc"))
		r.g.asks[at] = true
		r.seconds(4)
		arc = r.networkOf("arc")
		if arc.demand != powerKinds["arc_furnace"].Watts || !arc.powered || !r.g.runsAt(at) {
			t.Fatalf("working arc: %v W of %v W, powered %v", arc.demand, arc.gen, arc.powered)
		}
		if len(arc.members) != 3 {
			t.Fatalf("the arc's network has %d blocks", len(arc.members))
		}
	})
}

func TestLabGrowLampsAndWheat(t *testing.T) {
	labEach(t, labMidnight, func(r *labRig) {
		grow := r.networkOf("rtg:grow")
		if grow.demand != 120 || grow.gen != 160 || !grow.powered {
			t.Fatalf("greenhouse: %v W of %v W", grow.demand, grow.gen)
		}
		wheat := r.mark("wheat")
		if !r.g.growLampNear(wheat[0], wheat[1], wheat[2]) {
			t.Fatal("no grow lamp shines on the wheat")
		}
		genetics := r.mark("wheat:genetics")
		if !r.g.growLampNear(genetics[0], genetics[1], genetics[2]) {
			t.Fatal("no grow lamp shines on the genetics wheat")
		}
		r.wantLit("growlamp:genetics", true, "genetics")
		r.throw("lever:grow")
		if r.g.growLampNear(wheat[0], wheat[1], wheat[2]) {
			t.Fatal("the lever did not cut the grow lamps")
		}
		// Placed wheat is a crop for the server, on its farmland.
		registry := map[string]Crop{}
		cropped := 0
		for _, cell := range r.turn.Cells {
			name := cell[3].(string)
			if !strings.HasPrefix(name, "wheat_") {
				continue
			}
			x, y, z := int(cell[0].(float64)), int(cell[1].(float64)), int(cell[2].(float64))
			if trackBlockLocked(registry, x, y, z, name, r.now, zeroRand) {
				cropped++
			}
			if r.w[[3]int{x, y - 1, z}] != "farmland" {
				t.Fatalf("wheat at %d,%d,%d stands on %s", x, y, z, r.w[[3]int{x, y - 1, z}])
			}
		}
		if cropped < 50 {
			t.Fatalf("%d crops", cropped)
		}
	})
}

// ---- The experiment room ----

func TestLabLogicBenches(t *testing.T) {
	labEach(t, labNoon, func(r *labRig) {
		truth := []struct {
			gate string
			want [4]bool // a, b: 00 10 11 01
		}{{"and", [4]bool{false, false, true, false}}, {"or", [4]bool{false, true, true, true}}, {"xor", [4]bool{false, true, false, true}}}
		for _, row := range truth {
			lamp := "lamp:" + row.gate
			r.wantLit(lamp, row.want[0], row.gate+" 00")
			r.throw(row.gate + ":a")
			r.wantLit(lamp, row.want[1], row.gate+" 10")
			r.throw(row.gate + ":b")
			r.wantLit(lamp, row.want[2], row.gate+" 11")
			r.throw(row.gate + ":a")
			r.wantLit(lamp, row.want[3], row.gate+" 01")
			r.throw(row.gate + ":b")
		}
		// NOT
		r.wantLit("lamp:not", true, "not, lever off")
		r.throw("not:a")
		r.wantLit("lamp:not", false, "not, lever on")
		r.throw("not:a")
		// The latch: a button sets it and it stays, the other clears it and that stays.
		r.wantLit("lamp:latch", false, "latch")
		r.press("latch:set")
		r.seconds(5)
		r.wantLit("lamp:latch", true, "latch set, button up")
		r.press("latch:reset")
		r.seconds(5)
		r.wantLit("lamp:latch", false, "latch reset, button up")
		// The delay: 2 seconds.
		r.wantLit("lamp:delay", false, "delay")
		r.press("delay:a")
		r.seconds(1)
		r.wantLit("lamp:delay", false, "delay, after 1 s")
		r.seconds(4)
		r.wantLit("lamp:delay", true, "delay, after 5 s")
		r.throw("delay:a")
		// Sensors. Day: lit now, and at night not.
		r.wantLit("lamp:day", true, "daylight at noon")
		r.wantLit("lamp:rain", false, "rain sensor, dry")
		r.wantLit("lamp:proximity", false, "proximity, nobody")
		at := r.mark("lamp:proximity")
		r.env.Players = [][3]float64{{float64(at[0]) + 2, float64(at[1]) + 2, float64(at[2]) + 2}}
		r.env.Rain = 1
		r.seconds(4)
		r.wantLit("lamp:proximity", true, "proximity, a player close")
		r.wantLit("lamp:rain", true, "rain sensor, raining")
		r.env = labMidnight
		r.seconds(4)
		r.wantLit("lamp:day", false, "daylight at midnight")
		r.wantLit("lamp:proximity", false, "proximity, gone")
		r.wantLit("lamp:rain", false, "rain sensor, dry again")
		// The bench's network never blacks out, with everything on.
		bench := r.networkOf("rtg:bench")
		if !bench.powered && bench.demand > 0 {
			t.Fatalf("bench off: %v W of %v W", bench.demand, bench.gen)
		}
	})
}

func TestLabOverloadBench(t *testing.T) {
	labEach(t, labNoon, func(r *labRig) {
		base := []string{"lamp:overload13", "lamp:overload15", "lamp:overload17"}
		allLit := func(want bool, what string) {
			t.Helper()
			for _, lamp := range base {
				r.wantLit(lamp, want, what)
			}
		}
		allLit(true, "3 lamps, 30 W of 80")
		r.throw("overload:motor")
		allLit(true, "3 lamps and the motor, exactly 80 W")
		r.wantLit("motor:overload", true, "the motor")
		network := r.networkOf("rtg:overload")
		if network.demand != 80 || network.gen != 80 {
			t.Fatalf("%v W of %v W", network.demand, network.gen)
		}
		// One lamp more: all of it goes out.
		r.throw("overload:lamp")
		allLit(false, "one lamp too many")
		r.wantLit("motor:overload", false, "one lamp too many")
		r.wantLit("lamp:overload20", false, "one lamp too many")
		if r.networkOf("rtg:overload").powered {
			t.Fatal("powered, at 90 W of 80")
		}
		// Take it away: it comes back.
		r.throw("overload:lamp")
		allLit(true, "back to 80 W")
		// With a battery on the line, charged while there is spare, the 10 W are covered.
		r.throw("overload:motor")
		r.throw("overload:battery")
		r.seconds(60)
		if r.networkOf("rtg:overload").stored < 1000 {
			t.Fatalf("the battery holds %v J", r.networkOf("rtg:overload").stored)
		}
		r.throw("overload:motor")
		r.throw("overload:lamp")
		allLit(true, "90 W of 80, with a battery")
		r.wantLit("lamp:overload20", true, "90 W of 80, with a battery")
	})
}

func TestLabMotorDoorAndPlates(t *testing.T) {
	labEach(t, labNoon, func(r *labRig) {
		door := r.mark("door:experiments")
		open := func() bool { return strings.HasSuffix(r.w[door], ":open") }
		if open() {
			t.Fatal("open with nobody there")
		}
		for _, plate := range []string{"plate:in", "plate:out"} {
			at := r.mark(plate)
			// Eyes 1.62 over the feet, on the plate.
			r.env.Players = [][3]float64{{float64(at[0]) + 0.5, float64(at[1]) + 1.62, float64(at[2]) + 0.5}}
			r.seconds(1)
			if !open() {
				t.Fatalf("%s pressed, the door is %s, the motor %s, the plate %s", plate, r.w[door], r.name("motor:door"), r.w[at])
			}
			upper := [3]int{door[0], door[1] + 1, door[2]}
			if !strings.HasSuffix(r.w[upper], ":open") {
				t.Fatalf("the upper half: %s", r.w[upper])
			}
			r.env.Players = nil
			r.seconds(5)
			if open() {
				t.Fatalf("%s let go, the door is %s", plate, r.w[door])
			}
		}
	})
}

func TestLabHandCrank(t *testing.T) {
	turn := labLoad(t)[0]
	r := newLabRig(t, turn, labMidnight)
	var bulb labLamp
	for _, lamp := range turn.Lamps {
		if lamp.Manual {
			bulb = lamp
		}
	}
	if bulb.Room == "" || r.lampLit(bulb) {
		t.Fatalf("the crank's bulb: %+v %s", bulb, r.w[bulb.At])
	}
	at := r.mark("crank")
	if !r.g.crankTurn(at[0], at[1], at[2], r.now) {
		t.Fatal("no crank")
	}
	r.seconds(1)
	if !r.lampLit(bulb) {
		t.Fatalf("turned, and the bulb is %s", r.w[bulb.At])
	}
	r.seconds(6)
	if r.lampLit(bulb) {
		t.Fatal("it lights on with no one turning")
	}
}

// ---- The lift, as the apartments' ----

func (r *labRig) platform() int {
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

func (r *labRig) doorOpen(n int) bool {
	r.t.Helper()
	stop := r.mark(fmt.Sprintf("stop:%d", n))
	lower, upper := r.w[[3]int{stop[0], stop[1] - 2, stop[2]}], r.w[[3]int{stop[0], stop[1] - 1, stop[2]}]
	if strings.HasSuffix(lower, ":open") != strings.HasSuffix(upper, ":open") {
		r.t.Fatalf("door of floor %d: %s, %s", n, lower, upper)
	}
	return strings.HasSuffix(lower, ":open")
}

func (r *labRig) rideTo(n int, what string) {
	r.t.Helper()
	want := n * r.turn.Step
	blocks := want - r.platform()
	if blocks < 0 {
		blocks = -blocks
	}
	limit := time.Duration(blocks)*600*time.Millisecond + liftStopSettle + 2*labTick
	began := r.now
	for r.now.Sub(began) < limit && !r.doorOpen(n) {
		r.run(1)
		for m := 0; m <= 3; m++ {
			if r.doorOpen(m) && r.platform() != m*r.turn.Step {
				r.t.Fatalf("%s: the door of floor %d is open with the platform at %d", what, m, r.platform())
			}
		}
	}
	if r.platform() != want || !r.doorOpen(n) {
		r.t.Fatalf("%s: the platform is at %d, not %d (door %v)", what, r.platform(), want, r.doorOpen(n))
	}
}

func TestLabLiftGeometry(t *testing.T) {
	for _, turn := range labLoad(t) {
		if turn.WinchY-1 > liftMaxRope {
			t.Fatalf("%d of rope", turn.WinchY-1)
		}
		if top := turn.WinchY - liftHeadroom - 1; top != 3*turn.Step {
			t.Fatalf("the platform stops at %d", top)
		}
		for n := 0; n <= 3; n++ {
			if y := turn.Marks[fmt.Sprintf("stop:%d", n)][1]; y-liftStopDrop != n*turn.Step {
				t.Fatalf("the stop of floor %d is at %d", n, y)
			}
		}
	}
}

func TestLabLiftEveryCall(t *testing.T) {
	labEach(t, labNoon, func(r *labRig) {
		if r.platform() != 0 {
			t.Fatalf("it moved by itself: %d", r.platform())
		}
		if !r.doorOpen(0) {
			t.Fatal("ready on the ground, its door open")
		}
		for n := 1; n <= 3; n++ {
			r.press(fmt.Sprintf("stop:%d", n))
			r.rideTo(n, "up")
		}
		for n := 2; n >= 0; n-- {
			r.press(fmt.Sprintf("stop:%d", n))
			r.rideTo(n, "down")
		}
		r.press("stop:3")
		r.rideTo(3, "straight to the roof")
		r.press("stop:0")
		r.rideTo(0, "straight down")
	})
}

func TestLabLiftInside(t *testing.T) {
	labEach(t, labNoon, func(r *labRig) {
		for n := 0; n < 3; n++ {
			r.press(fmt.Sprintf("stop:%d", n))
			r.rideTo(n, "to the floor")
			r.seconds(1)
			r.press(fmt.Sprintf("green:%d", n))
			r.rideTo(3, "green")
			r.seconds(2)
		}
		for n := 3; n > 0; n-- {
			r.press(fmt.Sprintf("stop:%d", n))
			r.rideTo(n, "to the floor")
			r.seconds(1)
			r.press(fmt.Sprintf("red:%d", n))
			r.rideTo(0, "red")
			r.seconds(2)
		}
		// Green, then floor 2's stop as it comes.
		r.press("green:0")
		for r.platform() < 2*r.turn.Step-3 {
			r.run(1)
		}
		r.press("stop:2")
		r.rideTo(2, "green and then floor 2")
	})
}

// Saved and loaded as the server does it; every lamp and the bank come back.
func TestLabSurvivesARestart(t *testing.T) {
	turn := labLoad(t)[0]
	r := newLabRig(t, turn, labNoon)
	r.throw("lever:darkroom")
	r.seconds(30)
	stored := r.networkOf("rtg:main").stored
	powerMu.Lock()
	grid = r.g
	powerMu.Unlock()
	saved := snapshotPower()
	loadPower(saved)
	powerMu.Lock()
	r.g = grid
	grid = newPowerGrid()
	powerMu.Unlock()
	r.seconds(5)
	if r.name("lever:darkroom") != "lever:on" {
		t.Fatal(r.name("lever:darkroom"))
	}
	r.wantLit("lamp:darkroom", true, "after a restart")
	if after := r.networkOf("rtg:main").stored; after < stored {
		t.Fatalf("the bank lost charge: %v J, was %v J", after, stored)
	}
}

// The whole path of a build, through the real message handler and chunk store: every electric block
// a blockPlace, as constructionApply sends it. It ends up on the grid, and the grid lights what it should.
func TestLabThroughTheRealBlockPlace(t *testing.T) {
	turn := labLoad(t)[0] // Before the rig, which moves to a temporary directory.
	alice, send, _ := storageMessageRig(t)
	powerMu.Lock()
	grid = newPowerGrid()
	powerMu.Unlock()
	defer func() {
		powerMu.Lock()
		grid = newPowerGrid()
		powerMu.Unlock()
	}()
	const lift = 100 // Above whatever the terrain has there.
	cells := append([][]any(nil), turn.Cells...)
	sort.SliceStable(cells, func(i, j int) bool { return cells[i][1].(float64) < cells[j][1].(float64) })
	for _, cell := range cells {
		send(alice, "blockPlace", Block{X: int(cell[0].(float64)), Y: int(cell[1].(float64)) + lift, Z: int(cell[2].(float64)), BlockType: cell[3].(string)})
	}
	powerMu.Lock()
	defer powerMu.Unlock()
	for _, cell := range cells {
		x, y, z, name := int(cell[0].(float64)), int(cell[1].(float64))+lift, int(cell[2].(float64)), cell[3].(string)
		if kind := powerKindOf(name); kind != "" && (grid.blocks[powerPos{x, y, z}] == nil || grid.blocks[powerPos{x, y, z}].Kind != kind) {
			t.Fatalf("%s at %d,%d,%d is not on the grid", name, x, y, z)
		}
	}
	now := time.Now()
	for i := 0; i < 40; i++ {
		now = now.Add(labTick)
		grid.tick(chunkStore, labMidnight, now, labTick.Seconds())
	}
	block := func(at [3]int) string {
		name, err := chunkStore.Block(at[0], at[1]+lift, at[2])
		if err != nil {
			t.Fatal(err)
		}
		return name
	}
	for _, lamp := range turn.Lamps {
		if lamp.Manual {
			continue
		}
		if name := block(lamp.At); !strings.HasSuffix(name, ":on") {
			t.Fatalf("%s lamp at %v, in the real chunks: %s", lamp.Room, lamp.At, name)
		}
	}
	if name := block(turn.Marks["lamp:darkroom"]); name != "electric_lamp" {
		t.Fatalf("the darkroom's lamp, its lever off: %s", name)
	}
	if name := block(turn.Marks["sensor:lobby"]); name != "daylight_sensor:night:on" {
		t.Fatalf("the lobby's sensor at midnight: %s", name)
	}
	if !grid.runsAt(powerPos{turn.Marks["freezer"][0], turn.Marks["freezer"][1] + lift, turn.Marks["freezer"][2]}) {
		t.Fatal("the freezer does not run")
	}
}
