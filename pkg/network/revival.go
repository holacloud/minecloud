package network

import (
	"fmt"
	"log"
	"math"
	"sort"
	"strings"
	"time"

	"minecloud/pkg/terrain"
)

// The revival machine (js/game/revival.js draws its panel): a block that takes the fossils of an extinct
// animal, works for a while on electricity and brings the animal back to life next to it, for everybody.
// It is a chest of three slots in storage.go's book, under its one lock, so its fossils are put in and taken
// out with the messages of any chest (storagePut, storageTake: already refused in someone else's plot) and
// it adds no message of the client's. What it adds is a storagePart, a loop of its own and one message of
// the server's.
//
//   - Fossils. Only fossils go in (revivalFossil): `fossil_<species>` in the first slot or, for an animal
//     found as a skeleton, `fossil_<species>_skull`, `_spine` and `_tail`, each in its own slot. They make a
//     set when they are all of one animal and none of its pieces is missing. A slot may hold several of the
//     same fossil: one of each is used up by each animal.
//   - Power. It is an electric consumer of power.go that asks for its watts only while it works
//     (OnDemand). Power comes in through its four sides and from below.
//   - The signal. Its TOP face is its signal input and nothing else: like the input of a gate it never
//     conducts (powerKind.SignalTop, logic.go), so what stands on the machine never joins the network that
//     feeds it. The signal is on while the block right above the machine is an electric block that conducts
//     downwards and whose network carries a signal (logicInput): a lever that is on, a button while it is
//     pressed, a plate, a sensor or a gate that is on, or a wire (or any other electric block) whose network
//     is live or holds a switched-on logic block.
//   - Starting is by level, not by edge: at the first tick at which the fossils are a set, the signal is on,
//     a sea animal has its water and there are not too many animals around, the revival starts. From then
//     on the signal no longer matters. So a lever left on starts it as soon as the fossils go in, a button's
//     pulse is enough, and a clock or a gate can drive it. The loop runs as often as the grid
//     (revivalTickInterval), so a pulse of one tick of a circuit is not missed.
//   - Working. It counts the seconds it has power, up to those of its animal (revivalSpecies). Without
//     power it waits and keeps what it has done. Taking a fossil out stops it and what it had done is lost
//     (the fossil is the player's again): nothing is ever locked inside it. Its name shows that it is
//     really working, `revival_machine:on`, which only this file decides.
//   - Water. A sea animal needs the machine to touch a body of at least so many joined blocks of water:
//     counted by flooding from the water on its six faces, through faces, no further than
//     revivalWaterReach blocks to each side and no more than what is asked (the sea counts, as far as that).
//   - The animal. When the work is done the fossils are used up and the animal is made with animalSpawn
//     (animals.go): the server keeps it, everybody near sees the same one and it is there after a restart.
//     A land animal appears on a free cell next to the machine from which it can walk away (revivalGround),
//     a sea animal in the cell of its water, within a few blocks, with the most water around it
//     (revivalWater), and that cell is its home. Never in another plot or zone than the machine's own. With
//     no such place the machine waits, done, and looks again every second.
//   - Enough is enough: it does not start while revivalCrowdMax kept animals or more live within
//     revivalCrowdRange blocks of it.
//
// What the server says: storageContents carries `revival` (revivalView) to whoever has its panel open, when
// it changes; and revivalDone {x, y, z, species, id, at} goes to the players within revivalTellRange blocks
// when an animal is made, for the sound, the sparks and the bestiary.
//
// Crashes: a start, a stop and an animal only mark the chests to be saved with the next round, as the
// animals are, so both files are written together: a crash either keeps the animal and uses up the fossils or
// neither. The seconds done are marked every revivalSaveEvery.
//
// revivalSpecies is the server's table of the species. The client says the same of each in the `fossil` of
// its registerSpecies and in its movement (js/game/fossils.js, js/extensions.js), and test/js/revival.test.js
// checks every species of the game with a fossil against its row here.

const (
	revivalKind = "revival_machine"
	// The loop: as often as the grid, so that the shortest pulse a circuit makes is seen.
	revivalTickInterval = powerTickInterval
	revivalSaveEvery    = applianceSaveEvery
	// How often a machine that waits looks at the water and the animals around it, and for a place for
	// the animal it has finished.
	revivalLookEvery = 2 * time.Second
	revivalRoomEvery = time.Second
	// Enough is enough: this many kept animals within so many blocks, and it does not start.
	revivalCrowdMax   = 12
	revivalCrowdRange = 32.0
	// Blocks to each side of the machine that its body of water is looked at, blocks from it (to each side,
	// up and down) within which a sea animal is born, and a land one (to each side).
	revivalWaterReach = 16
	revivalBirthReach = 4
	revivalRoomReach  = 3
	// Players this near are told that an animal was made.
	revivalTellRange = 48.0
	// What is left of a second after adding up ticks of a fifth.
	revivalEpsilon = 1e-6
)

// revivalRow is what the server knows of an extinct species.
type revivalRow struct {
	// 1 fossil, or 3: the skull, the spine and the tail of a skeleton.
	Pieces int
	// Joined blocks of water the machine must touch (0: a land animal).
	Water int
	// Seconds of work, with power.
	Seconds float64
	// What animalSpawn is told (animals.go): how far from its home the server walks it, which is more than
	// 0 exactly for a species whose movement walks to a goal, and the blocks a second it walks.
	Radius float64
	Speed  float64
	// A hostile one that the server walks goes after a player (animals.go): from how many blocks (0: a
	// peaceful one), from how many by day when that is another distance (a nocturnal one; 0: the same),
	// and how fast. What animalsChaseOf (js/game/animals.js) says of its species; the last two are only
	// written in the rows that have them.
	Chase      float64
	ChaseDay   float64
	ChaseSpeed float64
}

// Every extinct species, in the groups they arrive in. A species' own task changes its row here when its
// file says otherwise (test/js/revival.test.js names the row and the field), and only its row: each group
// is the work of one task.
var revivalSpecies = map[string]revivalRow{
	// The first to arrive, on land.
	"dodo":          {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.42, Chase: 0},
	"eohippus":      {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.6, Chase: 0},
	"kubanochoerus": {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.36, Chase: 0},

	// And in the water.
	"trilobite":  {Pieces: 1, Water: 4, Seconds: 20, Radius: 0, Speed: 0.35, Chase: 0},
	"ammonite":   {Pieces: 1, Water: 6, Seconds: 20, Radius: 0, Speed: 0.5, Chase: 0},
	"plesiosaur": {Pieces: 3, Water: 120, Seconds: 120, Radius: 0, Speed: 1.1, Chase: 0},

	// Mammals.
	"dire_wolf":     {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.5, Chase: 16, ChaseSpeed: 2.4},
	"smilodon":      {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.42, Chase: 12, ChaseSpeed: 2},
	"sivatherium":   {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.36, Chase: 0},
	"titanotylopus": {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.45, Chase: 0},
	"castoroides":   {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.4, Chase: 0},

	// Small mammals.
	"myotragus":      {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.3, Chase: 0},
	"argali":         {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.45, Chase: 0},
	"nuralagus":      {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.32, Chase: 0},
	"onychonycteris": {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 1.1, Chase: 0},

	// Birds, and what glides.
	"vegavis":     {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.5, Chase: 0},
	"heracles":    {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.4, Chase: 0},
	"haast_eagle": {Pieces: 1, Water: 0, Seconds: 45, Radius: 0, Speed: 3.6, Chase: 0},
	"argentavis":  {Pieces: 1, Water: 0, Seconds: 45, Radius: 0, Speed: 3, Chase: 0},
	"giant_owl":   {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.6, Chase: 0},
	"pterosaur":   {Pieces: 1, Water: 0, Seconds: 45, Radius: 0, Speed: 3.4, Chase: 0},

	// Reptiles, a frog and a fish.
	"titanoboa":    {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.5, Chase: 10, ChaseSpeed: 1.3},
	"megalania":    {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.4, Chase: 12, ChaseSpeed: 1.5},
	"beelzebufo":   {Pieces: 1, Water: 0, Seconds: 45, Radius: 0, Speed: 2.6, Chase: 0},
	"archelon":     {Pieces: 1, Water: 60, Seconds: 45, Radius: 0, Speed: 0.75, Chase: 0},
	"dunkleosteus": {Pieces: 1, Water: 60, Seconds: 45, Radius: 0, Speed: 0.9, Chase: 0},

	// Arthropods.
	"pulmonoscorpius": {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.4, Chase: 10, ChaseSpeed: 1.2},
	"mongolarachne":   {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.45, Chase: 0},
	"callichimaera":   {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.5, Chase: 0},
	"hell_ant":        {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.5, Chase: 6, ChaseSpeed: 1.4},
	"ancient_bee":     {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.7, Chase: 0},
	"ancient_firefly": {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.5, Chase: 0},

	// The big ones of the land.
	"mammoth":      {Pieces: 3, Water: 0, Seconds: 45, Radius: 8, Speed: 0.4, Chase: 0},
	"deinotherium": {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.42, Chase: 0},
	"glyptodon":    {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.25, Chase: 0},
	"triceratops":  {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.36, Chase: 0},

	// The giants.
	"diplodocus":    {Pieces: 3, Water: 0, Seconds: 120, Radius: 8, Speed: 0.38, Chase: 0},
	"tyrannosaurus": {Pieces: 3, Water: 0, Seconds: 120, Radius: 8, Speed: 0.38, Chase: 0},

	// The rest of the sea and the air.
	"megalodon":    {Pieces: 3, Water: 300, Seconds: 120, Radius: 0, Speed: 0.38, Chase: 0},
	"anomalocaris": {Pieces: 1, Water: 16, Seconds: 45, Radius: 0, Speed: 0.38, Chase: 0},
	"meganeura":    {Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.38, Chase: 0},
}

// The pieces of a skeleton, each in the slot of its place here (FOSSIL_PIECES in js/game/fossils.js).
var revivalPieces = [3]string{"skull", "spine", "tail"}

// revivalFossil says what a fossil is: the species it brings back and the slot it goes in. ok is false for
// anything that is not the fossil of a species of the table.
func revivalFossil(item string) (species string, slot int, ok bool) {
	rest, isFossil := strings.CutPrefix(item, "fossil_")
	if !isFossil {
		return "", 0, false
	}
	if row, known := revivalSpecies[rest]; known && row.Pieces == 1 {
		return rest, 0, true
	}
	for i, piece := range revivalPieces {
		if skeleton, isPiece := strings.CutSuffix(rest, "_"+piece); isPiece {
			if row, known := revivalSpecies[skeleton]; known && row.Pieces == len(revivalPieces) {
				return skeleton, i, true
			}
		}
	}
	return "", 0, false
}

// revivalSet is what the fossils in a machine make.
type revivalSet struct {
	// The animal they are of: "" with none in, or with those of more than one.
	Species string
	// Fossils of more than one animal.
	Mixed bool
	// The pieces of its skeleton that are not in.
	Missing []string
}

// complete: the fossils of one animal, all of them.
func (s revivalSet) complete() bool {
	return s.Species != "" && len(s.Missing) == 0
}

func revivalSetOf(slots []StorageSlot) revivalSet {
	var set revivalSet
	var held [len(revivalPieces)]bool
	for i, slot := range slots {
		if slot.Count <= 0 {
			continue
		}
		species, at, ok := revivalFossil(slot.Type)
		if !ok || at != i || (set.Species != "" && set.Species != species) {
			set.Mixed = true
			continue
		}
		set.Species = species
		held[i] = true
	}
	if set.Mixed {
		set.Species = ""
		return set
	}
	if set.Species != "" && revivalSpecies[set.Species].Pieces > 1 {
		for i, piece := range revivalPieces {
			if !held[i] {
				set.Missing = append(set.Missing, piece)
			}
		}
	}
	return set
}

// RevivalWork is what a revival machine with fossils in it is doing, as it is saved.
type RevivalWork struct {
	// The animal it is bringing back: "" until a signal starts it.
	Species string `json:"species,omitempty"`
	// Seconds it has worked.
	Done float64 `json:"done,omitempty"`
}

// started: a signal has set it to work on the fossils it holds.
func (work *RevivalWork) started() bool {
	return work != nil && work.Species != ""
}

// revivalSettle stops a machine whose fossils are no longer the set it was working on: one was taken out.
// What it had done is lost. Returns whether it stopped.
func revivalSettle(block *StorageBlock) bool {
	work := block.Revival
	if !work.started() {
		return false
	}
	if set := revivalSetOf(block.Slots); set.complete() && set.Species == work.Species {
		return false
	}
	work.Species, work.Done = "", 0
	return true
}

func revivalBlockName(lit bool) string {
	if lit {
		return revivalKind + ":on"
	}
	return revivalKind
}

// revivalView is a revival machine in a storageContents message.
type revivalView struct {
	// What its fossils make (revivalSet).
	Species string   `json:"species,omitempty"`
	Mixed   bool     `json:"mixed,omitempty"`
	Missing []string `json:"missing,omitempty"`
	// A signal has started it, and the whole seconds it has worked of those its animal takes.
	Working bool    `json:"working,omitempty"`
	Done    float64 `json:"done"`
	Seconds float64 `json:"seconds"`
	// Its top face has a signal now.
	Signal bool `json:"signal"`
	// While it works: the grid feeds it, or it has only just asked and there is no answer yet.
	Powered  bool `json:"powered"`
	Starting bool `json:"starting,omitempty"`
	// A sea animal: the joined water it needs, and what the machine touches of it (no more is counted).
	Water    int `json:"water,omitempty"`
	WaterHas int `json:"waterHas,omitempty"`
	// Too many animals live around it to start, and what too many is.
	Crowded    bool    `json:"crowded,omitempty"`
	CrowdMax   int     `json:"crowdMax"`
	CrowdRange float64 `json:"crowdRange"`
	// It has done its work and there is no place for the animal.
	NoRoom bool `json:"noRoom,omitempty"`
}

// revivalNews is an animal that a machine has just made (the revivalDone message).
type revivalNews struct {
	// The machine.
	X int `json:"x"`
	Y int `json:"y"`
	Z int `json:"z"`
	// The animal: its species, its number among the kept animals and where it appeared.
	Species string     `json:"species"`
	ID      uint32     `json:"id"`
	At      [3]float64 `json:"at"`
}

// What a machine was last seen to have around it. Not saved: it is looked at again.
type revivalSeen struct {
	// Its top face at the last tick, and when it last looked at its water and at the animals around.
	signal   bool
	lookedAt time.Time
	// The joined water it touches, up to what its animal needs, and whether too many animals live near.
	water   int
	crowded bool
	// It has done its work and found no place for the animal, and when it last looked for one.
	noRoom bool
	roomAt time.Time
	// When the seconds it has done were last marked to be saved.
	savedAt time.Time
}

// revivalBook is what the revival machines keep in the book of the chests (storage.go), under its mu.
type revivalBook struct {
	// The machines that hold a fossil, by the key of their entry in blocks: only these are ticked.
	reviving map[string]bool
	// What each of those was last seen to have around it.
	revivalSeen map[string]*revivalSeen
	// What the panel of each machine somebody has open was last told, to tell it when that changes.
	revivalShown map[[3]int]string
	// The world around a machine (replaced by the tests): whether its top face has a signal, the kept
	// animals near a place, the zone of a column (claims.go) and making the animal (animals.go).
	revivalSignal func(cell [3]int) bool
	revivalNear   func(x, z float64) int
	revivalZone   func(x, z int) string
	revivalSpawn  func(spec animalSpawnSpec) (uint32, bool)
}

// What the revival machines add to the chests (storagePart, storage.go).
var revivalPart = storagePart{
	init: func(b *storageBook) {
		b.reviving = make(map[string]bool)
		b.revivalSeen = make(map[string]*revivalSeen)
		b.revivalShown = make(map[[3]int]string)
		b.revivalSignal = func(cell [3]int) bool { return logicInputAt(cell, powerPos{0, 1, 0}) }
		b.revivalNear = func(x, z float64) int { return revivalAnimalsNear(x, z, revivalCrowdRange) }
		b.revivalZone, b.revivalSpawn = claimZoneKey, animalSpawn
	},
	loading: func(b *storageBook) {
		b.reviving = make(map[string]bool)
		b.revivalSeen = make(map[string]*revivalSeen)
	},
	clean: revivalCleanLoaded,
	// Every saved machine is looked at after a restart: the tick drops what is no machine in the world.
	loaded: func(b *storageBook, key string, block *StorageBlock) {
		if block.Revival != nil {
			b.reviving[key] = true
		}
	},
	copyState: func(copied, block *StorageBlock) {
		if block.Revival != nil {
			work := *block.Revival
			copied.Revival = &work
		}
	},
	view: func(b *storageBook, place storagePlace, block *StorageBlock, snapshot *storageSnapshot) {
		if place.kind != revivalKind {
			return
		}
		snapshot.Revival = b.revivalViewLocked(place.cell, block)
		// Only a panel somebody has open is told again (unwatched forgets it).
		if len(b.viewers[place.cell]) > 0 {
			b.revivalShown[place.cell] = revivalDigest(snapshot.Revival)
		}
	},
	// Only fossils, each in the slot of its piece.
	slotFor: func(place storagePlace, item string) (int, string, bool) {
		if place.kind != revivalKind {
			return 0, "", false
		}
		_, slot, ok := revivalFossil(item)
		if !ok {
			return 0, "not for the revival machine", true
		}
		return slot, "", true
	},
	changed: func(b *storageBook, place storagePlace, block *StorageBlock) {
		if place.kind != revivalKind {
			return
		}
		if block.Revival == nil {
			block.Revival = &RevivalWork{}
		}
		b.reviving[storageKeyOf(place.cell)] = true
		// A fossil taken out of a machine at work: the panel hears it stopped with this very change.
		revivalSettle(block)
	},
	// The last fossil was taken out: nothing ticks it after this, so it goes dark here.
	emptied: func(b *storageBook, w cropWorld, place storagePlace) {
		if place.kind == revivalKind {
			b.revivalForgetLocked(place.cell, storageKeyOf(place.cell))
			b.revivalShowLocked(w, place.cell, false)
		}
	},
	// A machine that a crash left lit with nothing in it goes dark the first time it is opened.
	opened: func(b *storageBook, w cropWorld, place storagePlace) {
		if place.kind == revivalKind {
			b.revivalShowLocked(w, place.cell, b.revivalLitLocked(place.cell))
		}
	},
	unwatched: func(b *storageBook, cell [3]int) { delete(b.revivalShown, cell) },
	gone:      func(b *storageBook, cell [3]int, key string) { b.revivalForgetLocked(cell, key) },
}

// revivalCleanLoaded limits what a saved machine can claim: work on the very set it holds, and no more
// seconds than its animal takes.
func revivalCleanLoaded(block *StorageBlock) {
	if block.Revival == nil {
		return
	}
	work := RevivalWork{}
	saved := block.Revival
	if set := revivalSetOf(block.Slots); set.complete() && set.Species == saved.Species && !math.IsNaN(saved.Done) {
		work.Species = saved.Species
		work.Done = math.Max(0, math.Min(revivalSpecies[saved.Species].Seconds, saved.Done))
	}
	block.Revival = &work
}

// revivalForgetLocked ends a machine's turn in the loop and its demand on the grid.
func (b *storageBook) revivalForgetLocked(cell [3]int, key string) {
	delete(b.reviving, key)
	delete(b.revivalSeen, key)
	b.stopAskingLocked(cell, key)
}

// revivalFedLocked says whether the grid feeds the machine now. It has heard a machine only two ticks after
// that first asked: the grid balances as often as this loop runs, and the two are not in step.
func (b *storageBook) revivalFedLocked(cell [3]int) bool {
	return b.asked[storageKeyOf(cell)] >= 2 && b.powered(cell)
}

// revivalLitLocked says whether the machine at this cell is really working now: started, not yet done,
// and fed.
func (b *storageBook) revivalLitLocked(cell [3]int) bool {
	block := b.blocks[storageKeyOf(cell)]
	if block == nil || !block.Revival.started() {
		return false
	}
	return block.Revival.Done < revivalSpecies[block.Revival.Species].Seconds-revivalEpsilon && b.revivalFedLocked(cell)
}

// revivalShowLocked makes a machine's name say whether it is working.
func (b *storageBook) revivalShowLocked(w cropWorld, cell [3]int, lit bool) {
	name, err := w.Block(cell[0], cell[1], cell[2])
	if err != nil || storageBase(name) != revivalKind {
		return
	}
	want := revivalBlockName(lit)
	if want == name {
		return
	}
	if err := w.SetBlock(cell[0], cell[1], cell[2], want); err != nil {
		log.Printf("revival: %v", err)
		return
	}
	b.nameChanges = append(b.nameChanges, Block{X: cell[0], Y: cell[1], Z: cell[2], BlockType: want})
}

// revivalSettleName is the name a placed machine gets: lit only if the one standing there is working,
// whatever a plan or a client asks for. Other blocks keep their name, and pay nothing for this.
func (b *storageBook) revivalSettleName(x, y, z int, name string) string {
	if storageBase(name) != revivalKind {
		return name
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return revivalBlockName(b.revivalLitLocked([3]int{x, y, z}))
}

// revivalViewLocked is what a panel is told of the machine at a cell (block is nil when it holds nothing).
// It reads what the tick last saw around the machine: nothing here looks at the world.
func (b *storageBook) revivalViewLocked(cell [3]int, block *StorageBlock) *revivalView {
	view := &revivalView{Signal: b.revivalSignal(cell), CrowdMax: revivalCrowdMax, CrowdRange: revivalCrowdRange}
	if block == nil {
		return view
	}
	set := revivalSetOf(block.Slots)
	row := revivalSpecies[set.Species]
	view.Species, view.Mixed, view.Missing = set.Species, set.Mixed, set.Missing
	view.Seconds, view.Water = row.Seconds, row.Water
	if seen := b.revivalSeen[storageKeyOf(cell)]; seen != nil {
		view.WaterHas, view.Crowded, view.NoRoom = min(seen.water, row.Water), seen.crowded, seen.noRoom
	}
	if work := block.Revival; work.started() && work.Species == set.Species {
		view.Working = true
		view.Done = math.Floor(work.Done + revivalEpsilon)
		if work.Done < row.Seconds-revivalEpsilon {
			view.Starting = b.asked[storageKeyOf(cell)] < 2
			view.Powered = b.revivalFedLocked(cell)
		}
	}
	return view
}

// revivalDigest is a view as one string: two views that say the same are the same string.
func revivalDigest(view *revivalView) string {
	return fmt.Sprintf("%+v", *view)
}

// tickRevival runs every machine that holds a fossil for dt seconds, and tells the panels that are open
// what has changed. Returns the blocks whose names changed and the animals made, for the loop to tell.
func (b *storageBook) tickRevival(w cropWorld, dt float64, now time.Time) ([]Block, []revivalNews) {
	b.mu.Lock()
	defer b.mu.Unlock()
	var news []revivalNews
	for key := range b.reviving {
		block := b.blocks[key]
		if block == nil || block.Revival == nil {
			delete(b.reviving, key)
			delete(b.revivalSeen, key)
			continue
		}
		cell := [3]int{block.X, block.Y, block.Z}
		name, err := w.Block(cell[0], cell[1], cell[2])
		if err != nil {
			log.Printf("revival: %v", err)
			continue
		}
		if storageBase(name) != revivalKind {
			// Changed behind the book's back: not a machine to run any more.
			b.revivalForgetLocked(cell, key)
			continue
		}
		if made := b.revivalStepLocked(w, key, cell, block, dt, now); made != nil {
			news = append(news, *made)
		}
		b.revivalShowLocked(w, cell, b.revivalLitLocked(cell))
	}
	// A panel hears of what changes by itself: the signal, the power, each second done, the water.
	for cell, shown := range b.revivalShown {
		if revivalDigest(b.revivalViewLocked(cell, b.blocks[storageKeyOf(cell)])) != shown {
			b.rev++
			b.notifyLocked(storagePlace{cell: cell, capacity: storageKinds[revivalKind], kind: revivalKind})
		}
	}
	return b.drainNameChangesLocked(), news
}

// revivalStepLocked is one tick of a machine that holds a fossil (see the header). Returns the animal it
// made, if it made one.
func (b *storageBook) revivalStepLocked(w cropWorld, key string, cell [3]int, block *StorageBlock, dt float64, now time.Time) *revivalNews {
	work := block.Revival
	seen := b.revivalSeen[key]
	if seen == nil {
		seen = &revivalSeen{}
		b.revivalSeen[key] = seen
	}
	if revivalSettle(block) {
		worldStorage.mark()
	}
	set := revivalSetOf(block.Slots)
	row := revivalSpecies[set.Species]
	signal := b.revivalSignal(cell)
	rose := signal && !seen.signal
	seen.signal = signal

	if !work.started() {
		b.stopAskingLocked(cell, key)
		seen.noRoom = false
		if !set.complete() {
			seen.water, seen.crowded = 0, false
			return nil
		}
		// Looking around floods the water: only for somebody (a signal, an open panel), now and then, and
		// at once when the signal comes on, so that a button's pulse finds what the player has just built.
		if !signal && len(b.viewers[cell]) == 0 {
			return nil
		}
		if rose || now.Sub(seen.lookedAt) >= revivalLookEvery {
			seen.lookedAt = now
			seen.water = 0
			if row.Water > 0 {
				seen.water, _, _ = revivalWater(w, cell, row.Water, nil)
			}
			seen.crowded = b.revivalNear(float64(cell[0])+0.5, float64(cell[2])+0.5) >= revivalCrowdMax
		}
		if !signal || seen.water < row.Water || seen.crowded {
			return nil
		}
		work.Species, work.Done = set.Species, 0
		seen.savedAt = now
		worldStorage.mark()
	}

	if work.Done < row.Seconds-revivalEpsilon {
		fed := b.revivalFedLocked(cell)
		var asking bool
		b.askLocked(cell, key, &asking)
		if !fed {
			return nil
		}
		work.Done = math.Min(row.Seconds, work.Done+dt)
		if now.Sub(seen.savedAt) >= revivalSaveEvery {
			seen.savedAt = now
			worldStorage.mark()
		}
		if work.Done < row.Seconds-revivalEpsilon {
			return nil
		}
	}

	// Done. The animal, as soon as there is a place for it.
	b.stopAskingLocked(cell, key)
	if now.Sub(seen.roomAt) < revivalRoomEvery {
		return nil
	}
	seen.roomAt = now
	return b.revivalBirthLocked(w, key, cell, block, set.Species, row, seen, now)
}

// revivalBirthLocked makes the animal of a machine that has done its work, if there is a place for it, and
// uses up its fossils. Returns the animal, or nil when it has to wait.
func (b *storageBook) revivalBirthLocked(w cropWorld, key string, cell [3]int, block *StorageBlock, species string, row revivalRow, seen *revivalSeen, now time.Time) *revivalNews {
	// Never into another plot than the machine's own, nor out of one (claims.go).
	zone := b.revivalZone(cell[0], cell[2])
	own := func(x, z int) bool { return b.revivalZone(x, z) == zone }
	var spot [3]int
	found := false
	if row.Water > 0 {
		seen.water, spot, found = revivalWater(w, cell, row.Water, own)
		seen.lookedAt = now
		if seen.water < row.Water {
			// The water went while it worked: it waits for it, and the panel says how much there is.
			seen.noRoom = false
			return nil
		}
	} else {
		spot, found = revivalGround(w, cell, own)
	}
	if !found {
		seen.noRoom = true
		return nil
	}
	// Its home: the middle of that cell, feet on its floor.
	at := [3]float64{float64(spot[0]) + 0.5, float64(spot[1]), float64(spot[2]) + 0.5}
	id, ok := b.revivalSpawn(animalSpawnSpec{
		Species: species, X: at[0], Y: at[1], Z: at[2], Radius: row.Radius, Speed: row.Speed,
		Variant: uint8(b.seed()), Origin: "revival",
		Chase: row.Chase, ChaseDay: row.ChaseDay, ChaseSpeed: row.ChaseSpeed,
	})
	if !ok {
		// The world keeps as many animals as it can (animals.go): it waits like for a place.
		seen.noRoom = true
		return nil
	}
	seen.noRoom = false
	// One of each fossil of the set is used up: every slot that holds something holds one of them.
	for i := range block.Slots {
		if slot := &block.Slots[i]; slot.Count > 0 {
			slot.Count--
			if slot.Count == 0 {
				*slot = StorageSlot{}
			}
		}
	}
	block.Revival.Species, block.Revival.Done = "", 0
	// Written with the animals, in the same round (see the header).
	worldStorage.mark()
	if block.holdsNothing() {
		delete(b.blocks, key)
		b.revivalForgetLocked(cell, key)
	}
	b.rev++
	b.notifyLocked(storagePlace{cell: cell, capacity: storageKinds[revivalKind], kind: revivalKind})
	return &revivalNews{X: cell[0], Y: cell[1], Z: cell[2], Species: species, ID: id, At: at}
}

// ---------------------------------------------------------------------------------------
// The place around a machine

// What a body can stand in, and what it can stand on. The server has no table of shapes: a small plant is
// no obstacle, water and lava are neither room nor floor, and anything else is taken for a floor (a client
// puts the body on the real one, js/game/animals.js).
func revivalIsFree(name string) bool {
	return name != "water" && name != "lava" && mechSoft[name]
}

func revivalIsFloor(name string) bool {
	return name != "" && !mechSoft[name]
}

// The columns around a machine where a land animal may appear, nearest first. Worked out once.
var revivalAround = func() [][2]int {
	var around [][2]int
	for dx := -revivalRoomReach; dx <= revivalRoomReach; dx++ {
		for dz := -revivalRoomReach; dz <= revivalRoomReach; dz++ {
			if dx != 0 || dz != 0 {
				around = append(around, [2]int{dx, dz})
			}
		}
	}
	sort.SliceStable(around, func(i, j int) bool {
		return around[i][0]*around[i][0]+around[i][1]*around[i][1] < around[j][0]*around[j][0]+around[j][1]*around[j][1]
	})
	return around
}()

// The heights tried, from the machine's own: the floor it stands on before a step down or up, and the roof
// of its room last of all.
var revivalHeights = [5]int{0, -1, 1, -2, 2}

// revivalGround finds where a land animal appears: a cell around the machine, at its height if there is one
// and the nearest of those, in a column that `own` allows, with a floor under it, two free cells to stand
// in and a cell next to it to walk to (a step up or down at most), so that it is born neither inside a
// block nor in a hole. Only when there is no such cell, on top of the machine itself, if that is free.
func revivalGround(w cropWorld, cell [3]int, own func(x, z int) bool) (spot [3]int, found bool) {
	read := make(map[[3]int]string)
	at := func(x, y, z int) string {
		p := [3]int{x, y, z}
		name, known := read[p]
		if !known {
			if !mechInWorld(p) {
				name = ""
			} else if got, err := w.Block(x, y, z); err == nil {
				name = storageBase(got)
			}
			read[p] = name
		}
		return name
	}
	stands := func(x, y, z int) bool {
		return revivalIsFree(at(x, y, z)) && revivalIsFree(at(x, y+1, z)) && revivalIsFloor(at(x, y-1, z))
	}
	walksAway := func(x, y, z int) bool {
		for _, side := range liftStopSides {
			for _, dy := range [3]int{0, -1, 1} {
				if stands(x+side[0], y+dy, z+side[2]) {
					return true
				}
			}
		}
		return false
	}
	for _, dy := range revivalHeights {
		for _, column := range revivalAround {
			x, y, z := cell[0]+column[0], cell[1]+dy, cell[2]+column[1]
			if own(x, z) && stands(x, y, z) && walksAway(x, y, z) {
				return [3]int{x, y, z}, true
			}
		}
	}
	if revivalIsFree(at(cell[0], cell[1]+1, cell[2])) && revivalIsFree(at(cell[0], cell[1]+2, cell[2])) {
		return [3]int{cell[0], cell[1] + 1, cell[2]}, true
	}
	return spot, false
}

// revivalWater counts the water joined to a machine: the cells of water reached from those on its six
// faces, through faces, no further than revivalWaterReach blocks to each side of it and no more than
// `want`. With `own` it also finds where a sea animal is born: of the cells counted within
// revivalBirthReach of the machine, in a column that `own` allows, the one with the most water among the 26
// around it (the nearest of those), so that a big animal is not born against the wall.
func revivalWater(w cropWorld, cell [3]int, want int, own func(x, z int) bool) (count int, birth [3]int, found bool) {
	wet := make(map[[3]int]bool)
	isWater := func(p [3]int) bool {
		is, known := wet[p]
		if !known {
			if mechInWorld(p) {
				name, err := w.Block(p[0], p[1], p[2])
				is = err == nil && storageBase(name) == "water"
			}
			wet[p] = is
		}
		return is
	}
	var body [][3]int
	in := make(map[[3]int]bool)
	join := func(p [3]int) {
		if len(body) < want && !in[p] && isWater(p) {
			in[p] = true
			body = append(body, p)
		}
	}
	for _, step := range powerSteps {
		join([3]int{cell[0] + step[0], cell[1] + step[1], cell[2] + step[2]})
	}
	for next := 0; next < len(body) && len(body) < want; next++ {
		p := body[next]
		for _, step := range powerSteps {
			q := [3]int{p[0] + step[0], p[1] + step[1], p[2] + step[2]}
			if max(q[0]-cell[0], cell[0]-q[0], q[2]-cell[2], cell[2]-q[2]) <= revivalWaterReach {
				join(q)
			}
		}
	}
	if own == nil {
		return len(body), birth, false
	}
	best := -1
	for _, p := range body {
		if max(p[0]-cell[0], cell[0]-p[0], p[1]-cell[1], cell[1]-p[1], p[2]-cell[2], cell[2]-p[2]) > revivalBirthReach || !own(p[0], p[2]) {
			continue
		}
		around := 0
		for dx := -1; dx <= 1; dx++ {
			for dy := -1; dy <= 1; dy++ {
				for dz := -1; dz <= 1; dz++ {
					if (dx != 0 || dy != 0 || dz != 0) && isWater([3]int{p[0] + dx, p[1] + dy, p[2] + dz}) {
						around++
					}
				}
			}
		}
		if around > best {
			best, birth, found = around, p, true
		}
	}
	return len(body), birth, found
}

// revivalAnimalsNear counts the kept animals within so many blocks of a place, whoever's they are
// (animals.go keeps them by chunk).
func revivalAnimalsNear(x, z, blocks float64) int {
	b := animals
	b.mu.Lock()
	defer b.mu.Unlock()
	middle := animalChunkOf(x, z)
	reach := int32(math.Ceil(blocks / terrain.ChunkSize))
	count := 0
	for dx := -reach; dx <= reach; dx++ {
		for dz := -reach; dz <= reach; dz++ {
			for _, a := range b.chunks[animalChunk{middle[0] + dx, middle[1] + dz}] {
				if math.Hypot(a.X-x, a.Z-z) <= blocks {
					count++
				}
			}
		}
	}
	return count
}

// ---------------------------------------------------------------------------------------
// Server glue

// revivalTell tells the players near a machine of the animal it has made.
func revivalTell(made revivalNews) {
	data := createMessage("revivalDone", made)
	x, z := float64(made.X)+0.5, float64(made.Z)+0.5
	stateMu.RLock()
	defer stateMu.RUnlock()
	for id, player := range gameState.Players {
		if client := playerClients[id]; client != nil && player.Located && math.Hypot(player.X-x, player.Z-z) <= revivalTellRange {
			client.trySend(data)
		}
	}
}

func runRevival() {
	ticker := time.NewTicker(revivalTickInterval)
	defer ticker.Stop()
	for now := range ticker.C {
		names, news := storage.tickRevival(chunkStore, revivalTickInterval.Seconds(), now)
		for _, block := range names {
			broadcastToAll(createMessage("blockPlace", block))
		}
		for _, made := range news {
			revivalTell(made)
		}
	}
}

func init() {
	registerLoop(runRevival)
	// A machine glows when the server says so, whatever a plan or a client asks for.
	registerPlaceFilter(func(x, y, z int, name string) string { return storage.revivalSettleName(x, y, z, name) })
}
