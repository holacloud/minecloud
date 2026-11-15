package network

// The transport network (FEAT_TRANSPORT_AND_PORTALS.md): fixed plazas joined by official portals, so that a
// child can reach places very far away without walking. js/game/portals.js is the client's half and mirrors
// the rule and the shapes below (test/js/portals.test.js holds the two together).
//
//   - An address is the way from the centre: 0 to 4 letters among N, S, E and O, never N and S together nor E
//     and O together. The first letter moves 1,000 blocks, the second 10,000, the third 100,000, the fourth
//     1,000,000, and the plaza stands at the sum. North is -z and east is +x, as in js/blockShapes.js
//     (SHAPE_DIRECTIONS). The central plaza is the empty address, at (0, 0).
//   - Each plaza of level n (its number of letters) below the last level has a portal for every letter that
//     makes a valid address of level n+1: 4 in the central plaza, 3 in one whose way uses one axis (N, NN),
//     2 in the others (NE). The colour says the level of the jump: red, orange, yellow, green.
//   - Every plaza but the central one also has the portal back to the plaza it is reached from (its address
//     without the last letter), on the edge across from that letter: whoever arrives has it at their back.
//     It has the colour of the jump it undoes, so N has three orange portals and a red one on its south
//     edge. That edge is always free: its letter never makes a valid address (portalsDoors).
//   - All 4 levels are built (portalsLevels): 105 plazas, 104 portals out and 104 back. The farthest plaza,
//     OOOO, is 1,111,000 blocks from the centre, inside the 2,097,152 a client may ask chunks from (worldReach,
//     chunks.go). The plazas of four letters are the ends of the network: they have only the portal back.
//
// A plaza is two squares centred on its position: the core, (2*portalsPlazaRadius+1) blocks square, of
// portalsPlazaBlock with a ring of the plaza's colour on its edge (portalsTrimBlock: white for the central
// plaza, else the colour of the jump that reaches it), and around it the margin, portalsMargin blocks more on
// each side, of portalsPavingBlock: room for shops. Its floor is level, at the height of the highest column of
// the generator's terrain under the whole footprint, and never under the sea (portalsFloorY): the floor block
// takes the place of the top block of the highest ground (ColumnSurface.Height is that block) or of the top
// block of the water (WaterLevel), so nothing natural stands above it and a plaza sits on a peak instead of
// being a pit cut into it. The generator's numbers only, so a second build finds the same height. The first
// time it is built the columns above it are cleared to the sky, whatever an earlier layout of the network
// left below the floor (blocks named portal_*) is taken away, and the columns below are filled with
// cobblestone down through air, plants and trees to the ground, at most portalsFoundation blocks: never into
// water, so over the sea a plaza is a deck on it.
//
// In the core: at the centre, flush in the floor, portalsCompassBlock, whose top shows the cardinal points
// (where a traveller arrives; a right click on it explains the plaza, js/game/portals.js); four posts at the
// corners of the core, just inside its ring of colour (portalsPostOffset from the centre along x and z), each
// from the floor up portalsLegendBlock (a right click explains the plaza too), the address read from top to
// bottom in letter blocks (portal_letter_n, _e, _s, _o: its first letter highest; portalsStarBlock in the
// central plaza, which has none), and a cap of the plaza's colour. The middle of the core is left free. A
// portal stands on the middle of each side of the core, on the coloured ring: a frame of portalsPlazaBlock 5
// wide and 4 tall around a pane 3 wide and 3 tall of portal_<colour>, which nobody collides with (walking
// into it is crossing it: the client then takes the player to the centre of the plaza it leads to, looking
// the way they crossed it), and on the middle of its lintel the letter block of the way it is crossed.
//
// Protection: nobody but the admin (claimAdmin) breaks, covers or replaces a block of a plaza or a portal, nor
// places one anywhere (portalsGuard, asked by claimBreakAllowed and claimPlaceBlock in claims.go), and rams
// never move them (mechFixed). The names say what is official, so it needs no list of cells and no saved
// state: every block named portal_* is one (portalsOfficial). Building on top of a network plaza, core or
// margin, is building in the air over it, which nothing refuses; the central plaza's whole footprint lies
// inside the spawn zone, where nobody but the admin builds anything.
//
// Building: portalsBuild {} from a creative session ("/build portals", js/game/constructions.js); anybody else
// is ignored, as with every creative command. Plaza by plaza, under blockEditMu, it writes only the cells
// that differ from what the plaza should hold. A plaza that is already there (portalsCompassBlock at its
// centre, at the height of its floor: no earlier layout had that block) keeps everything built on it: only its
// own blocks are put right, and no column is looked through. So a second build changes nothing. Every build,
// of a plaza already there or not, also empties the cells of the posts of the second layout (portalsOldPosts:
// four columns at 3 from the centre) that hold a block of the network, which costs 24 cells a plaza. Each plaza's
// changed cells go as portalsCells {cells: [[x, y, z, name], ...]} ("" for air), at most
// portalsCellsPerMessage cells a message, to the clients whose chunk stream is focused near enough to have its
// chunks (portalsTell): a client further away asks for those chunks when it gets there, and the server sends
// them as they now are. The sender then hears portalsBuilt {plazas, portals, back, changed, levels} (portals
// out, and portals back), or {error: "busy"} while another build runs.

import (
	"log"
	"strings"
	"sync"

	"minecloud/pkg/terrain"
	"minecloud/pkg/world"
)

const (
	// The levels the build makes, and those the rule knows.
	portalsLevels    = 4
	portalsMaxLevels = 4
	// The first jump; each letter after it jumps ten times further.
	portalsFirstJump = 1000
	// Blocks of the core on each side of the centre (17 x 17): its edges hold the portals.
	portalsPlazaRadius = 8
	// Blocks of the margin round the core on each side: the whole footprint is 31 x 31.
	portalsMargin = 7
	// A portal's frame: posts this far from its middle, a pane as tall as this between them, under a lintel.
	portalsFrameHalf  = 2
	portalsPaneHeight = 3
	// The posts that spell the address stand at this distance from the centre along x and along z: at the
	// corners of the core, just inside its ring of colour.
	portalsPostOffset = 7
	// Where the posts of the second layout stood, and the cells over the floor a post can take (the legend,
	// four letters and the cap): every build empties what of the network is left there (portalsOldPosts).
	portalsOldPostOffset = 3
	portalsPostCells     = 6
	// The deepest a plaza's foundation goes: the deepest drop under a footprint is 22 blocks among the 105
	// plazas, at ONOO (TestPortalsPlazasRestOnTheGround).
	portalsFoundation = 24
	// The most cells one portalsCells message carries: about 10 KB.
	portalsCellsPerMessage = 256
	portalsPlazaBlock      = "portal_plaza"
	portalsPavingBlock     = "portal_paving"
	portalsCompassBlock    = "portal_compass"
	portalsLegendBlock     = "portal_legend"
	portalsStarBlock       = "portal_star"
	portalsFillBlock       = "cobblestone"
	// claimRefused.reason for a block of a plaza or a portal.
	claimReasonPlaza = "plaza"
)

// The letters in the order a plaza lists its portals, and where each one goes (x, z).
var (
	portalsLetters = []byte{'N', 'E', 'S', 'O'}
	portalsSteps   = map[byte][2]int{'N': {0, -1}, 'E': {1, 0}, 'S': {0, 1}, 'O': {-1, 0}}
	// The edge across from each letter: where the portal back stands.
	portalsOpposite = map[byte]byte{'N': 'S', 'E': 'O', 'S': 'N', 'O': 'E'}
	// The colour of a portal by the level of its jump (1 to 4): that of the farther of its two plazas.
	portalsColours = []string{"", "red", "orange", "yellow", "green"}
	// The posts' corners, in the order the shape lists them: north-west, north-east, south-east, south-west.
	portalsPostCorners = [][2]int{{-1, -1}, {1, -1}, {1, 1}, {-1, 1}}
)

// portalsValid says whether an address names a plaza of the rule (any of its 4 levels).
func portalsValid(address string) bool {
	if len(address) > portalsMaxLevels {
		return false
	}
	for i := 0; i < len(address); i++ {
		if _, ok := portalsSteps[address[i]]; !ok {
			return false
		}
	}
	return !(strings.ContainsRune(address, 'N') && strings.ContainsRune(address, 'S')) &&
		!(strings.ContainsRune(address, 'E') && strings.ContainsRune(address, 'O'))
}

// portalsPosition is where the plaza of an address stands: its centre column.
func portalsPosition(address string) (x, z int) {
	jump := portalsFirstJump
	for i := 0; i < len(address); i++ {
		step := portalsSteps[address[i]]
		x += step[0] * jump
		z += step[1] * jump
		jump *= 10
	}
	return x, z
}

// portalsExits are the letters of the portals of a plaza that lead further out when `levels` levels are built.
func portalsExits(address string, levels int) []byte {
	if len(address) >= levels {
		return nil
	}
	var exits []byte
	for _, letter := range portalsLetters {
		if portalsValid(address + string(letter)) {
			exits = append(exits, letter)
		}
	}
	return exits
}

// portalsAddresses lists every plaza of `levels` levels, level by level, the central one first.
func portalsAddresses(levels int) []string {
	all := []string{""}
	for from := 0; from < len(all); from++ {
		for _, letter := range portalsExits(all[from], levels) {
			all = append(all, all[from]+string(letter))
		}
	}
	return all
}

// portalsDoor is one portal of a plaza: the edge it stands on (and so the way it is crossed), the plaza it
// leads to, and the level of its jump, which is its colour.
type portalsDoor struct {
	Side  byte
	To    string
	Level int
}

// portalsDoors are the portals of a plaza when `levels` levels are built: those that lead further out, and
// then the one back to where it is reached from.
func portalsDoors(address string, levels int) []portalsDoor {
	var doors []portalsDoor
	for _, letter := range portalsExits(address, levels) {
		doors = append(doors, portalsDoor{letter, address + string(letter), len(address) + 1})
	}
	if last := len(address) - 1; last >= 0 {
		doors = append(doors, portalsDoor{portalsOpposite[address[last]], address[:last], len(address)})
	}
	return doors
}

// portalsPaneBlock is the block of the pane of a portal whose jump is of this level.
func portalsPaneBlock(level int) string {
	return "portal_" + portalsColours[level]
}

// portalsTrimBlock is the block of the colour of a plaza of this level (0 to 4): the ring round its core and
// the caps of its posts. That of the jump that reaches it, which is also that of its portal back; the
// central plaza's is white.
func portalsTrimBlock(level int) string {
	if level == 0 {
		return "portal_trim_white"
	}
	return "portal_trim_" + portalsColours[level]
}

// portalsLetterBlock is the block that shows one letter of an address on its four sides.
func portalsLetterBlock(letter byte) string {
	return "portal_letter_" + strings.ToLower(string(letter))
}

// portalsBlockNames are all the blocks of the network, for the lists that need them by name (mechFixed).
func portalsBlockNames() []string {
	names := []string{portalsPlazaBlock, portalsPavingBlock, portalsCompassBlock, portalsLegendBlock, portalsStarBlock}
	for level := 0; level <= portalsMaxLevels; level++ {
		names = append(names, portalsTrimBlock(level))
		if level > 0 {
			names = append(names, portalsPaneBlock(level))
		}
	}
	for _, letter := range portalsLetters {
		names = append(names, portalsLetterBlock(letter))
	}
	return names
}

// portalsOfficial says whether a block is part of a plaza or a portal.
func portalsOfficial(name string) bool {
	return strings.HasPrefix(storageBase(name), "portal_")
}

// portalsFootprint is how far a plaza's floor reaches from its centre, margin included.
func portalsFootprint() int {
	return portalsPlazaRadius + portalsMargin
}

// portalsFloorY is the height of the floor of the plaza centred on column (x, z): that of the highest
// column of the terrain under its footprint (Height is the y of its top block), or of the sea's top block
// where nothing is higher. The floor's block takes that block's place, so its top is flush with that ground.
func portalsFloorY(x, z int) int {
	floorY := terrain.WaterLevel
	f := portalsFootprint()
	for cx := x - f; cx <= x+f; cx++ {
		for cz := z - f; cz <= z+f; cz++ {
			floorY = max(floorY, terrain.ColumnSurface(cx, cz).Height)
		}
	}
	return floorY
}

// portalsCell is one cell of a plaza and what it holds.
type portalsCell struct {
	X, Y, Z int
	Name    string
}

// portalsShape is every block of a plaza whose floor is at floorY, in this order (js/game/portals.js lists
// them in the same one): the floor of the footprint row by row, the four posts, and each portal's frame and
// pane followed by its sign.
func portalsShape(address string, floorY, levels int) []portalsCell {
	cx, cz := portalsPosition(address)
	r, f := portalsPlazaRadius, portalsFootprint()
	trim := portalsTrimBlock(len(address))
	cells := make([]portalsCell, 0, (2*f+1)*(2*f+1)+4*(len(address)+3)+4*21)
	for x := cx - f; x <= cx+f; x++ {
		for z := cz - f; z <= cz+f; z++ {
			name := portalsPavingBlock
			switch ring := max(abs(x-cx), abs(z-cz)); {
			case ring == 0:
				name = portalsCompassBlock
			case ring < r:
				name = portalsPlazaBlock
			case ring == r:
				name = trim
			}
			cells = append(cells, portalsCell{x, floorY, z, name})
		}
	}
	for _, corner := range portalsPostCorners {
		x, z := cx+corner[0]*portalsPostOffset, cz+corner[1]*portalsPostOffset
		post := []string{portalsLegendBlock}
		if address == "" {
			post = append(post, portalsStarBlock)
		}
		// Read from top to bottom: the first letter highest.
		for i := len(address) - 1; i >= 0; i-- {
			post = append(post, portalsLetterBlock(address[i]))
		}
		post = append(post, trim)
		for i, name := range post {
			cells = append(cells, portalsCell{x, floorY + 1 + i, z, name})
		}
	}
	for _, door := range portalsDoors(address, levels) {
		pane := portalsPaneBlock(door.Level)
		step := portalsSteps[door.Side]
		// The middle of the portal on the core's edge, and the way across it.
		mx, mz := cx+step[0]*r, cz+step[1]*r
		ax, az := step[1]*step[1], step[0]*step[0]
		for along := -portalsFrameHalf; along <= portalsFrameHalf; along++ {
			for up := 1; up <= portalsPaneHeight+1; up++ {
				name := portalsPlazaBlock
				if along > -portalsFrameHalf && along < portalsFrameHalf && up <= portalsPaneHeight {
					name = pane
				}
				cells = append(cells, portalsCell{mx + ax*along, floorY + up, mz + az*along, name})
			}
		}
		cells = append(cells, portalsCell{mx, floorY + portalsPaneHeight + 2, mz, portalsLetterBlock(door.Side)})
	}
	return cells
}

// portalsOldPosts are the cells over the floor where the posts of the second layout stood, in the plaza of
// an address whose floor is at floorY: portalsPostCells a column, in the four columns portalsOldPostOffset from
// the centre along x and z. No cell of the shape is among them.
func portalsOldPosts(address string, floorY int) [][3]int {
	cx, cz := portalsPosition(address)
	cells := make([][3]int, 0, len(portalsPostCorners)*portalsPostCells)
	for _, corner := range portalsPostCorners {
		for up := 1; up <= portalsPostCells; up++ {
			cells = append(cells, [3]int{cx + corner[0]*portalsOldPostOffset, floorY + up, cz + corner[1]*portalsOldPostOffset})
		}
	}
	return cells
}

// portalsGuard keeps the plazas and portals as they are: nil when the client may change cell (x, y, z) into
// `placing` ("" for a break).
func portalsGuard(client *Client, x, y, z int, placing string) *claimRefusal {
	if claimAdmin(client) {
		return nil
	}
	if placing != "" && portalsOfficial(placing) {
		return &claimRefusal{Reason: claimReasonPlaza}
	}
	if current, err := chunkStore.Block(x, y, z); err == nil && portalsOfficial(current) {
		return &claimRefusal{Reason: claimReasonPlaza}
	}
	return nil
}

// portalsHollow is what a foundation goes down through: air, small plants (mechSoft) and the trees and cacti
// the generator grows (what of them stood above the floor is cleared anyway), never a liquid, so that it
// stops on the sea.
func portalsHollow(name string) bool {
	if name == "water" || name == "lava" {
		return false
	}
	return mechSoft[name] || name == "cactus" || name == "wood" || name == "leaves" ||
		strings.HasSuffix(name, "_wood") || strings.HasSuffix(name, "_leaves")
}

// portalsWrite puts a block in a cell as a break or a place by the admin would: what a chest held goes to the
// admin, a sign's text and the paint on the cell go, and a plot whose marker is covered goes with it.
// The caller holds blockEditMu.
func portalsWrite(client *Client, x, y, z int, was, name string) error {
	spill, _, err := storage.replace(chunkStore, x, y, z, name, func() (bool, error) {
		return setBlockTracked(x, y, z, name)
	})
	if err != nil {
		return err
	}
	key := blockKey(x, y, z)
	stateMu.Lock()
	_, hadMetadata := gameState.Blocks[key]
	delete(gameState.Blocks, key)
	removeSprayPaintsForBlockLocked(x, y, z)
	stateMu.Unlock()
	if hadMetadata {
		worldBlocks.changed()
	}
	if len(spill) > 0 {
		worldStorage.changed()
		storageSendDrop(client, x, y, z, spill)
	}
	claimBroken(was, x, y, z)
	return nil
}

// portalsBuildPlaza makes one plaza (see the header) and returns the cells it changed, as portalsCells
// tells them. The caller holds blockEditMu.
func portalsBuildPlaza(client *Client, address string, levels int) ([][4]interface{}, error) {
	cx, cz := portalsPosition(address)
	floorY := portalsFloorY(cx, cz)
	var changed [][4]interface{}
	set := func(x, y, z int, name string) error {
		was, err := chunkStore.Block(x, y, z)
		if err != nil {
			return err
		}
		if was == name || (name == "" && was == "air") {
			return nil
		}
		if err := portalsWrite(client, x, y, z, was, name); err != nil {
			return err
		}
		changed = append(changed, [4]interface{}{x, y, z, name})
		return nil
	}
	centre, err := chunkStore.Block(cx, floorY, cz)
	if err != nil {
		return nil, err
	}
	if centre != portalsCompassBlock {
		f := portalsFootprint()
		for x := cx - f; x <= cx+f; x++ {
			for z := cz - f; z <= cz+f; z++ {
				// What an earlier layout left under the floor (its plaza lay lower, at the height of the
				// ground at its centre) goes; above the floor everything goes anyway.
				for y := floorY - 1; y > terrain.WorldMinY; y-- {
					below, err := chunkStore.Block(x, y, z)
					if err != nil {
						return changed, err
					}
					if portalsOfficial(below) {
						if err := set(x, y, z, ""); err != nil {
							return changed, err
						}
					}
				}
				for y := floorY - 1; y >= max(floorY-portalsFoundation, terrain.WorldMinY+1); y-- {
					below, err := chunkStore.Block(x, y, z)
					if err != nil {
						return changed, err
					}
					if !portalsHollow(below) {
						break
					}
					if err := set(x, y, z, portalsFillBlock); err != nil {
						return changed, err
					}
				}
				for y := floorY + 1; y <= terrain.WorldMaxY; y++ {
					if err := set(x, y, z, ""); err != nil {
						return changed, err
					}
				}
			}
		}
	}
	// The posts of the second layout stood in the middle of the core (the user's world has them): what of the
	// network is left in their columns goes, and whatever else somebody built there stays.
	for _, cell := range portalsOldPosts(address, floorY) {
		was, err := chunkStore.Block(cell[0], cell[1], cell[2])
		if err != nil {
			return changed, err
		}
		if portalsOfficial(was) {
			if err := set(cell[0], cell[1], cell[2], ""); err != nil {
				return changed, err
			}
		}
	}
	for _, cell := range portalsShape(address, floorY, levels) {
		if err := set(cell.X, cell.Y, cell.Z, cell.Name); err != nil {
			return changed, err
		}
	}
	return changed, nil
}

// portalsTell sends what a build changed in the plaza centred on column (x, z) to the clients that can
// have its chunks: those whose chunk stream (chunks.go) is focused within its radius, and one chunk more, of
// a chunk of the footprint. The client keeps chunks only that far (js/world.js, chunkFocusRadius), and what
// it asks for later comes from the store as it now is. In messages of portalsCellsPerMessage cells; a client
// with no room for them is dropped, as broadcastToAll does, since it would go on with a wrong world.
func portalsTell(x, z int, cells [][4]interface{}) {
	if len(cells) == 0 {
		return
	}
	f := portalsFootprint()
	minX, minZ := world.ChunkCoords(x-f, z-f)
	maxX, maxZ := world.ChunkCoords(x+f, z+f)
	var messages [][]byte
	for from := 0; from < len(cells); from += portalsCellsPerMessage {
		part := cells[from:min(from+portalsCellsPerMessage, len(cells))]
		messages = append(messages, createMessage("portalsCells", map[string]interface{}{"cells": part}))
	}
	clientsMu.RLock()
	everybody := make([]*Client, 0, len(clients))
	for client := range clients {
		everybody = append(everybody, client)
	}
	clientsMu.RUnlock()
	var stale []*Client
	for _, client := range everybody {
		if client.stream == nil {
			continue
		}
		client.stream.mu.Lock()
		focusX, focusZ, reach := client.stream.focusX, client.stream.focusZ, client.stream.radius+1
		client.stream.mu.Unlock()
		if focusX < minX-reach || focusX > maxX+reach || focusZ < minZ-reach || focusZ > maxZ+reach {
			continue
		}
		for _, message := range messages {
			if !client.trySend(message) {
				stale = append(stale, client)
				break
			}
		}
	}
	if len(stale) == 0 {
		return
	}
	clientsMu.Lock()
	for _, client := range stale {
		if clients[client] {
			delete(clients, client)
			client.drop()
		}
	}
	clientsMu.Unlock()
}

// One build at a time.
var portalsBuildMu sync.Mutex

func handlePortalsBuild(client *Client) {
	// To anybody else there is no such thing, as with every creative command.
	if !claimAdmin(client) {
		return
	}
	if !portalsBuildMu.TryLock() {
		client.trySend(createMessage("portalsBuilt", map[string]interface{}{"error": "busy"}))
		return
	}
	defer portalsBuildMu.Unlock()
	answer := map[string]interface{}{"levels": portalsLevels}
	plazas, portals, back, total := 0, 0, 0, 0
	for _, address := range portalsAddresses(portalsLevels) {
		blockEditMu.Lock()
		cells, err := portalsBuildPlaza(client, address, portalsLevels)
		blockEditMu.Unlock()
		x, z := portalsPosition(address)
		portalsTell(x, z, cells)
		total += len(cells)
		if err != nil {
			log.Printf("portals: plaza %q: %v", address, err)
			answer["error"] = "world"
			break
		}
		plazas++
		exits := len(portalsExits(address, portalsLevels))
		portals += exits
		back += len(portalsDoors(address, portalsLevels)) - exits
	}
	log.Printf("portals: %s built %d plazas, %d portals out and %d back, %d cells changed", client.ID, plazas, portals, back, total)
	answer["plazas"], answer["portals"], answer["back"], answer["changed"] = plazas, portals, back, total
	storageDeliver(client, createMessage("portalsBuilt", answer))
}

func init() {
	// Plazas and portals are never pushed by a ram (mechanics.go).
	for _, name := range portalsBlockNames() {
		mechFixed[name] = true
	}
	// Only a creative session gets as far as building, and that is the admin, who changes any cell.
	registerMessage(messageSpec{plot: plotChecked, handle: func(c *Client, m Message) { handlePortalsBuild(c) }}, "portalsBuild")
}
