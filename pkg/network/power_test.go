package network

import (
	"math"
	"testing"
	"time"
)

// noon in the open, dry, with no wind-driven generators involved.
var powerNoon = powerEnvironment{Days: 0.25, Time: 0.25}
var powerMidnight = powerEnvironment{Days: 0.75, Time: 0.75}

func newTestGrid(w fakeCropWorld, blocks map[powerPos]string) *powerGrid {
	g := newPowerGrid()
	for p, name := range blocks {
		w.SetBlock(p[0], p[1], p[2], name)
		g.track(p[0], p[1], p[2], name)
	}
	return g
}

func TestPowerKindOf(t *testing.T) {
	cases := map[string]string{
		"copper_wire": "copper_wire", "electric_lamp:on": "electric_lamp", "battery_block:3": "battery_block",
		"water_wheel:z": "water_wheel", "stone": "", "": "", "iron_door:upper:n:left:open": "",
	}
	for name, want := range cases {
		if got := powerKindOf(name); got != want {
			t.Errorf("powerKindOf(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestPowerNetworksByAdjacency(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{
		{0, 0, 0}: "solar_panel", {1, 0, 0}: "copper_wire", {2, 0, 0}: "electric_lamp",
		{2, 1, 0}: "copper_wire",   // vertical neighbour: same network
		{5, 0, 0}: "electric_lamp", // apart: its own network
		{3, 1, 1}: "copper_wire",   // only a diagonal neighbour: apart
	})
	g.rebuild()
	if len(g.networks) != 3 {
		t.Fatalf("got %d networks, want 3", len(g.networks))
	}
	if g.netOf[powerPos{0, 0, 0}] != g.netOf[powerPos{2, 1, 0}] {
		t.Error("the panel and the wire above the lamp should share a network")
	}
	if g.netOf[powerPos{0, 0, 0}] == g.netOf[powerPos{5, 0, 0}] {
		t.Error("the far lamp should be on its own")
	}
	if len(g.netOf[powerPos{0, 0, 0}].members) != 4 {
		t.Errorf("first network has %d members, want 4", len(g.netOf[powerPos{0, 0, 0}].members))
	}
}

func TestPowerSolarLightsLampByDayOnly(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "solar_panel", {1, 0, 0}: "electric_lamp"})
	now := time.Unix(1000, 0)
	updates, _ := g.tick(w, powerNoon, now, 1)
	if len(updates) != 1 || updates[0].BlockType != "electric_lamp:on" {
		t.Fatalf("at noon the lamp should light: %+v", updates)
	}
	if w[[3]int{1, 0, 0}] != "electric_lamp:on" {
		t.Fatalf("the world should hold the lit lamp, got %q", w[[3]int{1, 0, 0}])
	}
	updates, _ = g.tick(w, powerMidnight, now.Add(time.Second), 1)
	if len(updates) != 1 || updates[0].BlockType != "electric_lamp" {
		t.Fatalf("at midnight the lamp should go off: %+v", updates)
	}
}

func TestPowerSolarNeedsTheSky(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "solar_panel", {1, 0, 0}: "electric_lamp"})
	w.SetBlock(0, 5, 0, "glass")
	now := time.Unix(1000, 0)
	g.tick(w, powerNoon, now, 1)
	if w[[3]int{1, 0, 0}] != "electric_lamp:on" {
		t.Fatal("sunlight goes through glass")
	}
	w.SetBlock(0, 7, 0, "stone")
	g.env = map[powerPos]*powerSurroundings{} // look again
	g.tick(w, powerNoon, now.Add(time.Second), 1)
	if w[[3]int{1, 0, 0}] != "electric_lamp" {
		t.Fatal("under a stone roof the panel gives nothing")
	}
}

func TestPowerAllOrNothing(t *testing.T) {
	// A 40 W panel at noon cannot run a 50 W motor: the lamp on the same network goes off too.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "solar_panel", {1, 0, 0}: "electric_lamp", {2, 0, 0}: "electric_motor"})
	g.tick(w, powerNoon, time.Unix(1000, 0), 1)
	if w[[3]int{1, 0, 0}] != "electric_lamp" || w[[3]int{2, 0, 0}] != "electric_motor" {
		t.Fatalf("overloaded network should be off: %v", w)
	}
	report := g.probe(1, 0, 0, w, powerNoon, time.Unix(1000, 0))
	if !report.Found || report.Powered || math.Abs(report.Gen-40) > 1e-9 || report.Demand != 60 || report.Blocks != 3 {
		t.Fatalf("unexpected report %+v", report)
	}
}

func TestPowerBatteryStoresAndDischarges(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "solar_panel", {1, 0, 0}: "battery_block", {2, 0, 0}: "electric_lamp"})
	now := time.Unix(1000, 0)
	// Noon: 40 W in, 10 W to the lamp, 30 W into the battery.
	g.tick(w, powerNoon, now, 1)
	battery := g.blocks[powerPos{1, 0, 0}]
	if math.Abs(battery.Energy-30) > 1e-9 {
		t.Fatalf("battery holds %.3f J, want 30", battery.Energy)
	}
	// Midnight: the battery keeps the lamp lit, 10 J a second.
	battery.Energy = 100
	g.tick(w, powerMidnight, now.Add(time.Second), 1)
	if w[[3]int{2, 0, 0}] != "electric_lamp:on" || math.Abs(battery.Energy-90) > 1e-9 {
		t.Fatalf("battery should run the lamp: lamp %q, energy %.3f", w[[3]int{2, 0, 0}], battery.Energy)
	}
	// Empty: blackout.
	battery.Energy = 5
	g.tick(w, powerMidnight, now.Add(2*time.Second), 1)
	if w[[3]int{2, 0, 0}] != "electric_lamp" || math.Abs(battery.Energy-5) > 1e-9 {
		t.Fatalf("an almost empty battery cannot run the lamp: lamp %q, energy %.3f", w[[3]int{2, 0, 0}], battery.Energy)
	}
}

func TestPowerBatteryLevelInName(t *testing.T) {
	cases := []struct {
		fraction float64
		want     string
	}{
		{0, "battery_block"}, {0.1, "battery_block"}, {0.13, "battery_block:1"}, {0.5, "battery_block:2"},
		{0.8, "battery_block:3"}, {1, "battery_block:4"}, {1.5, "battery_block:4"},
	}
	for _, c := range cases {
		if got := powerLevelName("battery_block", c.fraction, 4); got != c.want {
			t.Errorf("powerLevelName(%.2f) = %q, want %q", c.fraction, got, c.want)
		}
	}
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "battery_block"})
	g.blocks[powerPos{0, 0, 0}].Energy = 3000
	updates, _ := g.tick(w, powerMidnight, time.Unix(1000, 0), 1)
	if len(updates) != 1 || updates[0].BlockType != "battery_block:4" {
		t.Fatalf("a full battery should show four bars: %+v", updates)
	}
}

func TestPowerBalance(t *testing.T) {
	cases := []struct {
		gen, demand, stored float64
		powered             bool
		after               float64
	}{
		{20, 10, 0, true, 10},        // surplus charges
		{500, 0, 0, true, 100},       // at most the rate (100 W)
		{20, 10, 11995, true, 12000}, // never above the capacity
		{0, 10, 50, true, 40},        // the battery covers the deficit
		{0, 200, 5000, false, 5000},  // deficit above the rate: blackout
		{30, 60, 10, false, 40},      // blackout, the generation charges
	}
	for _, c := range cases {
		powered, after := powerBalance(c.gen, c.demand, c.stored, 12000, 100, 1)
		if powered != c.powered || math.Abs(after-c.after) > 1e-9 {
			t.Errorf("powerBalance(%v, %v, %v) = %v, %v; want %v, %v", c.gen, c.demand, c.stored, powered, after, c.powered, c.after)
		}
	}
}

func TestPowerSwitchHold(t *testing.T) {
	// A hand crank: after it stops the lamp waits powerSwitchHold before lighting again.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "hand_crank", {1, 0, 0}: "electric_lamp"})
	now := time.Unix(1000, 0)
	g.tick(w, powerMidnight, now, 1)
	if w[[3]int{1, 0, 0}] != "electric_lamp" {
		t.Fatal("an idle crank gives nothing")
	}
	if !g.crankTurn(0, 0, 0, now) {
		t.Fatal("turning the crank should work")
	}
	g.tick(w, powerMidnight, now.Add(time.Second), 1)
	if w[[3]int{1, 0, 0}] != "electric_lamp" {
		t.Fatal("the lamp should wait for the hold after switching off")
	}
	g.crankTurn(0, 0, 0, now.Add(3*time.Second))
	g.tick(w, powerMidnight, now.Add(3*time.Second), 1)
	if w[[3]int{1, 0, 0}] != "electric_lamp:on" {
		t.Fatal("the cranked lamp should light")
	}
	g.tick(w, powerMidnight, now.Add(20*time.Second), 1)
	if w[[3]int{1, 0, 0}] != "electric_lamp" {
		t.Fatal("the crank runs down")
	}
}

func TestPowerWaterWheel(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "water_wheel"})
	now := time.Unix(1000, 0)
	b := g.blocks[powerPos{0, 0, 0}]
	if got := g.generation(b, w, powerNoon, now); got != 0 {
		t.Fatalf("dry wheel gives %v W", got)
	}
	w.SetBlock(1, 0, 0, "water")
	w.SetBlock(0, -1, 0, "water")
	w.SetBlock(0, 1, 0, "water") // above: does not count
	g.env = map[powerPos]*powerSurroundings{}
	if got := g.generation(b, w, powerNoon, now); got != 70 {
		t.Fatalf("two wet sides give %v W, want 70", got)
	}
	for _, p := range [][3]int{{-1, 0, 0}, {0, 0, 1}, {0, 0, -1}} {
		w.SetBlock(p[0], p[1], p[2], "water")
	}
	g.env = map[powerPos]*powerSurroundings{}
	if got := g.generation(b, w, powerNoon, now); got != 105 {
		t.Fatalf("a wheel gives at most 105 W, got %v", got)
	}
}

func TestPowerWindMatchesTheClient(t *testing.T) {
	// Values of weatherWindModel(days, y, rain).speed in js/game/weather.js.
	cases := []struct{ days, y, rain, speed float64 }{
		{0.3, 10, 0, 3.873115662511342},
		{12.77, 40, 0.5, 13.144821031725405},
		{103.1, -3, 1, 9.56080461065061},
	}
	for _, c := range cases {
		if got := weatherWindSpeed(c.days, c.y, c.rain); math.Abs(got-c.speed) > 1e-9 {
			t.Errorf("weatherWindSpeed(%v, %v, %v) = %v, want %v", c.days, c.y, c.rain, got, c.speed)
		}
	}
	if powerWindWatts(0.5, 150) != 0 || math.Abs(powerWindWatts(4, 150)-38.4) > 1e-9 || powerWindWatts(7, 150) != 150 {
		t.Error("turbine curve: nothing below 1 m/s, 0.6 v^3, at most the peak")
	}
}

func TestPowerRainMatchesTheClient(t *testing.T) {
	// environmentRainWindow(day, 240) in js/game/environment.js: the rainy days below 120.
	rainy := map[int][2]float64{
		57:  {0.4293295159132666, 0.9547460232698339},
		87:  {0.321039200667655, 0.9059278042059298},
		100: {0.4402507767969163, 0.7384899229815582},
		101: {0.29860433340379355, 0.7490723872122294},
		119: {0.46759908435981545, 0.7442793624859658},
	}
	for day := -10; day < 120; day++ {
		start, end, ok := rainWindow(day)
		want, rains := rainy[day]
		if ok != rains {
			t.Errorf("day %d: rain %v, want %v", day, ok, rains)
			continue
		}
		if ok && (math.Abs(start-want[0]) > 1e-12 || math.Abs(end-want[1]) > 1e-12) {
			t.Errorf("day %d: shower %v-%v, want %v-%v", day, start, end, want[0], want[1])
		}
	}
	if got := rainLevel(57, 0.4293295159132666-0.02); math.Abs(got-0.5299839999999997) > 1e-9 {
		t.Errorf("rain build-up = %v", got)
	}
	if rainLevel(57, 0.6) != 1 || rainLevel(56, 0.6) != 0 {
		t.Error("rain level inside and outside the shower")
	}
}

func TestPowerMotorOpensIronDoors(t *testing.T) {
	w := fakeCropWorld{}
	w.SetBlock(1, 0, 0, "iron_door")
	w.SetBlock(1, 1, 0, "iron_door:upper:n:left:closed")
	w.SetBlock(0, 1, 0, "iron_trapdoor:e:top:closed")
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "electric_motor", {-1, 0, 0}: "water_wheel"})
	for _, p := range [][3]int{{-2, 0, 0}, {-1, -1, 0}, {-1, 0, 1}} {
		w.SetBlock(p[0], p[1], p[2], "water") // 60 W
	}
	now := time.Unix(1000, 0)
	g.tick(w, powerNoon, now, 1)
	if w[[3]int{0, 0, 0}] != "electric_motor:on" {
		t.Fatalf("motor should run, got %q", w[[3]int{0, 0, 0}])
	}
	if w[[3]int{1, 0, 0}] != "iron_door:lower:n:left:open" || w[[3]int{1, 1, 0}] != "iron_door:upper:n:left:open" {
		t.Fatalf("both door halves should open: %q %q", w[[3]int{1, 0, 0}], w[[3]int{1, 1, 0}])
	}
	if w[[3]int{0, 1, 0}] != "iron_trapdoor:e:top:open" {
		t.Fatalf("trapdoor should open: %q", w[[3]int{0, 1, 0}])
	}
	// Dry the wheel: the motor stops and the doors close (the lower half back to its bare name).
	for _, p := range [][3]int{{-2, 0, 0}, {-1, -1, 0}, {-1, 0, 1}} {
		w.SetBlock(p[0], p[1], p[2], "")
	}
	g.env = map[powerPos]*powerSurroundings{}
	g.tick(w, powerNoon, now.Add(time.Second), 1)
	if w[[3]int{1, 0, 0}] != "iron_door" || w[[3]int{1, 1, 0}] != "iron_door:upper:n:left:closed" {
		t.Fatalf("door should close: %q %q", w[[3]int{1, 0, 0}], w[[3]int{1, 1, 0}])
	}
}

func TestPowerTooBigNetwork(t *testing.T) {
	w := fakeCropWorld{}
	blocks := map[powerPos]string{{-1, 0, 0}: "hand_crank", {-2, 0, 0}: "electric_lamp"}
	for x := 0; x < powerMaxNetwork; x++ {
		blocks[powerPos{x, 0, 0}] = "copper_wire"
	}
	g := newTestGrid(w, blocks)
	now := time.Unix(1000, 0)
	g.crankTurn(-1, 0, 0, now)
	g.tick(w, powerMidnight, now, 1)
	if w[[3]int{-2, 0, 0}] != "electric_lamp" {
		t.Fatal("a network above the limit does not work")
	}
	if report := g.probe(-2, 0, 0, w, powerMidnight, now); !report.TooBig {
		t.Fatal("the multimeter should say the network is too big")
	}
}

func TestPowerFollowsTheWorld(t *testing.T) {
	// A lamp replaced behind the registry's back is forgotten instead of overwritten.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "solar_panel", {1, 0, 0}: "electric_lamp"})
	w.SetBlock(1, 0, 0, "stone")
	g.tick(w, powerNoon, time.Unix(1000, 0), 1)
	if w[[3]int{1, 0, 0}] != "stone" {
		t.Fatal("the power tick must not overwrite other blocks")
	}
	if g.blocks[powerPos{1, 0, 0}] != nil {
		t.Fatal("the replaced lamp should be forgotten")
	}
}

func TestPowerTrackPlacedStates(t *testing.T) {
	g := newPowerGrid()
	if !g.track(0, 0, 0, "battery_block:4") {
		t.Fatal("a battery should be tracked")
	}
	if g.blocks[powerPos{0, 0, 0}].Energy != 0 {
		t.Fatal("a placed battery starts empty whatever its name")
	}
	if g.track(0, 0, 0, "battery_block:2") {
		t.Fatal("a new state of the same block is not a new block")
	}
	if !g.track(0, 0, 0, "") || len(g.blocks) != 0 {
		t.Fatal("breaking forgets it")
	}
	if g.track(0, 0, 0, "stone") {
		t.Fatal("stone is not electric")
	}
}

func TestPowerGrowLamp(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 3, 0}: "grow_lamp", {1, 3, 0}: "hand_crank"})
	now := time.Unix(1000, 0)
	g.crankTurn(1, 3, 0, now)
	g.tick(w, powerMidnight, now, 1)
	if !g.growLampNear(1, 0, 1) || g.growLampNear(5, 0, 0) || g.growLampNear(0, 3, 0) {
		t.Fatal("a lit grow lamp shines on the crops below it")
	}
	registry := map[string]Crop{blockKey(1, 0, 1): {X: 1, Y: 0, Z: 1, Kind: "wheat", NextGrowth: 100}}
	if !boostCropsLocked(registry, g.growLampNear, 5*time.Second) || registry[blockKey(1, 0, 1)].NextGrowth != 95 {
		t.Fatalf("boosted crop: %+v", registry)
	}
}

func TestPowerEelTank(t *testing.T) {
	// Task #14: an eel tank gives 25 W while occupied, 50 W for a while after a meal.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "eel_tank", {1, 0, 0}: "electric_lamp"})
	now := time.Unix(1000, 0)
	tank := g.blocks[powerPos{0, 0, 0}]
	if got := g.generation(tank, w, powerMidnight, now); got != 0 {
		t.Fatalf("an empty tank gives %v W", got)
	}
	if g.eelFeed(0, 0, 0, now) {
		t.Fatal("an empty tank has no eel to feed")
	}
	w.SetBlock(0, 0, 0, "eel_tank:full")
	if g.track(0, 0, 0, "eel_tank:full") {
		t.Fatal("filling the tank keeps the same kind")
	}
	if got := g.generation(tank, w, powerMidnight, now); got != powerEelSteady {
		t.Fatalf("an occupied tank gives %v W, want %v", got, powerEelSteady)
	}
	if !g.eelFeed(0, 0, 0, now) {
		t.Fatal("feeding the eel should work")
	}
	if got := g.generation(tank, w, powerMidnight, now.Add(5*time.Second)); got != 50 {
		t.Fatalf("a fed eel gives %v W, want 50", got)
	}
	if got := g.generation(tank, w, powerMidnight, now.Add(11*time.Second)); got != powerEelSteady {
		t.Fatalf("the meal wears off: %v W", got)
	}
	// Several meals add up, but never more than powerEelFeedMax ahead.
	for i := 0; i < 6; i++ {
		g.eelFeed(0, 0, 0, now)
	}
	if until := g.crank[powerPos{0, 0, 0}]; until.After(now.Add(powerEelFeedMax)) {
		t.Fatalf("fed until %v, more than %v ahead", until.Sub(now), powerEelFeedMax)
	}
	g.tick(w, powerMidnight, now, 1)
	if !g.netOf[powerPos{0, 0, 0}].powered {
		t.Fatal("the eel should light the 10 W lamp at night")
	}
}

func TestPowerRadioisotopeGenerator(t *testing.T) {
	// An RTG gives its 80 W day and night, rain or shine, under a roof, with nothing to do.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "rtg", {1, 0, 0}: "electric_motor", {2, 0, 0}: "electric_lamp"})
	w.SetBlock(0, 3, 0, "stone")
	rtg := g.blocks[powerPos{0, 0, 0}]
	now := time.Unix(1000, 0)
	for _, env := range []powerEnvironment{powerNoon, powerMidnight, {Days: 3.75, Time: 0.75, Rain: 1}} {
		if got := g.generation(rtg, w, env, now); got != 80 {
			t.Fatalf("the RTG gives %v W in %+v, want 80", got, env)
		}
	}
	// A 50 W motor and a 10 W lamp at midnight, without batteries.
	g.tick(w, powerMidnight, now, 1)
	if w[[3]int{1, 0, 0}] != "electric_motor:on" || w[[3]int{2, 0, 0}] != "electric_lamp:on" {
		t.Fatalf("the RTG should run the motor and the lamp at night: %v", w)
	}
	report := g.probe(0, 0, 0, w, powerMidnight, now)
	if report.Own != 80 || report.Sources["radioisotope"] != 80 || report.Demand != 60 {
		t.Fatalf("unexpected report %+v", report)
	}
}

func TestLightBulbIsASwitchedConsumer(t *testing.T) {
	kind := powerKinds["light_bulb"]
	if kind.Role != powerConsumer || kind.Watts != 5 || !kind.Switch {
		t.Fatalf("kind: %+v", kind)
	}
	if powerKindOf("light_bulb:on") != "light_bulb" {
		t.Fatal("light_bulb:on is not a light_bulb")
	}
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "rtg", {1, 0, 0}: "copper_wire", {2, 0, 0}: "light_bulb"})
	updates, _ := g.tick(w, powerMidnight, time.Now(), 1)
	if len(updates) != 1 || updates[0].BlockType != "light_bulb:on" || w[[3]int{2, 0, 0}] != "light_bulb:on" {
		t.Fatalf("with power: %+v, %q", updates, w[[3]int{2, 0, 0}])
	}
	// Once on, no more updates; with the generator gone, it goes off.
	if updates, _ := g.tick(w, powerMidnight, time.Now(), 1); len(updates) != 0 {
		t.Fatalf("a second tick changed: %+v", updates)
	}
	g.track(0, 0, 0, "")
	delete(w, [3]int{0, 0, 0})
	updates, _ = g.tick(w, powerMidnight, time.Now(), 1)
	if len(updates) != 1 || updates[0].BlockType != "light_bulb" || w[[3]int{2, 0, 0}] != "light_bulb" {
		t.Fatalf("without power: %+v, %q", updates, w[[3]int{2, 0, 0}])
	}
}

// A bulb conducts, so what lies behind it is on the same network.
func TestLightBulbConducts(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "rtg", {1, 0, 0}: "light_bulb", {2, 0, 0}: "electric_lamp"})
	g.tick(w, powerMidnight, time.Now(), 1)
	if w[[3]int{1, 0, 0}] != "light_bulb:on" || w[[3]int{2, 0, 0}] != "electric_lamp:on" {
		t.Fatalf("got %q and %q", w[[3]int{1, 0, 0}], w[[3]int{2, 0, 0}])
	}
}

// A lit name from a blueprint does not light it: the server decides.
func TestLightBulbPlacedLitWithoutPower(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "light_bulb:on"})
	g.tick(w, powerMidnight, time.Now(), 1)
	if w[[3]int{0, 0, 0}] != "light_bulb" {
		t.Fatalf("got %q", w[[3]int{0, 0, 0}])
	}
}

// Bulbs placed when they were plain blocks are in the chunks but not in world.json.
func TestOldBulbsAreAdopted(t *testing.T) {
	w := fakeCropWorld{{1, 0, 0}: "light_bulb"}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "rtg"})
	g.tick(w, powerMidnight, time.Now(), 1)
	if w[[3]int{1, 0, 0}] != "light_bulb" {
		t.Fatal("an unknown block changed")
	}
	found := [][3]int{{1, 0, 0}, {7, 0, 0}} // the second has gone by the time it is looked at
	powerAdoptOldBulbs(g, w, found)
	if g.blocks[powerPos{1, 0, 0}] == nil || g.blocks[powerPos{7, 0, 0}] != nil {
		t.Fatalf("blocks: %v", g.blocks)
	}
	updates, _ := g.tick(w, powerMidnight, time.Now(), 1)
	if len(updates) != 1 || w[[3]int{1, 0, 0}] != "light_bulb:on" {
		t.Fatalf("not lit: %+v", updates)
	}
	// Known ones are left as they are.
	before := g.blocks[powerPos{1, 0, 0}]
	powerAdoptOldBulbs(g, w, found)
	if g.blocks[powerPos{1, 0, 0}] != before {
		t.Fatal("re-registered")
	}
}

func TestBulbsAreSaved(t *testing.T) {
	powerMu.Lock()
	saved := grid
	grid = newPowerGrid()
	grid.track(1, 2, 3, "light_bulb:on")
	powerMu.Unlock()
	defer func() {
		powerMu.Lock()
		grid = saved
		powerMu.Unlock()
	}()
	snapshot := snapshotPower()
	loadPower(snapshot)
	powerMu.Lock()
	defer powerMu.Unlock()
	if b := grid.blocks[powerPos{1, 2, 3}]; b == nil || b.Kind != "light_bulb" {
		t.Fatalf("lost: %+v", grid.blocks)
	}
}
