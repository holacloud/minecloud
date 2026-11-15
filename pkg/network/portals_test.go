package network

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	"minecloud/pkg/terrain"
	"minecloud/pkg/world"
)

// The transport network (portals.go): the rule of the addresses, the shapes, the build, its protection,
// and that the four levels lie inside the world a client may ask for. test/js/portals.test.js holds the client to the same.

// The examples of FEAT_TRANSPORT_AND_PORTALS.md, as (east, north) in blocks: east is +x, north is -z.
var portalsExamples = []struct {
	address     string
	level       int
	east, north int
}{
	{"", 0, 0, 0},
	{"N", 1, 0, 1000},
	{"NE", 2, 10000, 1000},
	{"NEN", 3, 10000, 101000},
	{"NENE", 4, 1010000, 101000},
	{"SOSO", 4, -1010000, -101000},
	{"OOOO", 4, -1111000, 0},
}

func TestPortalsTheAddressesAndTheirPlaces(t *testing.T) {
	for _, example := range portalsExamples {
		x, z := portalsPosition(example.address)
		if !portalsValid(example.address) || len(example.address) != example.level || x != example.east || -z != example.north {
			t.Errorf("%q: valid %v, level %d, at x=%d z=%d; want level %d, %d east and %d north",
				example.address, portalsValid(example.address), len(example.address), x, z, example.level, example.east, example.north)
		}
	}
	for _, bad := range []string{"NS", "SN", "EO", "OE", "NES", "NEO", "NNNNN", "X", "n", "NW", " N"} {
		if portalsValid(bad) {
			t.Errorf("%q is taken for a valid address", bad)
		}
	}

	all := portalsAddresses(portalsMaxLevels)
	perLevel := make([]int, portalsMaxLevels+1)
	places := map[[2]int]string{}
	portals, backs := 0, 0
	for _, address := range all {
		if !portalsValid(address) {
			t.Errorf("%q is listed and is not valid", address)
		}
		perLevel[len(address)]++
		x, z := portalsPosition(address)
		if other, taken := places[[2]int{x, z}]; taken {
			t.Errorf("%q and %q are both at %d,%d", address, other, x, z)
		}
		places[[2]int{x, z}] = address
		exits := portalsExits(address, portalsMaxLevels)
		portals += len(exits)
		want := map[int]int{0: 4, 1: 3, 2: 2, 3: 2, 4: 0}[len(address)]
		if len(address) >= 1 && len(address) < portalsMaxLevels && portalsOneAxis(address) {
			want = 3
		}
		if len(exits) != want {
			t.Errorf("%q has %d portals, want %d", address, len(exits), want)
		}
		for _, letter := range exits {
			to := address + string(letter)
			if !portalsValid(to) || len(to) != len(address)+1 {
				t.Errorf("%q leads to %q", address, to)
			}
		}
		// Its doors: those, and then the one back, on an edge of its own, which is the other end of the
		// portal that leads here and has its colour.
		doors := portalsDoors(address, portalsMaxLevels)
		edges := map[byte]bool{}
		for i, door := range doors {
			if edges[door.Side] {
				t.Errorf("%q has two portals on its %c edge", address, door.Side)
			}
			edges[door.Side] = true
			if i < len(exits) && (door.Side != exits[i] || door.To != address+string(exits[i]) || door.Level != len(address)+1) {
				t.Errorf("%q: its portal %c is %+v", address, exits[i], door)
			}
		}
		if address == "" {
			if len(doors) != len(exits) {
				t.Errorf("the central plaza has %d portals, want %d and none back", len(doors), len(exits))
			}
			continue
		}
		if len(doors) != len(exits)+1 {
			t.Fatalf("%q has %d portals, want %d and the one back", address, len(doors), len(exits))
		}
		backs++
		back, last := doors[len(doors)-1], address[len(address)-1]
		if back.To != address[:len(address)-1] || back.Level != len(address) || back.Side != portalsOpposite[last] {
			t.Errorf("%q: the portal back is %+v", address, back)
		}
		there := false
		for _, door := range portalsDoors(back.To, portalsMaxLevels) {
			there = there || (door.To == address && door.Side == last && door.Level == back.Level)
		}
		if !there {
			t.Errorf("%q: no portal of %q leads to it with the colour of its portal back", address, back.To)
		}
	}
	if len(all) != 105 || fmt.Sprint(perLevel) != "[1 4 12 28 60]" || portals != 104 || backs != 104 {
		t.Errorf("%d plazas %v, %d portals and %d back, want 105 [1 4 12 28 60], 104 and 104", len(all), perLevel, portals, backs)
	}
	// Every valid address of up to 4 letters is listed: the 4^0 + ... + 4^4 strings, each tried.
	listed := map[string]bool{}
	for _, address := range all {
		listed[address] = true
	}
	var walk func(prefix string)
	walk = func(prefix string) {
		if portalsValid(prefix) != listed[prefix] {
			t.Errorf("%q: valid %v, listed %v", prefix, portalsValid(prefix), listed[prefix])
		}
		if len(prefix) < portalsMaxLevels {
			for _, letter := range "NSEO" {
				walk(prefix + string(letter))
			}
		}
	}
	walk("")
	// The examples' counts.
	for address, want := range map[string]int{"": 4, "N": 3, "NN": 3, "OOO": 3, "NE": 2, "NEN": 2, "NNNN": 0, "NENE": 0} {
		if got := len(portalsExits(address, portalsMaxLevels)); got != want {
			t.Errorf("%q has %d portals, want %d", address, got, want)
		}
	}
	// What is built: the four levels.
	built := portalsAddresses(portalsLevels)
	builtPortals, builtDoors := 0, 0
	for _, address := range built {
		builtPortals += len(portalsExits(address, portalsLevels))
		builtDoors += len(portalsDoors(address, portalsLevels))
	}
	if portalsLevels != 4 || len(built) != 105 || builtPortals != 104 || builtDoors != 208 {
		t.Errorf("%d levels: %d plazas, %d portals out and %d in all, want 4: 105, 104 and 208", portalsLevels, len(built), builtPortals, builtDoors)
	}
	for level, colour := range []string{"", "red", "orange", "yellow", "green"} {
		if level > 0 && portalsPaneBlock(level) != "portal_"+colour {
			t.Errorf("level %d: %s", level, portalsPaneBlock(level))
		}
	}
}

// portalsOneAxis says whether a way uses only N and S, or only E and O.
func portalsOneAxis(address string) bool {
	ns, eo := false, false
	for i := 0; i < len(address); i++ {
		ns = ns || address[i] == 'N' || address[i] == 'S'
		eo = eo || address[i] == 'E' || address[i] == 'O'
	}
	return ns != eo
}

func TestPortalsTheShapeOfAPlaza(t *testing.T) {
	count := func(cells []portalsCell) map[string]int {
		names := map[string]int{}
		seen := map[[3]int]bool{}
		for _, cell := range cells {
			names[cell.Name]++
			if seen[[3]int{cell.X, cell.Y, cell.Z}] {
				t.Fatalf("%v twice", cell)
			}
			seen[[3]int{cell.X, cell.Y, cell.Z}] = true
		}
		return names
	}
	same := func(what string, got map[string]int, want map[string]int) {
		t.Helper()
		if fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("%s: %v, want %v", what, got, want)
		}
	}
	// The floor of every plaza: a core of 17 x 17 with its ring of colour (64 cells) and the rose at its
	// centre, and a margin of 7 round it, 31 x 31 in all.
	const core, ring, margin = 15*15 - 1, 16 * 4, 31*31 - 17*17
	// The central plaza: four red portals of 9 panes in frames of 11 blocks, each with its letter on top, and
	// four posts of the legend, the star and a white cap.
	same("central plaza", count(portalsShape("", 10, portalsLevels)), map[string]int{
		portalsPlazaBlock: core + 4*11, portalsCompassBlock: 1, "portal_trim_white": ring + 4, portalsPavingBlock: margin,
		"portal_red": 4 * 9, "portal_letter_n": 1, "portal_letter_e": 1, "portal_letter_s": 1, "portal_letter_o": 1,
		portalsLegendBlock: 4, portalsStarBlock: 4,
	})
	// NE: two yellow portals on, and the orange one back to N; orange is its colour, and its posts spell NE.
	same("NE", count(portalsShape("NE", 10, portalsLevels)), map[string]int{
		portalsPlazaBlock: core + 3*11, portalsCompassBlock: 1, "portal_trim_orange": ring + 4, portalsPavingBlock: margin,
		"portal_yellow": 2 * 9, "portal_orange": 9, "portal_letter_n": 4 + 1, "portal_letter_e": 4 + 1, "portal_letter_o": 1,
		portalsLegendBlock: 4,
	})
	// NEN: two green portals on, to NENN and NENE, and the yellow one back to NE.
	same("NEN", count(portalsShape("NEN", 10, portalsLevels)), map[string]int{
		portalsPlazaBlock: core + 3*11, portalsCompassBlock: 1, "portal_trim_yellow": ring + 4, portalsPavingBlock: margin,
		"portal_green": 2 * 9, "portal_yellow": 9, "portal_letter_n": 8 + 1, "portal_letter_e": 4 + 1, "portal_letter_s": 1,
		portalsLegendBlock: 4,
	})
	// The last level has only the portal back: NENE's green one on its west edge, back to NEN.
	same("NENE", count(portalsShape("NENE", 10, portalsLevels)), map[string]int{
		portalsPlazaBlock: core + 11, portalsCompassBlock: 1, "portal_trim_green": ring + 4, portalsPavingBlock: margin,
		"portal_green": 9, "portal_letter_n": 8, "portal_letter_e": 8, "portal_letter_o": 1, portalsLegendBlock: 4,
	})
	// N, at (0, -1000): its orange portals on the north, east and west edges of its core and the red one back
	// on its south edge, towards the centre; each in the middle three cells of its edge, three high over the
	// floor, with the letter of its way over the middle of its lintel.
	edges := map[string]int{}
	for _, cell := range portalsShape("N", 10, portalsLevels) {
		dx, dz := cell.X, cell.Z+1000
		r := portalsPlazaRadius
		switch {
		case cell.Y == 10:
			want := portalsPavingBlock
			switch ring := max(abs(dx), abs(dz)); {
			case ring == 0:
				want = portalsCompassBlock
			case ring < r:
				want = portalsPlazaBlock
			case ring == r:
				want = "portal_trim_red"
			}
			if cell.Name != want || max(abs(dx), abs(dz)) > 15 {
				t.Errorf("N: %v in the floor, want %s", cell, want)
			}
			continue
		case abs(dx) == portalsPostOffset && abs(dz) == portalsPostOffset:
			if want := []string{"", portalsLegendBlock, "portal_letter_n", "portal_trim_red"}[cell.Y-10]; cell.Name != want {
				t.Errorf("N: %v in a post, want %s", cell, want)
			}
			continue
		case cell.Name == portalsPlazaBlock:
			continue
		}
		edge, colour := "", "portal_orange"
		switch {
		case dz == -r && dx >= -1 && dx <= 1:
			edge = "N"
		case dz == r && dx >= -1 && dx <= 1:
			edge, colour = "S", "portal_red"
		case dx == r && dz >= -1 && dz <= 1:
			edge = "E"
		case dx == -r && dz >= -1 && dz <= 1:
			edge = "O"
		}
		if cell.Y == 15 {
			if edge == "" || cell.Name != portalsLetterBlock(edge[0]) || dx*dz != 0 {
				t.Errorf("N: a sign at %v", cell)
			}
			edges[edge+" sign"]++
			continue
		}
		if edge == "" || cell.Name != colour || cell.Y < 11 || cell.Y > 13 {
			t.Errorf("N: a pane at %v", cell)
		}
		edges[edge]++
	}
	if fmt.Sprint(edges) != "map[E:9 E sign:1 N:9 N sign:1 O:9 O sign:1 S:9 S sign:1]" {
		t.Errorf("N: panes by edge %v", edges)
	}
	// The posts of a plaza of three letters, at the corners of the core just inside its ring: legend, then NEN
	// from the top down, then the cap. And one of four letters, as tall as a post gets (portalsPostCells).
	if portalsPostOffset != portalsPlazaRadius-1 {
		t.Errorf("the posts stand %d from the centre, want %d: just inside the ring", portalsPostOffset, portalsPlazaRadius-1)
	}
	for address, want := range map[string]string{
		"NEN":  "[portal_plaza portal_legend portal_letter_n portal_letter_e portal_letter_n portal_trim_yellow]",
		"NENE": "[portal_plaza portal_legend portal_letter_e portal_letter_n portal_letter_e portal_letter_n portal_trim_green]",
	} {
		cx, cz := portalsPosition(address)
		var post []string
		for _, cell := range portalsShape(address, 10, portalsLevels) {
			if cell.X == cx-portalsPostOffset && cell.Z == cz-portalsPostOffset {
				post = append(post, cell.Name)
			}
		}
		if fmt.Sprint(post) != want || len(address) == portalsMaxLevels && len(post)-1 != portalsPostCells {
			t.Errorf("a post of %s from the floor up: %v", address, post)
		}
	}
	// Nothing of the shape stands where the old posts did: emptying them never fights the shape.
	for _, address := range []string{"", "N", "NE", "NEN", "NENE"} {
		old := map[[3]int]bool{}
		for _, cell := range portalsOldPosts(address, 10) {
			old[cell] = true
		}
		for _, cell := range portalsShape(address, 10, portalsLevels) {
			if old[[3]int{cell.X, cell.Y, cell.Z}] {
				t.Errorf("%q: %v is in the shape and among the old posts", address, cell)
			}
		}
		if len(old) != 24 {
			t.Errorf("%q: %d cells of old posts", address, len(old))
		}
	}

	// The same cells as js/game/portals.js makes, in the same order (test/js/portals.test.js has this number).
	if got := portalsShapeDigest(); got != portalsShapeDigestWant {
		t.Errorf("the shapes' digest is %s, want %s (and test/js/portals.test.js the same)", got, portalsShapeDigestWant)
	}
	// Every name of the network is official, and they are all different.
	names := map[string]bool{}
	for _, name := range portalsBlockNames() {
		if !portalsOfficial(name) || names[name] {
			t.Errorf("%s", name)
		}
		names[name] = true
	}
	if len(names) != 18 {
		t.Errorf("%d blocks of the network", len(names))
	}
}

// The digest of the shapes of five plazas, one of each level built, over a floor at y = 10: the count of cells
// and an FNV-1a of "x,y,z,name;" for each, in order. test/js/portals.test.js holds the client's to it.
const portalsShapeDigestWant = "5204:18135bb7"

func portalsShapeDigest() string {
	hash, cells := uint32(2166136261), 0
	for _, address := range []string{"", "N", "NE", "NEN", "NENE"} {
		for _, cell := range portalsShape(address, 10, portalsLevels) {
			cells++
			for _, b := range []byte(fmt.Sprintf("%d,%d,%d,%s;", cell.X, cell.Y, cell.Z, cell.Name)) {
				hash ^= uint32(b)
				hash *= 16777619
			}
		}
	}
	return fmt.Sprintf("%d:%08x", cells, hash)
}

// portalsWorld is the world of the plot tests (claimWorld) and a client of the admin, standing at the centre.
func portalsWorld(t *testing.T) (admin *Client) {
	t.Helper()
	claimWorld(t)
	admin = claimClient(t, "Admin", "plr_admin", 0.5, 120, 0.5)
	admin.creative.Store(true)
	return admin
}

// portalsBuilt is the last portalsBuilt the client heard, and the cells portalsCells told it.
func portalsBuilt(t *testing.T, heard map[string][]json.RawMessage) (answer map[string]interface{}, cells [][4]interface{}) {
	t.Helper()
	for _, raw := range heard["portalsCells"] {
		var message struct {
			Cells [][4]interface{} `json:"cells"`
		}
		if err := json.Unmarshal(raw, &message); err != nil {
			t.Fatal(err)
		}
		if len(message.Cells) == 0 || len(message.Cells) > portalsCellsPerMessage {
			t.Errorf("a portalsCells of %d cells", len(message.Cells))
		}
		cells = append(cells, message.Cells...)
	}
	list := heard["portalsBuilt"]
	if len(list) == 0 {
		return nil, cells
	}
	if err := json.Unmarshal(list[len(list)-1], &answer); err != nil {
		t.Fatal(err)
	}
	return answer, cells
}

// portalsFocus gives a test client a chunk stream focused on the chunk of column (x, z), as its page would.
func portalsFocus(client *Client, x, z int) {
	client.stream = newChunkStream(client)
	chunkX, chunkZ := world.ChunkCoords(x, z)
	client.stream.focus(chunkX, chunkZ, 8)
}

// portalsInFootprint says whether every cell lies in the footprint of the plaza of an address.
func portalsInFootprint(cells [][4]interface{}, address string) bool {
	cx, cz := portalsPosition(address)
	for _, cell := range cells {
		x, z := int(cell[0].(float64)), int(cell[2].(float64))
		if abs(x-cx) > portalsFootprint() || abs(z-cz) > portalsFootprint() {
			return false
		}
	}
	return true
}

func TestPortalsBuildMakesTheNetworkAndNothingTwice(t *testing.T) {
	admin := portalsWorld(t)
	beto := claimClient(t, "Beto", plrBeto, 1000.5, 120, -999.5)
	far := claimClient(t, "Far", "plr_far", 50000.5, 120, 50000.5)
	portalsFocus(admin, 0, 0)
	portalsFocus(beto, 0, -1000)
	portalsFocus(far, 50000, 50000)

	// Nobody but the admin: as if there were no such message.
	claimSend(t, beto, "portalsBuild", map[string]int{})
	if answer, cells := portalsBuilt(t, claimHeard(beto)); answer != nil || len(cells) != 0 {
		t.Fatalf("a player built: %v, %d cells", answer, len(cells))
	}
	if got := claimBlockAt(t, 0, portalsFloorY(0, 0), 0); got == portalsCompassBlock {
		t.Fatal("the central plaza is there before any build")
	}

	// A plot saved 2 columns east of plaza N's footprint (x -15..15) does not stop the build, and stays.
	claims.load(map[string]Claim{"clm_near": {X: 26, Y: 120, Z: -1000, Owner: plrCris, OwnerName: "Cris", CreatedAt: time.Unix(100, 0)}})

	claimHeard(admin)
	claimHeard(beto)
	claimHeard(far)
	started := time.Now()
	claimSend(t, admin, "portalsBuild", map[string]int{})
	t.Logf("the first build of the %d plazas took %v", len(portalsAddresses(portalsLevels)), time.Since(started))
	answer, cells := portalsBuilt(t, claimHeard(admin))
	if answer == nil || answer["plazas"] != 105.0 || answer["portals"] != 104.0 || answer["back"] != 104.0 || answer["levels"] != 4.0 || answer["error"] != nil {
		t.Fatalf("first build: %v", answer)
	}
	// Each client is told of the plazas whose chunks it can have, and of nothing else.
	_, betoCells := portalsBuilt(t, claimHeard(beto))
	_, farCells := portalsBuilt(t, claimHeard(far))
	if len(cells) == 0 || !portalsInFootprint(cells, "") || len(betoCells) == 0 || !portalsInFootprint(betoCells, "N") || len(farCells) != 0 {
		t.Fatalf("told: %d cells to the admin at the centre, %d to Beto at N and %d to somebody far away", len(cells), len(betoCells), len(farCells))
	}
	if answer["changed"].(float64) < float64(105*31*31) {
		t.Fatalf("first build changed %v cells", answer["changed"])
	}
	if list := claims.list(); len(list) != 1 || list[0].ID != "clm_near" {
		t.Fatalf("the plot near plaza N: %d plots", len(list))
	}

	// Every plaza where the rule says, with its own portals and no other, and nothing over its footprint.
	panes := 0
	for _, address := range portalsAddresses(portalsLevels) {
		cx, cz := portalsPosition(address)
		floorY := portalsFloorY(cx, cz)
		official := map[[3]int]bool{}
		for _, cell := range portalsShape(address, floorY, portalsLevels) {
			official[[3]int{cell.X, cell.Y, cell.Z}] = true
			if got := claimBlockAt(t, cell.X, cell.Y, cell.Z); got != cell.Name {
				t.Fatalf("%q: %d,%d,%d holds %q, want %q", address, cell.X, cell.Y, cell.Z, got, cell.Name)
			}
			if strings.HasPrefix(cell.Name, "portal_") && portalsPanes[cell.Name] {
				panes++
			}
		}
		f := portalsFootprint()
		for _, column := range [][2]int{{cx, cz}, {cx - f, cz - f}, {cx + f, cz + 3}, {cx + 2, cz + f}} {
			for y := floorY + 1; y <= terrain.WorldMaxY; y++ {
				if got := claimBlockAt(t, column[0], y, column[1]); got != "air" && !official[[3]int{column[0], y, column[1]}] {
					t.Fatalf("%q: %q over the floor at %d,%d,%d", address, got, column[0], y, column[1])
				}
			}
		}
		if len(address) == portalsLevels {
			for _, letter := range portalsLetters {
				want := "air"
				if letter == portalsOpposite[address[len(address)-1]] {
					want = portalsPaneBlock(portalsLevels)
				}
				step := portalsSteps[letter]
				if got := claimBlockAt(t, cx+step[0]*portalsPlazaRadius, floorY+2, cz+step[1]*portalsPlazaRadius); got != want {
					t.Errorf("%q, the last level, has %q on its %c edge, want %q", address, got, letter, want)
				}
			}
		}
	}
	if panes != 208*9 {
		t.Errorf("%d panes, want %d", panes, 208*9)
	}
	// The examples of the document, all built now, by their own coordinates.
	for _, example := range portalsExamples {
		x, z := example.east, -example.north
		if got := claimBlockAt(t, x, portalsFloorY(x, z), z); got != portalsCompassBlock {
			t.Errorf("%q: %q at its centre", example.address, got)
		}
	}

	// Somebody builds on the plaza N, on its core and on its margin; a second build changes nothing at all,
	// tells nobody anything, and keeps it.
	floorN := portalsFloorY(0, -1000)
	for _, x := range []int{1, 12} {
		claimSend(t, beto, "blockPlace", Block{X: x, Y: floorN + 1, Z: -1001, BlockType: "stone"})
		if got := claimBlockAt(t, x, floorN+1, -1001); got != "stone" {
			t.Fatalf("a block on the plaza N at x=%d: %q", x, got)
		}
	}
	claimHeard(admin)
	claimHeard(beto)
	claimSend(t, admin, "portalsBuild", map[string]int{})
	answer, cells = portalsBuilt(t, claimHeard(admin))
	_, betoCells = portalsBuilt(t, claimHeard(beto))
	if answer == nil || answer["changed"] != 0.0 || len(cells) != 0 || len(betoCells) != 0 || answer["plazas"] != 105.0 {
		t.Fatalf("second build: %v, %d cells", answer, len(cells))
	}
	for _, x := range []int{1, 12} {
		if got := claimBlockAt(t, x, floorN+1, -1001); got != "stone" {
			t.Errorf("the second build took away what was built on the plaza at x=%d: %q", x, got)
		}
	}
}

// The panes, by name.
var portalsPanes = map[string]bool{"portal_red": true, "portal_orange": true, "portal_yellow": true, "portal_green": true}

// The plaza N of the first layout (9 x 9 at the height of the ground at its centre, portals 4 blocks from it)
// is in the user's world: the new build leaves nothing of it, at any height, and is then already there.
func TestPortalsTheFirstLayoutGoesWhenAPlazaIsBuiltAgain(t *testing.T) {
	admin := portalsWorld(t)
	cx, cz := portalsPosition("N")
	oldY := max(terrain.ColumnSurface(cx, cz).Height, terrain.WaterLevel)
	floorY := portalsFloorY(cx, cz)
	if oldY >= floorY {
		t.Fatalf("N: the old floor at %d and the new one at %d: this test wants the old one lower", oldY, floorY)
	}
	old := func(x, y, z int, name string) {
		if err := chunkStore.SetBlock(x, y, z, name); err != nil {
			t.Fatal(err)
		}
	}
	for x := cx - 4; x <= cx+4; x++ {
		for z := cz - 4; z <= cz+4; z++ {
			old(x, oldY, z, portalsPlazaBlock)
		}
	}
	for along := -2; along <= 2; along++ {
		for up := 1; up <= 4; up++ {
			name := portalsPlazaBlock
			if along > -2 && along < 2 && up <= 3 {
				name = "portal_orange"
			}
			old(cx+along, oldY+up, cz-4, name)
			old(cx+along, oldY+up, cz+4, strings.Replace(name, "orange", "red", 1))
		}
	}
	blockEditMu.Lock()
	changed, err := portalsBuildPlaza(admin, "N", portalsLevels)
	blockEditMu.Unlock()
	if err != nil || len(changed) == 0 {
		t.Fatal(len(changed), err)
	}
	official := map[[3]int]string{}
	for _, cell := range portalsShape("N", floorY, portalsLevels) {
		official[[3]int{cell.X, cell.Y, cell.Z}] = cell.Name
	}
	f := portalsFootprint()
	for x := cx - f; x <= cx+f; x++ {
		for z := cz - f; z <= cz+f; z++ {
			for y := terrain.WorldMinY; y <= terrain.WorldMaxY; y++ {
				got := claimBlockAt(t, x, y, z)
				if want, ok := official[[3]int{x, y, z}]; ok && got != want {
					t.Fatalf("%d,%d,%d holds %q, want %q", x, y, z, got, want)
				} else if !ok && portalsOfficial(got) {
					t.Fatalf("%q left at %d,%d,%d", got, x, y, z)
				}
			}
		}
	}
	// Where the old floor was, under the new one, the foundation now is.
	if got := claimBlockAt(t, cx+1, oldY, cz+1); got != portalsFillBlock {
		t.Errorf("under the new floor, where the old one was: %q", got)
	}
	blockEditMu.Lock()
	again, err := portalsBuildPlaza(admin, "N", portalsLevels)
	blockEditMu.Unlock()
	if err != nil || len(again) != 0 {
		t.Errorf("built again: %d cells, %v", len(again), err)
	}
}

// The user's world has the second layout, posts at 3 from the centre: a build of a plaza that is already there
// empties them, puts the new ones at the corners of the core, keeps what somebody else built in those columns,
// and a second build changes nothing.
func TestPortalsTheOldPostsGoWhenAPlazaIsBuiltAgain(t *testing.T) {
	admin := portalsWorld(t)
	build := func() [][4]interface{} {
		t.Helper()
		blockEditMu.Lock()
		changed, err := portalsBuildPlaza(admin, "N", portalsLevels)
		blockEditMu.Unlock()
		if err != nil {
			t.Fatal(err)
		}
		return changed
	}
	build()
	cx, cz := portalsPosition("N")
	floorY := portalsFloorY(cx, cz)
	put := func(x, y, z int, name string) {
		if err := chunkStore.SetBlock(x, y, z, name); err != nil {
			t.Fatal(err)
		}
	}
	for _, corner := range portalsPostCorners {
		x, z := cx+corner[0]*portalsOldPostOffset, cz+corner[1]*portalsOldPostOffset
		for i, name := range []string{portalsLegendBlock, "portal_letter_n", "portal_trim_red"} {
			put(x, floorY+1+i, z, name)
		}
	}
	// Somebody built on top of one old post.
	put(cx+portalsOldPostOffset, floorY+4, cz+portalsOldPostOffset, "stone")

	changed := build()
	if len(changed) != 12 {
		t.Errorf("the old posts: %d cells changed, want 12", len(changed))
	}
	for _, cell := range changed {
		x, y, z := cell[0].(int), cell[1].(int), cell[2].(int)
		if cell[3] != "" || abs(x-cx) != portalsOldPostOffset || abs(z-cz) != portalsOldPostOffset || y <= floorY || y > floorY+3 {
			t.Errorf("changed %v", cell)
		}
	}
	for _, cell := range portalsOldPosts("N", floorY) {
		if got := claimBlockAt(t, cell[0], cell[1], cell[2]); portalsOfficial(got) {
			t.Errorf("%q left of an old post at %v", got, cell)
		}
	}
	if got := claimBlockAt(t, cx+portalsOldPostOffset, floorY+4, cz+portalsOldPostOffset); got != "stone" {
		t.Errorf("what somebody built over an old post: %q", got)
	}
	for _, corner := range portalsPostCorners {
		x, z := cx+corner[0]*portalsPostOffset, cz+corner[1]*portalsPostOffset
		for i, want := range []string{portalsLegendBlock, "portal_letter_n", "portal_trim_red"} {
			if got := claimBlockAt(t, x, floorY+1+i, z); got != want {
				t.Errorf("the new post at %d,%d holds %q at %d, want %q", x, z, got, floorY+1+i, want)
			}
		}
	}
	if again := build(); len(again) != 0 {
		t.Errorf("built again: %d cells", len(again))
	}
}

// Over the sea a plaza is a deck on the water, flush with its surface, with nothing under it; on land the
// foundation goes down to the ground.
func TestPortalsAPlazaRestsOnTheGroundOrOnTheSea(t *testing.T) {
	admin := portalsWorld(t)
	for _, address := range []string{"NON", "EN", "ONOO"} {
		// How long a first build holds blockEditMu: the sea, a slope, the deepest foundation of all.
		started := time.Now()
		blockEditMu.Lock()
		changed, err := portalsBuildPlaza(admin, address, portalsLevels)
		blockEditMu.Unlock()
		t.Logf("%q: blockEditMu held %v for %d cells", address, time.Since(started), len(changed))
		if err != nil {
			t.Fatal(err)
		}
	}
	// NON: the sea all round.
	cx, cz := portalsPosition("NON")
	if floorY := portalsFloorY(cx, cz); floorY != terrain.WaterLevel {
		t.Fatalf("NON: floor at %d, want the water's top block, %d", floorY, terrain.WaterLevel)
	}
	if got := claimBlockAt(t, cx+5, terrain.WaterLevel-1, cz-5); got != "water" {
		t.Errorf("NON: %q under the deck", got)
	}
	// EN: a slope. Every column of the footprint is full from the floor down to the ground or the water.
	cx, cz = portalsPosition("EN")
	floorY := portalsFloorY(cx, cz)
	f := portalsFootprint()
	filled := 0
	for x := cx - f; x <= cx+f; x++ {
		for z := cz - f; z <= cz+f; z++ {
			ground := max(terrain.ColumnSurface(x, z).Height, terrain.WaterLevel)
			for y := floorY - 1; y > ground; y-- {
				if got := claimBlockAt(t, x, y, z); got != portalsFillBlock {
					t.Fatalf("EN: %q under the floor at %d,%d,%d (ground at %d)", got, x, y, z, ground)
				}
				filled++
			}
		}
	}
	if filled == 0 {
		t.Error("EN: no foundation at all")
	}
}

// The height of every plaza, from the generator alone: its floor, the deepest drop under its footprint (what
// the foundation has to fill: it must reach), and the easiest way out, the smallest step down from the floor
// onto the ground or the water just outside the footprint (a fall of more than 4 blocks hurts,
// js/game/survival.js). With -v it prints them, the worst first.
func TestPortalsPlazasRestOnTheGround(t *testing.T) {
	top := func(x, z int) int { return max(terrain.ColumnSurface(x, z).Height, terrain.WaterLevel) }
	for _, levels := range []int{portalsLevels} {
		type plaza struct {
			address          string
			floor, drop, out int
		}
		var all []plaza
		for _, address := range portalsAddresses(levels) {
			cx, cz := portalsPosition(address)
			f := portalsFootprint()
			p := plaza{address: address, floor: portalsFloorY(cx, cz), out: 1 << 30}
			for x := cx - f; x <= cx+f; x++ {
				for z := cz - f; z <= cz+f; z++ {
					if top(x, z) > p.floor {
						t.Errorf("%q: ground at %d over the floor at %d", address, top(x, z), p.floor)
					}
					p.drop = max(p.drop, p.floor-top(x, z))
				}
			}
			for i := -f - 1; i <= f+1; i++ {
				for _, c := range [][2]int{{cx + i, cz - f - 1}, {cx + i, cz + f + 1}, {cx - f - 1, cz + i}, {cx + f + 1, cz + i}} {
					p.out = min(p.out, p.floor-top(c[0], c[1]))
				}
			}
			if p.drop > portalsFoundation {
				t.Errorf("%q: a drop of %d under its footprint, deeper than its foundation goes", address, p.drop)
			}
			if p.out > 4 {
				t.Errorf("%q: the easiest way out is a fall of %d blocks", address, p.out)
			}
			all = append(all, p)
		}
		worst := all[0]
		for _, p := range all {
			if p.out > worst.out {
				worst = p
			}
		}
		t.Logf("%d levels: the hardest way out is %q's, a step down of %d", levels, worst.address, worst.out)
		sort.Slice(all, func(i, j int) bool { return all[i].drop > all[j].drop })
		for i, p := range all {
			if i < 5 || testing.Verbose() && i < len(all) {
				t.Logf("%d levels: %-6q floor %3d, deepest drop %3d, easiest step down %3d", levels, p.address, p.floor, p.drop, p.out)
			}
		}
	}
}

func TestPortalsNobodyBreaksAPlazaAndAnybodyBuildsOnOne(t *testing.T) {
	admin := portalsWorld(t)
	for _, address := range []string{"", "N"} {
		blockEditMu.Lock()
		_, err := portalsBuildPlaza(admin, address, portalsLevels)
		blockEditMu.Unlock()
		if err != nil {
			t.Fatal(err)
		}
	}
	beto := claimClient(t, "Beto", plrBeto, 0.5, 120, -999.5)
	floorN := portalsFloorY(0, -1000)
	// The north portal of N: its pane and its frame.
	pane := [3]int{0, floorN + 1, -1000 - portalsPlazaRadius}
	post := [3]int{2, floorN + 1, -1000 - portalsPlazaRadius}
	refused := func(kind string, payload interface{}, cell [3]int, want string) {
		t.Helper()
		claimHeard(beto)
		claimSend(t, beto, kind, payload)
		refusal := claimRefusalOf(t, claimHeard(beto))
		if refusal == nil || refusal.Reason != claimReasonPlaza {
			t.Errorf("%s at %v: %+v", kind, cell, refusal)
		}
		if got := claimBlockAt(t, cell[0], cell[1], cell[2]); got != want {
			t.Errorf("%s at %v: it holds %q, want %q", kind, cell, got, want)
		}
	}
	// The rose, the core, its ring, the margin, a post's legend and letter, the sign over the portal.
	for _, cell := range [][3]int{{0, floorN, -1000}, {4, floorN, -996}, {8, floorN, -1000}, {13, floorN, -990},
		{7, floorN + 1, -993}, {7, floorN + 2, -993}, {0, floorN + 5, -1008}, pane, post} {
		want := claimBlockAt(t, cell[0], cell[1], cell[2])
		refused("blockBreak", map[string]int{"x": cell[0], "y": cell[1], "z": cell[2]}, cell, want)
		refused("blockPlace", Block{X: cell[0], Y: cell[1], Z: cell[2], BlockType: "dirt"}, cell, want)
	}
	// Nor makes a portal of their own, anywhere.
	refused("blockPlace", Block{X: 300, Y: 120, Z: 300, BlockType: "portal_red"}, [3]int{300, 120, 300}, "air")
	refused("blockPlace", Block{X: 301, Y: 120, Z: 301, BlockType: portalsPlazaBlock}, [3]int{301, 120, 301}, "air")

	// On top of a network plaza, anybody builds and breaks what they built.
	on := Block{X: -2, Y: floorN + 1, Z: -998, BlockType: "stone"}
	claimHeard(beto)
	claimSend(t, beto, "blockPlace", on)
	if refusal := claimRefusalOf(t, claimHeard(beto)); refusal != nil || claimBlockAt(t, on.X, on.Y, on.Z) != "stone" {
		t.Fatalf("building on the plaza N: %+v, %q", refusal, claimBlockAt(t, on.X, on.Y, on.Z))
	}
	claimSend(t, beto, "blockBreak", map[string]int{"x": on.X, "y": on.Y, "z": on.Z})
	if got := claimBlockAt(t, on.X, on.Y, on.Z); got != "air" {
		t.Errorf("breaking one's own block on the plaza: %q", got)
	}
	// Not on the central plaza, which is in the spawn zone.
	floor0 := portalsFloorY(0, 0)
	claimHeard(beto)
	claimSend(t, beto, "blockPlace", Block{X: 1, Y: floor0 + 1, Z: 1, BlockType: "stone"})
	if refusal := claimRefusalOf(t, claimHeard(beto)); refusal == nil || refusal.Reason != claimReasonSpawn || claimBlockAt(t, 1, floor0+1, 1) != "air" {
		t.Errorf("building on the central plaza: %+v", refusal)
	}
	// The whole footprint of the central plaza, margin included.
	f := portalsFootprint()
	for _, corner := range [][2]int{{-f, -f}, {f, -f}, {f, f}, {-f, f}} {
		if !spawnZone.contains(corner[0], corner[1]) {
			t.Errorf("the corner %v of the central plaza is outside the spawn zone", corner)
		}
	}

	// Rams never move them, and the admin may change them.
	for _, name := range portalsBlockNames() {
		if mechMovable(name) {
			t.Errorf("a ram moves %s", name)
		}
	}
	claimSend(t, admin, "blockBreak", map[string]int{"x": pane[0], "y": pane[1], "z": pane[2]})
	if got := claimBlockAt(t, pane[0], pane[1], pane[2]); got != "air" {
		t.Errorf("the admin could not take a pane away: %q", got)
	}
}

// The fourth level is built, so every plaza of the four levels, with its footprint and the chunks a client
// keeps round it (the view distance, js/world.js), must lie inside what a client may ask for (worldReach,
// handleChunkMessage in chunks.go), and generating and saving a chunk must work out there.
func TestPortalsEveryPlazaLiesInsideTheChunksAClientMayAsk(t *testing.T) {
	source, err := os.ReadFile("chunks.go")
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`limit := worldReach / terrain\.ChunkSize\n\s*for _, c := range payload\.Chunks \{\n\s*if abs\(c\[0\]\) < limit && abs\(c\[1\]\) < limit`).Match(source) {
		t.Fatal("the limit of chunkRequest (chunks.go) is not what this test knows")
	}
	limit := worldReach / terrain.ChunkSize
	// Chunks round the one a client stands in that it may ask for: the server keeps requests at most 16 away
	// (chunkStream.focus) and js/world.js asks within its view distance and 2 more; twice that, for room.
	const view = 32
	farthest, farthestAddress := 0, ""
	for _, address := range portalsAddresses(portalsLevels) {
		cx, cz := portalsPosition(address)
		r := portalsFootprint()
		for _, x := range []int{cx - r, cx + r} {
			for _, z := range []int{cz - r, cz + r} {
				chunkX, chunkZ := world.ChunkCoords(x, z)
				reach := max(abs(chunkX), abs(chunkZ)) + view
				if reach >= limit {
					t.Errorf("%q: chunk %d,%d and %d round it reach beyond the %d a client may ask", address, chunkX, chunkZ, view, limit)
				}
				if reach > farthest {
					farthest, farthestAddress = reach, address
				}
			}
		}
	}
	if len(portalsAddresses(portalsLevels)) != 105 || farthestAddress == "" || len(farthestAddress) != 4 {
		t.Errorf("%d plazas, the farthest %q", len(portalsAddresses(portalsLevels)), farthestAddress)
	}
	t.Logf("the farthest chunk a client asks on a plaza: %d (%q), of %d", farthest, farthestAddress, limit)

	// Generation and saving hold there: the farthest plaza of all, and the farthest one built.
	dir := t.TempDir()
	store, err := world.Open(filepath.Join(dir, "chunks"), nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, address := range []string{"OOOO", "SSSS", "EEEE", "NENE", "OOO", "SES"} {
		x, z := portalsPosition(address)
		surface := terrain.ColumnSurface(x, z)
		if surface.Height < terrain.BedrockY || surface.Height > terrain.WorldMaxY {
			t.Errorf("%q: the terrain's top at y=%d", address, surface.Height)
		}
		chunkX, chunkZ := world.ChunkCoords(x, z)
		chunk := terrain.Generate(chunkX, chunkZ)
		if chunk.Get(0, terrain.BedrockY, 0) != "bedrock" || chunk.Get(0, terrain.WorldMaxY, 0) != "air" {
			t.Errorf("%q: chunk %d,%d is not a world: %q at the bottom, %q at the top", address, chunkX, chunkZ,
				chunk.Get(0, terrain.BedrockY, 0), chunk.Get(0, terrain.WorldMaxY, 0))
		}
		data, err := world.Encode(chunk)
		if err != nil {
			t.Fatal(err)
		}
		back, err := world.Decode(data)
		if err != nil || back.X != chunkX || back.Z != chunkZ {
			t.Errorf("%q: chunk %d,%d comes back as %v, %v", address, chunkX, chunkZ, back, err)
		}
		if err := store.SetBlock(x, surface.Height+1, z, portalsPlazaBlock); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Flush(); err != nil {
		t.Fatal(err)
	}
	again, err := world.Open(filepath.Join(dir, "chunks"), nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, address := range []string{"OOOO", "SSSS", "EEEE", "NENE", "OOO", "SES"} {
		x, z := portalsPosition(address)
		if got, err := again.Block(x, terrain.ColumnSurface(x, z).Height+1, z); err != nil || got != portalsPlazaBlock {
			t.Errorf("%q: saved and read back as %q, %v", address, got, err)
		}
	}
}

// A plot on a plaza's footprint (saved before plazas kept plots away) stops the whole build, which names it.
func TestPortalsABuildWithAPlotOnAPlazaBuildsNothing(t *testing.T) {
	admin := portalsWorld(t)
	portalsFocus(admin, 0, -1000)
	old := time.Unix(100, 0)
	saved := map[string]Claim{
		// On the margin of plaza N (x -15..15, z -1015..-985), and the admin's own on the core of NENE.
		"clm_a": {X: 20, Y: 70, Z: -995, Owner: plrAna, OwnerName: "Ana", CreatedAt: old},
		"clm_z": {X: 1010000, Y: 90, Z: -101000, Owner: "plr_admin", OwnerName: "Admin", CreatedAt: old},
	}
	// Eleven more on the plazas of the fourth level, to see the list bounded.
	for i, address := range portalsAddresses(portalsLevels)[94:105] {
		x, z := portalsPosition(address)
		saved[fmt.Sprintf("clm_m%02d", i)] = Claim{X: x, Y: 80, Z: z, Owner: fmt.Sprintf("plr_m%02d", i), OwnerName: fmt.Sprintf("M%02d", i), CreatedAt: old}
	}
	claims.load(saved)
	if n := len(claims.list()); n != 13 {
		t.Fatalf("%d plots loaded", n)
	}
	floorN := portalsFloorY(0, -1000)
	before := claimBlockAt(t, 0, floorN, -1000)
	claimHeard(admin)
	claimSend(t, admin, "portalsBuild", map[string]int{})
	heard := claimHeard(admin)
	if len(heard["portalsCells"]) != 0 {
		t.Fatalf("%d portalsCells sent", len(heard["portalsCells"]))
	}
	var answer struct {
		Error  string           `json:"error"`
		Plots  []portalsBlocker `json:"plots"`
		Count  int              `json:"count"`
		Plazas *int             `json:"plazas"`
	}
	if list := heard["portalsBuilt"]; len(list) != 1 || json.Unmarshal(list[0], &answer) != nil {
		t.Fatalf("portalsBuilt: %d", len(list))
	}
	if answer.Error != "plots" || answer.Count != 13 || len(answer.Plots) != portalsBlockersShown || answer.Plazas != nil {
		t.Fatalf("answer: %+v", answer)
	}
	// Plaza by plaza in the order they are built: N comes first.
	if first := answer.Plots[0]; first != (portalsBlocker{Plaza: "N", Owner: "Ana", X: 20, Y: 70, Z: -995}) {
		t.Fatalf("first: %+v", first)
	}
	if got := claimBlockAt(t, 0, floorN, -1000); got != before || got == portalsCompassBlock {
		t.Fatalf("plaza N's centre changed: %q -> %q", before, got)
	}
	if n := len(claims.list()); n != 13 {
		t.Fatalf("%d plots left", n)
	}

	// With only the admin's own plot on NENE, the same: the admin's plot is a plot like any other.
	claims.load(map[string]Claim{"clm_z": saved["clm_z"]})
	claimSend(t, admin, "portalsBuild", map[string]int{})
	heard = claimHeard(admin)
	answer.Plots = nil
	if list := heard["portalsBuilt"]; len(list) != 1 || json.Unmarshal(list[0], &answer) != nil || answer.Count != 1 || len(answer.Plots) != 1 ||
		answer.Plots[0] != (portalsBlocker{Plaza: "NENE", Owner: "Admin", X: 1010000, Y: 90, Z: -101000}) || len(heard["portalsCells"]) != 0 {
		t.Fatalf("the admin's plot: %+v", answer)
	}
}
