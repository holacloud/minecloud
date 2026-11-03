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
