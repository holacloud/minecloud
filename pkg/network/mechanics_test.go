package network

import (
	"testing"
	"time"
)

// mechRun ticks the grid n times from *now, turning the hand crank at *crank (100 W) each tick
// when there is one.
func mechRun(g *powerGrid, w fakeCropWorld, crank *powerPos, now *time.Time, n int) {
	for i := 0; i < n; i++ {
		*now = now.Add(logicStep)
		if crank != nil {
			g.crankTurn((*crank)[0], (*crank)[1], (*crank)[2], *now)
		}
		g.tick(w, powerMidnight, *now, logicStep.Seconds())
	}
}

func TestRamNames(t *testing.T) {
	cases := map[string]string{
		"motor_ram": "motor_ram", "motor_ram:n:in": "motor_ram", "motor_ram:e:out": "motor_ram:e:out",
		"sticky_ram:u:in": "sticky_ram:u:in", "sticky_ram:d:out": "sticky_ram:d:out",
	}
	for name, want := range cases {
		ram, ok := ramParse(name)
		if !ok || ram.String() != want {
			t.Errorf("ramParse(%q) = %q, %v; want %q", name, ram.String(), ok, want)
		}
	}
	for _, bad := range []string{"motor_ram:x:in", "motor_ram:e", "motor_ram:e:half", "stone", "ram_arm:e:plain"} {
		if _, ok := ramParse(bad); ok {
			t.Errorf("ramParse(%q) should fail", bad)
		}
	}
	if powerKindOf("motor_ram:e:out") != "motor_ram" || powerKinds["lift_winch"].Role != powerConsumer {
		t.Fatal("rams and winches are electric consumers")
	}
	if f, ok := ramArmFacing(ramArmName("u", true)); !ok || f != "u" {
		t.Fatal("arm names")
	}
}

func TestMechMovable(t *testing.T) {
	for _, name := range []string{"stone", "oak_planks", "glass", "oak_stairs:e:bottom", "iron_trapdoor"} {
		if !mechMovable(name) {
			t.Errorf("%s should move", name)
		}
	}
	for _, name := range []string{"air", "water", "bedrock", "copper_wire", "lever:on", "motor_ram", "ram_arm:e:plain",
		"lift_platform", "oak_door:upper:n:left:open", "wheat_3", "farmland", "sign", "tall_grass"} {
		if mechMovable(name) {
			t.Errorf("%s should not move", name)
		}
	}
}

// A crank powering a ram facing east at (0,0,0), with blocks in front.
func newRamWorld(ram string, front ...string) (fakeCropWorld, *powerGrid, powerPos) {
	w := fakeCropWorld{}
	blocks := map[powerPos]string{{0, 0, 1}: "hand_crank", {0, 0, 0}: ram}
	g := newTestGrid(w, blocks)
	for i, name := range front {
		w.SetBlock(1+i, 0, 0, name)
	}
	return w, g, powerPos{0, 0, 1}
}

func TestRamPushesAndRetracts(t *testing.T) {
	w, g, crank := newRamWorld("motor_ram:e:in", "stone", "dirt", "glass")
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 1)
	want := map[int]string{0: "motor_ram:e:out", 1: "ram_arm:e:plain", 2: "stone", 3: "dirt", 4: "glass"}
	for x, name := range want {
		if w[[3]int{x, 0, 0}] != name {
			t.Fatalf("x=%d: got %q, want %q", x, w[[3]int{x, 0, 0}], name)
		}
	}
	events := g.mechanicsDrain()
	if len(events) != 1 || events[0].Kind != "push" || events[0].Dir != [3]int{1, 0, 0} || len(events[0].Moved) != 3 || len(events[0].Filled) != 4 {
		t.Fatalf("push event: %+v", events)
	}
	// Powered and out: nothing more happens.
	mechRun(g, w, &crank, &now, 3)
	if name, _ := w.Block(5, 0, 0); name != "air" {
		t.Fatal("an extended ram pushes only once")
	}
	// The crank stops (it was wound 12 s ahead): the arm goes back in, the blocks stay.
	mechRun(g, w, nil, &now, 70)
	if w[[3]int{0, 0, 0}] != "motor_ram:e:in" || w[[3]int{1, 0, 0}] != "air" || w[[3]int{2, 0, 0}] != "stone" {
		t.Fatalf("retract: %q %q %q", w[[3]int{0, 0, 0}], w[[3]int{1, 0, 0}], w[[3]int{2, 0, 0}])
	}
}

func TestStickyRamPullsBack(t *testing.T) {
	w, g, crank := newRamWorld("sticky_ram:e:in", "stone")
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 1)
	if w[[3]int{1, 0, 0}] != "ram_arm:e:sticky" || w[[3]int{2, 0, 0}] != "stone" {
		t.Fatal("the sticky ram pushes like the plain one")
	}
	g.mechanicsDrain()
	mechRun(g, w, nil, &now, 70)
	if w[[3]int{1, 0, 0}] != "stone" || w[[3]int{2, 0, 0}] != "air" || w[[3]int{0, 0, 0}] != "sticky_ram:e:in" {
		t.Fatalf("pull: %q %q", w[[3]int{1, 0, 0}], w[[3]int{2, 0, 0}])
	}
	events := g.mechanicsDrain()
	if len(events) != 1 || events[0].Kind != "pull" || events[0].Dir != [3]int{-1, 0, 0} {
		t.Fatalf("pull event: %+v", events)
	}
}

func TestRamBlocked(t *testing.T) {
	// Bedrock, a door and a wire stop the push; so does a line longer than ramMaxPush.
	for _, blocker := range []string{"bedrock", "oak_door", "copper_wire"} {
		w, g, crank := newRamWorld("motor_ram:e:in", "stone", blocker)
		now := time.Unix(1000, 0)
		mechRun(g, w, &crank, &now, 2)
		if w[[3]int{0, 0, 0}] != "motor_ram:e:in" || w[[3]int{1, 0, 0}] != "stone" {
			t.Errorf("%s should stop the ram", blocker)
		}
	}
	long := make([]string, ramMaxPush+1)
	for i := range long {
		long[i] = "stone"
	}
	w, g, crank := newRamWorld("motor_ram:e:in", long...)
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 2)
	if w[[3]int{0, 0, 0}] != "motor_ram:e:in" {
		t.Error("13 blocks are too many")
	}
	// Exactly ramMaxPush is fine, and the line may end in water (which is gone).
	w, g, crank = newRamWorld("motor_ram:e:in", append(long[:ramMaxPush], "water")...)
	mechRun(g, w, &crank, &now, 2)
	if w[[3]int{0, 0, 0}] != "motor_ram:e:out" || w[[3]int{ramMaxPush + 1, 0, 0}] != "stone" {
		t.Error("12 blocks move, into the water")
	}
}

func TestRamUpStopsAtTheTopOfTheWorld(t *testing.T) {
	w := fakeCropWorld{}
	top := 239 // WorldMaxY
	g := newTestGrid(w, map[powerPos]string{{0, top - 1, 1}: "hand_crank", {0, top - 1, 0}: "motor_ram:u:in"})
	w.SetBlock(0, top, 0, "stone")
	crank := powerPos{0, top - 1, 1}
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 2)
	if w[[3]int{0, top - 1, 0}] != "motor_ram:u:in" {
		t.Fatal("nothing is pushed out of the world")
	}
}

func TestBrokenRamTakesItsArm(t *testing.T) {
	w, g, crank := newRamWorld("motor_ram:e:in", "stone")
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 1)
	w.SetBlock(0, 0, 0, "air")
	g.track(0, 0, 0, "air")
	mechRun(g, w, &crank, &now, 1)
	if w[[3]int{1, 0, 0}] != "air" || w[[3]int{2, 0, 0}] != "stone" {
		t.Fatalf("the arm of a broken ram goes: %q", w[[3]int{1, 0, 0}])
	}
}

// A winch at y=10 with a crank, the platform on the ground at y=0.
func newLiftWorld() (fakeCropWorld, *powerGrid, powerPos) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{{0, 10, 0}: "lift_winch", {1, 10, 0}: "hand_crank"})
	w.SetBlock(0, -1, 0, "stone")
	w.SetBlock(0, 0, 0, "lift_platform")
	return w, g, powerPos{1, 10, 0}
}

func liftHeight(w fakeCropWorld) int {
	found := -100
	for p, name := range w {
		if name == "lift_platform" {
			found = p[1]
		}
	}
	return found
}

func TestLiftGoesUpAndDown(t *testing.T) {
	w, g, crank := newLiftWorld()
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 1)
	if liftHeight(w) != 1 {
		t.Fatalf("one block up at once, got %d", liftHeight(w))
	}
	events := g.mechanicsDrain()
	if len(events) != 1 || events[0].Kind != "lift" || events[0].Dir != [3]int{0, 1, 0} {
		t.Fatalf("lift event: %+v", events)
	}
	// 2.5 blocks a second: one step every two ticks, up to two blocks below the winch.
	mechRun(g, w, &crank, &now, 4)
	if liftHeight(w) != 3 {
		t.Fatalf("after 1 s: got %d, want 3", liftHeight(w))
	}
	mechRun(g, w, &crank, &now, 40)
	if liftHeight(w) != 7 {
		t.Fatalf("top stop: got %d, want 7 (winch at 10)", liftHeight(w))
	}
	// Without power (once the crank runs down) it comes down to the ground, but not onto a
	// player standing in the shaft.
	env := powerMidnight
	env.Players = [][3]float64{{0.5, 4 + 1.62, 0.5}} // feet at y=4, head in the cell y=5
	for i := 0; i < 80; i++ {
		now = now.Add(logicStep)
		g.tick(w, env, now, logicStep.Seconds())
	}
	if liftHeight(w) != 6 {
		t.Fatalf("stops above the player: got %d, want 6", liftHeight(w))
	}
	mechRun(g, w, nil, &now, 40)
	if liftHeight(w) != 0 {
		t.Fatalf("rests on the ground: got %d", liftHeight(w))
	}
}

func TestLiftNeedsAClearRope(t *testing.T) {
	w, g, crank := newLiftWorld()
	w.SetBlock(0, 5, 0, "stone")
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 10)
	if liftHeight(w) != 0 {
		t.Fatal("a block in the shaft cuts the rope: the platform stays")
	}
}

// A shaft of 20 with a winch at y = 21 on its own rtg, the platform on the ground and stops in the
// wall over its floors: a stop at y holds the platform at y - 3.
func newStopWorld(stops ...int) (fakeCropWorld, *powerGrid, *time.Time) {
	w := fakeCropWorld{}
	blocks := map[powerPos]string{{0, 21, 0}: "lift_winch", {0, 21, 1}: "rtg"}
	for _, y := range stops {
		blocks[powerPos{1, y, 0}] = "lift_stop"
	}
	g := newTestGrid(w, blocks)
	w.SetBlock(0, -1, 0, "stone")
	w.SetBlock(0, 0, 0, "lift_platform")
	now := time.Unix(1000, 0)
	return w, g, &now
}

func stopPress(t *testing.T, g *powerGrid, w fakeCropWorld, y int, now time.Time) {
	t.Helper()
	if _, ok := g.press(w, 1, y, 0, now); !ok {
		t.Fatalf("the stop at %d did not change on a press", y)
	}
}

// stopTravel ticks until the platform has stayed at y for 2 s, checking it never goes away from y.
func stopTravel(t *testing.T, g *powerGrid, w fakeCropWorld, env powerEnvironment, now *time.Time, y int) {
	t.Helper()
	last := liftHeight(w)
	for i := 0; i < 400; i++ {
		*now = now.Add(logicStep)
		g.tick(w, env, *now, logicStep.Seconds())
		h := liftHeight(w)
		if (y-h)*(y-h) > (y-last)*(y-last) {
			t.Fatalf("going away from %d: %d, then %d", y, last, h)
		}
		last = h
	}
	if last != y {
		t.Fatalf("the platform is at %d, not %d", last, y)
	}
}

func TestStopNames(t *testing.T) {
	for name, want := range map[string]string{
		"lift_stop": "lift_stop", "lift_stop:free:off": "lift_stop", "lift_stop:called:off": "lift_stop:called:off", "lift_stop:free:on": "lift_stop:free:on",
	} {
		block, ok := logicParse(name)
		if !ok || block.String() != want {
			t.Errorf("logicParse(%q) = %q, %v; want %q", name, block.String(), ok, want)
		}
	}
	if powerKinds["lift_stop"].Role != powerLogic {
		t.Fatal("a stop is a logic block")
	}
	if mechMovable("lift_stop") || mechMovable("lift_stop:called:on") || mechMovable("lift_platform") {
		t.Fatal("rams do not move stops or platforms")
	}
}

func TestStopCallsTheLiftUpAndDown(t *testing.T) {
	w, g, now := newStopWorld(5, 10, 15)
	env := powerMidnight
	// Nothing called: with stops, a powered winch holds it where it is.
	mechRun(g, w, nil, now, 20)
	if liftHeight(w) != 0 {
		t.Fatalf("no stop called: it went to %d", liftHeight(w))
	}
	// Below the stop: up. It holds, not going on to the top.
	stopPress(t, g, w, 10, *now)
	stopTravel(t, g, w, env, now, 7)
	// Above the stop: down, with the winch powered all the time.
	stopPress(t, g, w, 5, *now)
	if b := g.netOf[powerPos{0, 21, 0}]; b == nil || !b.powered {
		t.Fatal("the winch has power")
	}
	stopTravel(t, g, w, env, now, 2)
	// Already there: nothing moves, and no event.
	g.mechanicsDrain()
	g.press(w, 1, 5, 0, *now)
	mechRun(g, w, nil, now, 10)
	if liftHeight(w) != 2 || len(g.mechanicsDrain()) != 0 {
		t.Fatalf("already there: %d", liftHeight(w))
	}
	// Up once more, past a stop that is not called.
	stopPress(t, g, w, 15, *now)
	stopTravel(t, g, w, env, now, 12)
	if w[[3]int{1, 10, 0}] != "lift_stop" || w[[3]int{1, 5, 0}] != "lift_stop" || w[[3]int{1, 15, 0}] != "lift_stop:called:on" {
		t.Fatalf("the stops: %q %q %q", w[[3]int{1, 5, 0}], w[[3]int{1, 10, 0}], w[[3]int{1, 15, 0}])
	}
}

func TestStopChangesItsMindMidWay(t *testing.T) {
	w, g, now := newStopWorld(5, 18)
	stopPress(t, g, w, 18, *now)
	mechRun(g, w, nil, now, 10)
	if h := liftHeight(w); h < 4 || h > 7 {
		t.Fatalf("on its way: %d", h)
	}
	// The last call wins, and the platform turns round at once.
	stopPress(t, g, w, 5, *now)
	mechRun(g, w, nil, now, 1)
	stopTravel(t, g, w, powerMidnight, now, 2)
	if w[[3]int{1, 18, 0}] != "lift_stop" {
		t.Fatalf("the first call was not freed: %q", w[[3]int{1, 18, 0}])
	}
}

// Without power the stops do not count: down as ever, onto what it rests on; back when it returns.
func TestStopPowerFails(t *testing.T) {
	w, g, now := newStopWorld(10, 15)
	stopPress(t, g, w, 15, *now)
	mechRun(g, w, nil, now, 60)
	if liftHeight(w) != 12 {
		t.Fatalf("called: %d", liftHeight(w))
	}
	// Held, then the rtg is broken: down past every stop, to the ground, and it stays called.
	w.SetBlock(0, 21, 1, "air")
	g.track(0, 21, 1, "air")
	mechRun(g, w, nil, now, 60)
	if liftHeight(w) != 0 {
		t.Fatalf("no power: at %d", liftHeight(w))
	}
	if w[[3]int{1, 15, 0}] != "lift_stop:called:off" {
		t.Fatalf("the call is kept: %q", w[[3]int{1, 15, 0}])
	}
	// Failing mid-way down, it rests on a block.
	w.SetBlock(0, 21, 1, "rtg")
	g.track(0, 21, 1, "rtg")
	mechRun(g, w, nil, now, 60)
	if liftHeight(w) != 12 {
		t.Fatalf("power back: to the stop called, got %d", liftHeight(w))
	}
	w.SetBlock(0, 5, 0, "stone")
	w.SetBlock(0, 21, 1, "air")
	g.track(0, 21, 1, "air")
	mechRun(g, w, nil, now, 60)
	if liftHeight(w) != 6 {
		t.Fatalf("resting on a block: at %d", liftHeight(w))
	}
}

func TestStopLeavesLiftsWithoutStopsAlone(t *testing.T) {
	// The same run as TestLiftGoesUpAndDown's first part, with a stop far from the shaft: nothing changes.
	w, g, crank := newLiftWorld()
	w.SetBlock(3, 5, 3, "lift_stop")
	g.track(3, 5, 3, "lift_stop")
	now := time.Unix(1000, 0)
	mechRun(g, w, &crank, &now, 45)
	if liftHeight(w) != 7 {
		t.Fatalf("to the top: got %d", liftHeight(w))
	}
	mechRun(g, w, nil, &now, 100)
	if liftHeight(w) != 0 {
		t.Fatalf("to the ground: got %d", liftHeight(w))
	}
}

func TestStopPlayersAndBlocks(t *testing.T) {
	w, g, now := newStopWorld(5, 15)
	stopPress(t, g, w, 15, *now)
	// A rider standing on the platform goes up with it (the client moves the rider).
	rider := powerMidnight
	rider.Players = [][3]float64{{0.5, 1 + 1.62, 0.5}}
	stopTravel(t, g, w, rider, now, 12)
	// And comes down with it, the rider's own feet being over the platform.
	rider.Players = [][3]float64{{0.5, 13 + 1.62, 0.5}}
	stopPress(t, g, w, 5, *now)
	for i := 0; i < 80 && liftHeight(w) > 2; i++ {
		*now = now.Add(logicStep)
		g.tick(w, rider, *now, logicStep.Seconds())
		rider.Players[0][1] = float64(liftHeight(w)+1) + 1.62
	}
	if liftHeight(w) != 2 {
		t.Fatalf("with a rider, at %d", liftHeight(w))
	}
	// Called up and back: a player in the shaft below stops it coming down, and it goes on after.
	stopPress(t, g, w, 15, *now)
	stopTravel(t, g, w, powerMidnight, now, 12)
	stopPress(t, g, w, 5, *now)
	below := powerMidnight
	below.Players = [][3]float64{{0.5, 6 + 1.62, 0.5}} // feet at 6, head in the cell 7
	for i := 0; i < 80; i++ {
		*now = now.Add(logicStep)
		g.tick(w, below, *now, logicStep.Seconds())
	}
	if liftHeight(w) != 8 {
		t.Fatalf("over the player: at %d", liftHeight(w))
	}
	stopTravel(t, g, w, powerMidnight, now, 2)
	// A block over the platform cuts the rope: it stays, called, and goes on when it is taken away.
	w.SetBlock(0, 8, 0, "stone")
	stopPress(t, g, w, 15, *now)
	mechRun(g, w, nil, now, 40)
	if liftHeight(w) != 2 {
		t.Fatalf("a block in the shaft: at %d", liftHeight(w))
	}
	w.SetBlock(0, 8, 0, "air")
	stopTravel(t, g, w, powerMidnight, now, 12)
	// A block under it, coming down: it rests there, and goes on when it is gone.
	w.SetBlock(0, 6, 0, "stone")
	stopPress(t, g, w, 5, *now)
	mechRun(g, w, nil, now, 40)
	if liftHeight(w) != 7 {
		t.Fatalf("on a block in the shaft: at %d", liftHeight(w))
	}
	w.SetBlock(0, 6, 0, "air")
	stopTravel(t, g, w, powerMidnight, now, 2)
}

func TestStopTopLimit(t *testing.T) {
	// At the winch's own height: the platform holds at the top limit, 3 below both.
	w, g, now := newStopWorld(21)
	stopPress(t, g, w, 21, *now)
	stopTravel(t, g, w, powerMidnight, now, 18)
	// Over the winch: not this shaft's, so the shaft has no stops and goes up as ever.
	w, g, now = newStopWorld(22)
	mechRun(g, w, nil, now, 80)
	if liftHeight(w) != 18 {
		t.Fatalf("a stop over the winch is not of this lift: at %d", liftHeight(w))
	}
	// Under the ground it rests on: it rests, called, and waits.
	w, g, now = newStopWorld(2)
	stopPress(t, g, w, 2, *now)
	w.SetBlock(0, 0, 0, "air")
	w.SetBlock(0, 3, 0, "lift_platform")
	mechRun(g, w, nil, now, 60)
	if liftHeight(w) != 0 {
		t.Fatalf("under the ground: at %d", liftHeight(w))
	}
}

func TestStopSurvivesARestart(t *testing.T) {
	w, g, now := newStopWorld(5, 15)
	stopPress(t, g, w, 15, *now)
	mechRun(g, w, nil, now, 10)
	mid := liftHeight(w)
	if mid == 0 || mid == 12 {
		t.Fatalf("mid-trip: %d", mid)
	}
	restart := func() {
		powerMu.Lock()
		grid = g
		powerMu.Unlock()
		loadPower(snapshotPower())
		powerMu.Lock()
		g = grid
		grid = newPowerGrid()
		powerMu.Unlock()
	}
	restart()
	stopTravel(t, g, w, powerMidnight, now, 12)
	if w[[3]int{1, 15, 0}] != "lift_stop:called:on" {
		t.Fatalf("after: %q", w[[3]int{1, 15, 0}])
	}
	// Held at a stop, it stays on through a restart with no flicker.
	restart()
	for i := 0; i < 10; i++ {
		mechRun(g, w, nil, now, 1)
		if w[[3]int{1, 15, 0}] != "lift_stop:called:on" {
			t.Fatalf("tick %d: %q", i, w[[3]int{1, 15, 0}])
		}
	}
}

func TestStopSignalOnTopCalls(t *testing.T) {
	w, g, now := newStopWorld(10)
	// A button on the stop: one press is enough, it remembers.
	w.SetBlock(1, 11, 0, "push_button")
	g.track(1, 11, 0, "push_button")
	mechRun(g, w, nil, now, 2)
	if _, ok := g.press(w, 1, 11, 0, *now); !ok {
		t.Fatal("the button")
	}
	mechRun(g, w, nil, now, 3)
	if w[[3]int{1, 10, 0}] != "lift_stop:called:off" {
		t.Fatalf("called by its button: %q", w[[3]int{1, 10, 0}])
	}
	stopTravel(t, g, w, powerMidnight, now, 7)
	if w[[3]int{1, 11, 0}] != "push_button" {
		t.Fatalf("the button ran out: %q", w[[3]int{1, 11, 0}])
	}
}

// A level signal is one call: another stop takes over, and the first is not called again until its
// signal goes off and on.
func TestStopLeverKeepsNoClaim(t *testing.T) {
	w, g, now := newStopWorld(5, 10)
	w.SetBlock(1, 11, 0, "lever")
	g.track(1, 11, 0, "lever")
	mechRun(g, w, nil, now, 2)
	g.press(w, 1, 11, 0, *now) // on
	stopTravel(t, g, w, powerMidnight, now, 7)
	stopPress(t, g, w, 5, *now)
	stopTravel(t, g, w, powerMidnight, now, 2)
	if w[[3]int{1, 10, 0}] != "lift_stop" {
		t.Fatalf("the lever's stop: %q", w[[3]int{1, 10, 0}])
	}
}

// A stop is on only once the platform stands there, and then it conducts: not through its input.
func TestStopSensorAndWires(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{
		{0, 21, 0}: "lift_winch", {0, 21, 1}: "rtg",
		{1, 10, 0}: "lift_stop", {1, 5, 0}: "lift_stop", {1, 15, 0}: "lift_stop",
		// A lamp with its own rtg behind the stop at 10; a wire on the top of the stop at 15.
		{2, 10, 0}: "copper_wire", {3, 10, 0}: "rtg", {1, 9, 0}: "electric_lamp",
	})
	w.SetBlock(0, -1, 0, "stone")
	w.SetBlock(0, 0, 0, "lift_platform")
	now := time.Unix(1000, 0)
	mechRun(g, w, nil, &now, 2)
	if w[[3]int{1, 9, 0}] != "electric_lamp" {
		t.Fatalf("the lamp is off with the stop off: %q", w[[3]int{1, 9, 0}])
	}
	// Going by the stop at 10 does not switch it on: nor its lamp.
	g.press(w, 1, 15, 0, now)
	for i := 0; i < 100 && liftHeight(w) < 12; i++ {
		mechRun(g, w, nil, &now, 1)
		if w[[3]int{1, 10, 0}] != "lift_stop" || w[[3]int{1, 9, 0}] != "electric_lamp" {
			t.Fatalf("flickering at %d: %q, %q", liftHeight(w), w[[3]int{1, 10, 0}], w[[3]int{1, 9, 0}])
		}
	}
	// Standing at it, it is on and the lamp lights; leaving, off at once.
	g.press(w, 1, 10, 0, now)
	mechRun(g, w, nil, &now, 30)
	if liftHeight(w) != 7 || w[[3]int{1, 10, 0}] != "lift_stop:called:on" || w[[3]int{1, 9, 0}] != "electric_lamp:on" {
		t.Fatalf("at %d: %q, %q", liftHeight(w), w[[3]int{1, 10, 0}], w[[3]int{1, 9, 0}])
	}
	g.press(w, 1, 5, 0, now)
	mechRun(g, w, nil, &now, 3)
	if w[[3]int{1, 10, 0}] != "lift_stop" {
		t.Fatalf("after leaving: %q", w[[3]int{1, 10, 0}])
	}
}

// The top face reads, and never conducts: a powered wire on top stays apart from the stop's network.
func TestStopInputDoesNotConduct(t *testing.T) {
	w := fakeCropWorld{}
	g := newTestGrid(w, map[powerPos]string{
		{1, 3, 0}: "lift_stop:free:on", {1, 4, 0}: "copper_wire", {2, 3, 0}: "copper_wire",
	})
	now := time.Unix(1000, 0)
	g.tick(w, powerMidnight, now, logicStep.Seconds())
	if g.netOf[powerPos{1, 4, 0}] == g.netOf[powerPos{1, 3, 0}] {
		t.Fatal("the top face is an input")
	}
	if g.netOf[powerPos{2, 3, 0}] == nil {
		t.Fatal("a side conducts")
	}
}

// An iron door touching a stop: it opens when the platform arrives and shuts when it leaves, with no
// power at all (the winch's rtg is not on it).
func TestStopMovesItsDoor(t *testing.T) {
	w, g, now := newStopWorld(10, 15)
	w.SetBlock(1, 8, 0, "iron_door")
	w.SetBlock(1, 9, 0, "iron_door:upper:n:left:closed")
	stopPress(t, g, w, 10, *now)
	for i := 0; i < 40 && liftHeight(w) != 7; i++ {
		mechRun(g, w, nil, now, 1)
	}
	if liftHeight(w) != 7 || w[[3]int{1, 8, 0}] != "iron_door" {
		t.Fatalf("not yet: at %d, door %q", liftHeight(w), w[[3]int{1, 8, 0}])
	}
	mechRun(g, w, nil, now, 6)
	if w[[3]int{1, 8, 0}] != "iron_door:lower:n:left:open" || w[[3]int{1, 9, 0}] != "iron_door:upper:n:left:open" {
		t.Fatalf("arrived: %q, %q", w[[3]int{1, 8, 0}], w[[3]int{1, 9, 0}])
	}
	stopPress(t, g, w, 15, *now)
	mechRun(g, w, nil, now, 3)
	if liftHeight(w) == 7 || w[[3]int{1, 8, 0}] != "iron_door" || w[[3]int{1, 9, 0}] != "iron_door:upper:n:left:closed" {
		t.Fatalf("leaving: at %d, %q, %q", liftHeight(w), w[[3]int{1, 8, 0}], w[[3]int{1, 9, 0}])
	}
	// A wooden door touching one is left alone.
	w.SetBlock(2, 10, 0, "oak_door")
	stopPress(t, g, w, 10, *now)
	mechRun(g, w, nil, now, 40)
	if w[[3]int{2, 10, 0}] != "oak_door" {
		t.Fatalf("wood: %q", w[[3]int{2, 10, 0}])
	}
}

func TestRamDoesNotMoveStopOrPlatform(t *testing.T) {
	for _, name := range []string{"lift_stop", "lift_platform"} {
		w, g, crank := newRamWorld("motor_ram:e:in", name)
		now := time.Unix(1000, 0)
		g.track(1, 0, 0, name)
		mechRun(g, w, &crank, &now, 3)
		if w[[3]int{1, 0, 0}] != name || w[[3]int{0, 0, 0}] != "motor_ram:e:in" {
			t.Errorf("%s: %q, ram %q", name, w[[3]int{1, 0, 0}], w[[3]int{0, 0, 0}])
		}
	}
}
