package network

import (
	"testing"
	"time"
)

const logicStep = 200 * time.Millisecond

// logicRun ticks the grid n times from *now (advancing it), like runPowerGrid.
func logicRun(g *powerGrid, w fakeCropWorld, env powerEnvironment, now *time.Time, n int) {
	for i := 0; i < n; i++ {
		*now = now.Add(logicStep)
		g.tick(w, env, *now, logicStep.Seconds())
	}
}

func TestLogicNames(t *testing.T) {
	cases := map[string]string{
		"lever": "lever", "lever:on": "lever:on", "lever:off": "lever", "and_gate:e:on": "and_gate:e:on",
		"and_gate:n:off": "and_gate", "delay_gate:n:3:off": "delay_gate:n:3:off", "daylight_sensor:night:off": "daylight_sensor:night:off",
	}
	for name, want := range cases {
		block, ok := logicParse(name)
		if !ok || block.String() != want {
			t.Errorf("logicParse(%q) = %q, %v; want %q", name, block.String(), ok, want)
		}
	}
	for _, bad := range []string{"and_gate:x:on", "lever:on:on", "stone", "delay_gate:n:9:on"} {
		if _, ok := logicParse(bad); ok {
			t.Errorf("logicParse(%q) should fail", bad)
		}
	}
	if powerKindOf("and_gate:e:on") != "and_gate" || powerKinds["lever"].Role != powerLogic {
		t.Fatal("logic blocks are electric blocks with the logic role")
	}
	block, _ := logicParse("latch:w:on")
	if got := block.with("power", "off").String(); got != "latch:w:off" {
		t.Fatalf("with: %q", got)
	}
}

func TestLogicFaces(t *testing.T) {
	// Looking north (-z): the right hand is east (+x).
	if logicFace("n", "right") != (powerPos{1, 0, 0}) || logicFace("n", "left") != (powerPos{-1, 0, 0}) || logicFace("n", "back") != (powerPos{0, 0, 1}) {
		t.Fatal("faces of a gate facing north")
	}
	if logicFace("e", "right") != (powerPos{0, 0, 1}) || logicFace("s", "front") != (powerPos{0, 0, 1}) || logicFace("w", "left") != (powerPos{0, 0, 1}) {
		t.Fatal("faces of rotated gates")
	}
}

func TestLogicLeverSwitchesALamp(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "battery_block", {1, 0, 0}: "lever", {2, 0, 0}: "electric_lamp"})
	g.blocks[powerPos{0, 0, 0}].Energy = 3000
	now := time.Unix(1000, 0)
	logicRun(g, w, powerMidnight, &now, 2)
	if w[[3]int{2, 0, 0}] != "electric_lamp" {
		t.Fatal("an open lever cuts the lamp off the battery")
	}
	if g.netOf[powerPos{0, 0, 0}] == g.netOf[powerPos{2, 0, 0}] {
		t.Fatal("an open lever splits the network")
	}
	for round := 0; round < 3; round++ {
		if _, ok := g.press(w, 1, 0, 0, now); !ok || w[[3]int{1, 0, 0}] != "lever:on" {
			t.Fatalf("pressing switches the lever on: %q", w[[3]int{1, 0, 0}])
		}
		logicRun(g, w, powerMidnight, &now, 1)
		if w[[3]int{2, 0, 0}] != "electric_lamp:on" {
			t.Fatalf("round %d: a closed lever lights the lamp at once", round)
		}
		g.press(w, 1, 0, 0, now)
		logicRun(g, w, powerMidnight, &now, 1)
		if w[[3]int{2, 0, 0}] != "electric_lamp" || w[[3]int{1, 0, 0}] != "lever" {
			t.Fatalf("round %d: switching off puts the lamp out", round)
		}
	}
}

// A gate facing north at the origin: left input at x-1, right input at x+1, power behind
// it (z+1) and a lamp in front (z-1).
func logicGateRig(gate string) (*powerGrid, fakeCropWorld) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{
		{0, 0, 0}: gate, {-1, 0, 0}: "lever", {1, 0, 0}: "lever", {0, 0, 1}: "battery_block", {0, 0, -1}: "electric_lamp",
	})
	g.blocks[powerPos{0, 0, 1}].Energy = 3000
	return g, w
}

func TestLogicTwoInputGates(t *testing.T) {
	table := map[string][4]bool{ // outputs for inputs 00, 01, 10, 11
		"and_gate": {false, false, false, true},
		"or_gate":  {false, true, true, true},
		"xor_gate": {false, true, true, false},
	}
	for gate, want := range table {
		for i, expected := range want {
			g, w := logicGateRig(gate)
			now := time.Unix(1000, 0)
			if i&2 != 0 {
				g.press(w, -1, 0, 0, now)
			}
			if i&1 != 0 {
				g.press(w, 1, 0, 0, now)
			}
			logicRun(g, w, powerMidnight, &now, 3)
			gateOn := w[[3]int{0, 0, 0}] == gate+":n:on"
			lampOn := w[[3]int{0, 0, -1}] == "electric_lamp:on"
			if gateOn != expected || lampOn != expected {
				t.Errorf("%s inputs %02b: gate %q lamp %q, want on=%v", gate, i, w[[3]int{0, 0, 0}], w[[3]int{0, 0, -1}], expected)
			}
			// The inputs never conduct: the levers stay apart from the gate's network.
			if g.netOf[powerPos{-1, 0, 0}] == g.netOf[powerPos{0, 0, 0}] {
				t.Errorf("%s: an input face must not conduct", gate)
			}
		}
	}
}

func TestLogicSignalFromPower(t *testing.T) {
	// An input fed by a wire with a charged battery is on; a dead battery gives no signal.
	for _, energy := range []float64{3000, 0} {
		w := fakeCropWorld{}
		g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "not_gate", {0, 0, 1}: "copper_wire", {0, 0, 2}: "battery_block"})
		g.blocks[powerPos{0, 0, 2}].Energy = energy
		now := time.Unix(1000, 0)
		logicRun(g, w, powerMidnight, &now, 3)
		if on := w[[3]int{0, 0, 0}] == "not_gate:n:on"; on != (energy == 0) {
			t.Errorf("battery %v J: NOT gate is %q", energy, w[[3]int{0, 0, 0}])
		}
	}
}

func TestLogicNotOscillatorIsBounded(t *testing.T) {
	// A NOT gate whose front is wired back to its input flips every tick, no faster.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{
		{0, 0, 0}: "not_gate", {0, 0, -1}: "copper_wire", {-1, 0, -1}: "copper_wire", {-2, 0, -1}: "copper_wire",
		{-2, 0, 0}: "copper_wire", {-2, 0, 1}: "copper_wire", {-1, 0, 1}: "copper_wire", {0, 0, 1}: "copper_wire",
	})
	now := time.Unix(1000, 0)
	var states []bool
	for i := 0; i < 8; i++ {
		logicRun(g, w, powerMidnight, &now, 1)
		states = append(states, w[[3]int{0, 0, 0}] == "not_gate:n:on")
	}
	for i := 1; i < len(states); i++ {
		if states[i] == states[i-1] {
			t.Fatalf("the oscillator should flip every tick: %v", states)
		}
	}
}

func TestLogicDelay(t *testing.T) {
	// Lever behind a 1 s delay facing north.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "delay_gate", {0, 0, 1}: "lever"})
	now := time.Unix(1000, 0)
	logicRun(g, w, powerMidnight, &now, 1)
	g.press(w, 0, 0, 1, now)
	logicRun(g, w, powerMidnight, &now, 2)
	if w[[3]int{0, 0, 0}] != "delay_gate" {
		t.Fatal("the delay waits")
	}
	logicRun(g, w, powerMidnight, &now, 5)
	if w[[3]int{0, 0, 0}] != "delay_gate:n:1:on" {
		t.Fatalf("after a second the delay is on: %q", w[[3]int{0, 0, 0}])
	}
	// Right click changes the delay: 1 -> 2 s.
	if update, ok := g.press(w, 0, 0, 0, now); !ok || update.BlockType != "delay_gate:n:2:on" {
		t.Fatalf("pressing a delay changes it: %+v", update)
	}
	g.press(w, 0, 0, 1, now)
	logicRun(g, w, powerMidnight, &now, 8)
	if w[[3]int{0, 0, 0}] != "delay_gate:n:2:on" {
		t.Fatal("2 s delay: still on after 1.6 s")
	}
	logicRun(g, w, powerMidnight, &now, 3)
	if w[[3]int{0, 0, 0}] != "delay_gate:n:2:off" {
		t.Fatalf("2 s delay: off after 2.2 s: %q", w[[3]int{0, 0, 0}])
	}
}

func TestLogicLatchRemembers(t *testing.T) {
	g, w := logicGateRig("latch")
	now := time.Unix(1000, 0)
	g.press(w, -1, 0, 0, now) // SET on
	logicRun(g, w, powerMidnight, &now, 2)
	g.press(w, -1, 0, 0, now) // SET off again
	logicRun(g, w, powerMidnight, &now, 3)
	if w[[3]int{0, 0, 0}] != "latch:n:on" || w[[3]int{0, 0, -1}] != "electric_lamp:on" {
		t.Fatalf("the latch remembers SET: %q", w[[3]int{0, 0, 0}])
	}
	g.press(w, 1, 0, 0, now) // RESET
	logicRun(g, w, powerMidnight, &now, 3)
	if w[[3]int{0, 0, 0}] != "latch" || w[[3]int{0, 0, -1}] != "electric_lamp" {
		t.Fatalf("RESET clears it: %q", w[[3]int{0, 0, 0}])
	}
}

func TestLogicButton(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "push_button"})
	now := time.Unix(1000, 0)
	if _, ok := g.press(w, 0, 0, 0, now); !ok || w[[3]int{0, 0, 0}] != "push_button:on" {
		t.Fatal("a pressed button is on")
	}
	logicRun(g, w, powerMidnight, &now, 6)
	if w[[3]int{0, 0, 0}] != "push_button:on" {
		t.Fatal("still on after 1.2 s")
	}
	logicRun(g, w, powerMidnight, &now, 2)
	if w[[3]int{0, 0, 0}] != "push_button" {
		t.Fatal("off after 1.6 s")
	}
}

func TestLogicPlateAndProximity(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "pressure_plate", {10, 0, 0}: "proximity_sensor"})
	now := time.Unix(1000, 0)
	env := powerMidnight
	env.Players = [][3]float64{{0.5, 1.62, 0.5}}
	logicRun(g, w, env, &now, 1)
	if w[[3]int{0, 0, 0}] != "pressure_plate:on" || w[[3]int{10, 0, 0}] != "proximity_sensor" {
		t.Fatalf("standing on the plate, far from the sensor: %v", w)
	}
	env.Players = [][3]float64{{7, 1.62, 0.5}}
	logicRun(g, w, env, &now, 1)
	if w[[3]int{0, 0, 0}] != "pressure_plate" || w[[3]int{10, 0, 0}] != "proximity_sensor:on" {
		t.Fatalf("off the plate, near the sensor: %v", w)
	}
}

func TestLogicWeatherSensors(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "daylight_sensor", {2, 0, 0}: "daylight_sensor", {4, 0, 0}: "rain_sensor"})
	now := time.Unix(1000, 0)
	if update, ok := g.press(w, 2, 0, 0, now); !ok || update.BlockType != "daylight_sensor:night:off" {
		t.Fatalf("right click switches to night mode: %+v", update)
	}
	logicRun(g, w, powerNoon, &now, 1)
	if w[[3]int{0, 0, 0}] != "daylight_sensor:day:on" || w[[3]int{2, 0, 0}] != "daylight_sensor:night:off" || w[[3]int{4, 0, 0}] != "rain_sensor" {
		t.Fatalf("noon, dry: %v", w)
	}
	rainyNight := powerMidnight
	rainyNight.Rain = 1
	logicRun(g, w, rainyNight, &now, 1)
	if w[[3]int{0, 0, 0}] != "daylight_sensor" || w[[3]int{2, 0, 0}] != "daylight_sensor:night:on" || w[[3]int{4, 0, 0}] != "rain_sensor:on" {
		t.Fatalf("rainy midnight: %v", w)
	}
}

func TestLogicStaircaseLight(t *testing.T) {
	// Two levers into an XOR: either lever toggles the light.
	g, w := logicGateRig("xor_gate")
	now := time.Unix(1000, 0)
	lamp := func() bool { return w[[3]int{0, 0, -1}] == "electric_lamp:on" }
	steps := []struct {
		x    int
		want bool
	}{{-1, true}, {1, false}, {-1, true}, {1, false}}
	for i, step := range steps {
		g.press(w, step.x, 0, 0, now)
		logicRun(g, w, powerMidnight, &now, 3)
		if lamp() != step.want {
			t.Fatalf("step %d: lamp %v, want %v", i, lamp(), step.want)
		}
	}
}

func TestLogicFollowsSavedNames(t *testing.T) {
	// After a restart the chunk store holds the truth: a lever saved on in the chunk is on.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 0, 0}: "battery_block", {1, 0, 0}: "lever", {2, 0, 0}: "electric_lamp"})
	g.blocks[powerPos{0, 0, 0}].Energy = 3000
	w.SetBlock(1, 0, 0, "lever:on")
	now := time.Unix(1000, 0)
	logicRun(g, w, powerMidnight, &now, 1)
	if w[[3]int{2, 0, 0}] != "electric_lamp:on" {
		t.Fatal("the lever from the chunk closes the circuit")
	}
}

func TestLogicBlinker(t *testing.T) {
	// Page 210: a NOT gate (facing east) and a 1 s delay right after it, with a wire from the
	// delay's output back round to the NOT's input: about 1.2 s on, 1.2 s off.
	blocks := map[powerPos]string{{0, 0, 0}: "not_gate:e:off", {1, 0, 0}: "delay_gate:e:1:off"}
	for _, p := range []powerPos{{2, 0, 0}, {2, 0, 1}, {2, 0, 2}, {1, 0, 2}, {0, 0, 2}, {-1, 0, 2}, {-1, 0, 1}, {-1, 0, 0}} {
		blocks[p] = "copper_wire"
	}
	w := fakeCropWorld{}
	g := newTestGrid(w, blocks)
	now := time.Unix(1000, 0)
	var flips []int
	last := false
	for i := 0; i < 60; i++ {
		logicRun(g, w, powerMidnight, &now, 1)
		on := w[[3]int{0, 0, 0}] == "not_gate:e:on"
		if on != last {
			flips = append(flips, i)
			last = on
		}
	}
	if len(flips) < 5 {
		t.Fatalf("the blinker should keep blinking: flips at ticks %v", flips)
	}
	for i := 2; i < len(flips); i++ {
		if gap := flips[i] - flips[i-1]; gap < 5 || gap > 8 {
			t.Fatalf("each half period should be about 1.2 s (6 ticks): flips at ticks %v", flips)
		}
	}
}

// The example circuits of guide page 211.

func TestLogicExampleNightLights(t *testing.T) {
	// Panel + battery | daylight sensor in night mode | lamp.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{
		{0, 0, 0}: "solar_panel", {1, 0, 0}: "battery_block", {2, 0, 0}: "daylight_sensor:night:off", {3, 0, 0}: "electric_lamp",
	})
	g.blocks[powerPos{1, 0, 0}].Energy = 1000
	now := time.Unix(1000, 0)
	logicRun(g, w, powerNoon, &now, 3)
	if w[[3]int{3, 0, 0}] != "electric_lamp" {
		t.Fatal("by day the lamp is off")
	}
	logicRun(g, w, powerMidnight, &now, 3)
	if w[[3]int{3, 0, 0}] != "electric_lamp:on" {
		t.Fatal("at night the lamp is on")
	}
}

func TestLogicExampleDoorWithDelay(t *testing.T) {
	// Top view (x -2..2, z -2..3), all on one level:
	//   z=-2  . . door . .
	//   z=-1  . . motor . .
	//   z= 0  W P OR D W      D is a delay pointing west, into the OR's right input
	//   z= 1  W . bat . W
	//   z= 2  W . . . W
	//   z= 3  W W W W W
	blocks := map[powerPos]string{
		{0, 0, -1}: "electric_motor", {-1, 0, 0}: "pressure_plate", {0, 0, 0}: "or_gate", {1, 0, 0}: "delay_gate:w:2:off",
		{0, 0, 1}: "battery_block",
	}
	for z := 0; z <= 3; z++ {
		blocks[powerPos{-2, 0, z}] = "copper_wire"
		blocks[powerPos{2, 0, z}] = "copper_wire"
	}
	for x := -1; x <= 1; x++ {
		blocks[powerPos{x, 0, 3}] = "copper_wire"
	}
	w := fakeCropWorld{}
	g := newTestGrid(w, blocks)
	w.SetBlock(0, 0, -2, "iron_door")
	g.blocks[powerPos{0, 0, 1}].Energy = 3000
	now := time.Unix(1000, 0)
	env := powerMidnight
	logicRun(g, w, env, &now, 3)
	if w[[3]int{0, 0, -2}] != "iron_door" {
		t.Fatal("nobody on the plate: closed")
	}
	env.Players = [][3]float64{{-0.5, 1.62, 0.5}}
	logicRun(g, w, env, &now, 3)
	if w[[3]int{0, 0, -2}] != "iron_door:lower:n:left:open" {
		t.Fatalf("stepping on the plate opens the door at once: %q", w[[3]int{0, 0, -2}])
	}
	logicRun(g, w, env, &now, 15) // stay 3 s: the delay is on by now
	env.Players = nil
	logicRun(g, w, env, &now, 5) // 1 s after leaving
	if w[[3]int{0, 0, -2}] != "iron_door:lower:n:left:open" {
		t.Fatal("the door stays open a while after you leave")
	}
	logicRun(g, w, env, &now, 10) // 3 s after leaving
	if w[[3]int{0, 0, -2}] != "iron_door" {
		t.Fatalf("and then closes: %q", w[[3]int{0, 0, -2}])
	}
}

func TestLogicExampleAlarm(t *testing.T) {
	// A proximity sensor and an "armed" lever into an AND gate: the lamp lights only when
	// the alarm is armed and someone comes near.
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{
		{0, 0, 0}: "and_gate", {-1, 0, 0}: "proximity_sensor", {1, 0, 0}: "lever", {0, 0, 1}: "battery_block", {0, 0, -1}: "electric_lamp",
	})
	g.blocks[powerPos{0, 0, 1}].Energy = 3000
	now := time.Unix(1000, 0)
	near := powerMidnight
	near.Players = [][3]float64{{-3, 1.62, 0}}
	logicRun(g, w, near, &now, 3)
	if w[[3]int{0, 0, -1}] != "electric_lamp" {
		t.Fatal("not armed: no alarm")
	}
	g.press(w, 1, 0, 0, now)
	logicRun(g, w, powerMidnight, &now, 3)
	if w[[3]int{0, 0, -1}] != "electric_lamp" {
		t.Fatal("armed, nobody near: no alarm")
	}
	logicRun(g, w, near, &now, 3)
	if w[[3]int{0, 0, -1}] != "electric_lamp:on" {
		t.Fatal("armed and someone near: alarm")
	}
}
