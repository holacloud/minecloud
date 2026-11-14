package network

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"regexp"
	"sync"
	"time"

	"minecloud/pkg/terrain"
	"minecloud/pkg/world"
)

// Animals the server keeps (js/game/animals.js). Wild animals live in each browser and nobody else hears
// of them. A kept animal is one that matters to somebody: a tamed one, its babies, one that a machine
// revived. The server owns that it exists, its number, its species and colour, where it is, its home, what
// it is doing (its mode), whose it is, how hurt it is, and a small `extra` that only its owner's client
// understands (the age of a baby, its genes). It saves them (data/world/animals.json) and tells each client
// about those in the chunks around its player. Each client gives them a body: an ordinary mob, walked with
// the code and the collision it already has. A position is never sent round after round.
//
// A mechanic makes one with animalSpawn, which it may call holding its own lock if that comes before
// animals.mu in the order of the locks (CLAUDE.md), as powerMu does:
//
//	id, ok := animalSpawn(animalSpawnSpec{Species: "pig", X: 10.5, Y: 64, Z: -3.5, Radius: 8, Origin: "revival"})
//
// What it is doing:
//
//   - roam: it wanders around its home and has no owner. The server decides: every so often it picks a
//     point a few blocks from where the animal is, never further than Radius from its home, and says "it
//     walks there"; or says nothing while it rests. Only in the chunks around a player whose client is
//     awake (animalsActive), so a world full of animals costs nothing where nobody is. With Radius 0 the
//     server does not walk it: it only exists, and lives around its home by the behaviour of its species
//     on each client (a swimmer, a flyer).
//   - stay: its owner told it to sit: it is where it was left.
//   - follow: it goes with its owner, whose client walks it as it always did. For the server it is
//     simply where its owner is; the other clients walk it towards the owner's avatar. With the owner
//     away it waits where they left.
//   - ridden: its owner rides it. The others hide it: they already see the mount under the rider.
//   - chase: it has no owner and is after a player: the one the server says, so that it is the same one
//     for everybody (see below). Every client runs its copy at that player, and only that player's own
//     client lets it bite (js/game/animals.js).
//
// Where a roaming animal really is. Only clients know what is in the way (a fence), so the server keeps
// two things: where the animal was last known to stand (X, Y, Z) and the walk it is on. A client that
// comes into range puts it where it stood and walks it. When a client's copy stops somewhere else than
// where it was sent (blocked for a second, or at another height), it says so once, animalAt, and the
// server takes the first one it hears for that walk: the animal is there, and everybody is told. With
// nothing said by the time it must have arrived, it is where it was sent. So an animal in a pen stays in
// the pen for everybody, also for who comes later. What a client may say is little: a place inside the
// animal's circle, and inside a plot that is not the client's own it can only send the animal back to
// where it stood.
//
// Whom a hostile one goes after. An animal made with a Chase (animalSpawnSpec: its species' chase
// distance; 0, a peaceful one, never) that roams where animals are walked takes as its target, in each
// round, the nearest player within that many blocks of where it must be by now, and no further than
// Radius plus that many from its home, among the players that are somewhere (not in the title screen),
// whose client is awake and who have not died in the last animalsChaseSpare. By day the distance is
// ChaseDay if it has one (a species that only comes from close by day). It keeps that target, whoever
// else comes nearer, until the player is further from it than animalsChaseLoose times that distance, or
// further from its home than its leash (Radius plus animalsChaseLoose times that distance: it never
// goes beyond, so a player can always walk away from it), or is gone, asleep or dead. Then it goes after
// the nearest other player it could take, or roams again and walks back to its circle as on any walk.
// Everybody is told when it starts, takes another target and stops, and nothing while it lasts. Meanwhile
// the server moves its own idea of where the animal is towards the target at ChaseSpeed, as far as the
// leash and at the height it had: there a client that comes later puts it, and there the chase is
// taken to have left it. Where it really stopped is heard as for any walk: a copy that something stops
// on the way home says so (animalAt), and for an animal with a Chase that may be anywhere inside its leash.
//
// Whose it is: the stable player (identity.go) of the client that kept it, never anything the page says.
// Only its owner changes an owned animal or strikes it; one with no owner cannot be struck or taken by a
// stranger inside somebody's plot (claimCheck where the animal is). A creative session passes both, as it
// passes every plot. A refused client is told the animal again, whole, so its copy is put right.
//
// What a client says (JSON; each is rare):
//
//   - animalKeep {ref, species, variant, hurt, extra}: an animal of its own making is to be kept (it tamed a
//     wild one, a baby was born, or it comes from when they were saved in the browser). It starts by its
//     owner's side, following. Answer: animalKept {ref, id}, or {ref, error}. Said twice with one ref, it
//     is kept once.
//   - animalAdopt {ref, id}: it tamed a kept animal that had no owner. Same answer.
//   - animalSet {id, mode, x, y, z, hurt, extra}: its owner changed it; only what is given changes. To
//     stay it needs a place, near its owner and not in a plot where the owner may not build.
//   - animalAt {id, x, y, z, gx, gz}: see above; gx, gz are the walk it was on, as the frame said it.
//   - animalHurt {id, damage}, animalGone {id}: struck, and defeated or taken out of the world. The server
//     only counts the damage: the client that strikes the last blow is the one that knows it was, and
//     says animalGone.
//   - animalSummon {species, variant, x, y, z, radius, speed, chase, chaseDay, chaseSpeed}: a creative
//     session makes a roaming one next to its player (/animal pig).
//
// What the server says: animalKept, animalSummoned {id} or {error}, animalRefused {id, gone}, and the
// rounds. Every animalsEvery each client whose player is somewhere gets, if anything changed for it, one
// binary frame (writePump sends as bytes what starts with the magic; js/websocket.js gives it to
// animals.js). A number is a varint as encoding/binary writes it (uvarint without sign, varint zigzag),
// a string is its length (uvarint) and its bytes, and places are in quarters of a block:
//
//	"MCA1"
//	uvarint n, then n animals new to this client:
//	    uvarint id, string species, byte variant, byte mode (after a 4, chase: string page id of the
//	    player it is after), byte flags,
//	    varint home x, y, z, varint place x, y, z (from its home), uvarint hurt (half points),
//	    flags&1: it is on a walk: varint x, z (from its home)
//	    flags&2: it has an owner: string page id of the owner ("" while away), string owner's name.
//	             A client whose own page id that is walks the animal itself: it is its player's
//	    flags&4: string extra (JSON)
//	    flags&8: the server walks it
//	uvarint n, then n animals it knows that have changed:
//	    uvarint id, byte flags, then, in this order, what the flags say:
//	    1 varint home x, y, z (its place is its home), 2 varint place x, y, z (from its home: it is
//	    there, and a copy that is elsewhere walks there), 4 varint walk x, z (from its home), 8 byte mode
//	    (after a 4: string page id of the player it is after), 16 uvarint hurt, 32 string owner's page
//	    id, string owner's name, 64 string extra
//	uvarint n, then n uvarint ids of animals that are gone for this client (out of range, or no more)
//
// A client is told of an animal within animalsRangeIn chunks of its player and until it is further than
// animalsRangeOut; of those beyond animalsActive only every animalsFarEvery rounds. An animal that rests
// or sits costs nothing.

const (
	animalsMagic = "MCA1"
	// The time between two rounds.
	animalsEvery = 500 * time.Millisecond
	// Chunks from its player's (the larger of the two differences) within which a client is told of an
	// animal, and beyond which one it knows is gone for it. Wild animals live within 3 (js/game/mobs.js).
	animalsRangeIn  = 3
	animalsRangeOut = 4
	// Chunks around a player whose client is awake where roaming animals are walked: every client has
	// those loaded (the least a player can set is 2), so one of them sees whether the animal gets there.
	animalsActive = 2
	// What has changed of an animal further than that is told every so many rounds.
	animalsFarEvery = 4
	// A client that has not said where its player is for this long (a tab in the background) is not
	// watching: no animal is walked for it.
	animalsAwakeFor = 6 * time.Second

	animalsMaxPerOwner = 100
	animalsMaxWorld    = 5000
	animalsMaxExtra    = 2048
	animalsMaxPayload  = 4096
	animalsMaxRadius   = 32.0
	animalsMaxHurt     = 16.0 // points in one blow: a golden sword with another in the left hand is 12
	// How far from its owner an animal may be left to stay, and from a creative player one is summoned.
	animalsStayReach   = 160.0
	animalsSummonReach = 16.0
	// How far over or under its home a client may say an animal stands.
	animalsHeightReach = 48.0
	// From the eyes of a player, which is what a client says, to the feet.
	animalsEyeHeight = 1.62

	// A walk: this many blocks from where it is, at the pace of its species (a pig's when not known),
	// with time to spare, to find itself blocked and to say so, and then a pause; now and then a rest.
	animalsHopMin     = 2.0
	animalsHopMax     = 5.0
	animalsSpeedGuess = 0.38
	animalsWalkSlack  = 1.3
	animalsStopGrace  = 4 * time.Second
	animalsPauseMax   = 4 * time.Second
	animalsRestChance = 0.2
	animalsRestMin    = 8 * time.Second
	animalsRestMax    = 20 * time.Second

	// An animal that goes after players. The furthest it can be told to from (animalSpawnSpec.Chase): its
	// target is let go at animalsChaseLoose times that, which has to be inside the chunks where animals are
	// walked (animalsActive: 32 blocks at the least), where the round looks for it.
	animalsMaxChase   = 20.0
	animalsChaseLoose = 1.5
	// A player that has died is left alone this long: the three seconds until it is back
	// (js/game/survival.js) and a few more to walk away.
	animalsChaseSpare = 10 * time.Second
)

const (
	animalRoam uint8 = iota
	animalStay
	animalFollow
	animalRidden
	animalChase
)

// The flags of a new animal and of a change, in a frame.
const (
	animalNewWalking = 1 << iota
	animalNewOwned
	animalNewExtra
	animalNewWalked
)

const (
	animalSaysHome = 1 << iota
	animalSaysPlace
	animalSaysWalk
	animalSaysMode
	animalSaysHurt
	animalSaysOwner
	animalSaysExtra
)

var (
	animalsFrameMagic = []byte(animalsMagic)
	// The server has no table of species: a name is any id a client could have registered.
	animalSpeciesOK = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)
	animalRefOK     = regexp.MustCompile(`^[a-z0-9]{1,16}$`)
)

// Animal is a kept animal as it is saved.
type Animal struct {
	ID      uint32 `json:"id"`
	Species string `json:"species"`
	Variant uint8  `json:"variant,omitempty"`
	Mode    uint8  `json:"mode"`
	// Where it stands, and its home: the same place unless it roams. In quarters of a block, feet on the floor.
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Z     float64 `json:"z"`
	HomeX float64 `json:"homeX"`
	HomeY float64 `json:"homeY"`
	HomeZ float64 `json:"homeZ"`
	// How far from home the server walks it (0: it does not), and how fast its species walks (0: not known).
	Radius float64 `json:"radius,omitempty"`
	Speed  float64 `json:"speed,omitempty"`
	// From how many blocks it goes after a player (0: it never does), the same by day if that is another
	// distance (0: it is not), and how fast it runs then (0: as it walks). See animalSpawnSpec.
	Chase      float64 `json:"chase,omitempty"`
	ChaseDay   float64 `json:"chaseDay,omitempty"`
	ChaseSpeed float64 `json:"chaseSpeed,omitempty"`
	// The stable player it belongs to, and their name as the others read it.
	Owner     string `json:"owner,omitempty"`
	OwnerName string `json:"ownerName,omitempty"`
	// Damage taken, in half points: what is left of its health is its species', which only clients know.
	Hurt uint16 `json:"hurt,omitempty"`
	// What its owner's client keeps with it. Replaced, never changed in place: the save reads it unlocked.
	Extra json.RawMessage `json:"extra,omitempty"`
	// What made it ("tamed", "summon", "revival"...), for whoever reads the file.
	Origin string `json:"origin,omitempty"`
	// The name its owner's client gave it when asking to keep it, so that asking twice keeps one.
	Ref string `json:"ref,omitempty"`
}

type animalChunk [2]int32

type animal struct {
	Animal
	owner *animalOwner
	chunk animalChunk
	// The walk the server sent it on, in quarters of a block from its home, until it is known where it ended.
	goalX, goalZ int32
	walking      bool
	// A client said where this walk ended: nobody else is heard about it.
	reported bool
	// When that walk began for the clients, to know how far along it the animal must be (about).
	walkAt time.Time
	// In chase mode: the page id of the player it is after (never saved: a page is gone with its
	// connection), and where the server takes it to be, finer than the quarters of a block of its place.
	target     string
	runX, runZ float64
	// What the round's walk of the chunks found near it (sight), good for the round sightTick says: its
	// target and the nearest player it could take, as places in animalBook.players, or -1.
	sightTick  uint64
	prey, near int32
	nearFar    float64
	// When the server next decides for it, and the last round its chunk was near an awake player.
	nextAt     time.Time
	activeTick uint64
	// The number (animalBook.rev) of the last change of each thing a client may have to be told.
	rev, homeRev, placeRev, walkRev, modeRev, hurtRev, ownerRev, extraRev uint64
}

// A player that owns animals: which, and the page it is playing from now ("" while away).
type animalOwner struct {
	player  string
	animals []*animal
	session string
	tick    uint64
}

// What a client was last told of an animal (Client.animals, under animals.mu).
type animalSeen struct {
	rev  uint64
	tick uint64
}

// A player in one round.
type animalPlayer struct {
	id      string
	client  *Client
	stable  string
	name    string
	x, y, z float64
	chunk   animalChunk
	awake   bool
	// It died a moment ago: no animal goes after it.
	spared bool
}

type animalChange struct {
	animal *animal
	since  uint64
}

type animalBook struct {
	// After powerMu and before Store.mu, stateMu and clientsMu (CLAUDE.md): a machine may make an animal
	// holding its own lock, and a handler here asks the plots and the players holding this one.
	mu     sync.Mutex
	next   uint32
	byID   map[uint32]*animal
	chunks map[animalChunk][]*animal
	owners map[string]*animalOwner
	rev    uint64
	tick   uint64
	random *rand.Rand
	// The animals that are after a player, and whether it is night (js/game/environment.js: isNightTime).
	chasers []*animal
	night   bool
	// What a round works with, kept from one to the next so that it allocates nothing.
	players []animalPlayer
	online  []*animalOwner
	arrived []*animalOwner
	due     []*animal
	sighted []*animal
	fresh   []*animal
	changed []animalChange
	gone    []uint32
	frame   []byte
}

func newAnimalBook() *animalBook {
	return &animalBook{
		next:   1,
		byID:   make(map[uint32]*animal),
		chunks: make(map[animalChunk][]*animal),
		owners: make(map[string]*animalOwner),
		random: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

var animals = newAnimalBook()

// ---------------------------------------------------------------------------------------
// The book

func animalQuarter(v float64) int64 {
	return int64(math.Round(v * 4))
}

func animalSnap(v float64) float64 {
	return math.Round(v*4) / 4
}

func animalChunkOf(x, z float64) animalChunk {
	chunkX, chunkZ := world.ChunkCoords(int(math.Floor(x)), int(math.Floor(z)))
	return animalChunk{int32(chunkX), int32(chunkZ)}
}

// animalPlaceOK says whether an animal can be there at all: numbers, inside the world.
func animalPlaceOK(x, y, z float64) bool {
	for _, v := range [3]float64{x, y, z} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return math.Abs(x) < 1<<20 && math.Abs(z) < 1<<20 && y >= terrain.WorldMinY-8 && y <= terrain.WorldMaxY+64
}

// bump gives the animal the number of a new change, for whatever of it has changed.
func (b *animalBook) bump(a *animal) uint64 {
	b.rev++
	a.rev = b.rev
	return b.rev
}

// place puts the animal at a spot, in the chunk it belongs to. Returns whether that is another chunk.
func (b *animalBook) place(a *animal, x, y, z float64) bool {
	a.X, a.Y, a.Z = animalSnap(x), animalSnap(y), animalSnap(z)
	chunk := animalChunkOf(a.X, a.Z)
	if chunk == a.chunk {
		return false
	}
	b.unbucket(a)
	a.chunk = chunk
	b.chunks[chunk] = append(b.chunks[chunk], a)
	return true
}

func (b *animalBook) unbucket(a *animal) {
	list := b.chunks[a.chunk]
	for i, other := range list {
		if other == a {
			list[i] = list[len(list)-1]
			list[len(list)-1] = nil
			list = list[:len(list)-1]
			break
		}
	}
	if len(list) == 0 {
		delete(b.chunks, a.chunk)
	} else {
		b.chunks[a.chunk] = list
	}
}

// add takes an animal into the book, with a number of its own unless it has one (from the save).
func (b *animalBook) add(saved Animal) *animal {
	if saved.ID == 0 {
		saved.ID = b.next
	}
	if saved.ID >= b.next {
		b.next = saved.ID + 1
	}
	a := &animal{Animal: saved}
	a.X, a.Y, a.Z = animalSnap(a.X), animalSnap(a.Y), animalSnap(a.Z)
	a.HomeX, a.HomeY, a.HomeZ = animalSnap(a.HomeX), animalSnap(a.HomeY), animalSnap(a.HomeZ)
	a.chunk = animalChunkOf(a.X, a.Z)
	b.byID[a.ID] = a
	b.chunks[a.chunk] = append(b.chunks[a.chunk], a)
	b.own(a)
	b.bump(a)
	return a
}

// own puts the animal in its owner's list, if it has one.
func (b *animalBook) own(a *animal) {
	if a.Owner == "" {
		return
	}
	owner := b.owners[a.Owner]
	if owner == nil {
		owner = &animalOwner{player: a.Owner}
		b.owners[a.Owner] = owner
	}
	owner.animals = append(owner.animals, a)
	a.owner = owner
}

func (b *animalBook) remove(a *animal) {
	delete(b.byID, a.ID)
	b.unbucket(a)
	if owner := a.owner; owner != nil {
		for i, other := range owner.animals {
			if other == a {
				owner.animals[i] = owner.animals[len(owner.animals)-1]
				owner.animals[len(owner.animals)-1] = nil
				owner.animals = owner.animals[:len(owner.animals)-1]
				break
			}
		}
		// An owner with nothing left stays in the book while it is online: the round holds it.
		if len(owner.animals) == 0 && owner.session == "" {
			delete(b.owners, a.Owner)
		}
	}
}

// animalSpawnSpec is an animal for the server to keep that nobody owns.
type animalSpawnSpec struct {
	// The species' id, as its file registers it on the client (registerSpecies).
	Species string
	// Where it appears, feet on the floor: its home.
	X, Y, Z float64
	// How far from home the server walks it, in blocks (at most animalsMaxRadius). 0 for a species
	// whose movement does not walk to a goal (a swimmer, a flyer): it lives around its home by itself.
	Radius float64
	// Blocks a second its species walks, so that it is given time to arrive. 0: a pig's.
	Speed float64
	// From how many blocks it goes after a player, for a hostile species that the server walks: its
	// chaseDistance, or 16 (js/game/mobs.js). At most animalsMaxChase. 0: a peaceful animal; and with
	// Radius 0 it is 0 whatever is said (a hostile swimmer does as its species does, on each client).
	Chase float64
	// The same by day, for a species that only comes from close by then (`nocturnal`: 3.5). 0: as by night.
	ChaseDay float64
	// Blocks a second it runs after its target (its species' chaseSpeed), for the server to keep up. 0: Speed.
	ChaseSpeed float64
	// Its colour: the client takes it modulo the variants its species has.
	Variant uint8
	// What made it ("revival"), for whoever reads the save.
	Origin string
}

// animalSpawn makes an animal that roams around the place given, for every client near it to see from
// the next round on, and to be there after a restart. ok is false for a species that cannot be a
// name, a place out of the world, or a world that is full of animals.
func animalSpawn(spec animalSpawnSpec) (id uint32, ok bool) {
	if !animalSpeciesOK.MatchString(spec.Species) || !animalPlaceOK(spec.X, spec.Y, spec.Z) {
		return 0, false
	}
	if math.IsNaN(spec.Radius) || math.IsNaN(spec.Speed) || math.IsNaN(spec.Chase) || math.IsNaN(spec.ChaseDay) || math.IsNaN(spec.ChaseSpeed) {
		return 0, false
	}
	radius := math.Max(0, math.Min(animalsMaxRadius, spec.Radius))
	var chase, chaseDay, chaseSpeed float64
	if radius > 0 && spec.Chase > 0 {
		chase = math.Min(animalsMaxChase, spec.Chase)
		chaseDay = math.Max(0, math.Min(chase, spec.ChaseDay))
		chaseSpeed = math.Max(0, math.Min(8, spec.ChaseSpeed))
	}
	b := animals
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.byID) >= animalsMaxWorld {
		return 0, false
	}
	a := b.add(Animal{
		Species: spec.Species, Variant: spec.Variant, Mode: animalRoam,
		X: spec.X, Y: spec.Y, Z: spec.Z, HomeX: spec.X, HomeY: spec.Y, HomeZ: spec.Z,
		Radius: radius,
		Speed:  math.Max(0, math.Min(8, spec.Speed)),
		Chase:  chase, ChaseDay: chaseDay, ChaseSpeed: chaseSpeed,
		Origin: spec.Origin,
	})
	worldAnimals.mark()
	return a.ID, true
}

// ---------------------------------------------------------------------------------------
// The frame

func animalAppendString(buf []byte, s string) []byte {
	buf = binary.AppendUvarint(buf, uint64(len(s)))
	return append(buf, s...)
}

func (a *animal) appendHome(buf []byte) []byte {
	buf = binary.AppendVarint(buf, animalQuarter(a.HomeX))
	buf = binary.AppendVarint(buf, animalQuarter(a.HomeY))
	return binary.AppendVarint(buf, animalQuarter(a.HomeZ))
}

func (a *animal) appendPlace(buf []byte) []byte {
	buf = binary.AppendVarint(buf, animalQuarter(a.X)-animalQuarter(a.HomeX))
	buf = binary.AppendVarint(buf, animalQuarter(a.Y)-animalQuarter(a.HomeY))
	return binary.AppendVarint(buf, animalQuarter(a.Z)-animalQuarter(a.HomeZ))
}

func (a *animal) appendWalk(buf []byte) []byte {
	buf = binary.AppendVarint(buf, int64(a.goalX))
	return binary.AppendVarint(buf, int64(a.goalZ))
}

// appendMode is what it is doing and, of one that is after a player, which.
func (a *animal) appendMode(buf []byte) []byte {
	buf = append(buf, a.Mode)
	if a.Mode == animalChase {
		buf = animalAppendString(buf, a.target)
	}
	return buf
}

func (a *animal) appendOwner(buf []byte) []byte {
	session := ""
	if a.owner != nil {
		session = a.owner.session
	}
	buf = animalAppendString(buf, session)
	return animalAppendString(buf, a.OwnerName)
}

// appendNew is everything about the animal, for a client that does not know it.
func (a *animal) appendNew(buf []byte) []byte {
	var flags byte
	if a.walking {
		flags |= animalNewWalking
	}
	if a.Owner != "" {
		flags |= animalNewOwned
	}
	if len(a.Extra) > 0 {
		flags |= animalNewExtra
	}
	if (a.Mode == animalRoam || a.Mode == animalChase) && a.Radius > 0 {
		flags |= animalNewWalked
	}
	buf = binary.AppendUvarint(buf, uint64(a.ID))
	buf = animalAppendString(buf, a.Species)
	buf = append(buf, a.Variant)
	buf = a.appendMode(buf)
	buf = append(buf, flags)
	buf = a.appendHome(buf)
	buf = a.appendPlace(buf)
	buf = binary.AppendUvarint(buf, uint64(a.Hurt))
	if a.walking {
		buf = a.appendWalk(buf)
	}
	if a.Owner != "" {
		buf = a.appendOwner(buf)
	}
	if len(a.Extra) > 0 {
		buf = animalAppendString(buf, string(a.Extra))
	}
	return buf
}

// appendChange is what has changed of the animal since a client was last told (change number `since`).
func (a *animal) appendChange(buf []byte, since uint64) []byte {
	var flags byte
	if a.homeRev > since {
		flags |= animalSaysHome
	}
	// A place that is its home was said with the home.
	if a.placeRev > since && (flags&animalSaysHome == 0 || a.X != a.HomeX || a.Y != a.HomeY || a.Z != a.HomeZ) {
		flags |= animalSaysPlace
	}
	if a.walkRev > since && a.walking {
		flags |= animalSaysWalk
	}
	if a.modeRev > since {
		flags |= animalSaysMode
	}
	if a.hurtRev > since {
		flags |= animalSaysHurt
	}
	if a.ownerRev > since {
		flags |= animalSaysOwner
	}
	if a.extraRev > since {
		flags |= animalSaysExtra
	}
	buf = binary.AppendUvarint(buf, uint64(a.ID))
	buf = append(buf, flags)
	if flags&animalSaysHome != 0 {
		buf = a.appendHome(buf)
	}
	if flags&animalSaysPlace != 0 {
		buf = a.appendPlace(buf)
	}
	if flags&animalSaysWalk != 0 {
		buf = a.appendWalk(buf)
	}
	if flags&animalSaysMode != 0 {
		buf = a.appendMode(buf)
	}
	if flags&animalSaysHurt != 0 {
		buf = binary.AppendUvarint(buf, uint64(a.Hurt))
	}
	if flags&animalSaysOwner != 0 {
		buf = a.appendOwner(buf)
	}
	if flags&animalSaysExtra != 0 {
		buf = animalAppendString(buf, string(a.Extra))
	}
	return buf
}

// animalsAppendFrame writes one round for one client (the format is in the header).
func animalsAppendFrame(buf []byte, fresh []*animal, changed []animalChange, gone []uint32) []byte {
	buf = append(buf, animalsMagic...)
	buf = binary.AppendUvarint(buf, uint64(len(fresh)))
	for _, a := range fresh {
		buf = a.appendNew(buf)
	}
	buf = binary.AppendUvarint(buf, uint64(len(changed)))
	for _, change := range changed {
		buf = change.animal.appendChange(buf, change.since)
	}
	buf = binary.AppendUvarint(buf, uint64(len(gone)))
	for _, id := range gone {
		buf = binary.AppendUvarint(buf, uint64(id))
	}
	return buf
}

// isBinaryFrame says whether a message for a client is a frame of bytes and not JSON (writePump).
func isBinaryFrame(message []byte) bool {
	return bytes.HasPrefix(message, animalsFrameMagic)
}

// ---------------------------------------------------------------------------------------
// The round

func (b *animalBook) between(least, most time.Duration) time.Duration {
	return least + time.Duration(b.random.Float64()*float64(most-least))
}

// pace is the blocks a second the animal walks, as far as the server knows.
func (a *animal) pace() float64 {
	if a.Speed <= 0 {
		return animalsSpeedGuess
	}
	return a.Speed
}

// walkTime is how long the animal is given to walk so many blocks and be heard of if it could not.
func (a *animal) walkTime(blocks float64) time.Duration {
	return time.Duration(blocks/a.pace()*animalsWalkSlack*float64(time.Second)) + animalsStopGrace
}

func (a *animal) goalPlace() (x, z float64) {
	return a.HomeX + float64(a.goalX)/4, a.HomeZ + float64(a.goalZ)/4
}

// about is where the animal must be by now: its place or, on a walk nobody has said the end of, as far
// along it as its pace has taken it. A guess (only clients know what is in its way), good enough to
// tell who is near it.
func (a *animal) about(now time.Time) (x, z float64) {
	if !a.walking {
		return a.X, a.Z
	}
	x, z = a.goalPlace()
	far := math.Hypot(x-a.X, z-a.Z)
	done := a.pace() * now.Sub(a.walkAt).Seconds()
	if done >= far {
		return x, z
	}
	if done <= 0 {
		return a.X, a.Z
	}
	return a.X + (x-a.X)*done/far, a.Z + (z-a.Z)*done/far
}

// walk sends the animal to a point (in quarters of a block from its home) so many blocks from where it is.
func (b *animalBook) walk(a *animal, goalX, goalZ int32, blocks float64, now time.Time) {
	a.goalX, a.goalZ, a.walking, a.reported, a.walkAt = goalX, goalZ, true, false, now
	a.walkRev = b.bump(a)
	a.nextAt = now.Add(a.walkTime(blocks) + b.between(0, animalsPauseMax))
}

// decide is the server's turn for a roaming animal: where its last walk left it, and a new walk or a rest.
func (b *animalBook) decide(a *animal, now time.Time) {
	if a.walking && !a.reported {
		// Nobody said otherwise: it got there, a block higher or lower at most.
		x, z := a.goalPlace()
		b.place(a, x, a.Y, z)
		worldAnimals.mark()
	}
	a.walking, a.reported = false, false
	if b.random.Float64() < animalsRestChance {
		a.nextAt = now.Add(b.between(animalsRestMin, animalsRestMax))
		return
	}
	angle := b.random.Float64() * 2 * math.Pi
	hop := animalsHopMin + b.random.Float64()*(animalsHopMax-animalsHopMin)
	dx := a.X + math.Cos(angle)*hop - a.HomeX
	dz := a.Z + math.Sin(angle)*hop - a.HomeZ
	if far := math.Hypot(dx, dz); far > a.Radius {
		dx, dz = dx*a.Radius/far, dz*a.Radius/far
	}
	// The quarter is cut, not rounded: towards home, never past its circle.
	goalX, goalZ := int32(dx*4), int32(dz*4)
	blocks := math.Hypot(a.HomeX+float64(goalX)/4-a.X, a.HomeZ+float64(goalZ)/4-a.Z)
	if blocks < 0.5 {
		a.nextAt = now.Add(b.between(time.Second, animalsPauseMax))
		return
	}
	b.walk(a, goalX, goalZ, blocks, now)
}

// reach is from how many blocks the animal goes after a player at this hour.
func (b *animalBook) reach(a *animal) float64 {
	if !b.night && a.ChaseDay > 0 {
		return a.ChaseDay
	}
	return a.Chase
}

// leash is how far from its home an animal that goes after players from `reach` blocks may ever be: its
// circle and, beyond it, as far as it keeps a target. Its circle alone for a peaceful one.
func (a *animal) leash(reach float64) float64 {
	return a.Radius + animalsChaseLoose*reach
}

// sight notes a player that the round's walk of the chunks has found near an animal that goes after
// players: whether it is the one it is after, and whether it is the nearest it could take. Nothing is
// decided here (chases does, once the chunks are walked): a player costs each animal near it one look.
func (b *animalBook) sight(a *animal, index int, now time.Time) {
	player := &b.players[index]
	if a.Radius <= 0 || player.spared || (a.Mode != animalRoam && a.Mode != animalChase) {
		return
	}
	if a.sightTick != b.tick {
		a.sightTick, a.prey, a.near = b.tick, -1, -1
		if a.Mode == animalRoam {
			b.sighted = append(b.sighted, a)
		}
	}
	if a.Mode == animalChase {
		// Watched all along: when it roams again its turn comes as if it had never stopped roaming.
		a.activeTick = b.tick
		if player.id == a.target {
			a.prey = int32(index)
			return
		}
	}
	reach := b.reach(a)
	x, z := a.about(now)
	far := math.Hypot(player.x-x, player.z-z)
	// Within reach of the animal, and of its home: nobody is taken who would be let go at once.
	if far <= reach && math.Hypot(player.x-a.HomeX, player.z-a.HomeZ) <= a.Radius+reach && (a.near < 0 || far < a.nearFar) {
		a.near, a.nearFar = int32(index), far
	}
}

// chases is the turn of the animals that go after players: each one that is after somebody runs on, takes
// another target or lets go, and each roaming one with a player near enough goes after it.
func (b *animalBook) chases(now time.Time) {
	chasers := b.chasers[:0]
	for _, a := range b.chasers {
		// Taken out of the world, or tamed, since the last round: it is after nobody.
		if b.byID[a.ID] != a || a.Mode != animalChase {
			a.target = ""
			continue
		}
		if b.pursue(a, now); a.Mode == animalChase {
			chasers = append(chasers, a)
		}
	}
	for _, a := range b.sighted {
		if a.Mode != animalRoam || a.near < 0 {
			continue
		}
		// From where it must be by now: the walk it was on is over, and nobody is heard about it.
		a.runX, a.runZ = a.about(now)
		b.place(a, a.runX, a.Y, a.runZ)
		a.walking, a.reported = false, false
		a.Mode, a.target = animalChase, b.players[a.near].id
		a.modeRev = b.bump(a)
		worldAnimals.mark()
		chasers = append(chasers, a)
	}
	// Those that are after nobody any more are not held on to.
	if len(chasers) < len(b.chasers) {
		clear(b.chasers[len(chasers):])
	}
	b.chasers = chasers
}

// pursue is a round of an animal that is after a player. The server's idea of where it is runs towards
// its target, never past its leash; a target that is no longer seen (gone, asleep, dead), too far from
// the animal or beyond its leash is let go, for the nearest other player it could take or to roam again.
func (b *animalBook) pursue(a *animal, now time.Time) {
	seen := a.sightTick == b.tick
	reach := b.reach(a)
	leash := a.leash(reach)
	if seen && a.prey >= 0 {
		target := &b.players[a.prey]
		run := a.ChaseSpeed
		if run <= 0 {
			run = a.pace()
		}
		run *= animalsEvery.Seconds()
		if far := math.Hypot(target.x-a.runX, target.z-a.runZ); far <= run {
			a.runX, a.runZ = target.x, target.z
		} else {
			a.runX, a.runZ = a.runX+(target.x-a.runX)*run/far, a.runZ+(target.z-a.runZ)*run/far
		}
		if far := math.Hypot(a.runX-a.HomeX, a.runZ-a.HomeZ); far > leash {
			a.runX, a.runZ = a.HomeX+(a.runX-a.HomeX)*leash/far, a.HomeZ+(a.runZ-a.HomeZ)*leash/far
		}
		// No news for anybody: who sees it runs its own copy. Saved by the chunk, as a follower is.
		if b.place(a, a.runX, a.Y, a.runZ) {
			worldAnimals.mark()
		}
		if math.Hypot(target.x-a.runX, target.z-a.runZ) <= animalsChaseLoose*reach &&
			math.Hypot(target.x-a.HomeX, target.z-a.HomeZ) <= leash {
			return
		}
	}
	if seen && a.near >= 0 {
		a.target = b.players[a.near].id
		a.modeRev = b.bump(a)
		return
	}
	// It roams again, from where the server takes it to be: every copy walks there, and from out of its
	// circle on to the nearest point of it, a walk as any other.
	a.Mode, a.target = animalRoam, ""
	change := b.bump(a)
	a.modeRev, a.placeRev = change, change
	a.walking, a.reported = false, false
	a.nextAt = now.Add(b.between(time.Second, animalsPauseMax))
	dx, dz := a.X-a.HomeX, a.Z-a.HomeZ
	if far := math.Hypot(dx, dz); far > a.Radius {
		// The quarter is cut, not rounded, as in decide: never past its circle.
		goalX, goalZ := int32(dx*a.Radius/far*4), int32(dz*a.Radius/far*4)
		x, z := a.HomeX+float64(goalX)/4, a.HomeZ+float64(goalZ)/4
		b.walk(a, goalX, goalZ, math.Hypot(x-a.X, z-a.Z), now)
	}
	worldAnimals.mark()
}

// animalsTick is one round: the animals that go with their owners are where their owners are, the
// roaming ones near somebody get their turn, and every client is told what has changed around it.
func animalsTick(now time.Time) {
	b := animals
	b.mu.Lock()
	defer b.mu.Unlock()
	b.tick++

	players := b.players[:0]
	stateMu.RLock()
	for id, player := range gameState.Players {
		// Until its first move a player is nowhere (the title screen).
		if client := playerClients[id]; player.Located && client != nil {
			players = append(players, animalPlayer{id: id, client: client, name: player.Username, x: player.X, y: player.Y - animalsEyeHeight, z: player.Z})
		}
	}
	// The second half of the clock is the night, from 18:00 to 06:00, as the clients read it.
	b.night = gameState.WorldTime >= 0.5
	stateMu.RUnlock()
	b.players = players
	for i := range players {
		player := &players[i]
		player.stable = player.client.stablePlayerID()
		player.chunk = animalChunkOf(player.x, player.z)
		player.awake = now.Sub(time.Unix(0, player.client.movedAt.Load())) < animalsAwakeFor
		player.spared = now.Sub(time.Unix(0, player.client.diedAt.Load())) < animalsChaseSpare
	}

	b.followOwners(players)

	// The roaming ones near somebody who is watching. Decided after the chunks are walked: a decision
	// moves an animal from one chunk's list to another's.
	due := b.due[:0]
	b.sighted = b.sighted[:0]
	for i := range players {
		player := &players[i]
		if !player.awake {
			continue
		}
		for dx := int32(-animalsActive); dx <= animalsActive; dx++ {
			for dz := int32(-animalsActive); dz <= animalsActive; dz++ {
				for _, a := range b.chunks[animalChunk{player.chunk[0] + dx, player.chunk[1] + dz}] {
					// One that goes after players is looked at by each of them, once its walk is known.
					if a.Mode != animalRoam || a.Radius <= 0 || a.activeTick == b.tick {
						if a.Chase > 0 {
							b.sight(a, i, now)
						}
						continue
					}
					watched := a.activeTick != 0 && a.activeTick == b.tick-1
					a.activeTick = b.tick
					if !watched {
						// Somebody has just come: time to load the place and to walk what was left, or a
						// while before the first walk, a different one for each so they do not all start at once.
						if a.walking {
							x, z := a.goalPlace()
							a.nextAt = now.Add(a.walkTime(math.Hypot(x-a.X, z-a.Z)) + b.between(0, animalsPauseMax))
							a.walkAt = now
						} else {
							a.nextAt = now.Add(b.between(time.Second, 2*animalsPauseMax))
						}
					} else if !now.Before(a.nextAt) {
						due = append(due, a)
					}
					if a.Chase > 0 {
						b.sight(a, i, now)
					}
				}
			}
		}
	}
	b.chases(now)
	for _, a := range due {
		// (One that has just gone after somebody has no turn to roam.)
		if a.Mode == animalRoam {
			b.decide(a, now)
		}
	}
	b.due = due

	for i := range players {
		b.tell(&players[i])
	}
}

// followOwners puts every animal that follows or carries its owner where the owner is, and notes which
// owners are playing, from which page: the others walk a follower towards that page's avatar.
func (b *animalBook) followOwners(players []animalPlayer) {
	// A page that was its owner's last round stays so (a second tab of the same player changes nothing).
	for i := range players {
		player := &players[i]
		if owner := b.owners[player.stable]; owner != nil && owner.session == player.id {
			owner.tick = b.tick
			b.lead(owner, player)
		}
	}
	arrived := b.arrived[:0]
	for i := range players {
		player := &players[i]
		owner := b.owners[player.stable]
		if owner == nil || owner.tick == b.tick || player.stable == "" {
			continue
		}
		owner.tick = b.tick
		owner.session = player.id
		arrived = append(arrived, owner)
		name := claimCleanName(player.name)
		for _, a := range owner.animals {
			a.OwnerName = name
			a.ownerRev = b.bump(a)
		}
		b.lead(owner, player)
	}
	// Those that were playing and are not: their animals wait where they were left.
	online := b.online[:0]
	for _, owner := range b.online {
		if owner.tick == b.tick {
			online = append(online, owner)
			continue
		}
		owner.session = ""
		for _, a := range owner.animals {
			a.ownerRev = b.bump(a)
		}
		if len(owner.animals) == 0 && b.owners[owner.player] == owner {
			delete(b.owners, owner.player)
		}
		worldAnimals.mark()
	}
	b.online = append(online, arrived...)
	b.arrived = arrived[:0]
}

// lead puts an owner's followers where the owner is. It is no news for anybody: who sees them walks them.
func (b *animalBook) lead(owner *animalOwner, player *animalPlayer) {
	for _, a := range owner.animals {
		if a.Mode != animalFollow && a.Mode != animalRidden {
			continue
		}
		moved := b.place(a, player.x, player.y, player.z)
		a.HomeX, a.HomeY, a.HomeZ = a.X, a.Y, a.Z
		// Saved by the chunk: where exactly matters to nobody until the owner leaves, and that is saved.
		if moved {
			worldAnimals.mark()
		}
	}
}

// tell sends a client the frame of this round, if there is anything in it.
func (b *animalBook) tell(player *animalPlayer) {
	client := player.client
	if client.animals == nil {
		client.animals = make(map[uint32]animalSeen)
	}
	fresh, changed := b.fresh[:0], b.changed[:0]
	for dx := int32(-animalsRangeOut); dx <= animalsRangeOut; dx++ {
		for dz := int32(-animalsRangeOut); dz <= animalsRangeOut; dz++ {
			list := b.chunks[animalChunk{player.chunk[0] + dx, player.chunk[1] + dz}]
			if len(list) == 0 {
				continue
			}
			far := max(max(dx, -dx), max(dz, -dz))
			for _, a := range list {
				seen, known := client.animals[a.ID]
				switch {
				case !known:
					if far > animalsRangeIn {
						continue
					}
					fresh = append(fresh, a)
					seen.rev = a.rev
				case seen.rev != a.rev:
					if far <= animalsActive || (b.tick+uint64(a.ID))%animalsFarEvery == 0 {
						changed = append(changed, animalChange{animal: a, since: seen.rev})
						seen.rev = a.rev
					}
				}
				seen.tick = b.tick
				client.animals[a.ID] = seen
			}
		}
	}
	gone := b.gone[:0]
	for id, seen := range client.animals {
		if seen.tick != b.tick {
			gone = append(gone, id)
			delete(client.animals, id)
		}
	}
	b.fresh, b.changed, b.gone = fresh, changed, gone
	if len(fresh) == 0 && len(changed) == 0 && len(gone) == 0 {
		return
	}
	b.frame = animalsAppendFrame(b.frame[:0], fresh, changed, gone)
	// A client that cannot keep up is dropped, as in the players' round: what it knows could not be known.
	if !client.trySend(append([]byte(nil), b.frame...)) {
		client.drop()
	}
}

func runAnimals() {
	ticker := time.NewTicker(animalsEvery)
	defer ticker.Stop()
	for now := range ticker.C {
		animalsTick(now)
	}
}

// ---------------------------------------------------------------------------------------
// What a client says

// animalPlayerAt is where the client's player stands (its feet), if it has said.
func animalPlayerAt(client *Client) (x, y, z float64, located bool) {
	stateMu.RLock()
	defer stateMu.RUnlock()
	player, ok := gameState.Players[client.ID]
	if !ok || !player.Located {
		return 0, 0, 0, false
	}
	return player.X, player.Y - animalsEyeHeight, player.Z, true
}

// animalExtraOK says whether this can be an animal's extra: nothing, or a small JSON object.
func animalExtraOK(extra json.RawMessage) bool {
	if len(extra) == 0 {
		return true
	}
	return len(extra) <= animalsMaxExtra && extra[0] == '{' && json.Valid(extra)
}

// animalHurtOf turns points of damage into the half points an animal keeps.
func animalHurtOf(points float64) (uint16, bool) {
	if math.IsNaN(points) || points < 0 || points > 1000 {
		return 0, false
	}
	return uint16(math.Round(points * 2)), true
}

// retell has the client told the animal again from scratch with the next round: its copy was wrong.
func (b *animalBook) retell(client *Client, id uint32, gone bool) {
	delete(client.animals, id)
	client.trySend(createMessage("animalRefused", map[string]interface{}{"id": id, "gone": gone}))
}

// said notes that the client knows of the change it has just made itself, if it knew everything before.
func (b *animalBook) said(client *Client, a *animal, before uint64) {
	if seen, ok := client.animals[a.ID]; ok && seen.rev == before {
		seen.rev = a.rev
		client.animals[a.ID] = seen
	}
}

// guard says whether the client may strike the animal or take it out of the world: its owner, or anybody
// who could build where it stands when it has none. With a plot's refusal when that is why not.
func (b *animalBook) guard(client *Client, a *animal) (allowed bool, refusal *claimRefusal) {
	if claimAdmin(client) {
		return true, nil
	}
	if a.Owner != "" {
		return a.Owner == client.stablePlayerID(), nil
	}
	if refusal := claimCheck(client, int(math.Floor(a.X)), int(math.Floor(a.Z))); refusal != nil {
		return false, refusal
	}
	return true, nil
}

func animalKeptAnswer(client *Client, ref string, id uint32, problem string) {
	answer := map[string]interface{}{"ref": ref}
	if problem != "" {
		answer["error"] = problem
	} else {
		answer["id"] = id
	}
	client.trySend(createMessage("animalKept", answer))
}

func handleAnimalKeep(client *Client, payload []byte) {
	var request struct {
		Ref     string          `json:"ref"`
		Species string          `json:"species"`
		Variant int             `json:"variant"`
		Hurt    float64         `json:"hurt"`
		Extra   json.RawMessage `json:"extra"`
	}
	if len(payload) > animalsMaxPayload || json.Unmarshal(payload, &request) != nil || !animalRefOK.MatchString(request.Ref) {
		return
	}
	me := client.stablePlayerID()
	if me == "" {
		animalKeptAnswer(client, request.Ref, 0, "noPlayer")
		return
	}
	if string(request.Extra) == "null" {
		request.Extra = nil
	}
	hurt, hurtOK := animalHurtOf(request.Hurt)
	if !animalSpeciesOK.MatchString(request.Species) || request.Variant < 0 || request.Variant > 255 || !hurtOK || !animalExtraOK(request.Extra) {
		animalKeptAnswer(client, request.Ref, 0, "invalid")
		return
	}
	// It starts by its owner's side: an owner that is nowhere yet (the title screen) asks again later.
	x, y, z, located := animalPlayerAt(client)
	if !located {
		animalKeptAnswer(client, request.Ref, 0, "later")
		return
	}

	b := animals
	b.mu.Lock()
	defer b.mu.Unlock()
	owner := b.owners[me]
	if owner != nil {
		// Asked before (the answer was lost with a connection, or the page was reloaded before noting it).
		for _, a := range owner.animals {
			if a.Ref == request.Ref {
				animalKeptAnswer(client, request.Ref, a.ID, "")
				return
			}
		}
		if len(owner.animals) >= animalsMaxPerOwner {
			animalKeptAnswer(client, request.Ref, 0, "full")
			return
		}
	}
	if len(b.byID) >= animalsMaxWorld {
		animalKeptAnswer(client, request.Ref, 0, "worldFull")
		return
	}
	a := b.add(Animal{
		Species: request.Species, Variant: uint8(request.Variant), Mode: animalFollow,
		X: x, Y: y, Z: z, HomeX: x, HomeY: y, HomeZ: z,
		Owner: me, OwnerName: claimCleanName(client.username), Hurt: hurt,
		Extra: append(json.RawMessage(nil), request.Extra...), Origin: "tamed", Ref: request.Ref,
	})
	worldAnimals.mark()
	animalKeptAnswer(client, request.Ref, a.ID, "")
}

func handleAnimalAdopt(client *Client, payload []byte) {
	var request struct {
		Ref string `json:"ref"`
		ID  uint32 `json:"id"`
	}
	if len(payload) > animalsMaxPayload || json.Unmarshal(payload, &request) != nil || !animalRefOK.MatchString(request.Ref) {
		return
	}
	me := client.stablePlayerID()
	b := animals
	b.mu.Lock()
	defer b.mu.Unlock()
	a := b.byID[request.ID]
	switch {
	case a == nil:
		animalKeptAnswer(client, request.Ref, 0, "gone")
		return
	case me == "":
		animalKeptAnswer(client, request.Ref, 0, "noPlayer")
		return
	case a.Owner == me:
		animalKeptAnswer(client, request.Ref, a.ID, "")
		return
	case a.Owner != "":
		animalKeptAnswer(client, request.Ref, 0, "owned")
		return
	}
	// Nobody tames away the animal of somebody's plot.
	if !claimAdmin(client) {
		if refusal := claimCheck(client, int(math.Floor(a.X)), int(math.Floor(a.Z))); refusal != nil {
			claimRefuse(client, refusal)
			animalKeptAnswer(client, request.Ref, 0, "protected")
			return
		}
	}
	if owner := b.owners[me]; owner != nil && len(owner.animals) >= animalsMaxPerOwner {
		animalKeptAnswer(client, request.Ref, 0, "full")
		return
	}
	a.Owner, a.OwnerName, a.Ref = me, claimCleanName(client.username), request.Ref
	a.Mode, a.Radius, a.walking, a.reported = animalFollow, 0, false, false
	a.HomeX, a.HomeY, a.HomeZ = a.X, a.Y, a.Z
	b.own(a)
	change := b.bump(a)
	a.ownerRev, a.modeRev, a.homeRev = change, change, change
	worldAnimals.mark()
	animalKeptAnswer(client, request.Ref, a.ID, "")
}

func handleAnimalSet(client *Client, payload []byte) {
	var request struct {
		ID    uint32          `json:"id"`
		Mode  *uint8          `json:"mode"`
		X     float64         `json:"x"`
		Y     float64         `json:"y"`
		Z     float64         `json:"z"`
		Hurt  *float64        `json:"hurt"`
		Extra json.RawMessage `json:"extra"`
	}
	if len(payload) > animalsMaxPayload || json.Unmarshal(payload, &request) != nil {
		return
	}
	b := animals
	staying := request.Mode != nil && *request.Mode == animalStay
	if staying {
		if !animalPlaceOK(request.X, request.Y, request.Z) {
			return
		}
		// Nobody leaves an animal to stay where they may not build: checked before whose it is.
		if refusal := claimCheck(client, int(math.Floor(request.X)), int(math.Floor(request.Z))); refusal != nil {
			claimRefuse(client, refusal)
			b.mu.Lock()
			if a := b.byID[request.ID]; a != nil {
				b.retell(client, a.ID, false)
			}
			b.mu.Unlock()
			return
		}
	}
	px, py, pz, located := animalPlayerAt(client)

	b.mu.Lock()
	defer b.mu.Unlock()
	a := b.byID[request.ID]
	if a == nil {
		// The client holds an animal the server does not: it will ask for it to be kept again.
		b.retell(client, request.ID, true)
		return
	}
	me := client.stablePlayerID()
	valid := me != "" && a.Owner == me
	if request.Mode != nil {
		valid = valid && *request.Mode >= animalStay && *request.Mode <= animalRidden && located
	}
	if staying {
		valid = valid && math.Abs(request.X-px)+math.Abs(request.Y-py)+math.Abs(request.Z-pz) <= animalsStayReach
	}
	var hurt uint16
	if request.Hurt != nil {
		var ok bool
		hurt, ok = animalHurtOf(*request.Hurt)
		valid = valid && ok
	}
	extra := request.Extra
	if string(extra) == "null" {
		extra = json.RawMessage("{}")
	}
	if !valid || !animalExtraOK(extra) {
		b.retell(client, a.ID, false)
		return
	}

	// The number of this change, taken when the first thing does change.
	before, change := a.rev, uint64(0)
	touch := func() uint64 {
		if change == 0 {
			change = b.bump(a)
		}
		return change
	}
	if request.Mode != nil {
		sat := a.Mode != *request.Mode
		if sat {
			a.Mode = *request.Mode
			a.modeRev = touch()
		}
		// It sits where its owner says; else it is where its owner is, which is no news.
		x, y, z := px, py, pz
		if staying {
			x, y, z = request.X, request.Y, request.Z
		}
		was := [3]float64{a.X, a.Y, a.Z}
		b.place(a, x, y, z)
		a.HomeX, a.HomeY, a.HomeZ = a.X, a.Y, a.Z
		if staying && (sat || was != [3]float64{a.X, a.Y, a.Z}) {
			a.homeRev = touch()
		}
	}
	if request.Hurt != nil && a.Hurt != hurt {
		a.Hurt = hurt
		a.hurtRev = touch()
	}
	if len(extra) > 0 && !(len(extra) == 2 && len(a.Extra) == 0) && !bytes.Equal(extra, a.Extra) {
		// "{}" is none.
		if len(extra) == 2 {
			a.Extra = nil
		} else {
			a.Extra = append(json.RawMessage(nil), extra...)
		}
		a.extraRev = touch()
	}
	if change != 0 {
		worldAnimals.mark()
		b.said(client, a, before)
	}
}

func handleAnimalAt(client *Client, payload []byte) {
	var report struct {
		ID uint32  `json:"id"`
		X  float64 `json:"x"`
		Y  float64 `json:"y"`
		Z  float64 `json:"z"`
		GX int32   `json:"gx"`
		GZ int32   `json:"gz"`
	}
	if len(payload) > animalsMaxPayload || json.Unmarshal(payload, &report) != nil {
		return
	}
	b := animals
	b.mu.Lock()
	defer b.mu.Unlock()
	a := b.byID[report.ID]
	// Only about the walk it is on, only once, and only from a client that has the animal around.
	if a == nil || a.Mode != animalRoam || !a.walking || a.reported || report.GX != a.goalX || report.GZ != a.goalZ {
		return
	}
	if _, around := client.animals[a.ID]; !around {
		return
	}
	a.walking, a.reported = false, true
	goalX, goalZ := a.goalPlace()
	height := animalPlaceOK(report.X, report.Y, report.Z) && math.Abs(report.Y-a.HomeY) <= animalsHeightReach
	// Where it would be kept: never a quarter of a block out of its circle.
	x, z := animalSnap(report.X), animalSnap(report.Z)
	switch {
	case height && math.Hypot(report.X-goalX, report.Z-goalZ) <= 1:
		// It got there: only its height is news.
		b.place(a, goalX, report.Y, goalZ)
	case height && math.Hypot(x-a.HomeX, z-a.HomeZ) <= a.leash(a.Chase) &&
		claimCheck(client, int(math.Floor(a.HomeX)), int(math.Floor(a.HomeZ))) == nil:
		// Something was in its way: it is where this client saw it stop. In its circle or, for one that
		// goes after players and was walking back, as far out as that ever takes it.
		b.place(a, x, report.Y, z)
	default:
		// Not a place it can be, or said by a visitor of the plot it lives in: it is back where it stood.
	}
	a.placeRev = b.bump(a)
	worldAnimals.mark()
}

func handleAnimalHurt(client *Client, payload []byte) {
	var request struct {
		ID     uint32  `json:"id"`
		Damage float64 `json:"damage"`
	}
	if len(payload) > animalsMaxPayload || json.Unmarshal(payload, &request) != nil {
		return
	}
	if math.IsNaN(request.Damage) || request.Damage <= 0 || request.Damage > animalsMaxHurt {
		return
	}
	b := animals
	b.mu.Lock()
	defer b.mu.Unlock()
	a := b.byID[request.ID]
	if a == nil {
		return
	}
	if allowed, refusal := b.guard(client, a); !allowed {
		claimRefuse(client, refusal)
		b.retell(client, a.ID, false)
		return
	}
	before := a.rev
	a.Hurt = uint16(min(math.MaxUint16, int(a.Hurt)+int(math.Round(request.Damage*2))))
	a.hurtRev = b.bump(a)
	worldAnimals.mark()
	b.said(client, a, before)
}

func handleAnimalGone(client *Client, payload []byte) {
	var request struct {
		ID uint32 `json:"id"`
	}
	if len(payload) > animalsMaxPayload || json.Unmarshal(payload, &request) != nil {
		return
	}
	b := animals
	b.mu.Lock()
	defer b.mu.Unlock()
	a := b.byID[request.ID]
	if a == nil {
		return
	}
	if allowed, refusal := b.guard(client, a); !allowed {
		claimRefuse(client, refusal)
		b.retell(client, a.ID, false)
		return
	}
	// Every client that knows it hears that it is gone with the next round.
	b.remove(a)
	worldAnimals.mark()
	if logMessages {
		log.Printf("animals: %s took the %s %d out of the world", client.ID, a.Species, a.ID)
	}
}

func handleAnimalSummon(client *Client, payload []byte) {
	var request struct {
		Species string  `json:"species"`
		Variant uint8   `json:"variant"`
		X       float64 `json:"x"`
		Y       float64 `json:"y"`
		Z       float64 `json:"z"`
		Radius  float64 `json:"radius"`
		Speed   float64 `json:"speed"`
		// Of a hostile species, for it to go after players as its kind does (animalSpawnSpec).
		Chase      float64 `json:"chase"`
		ChaseDay   float64 `json:"chaseDay"`
		ChaseSpeed float64 `json:"chaseSpeed"`
	}
	// To anybody else there is no such thing, as with every creative command.
	if !client.creative.Load() || len(payload) > animalsMaxPayload || json.Unmarshal(payload, &request) != nil {
		return
	}
	answer := func(id uint32, problem string) {
		message := map[string]interface{}{"species": request.Species}
		if problem != "" {
			message["error"] = problem
		} else {
			message["id"] = id
		}
		client.trySend(createMessage("animalSummoned", message))
	}
	px, py, pz, located := animalPlayerAt(client)
	if !located || !animalPlaceOK(request.X, request.Y, request.Z) ||
		math.Abs(request.X-px)+math.Abs(request.Y-py)+math.Abs(request.Z-pz) > animalsSummonReach {
		answer(0, "reach")
		return
	}
	// A creative session is the admin, whom no plot stops: the check is here so the bypass stays the one in claimAdmin.
	if refusal := claimCheck(client, int(math.Floor(request.X)), int(math.Floor(request.Z))); refusal != nil {
		claimRefuse(client, refusal)
		return
	}
	id, ok := animalSpawn(animalSpawnSpec{
		Species: request.Species, Variant: request.Variant, X: request.X, Y: request.Y, Z: request.Z,
		Radius: request.Radius, Speed: request.Speed, Origin: "summon",
		Chase: request.Chase, ChaseDay: request.ChaseDay, ChaseSpeed: request.ChaseSpeed,
	})
	if !ok {
		answer(0, "invalid")
		return
	}
	answer(id, "")
}

// ---------------------------------------------------------------------------------------
// Saving

type animalsSaved struct {
	Animals    []Animal `json:"animals,omitempty"`
	AnimalNext uint32   `json:"animalNext,omitempty"`
}

func (b *animalBook) snapshot() animalsSaved {
	b.mu.Lock()
	defer b.mu.Unlock()
	saved := animalsSaved{Animals: make([]Animal, 0, len(b.byID)), AnimalNext: b.next}
	for _, a := range b.byID {
		saved.Animals = append(saved.Animals, a.Animal)
	}
	return saved
}

// animalsLoad makes a book of what a save holds, leaving out what could not have been kept.
func animalsLoad(saved animalsSaved) *animalBook {
	b := newAnimalBook()
	for _, a := range saved.Animals {
		if a.ID == 0 || b.byID[a.ID] != nil || !animalSpeciesOK.MatchString(a.Species) || a.Mode > animalChase ||
			!animalPlaceOK(a.X, a.Y, a.Z) || !animalPlaceOK(a.HomeX, a.HomeY, a.HomeZ) || !animalExtraOK(a.Extra) {
			log.Printf("animals: left out of the save: %+v", a)
			continue
		}
		// Nobody is riding as the server starts.
		if a.Mode == animalRidden {
			a.Mode = animalFollow
		}
		// Nor is any animal after anybody: it roams, and walks home from wherever the chase had taken it.
		if a.Mode == animalChase {
			a.Mode = animalRoam
		}
		b.add(a)
	}
	if saved.AnimalNext > b.next {
		b.next = saved.AnimalNext
	}
	return b
}

var worldAnimals *worldSection

func init() {
	worldAnimals = registerWorldSection(worldSectionSpec{
		name:     "animals",
		snapshot: func() any { return animals.snapshot() },
		load: func(data []byte) error {
			var saved animalsSaved
			if err := json.Unmarshal(data, &saved); err != nil {
				return err
			}
			animals = animalsLoad(saved)
			log.Printf("Loaded %d kept animals", len(animals.byID))
			return nil
		},
	})
	// An animal follows its owner anywhere and is kept nowhere in particular.
	registerMessage(messageSpec{plot: plotNowhere, handle: func(c *Client, m Message) { handleAnimalKeep(c, m.Payload) }}, "animalKeep")
	registerMessage(messageSpec{plot: plotChecked, handle: func(c *Client, m Message) { handleAnimalAdopt(c, m.Payload) }}, "animalAdopt")
	registerMessage(messageSpec{plot: plotChecked, handle: func(c *Client, m Message) { handleAnimalSet(c, m.Payload) }}, "animalSet")
	registerMessage(messageSpec{plot: plotChecked, handle: func(c *Client, m Message) { handleAnimalHurt(c, m.Payload) }}, "animalHurt")
	registerMessage(messageSpec{plot: plotChecked, handle: func(c *Client, m Message) { handleAnimalGone(c, m.Payload) }}, "animalGone")
	registerMessage(messageSpec{plot: plotChecked, handle: func(c *Client, m Message) { handleAnimalSummon(c, m.Payload) }}, "animalSummon")
	// A visitor's copy may be the only one that sees an animal stop, so it is heard too; in a plot that is
	// not theirs all it can do is send the animal back to where it stood.
	registerMessage(messageSpec{plot: plotOpen, why: "it moves no animal out of its circle, nor a plot's animal at all", handle: func(c *Client, m Message) { handleAnimalAt(c, m.Payload) }}, "animalAt")
	registerLoop(runAnimals)
}
