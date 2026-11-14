package network

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
	"unsafe"

	"github.com/gorilla/websocket"
)

// The animals the server keeps (animals.go): who is told of which, where they walk, who may touch them,
// what a frame looks like and what it all costs.

// A world with no animals and nobody in it, where the dice always roll the same.
func animalsWorld(t *testing.T) *animalBook {
	t.Helper()
	nobody := func() {
		stateMu.Lock()
		gameState.Players = make(map[string]Player)
		playerClients = make(map[string]*Client)
		stateMu.Unlock()
	}
	nobody()
	t.Cleanup(nobody)
	return animalsWorldKeepingPlayers(t)
}

// The same, with whoever is in the world left where they are (the plots' tests have their people in already).
func animalsWorldKeepingPlayers(t *testing.T) *animalBook {
	t.Helper()
	previous := animals
	animals = newAnimalBook()
	animals.random = rand.New(rand.NewSource(1))
	t.Cleanup(func() {
		animals = previous
		worldAnimals.dirty.Store(false)
	})
	return animals
}

// A connected client whose player stands with its feet at (x, y, z) and has just said so.
func animalsClient(t *testing.T, name, stable string, x, y, z float64) *Client {
	t.Helper()
	client := &Client{ID: "page_" + name, username: name, send: make(chan []byte, 512), chunks: make(chan []byte, 4), done: make(chan struct{})}
	client.setStablePlayerID(stable)
	clientsMu.Lock()
	clients[client] = true
	clientsMu.Unlock()
	animalsStand(client, x, y, z)
	t.Cleanup(func() {
		clientsMu.Lock()
		delete(clients, client)
		clientsMu.Unlock()
		animalsLeave(client)
	})
	return client
}

func animalsStand(client *Client, x, y, z float64) {
	stateMu.Lock()
	gameState.Players[client.ID] = Player{ID: client.ID, Username: client.username, X: x, Y: y + animalsEyeHeight, Z: z, Located: true}
	playerClients[client.ID] = client
	stateMu.Unlock()
	client.movedAt.Store(time.Now().UnixNano())
}

func animalsLeave(client *Client) {
	stateMu.Lock()
	delete(gameState.Players, client.ID)
	delete(playerClients, client.ID)
	stateMu.Unlock()
}

func animalsSend(t *testing.T, client *Client, kind string, payload any) {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	handleMessage(client, Message{Type: kind, Payload: data})
}

// An animal as a frame tells it: places in blocks, a walk as the point it leads to.
type animalTold struct {
	ID                        uint32
	Species                   string
	Variant, Mode, Flags      byte
	Home, Place               [3]float64
	Hurt                      uint64
	Walk                      *[2]float64
	WalkX, WalkZ              int64
	Session, OwnerName, Extra string
	// The player it is after, of one in chase mode.
	Target string
	// Of a change: which of the above it says.
	Says byte
}

type animalFrame struct {
	Fresh, Changed []animalTold
	Gone           []uint32
	Bytes          int
}

func (f animalFrame) fresh(id uint32) *animalTold {
	for i := range f.Fresh {
		if f.Fresh[i].ID == id {
			return &f.Fresh[i]
		}
	}
	return nil
}

func (f animalFrame) changed(id uint32) *animalTold {
	for i := range f.Changed {
		if f.Changed[i].ID == id {
			return &f.Changed[i]
		}
	}
	return nil
}

// animalsRead reads a frame as a client does (js/game/animals.js), knowing the homes it was told before.
func animalsRead(t *testing.T, data []byte, homes map[uint32][3]float64) animalFrame {
	t.Helper()
	if !isBinaryFrame(data) {
		t.Fatalf("not a frame: %q", data)
	}
	at := len(animalsMagic)
	uvarint := func() uint64 {
		v, n := binary.Uvarint(data[at:])
		if n <= 0 {
			t.Fatalf("a frame cut short at %d: %x", at, data)
		}
		at += n
		return v
	}
	varint := func() int64 {
		v, n := binary.Varint(data[at:])
		if n <= 0 {
			t.Fatalf("a frame cut short at %d: %x", at, data)
		}
		at += n
		return v
	}
	one := func() byte {
		at++
		return data[at-1]
	}
	text := func() string {
		n := int(uvarint())
		at += n
		return string(data[at-n : at])
	}
	quarters := func() [3]float64 {
		return [3]float64{float64(varint()) / 4, float64(varint()) / 4, float64(varint()) / 4}
	}
	from := func(home [3]float64) [3]float64 {
		place := quarters()
		return [3]float64{home[0] + place[0], home[1] + place[1], home[2] + place[2]}
	}
	walk := func(told *animalTold, home [3]float64) {
		told.WalkX, told.WalkZ = varint(), varint()
		told.Walk = &[2]float64{home[0] + float64(told.WalkX)/4, home[2] + float64(told.WalkZ)/4}
	}
	frame := animalFrame{Bytes: len(data)}
	for n := uvarint(); n > 0; n-- {
		told := animalTold{ID: uint32(uvarint()), Species: text(), Variant: one(), Mode: one()}
		if told.Mode == animalChase {
			told.Target = text()
		}
		told.Flags = one()
		told.Home = quarters()
		told.Place = from(told.Home)
		told.Hurt = uvarint()
		if told.Flags&animalNewWalking != 0 {
			walk(&told, told.Home)
		}
		if told.Flags&animalNewOwned != 0 {
			told.Session, told.OwnerName = text(), text()
		}
		if told.Flags&animalNewExtra != 0 {
			told.Extra = text()
		}
		homes[told.ID] = told.Home
		frame.Fresh = append(frame.Fresh, told)
	}
	for n := uvarint(); n > 0; n-- {
		told := animalTold{ID: uint32(uvarint()), Says: one()}
		home, known := homes[told.ID]
		if !known {
			t.Fatalf("a change of animal %d, which this client was never told of", told.ID)
		}
		if told.Says&animalSaysHome != 0 {
			home = quarters()
			homes[told.ID] = home
			told.Place = home
		}
		told.Home = home
		if told.Says&animalSaysPlace != 0 {
			told.Place = from(home)
		}
		if told.Says&animalSaysWalk != 0 {
			walk(&told, home)
		}
		if told.Says&animalSaysMode != 0 {
			told.Mode = one()
			if told.Mode == animalChase {
				told.Target = text()
			}
		}
		if told.Says&animalSaysHurt != 0 {
			told.Hurt = uvarint()
		}
		if told.Says&animalSaysOwner != 0 {
			told.Session, told.OwnerName = text(), text()
		}
		if told.Says&animalSaysExtra != 0 {
			told.Extra = text()
		}
		frame.Changed = append(frame.Changed, told)
	}
	for n := uvarint(); n > 0; n-- {
		id := uint32(uvarint())
		delete(homes, id)
		frame.Gone = append(frame.Gone, id)
	}
	if at != len(data) {
		t.Fatalf("%d bytes left over in a frame", len(data)-at)
	}
	return frame
}

// Somebody listening: what a client has been sent since it was last asked.
type animalsEar struct {
	client *Client
	homes  map[uint32][3]float64
}

func animalsListen(client *Client) *animalsEar {
	return &animalsEar{client: client, homes: map[uint32][3]float64{}}
}

// heard is the frame of the last round, if there was one, and every JSON message by type.
func (ear *animalsEar) heard(t *testing.T) (frame animalFrame, told bool, messages map[string][]json.RawMessage) {
	t.Helper()
	messages = map[string][]json.RawMessage{}
	for {
		select {
		case data := <-ear.client.send:
			if isBinaryFrame(data) {
				if told {
					t.Fatal("two frames for one round")
				}
				frame, told = animalsRead(t, data, ear.homes), true
				continue
			}
			var message Message
			if err := json.Unmarshal(data, &message); err != nil {
				t.Fatalf("sent %q", data)
			}
			messages[message.Type] = append(messages[message.Type], message.Payload)
		default:
			return frame, told, messages
		}
	}
}

// catchUp reads whatever was sent over several rounds, to listen to the next one alone.
func (ear *animalsEar) catchUp(t *testing.T) {
	t.Helper()
	for {
		select {
		case data := <-ear.client.send:
			if isBinaryFrame(data) {
				animalsRead(t, data, ear.homes)
			}
		default:
			return
		}
	}
}

func (ear *animalsEar) frame(t *testing.T) animalFrame {
	t.Helper()
	frame, _, _ := ear.heard(t)
	return frame
}

// What animalKeep or animalAdopt was answered.
func animalsKept(t *testing.T, ear *animalsEar) (id uint32, problem string) {
	t.Helper()
	_, _, messages := ear.heard(t)
	answers := messages["animalKept"]
	if len(answers) != 1 {
		t.Fatalf("%d answers: %v", len(answers), messages)
	}
	var answer struct {
		ID    uint32 `json:"id"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(answers[0], &answer); err != nil {
		t.Fatal(err)
	}
	return answer.ID, answer.Error
}

func animalsKeep(t *testing.T, client *Client, ear *animalsEar, ref, species string) uint32 {
	t.Helper()
	animalsSend(t, client, "animalKeep", map[string]any{"ref": ref, "species": species})
	id, problem := animalsKept(t, ear)
	if problem != "" || id == 0 {
		t.Fatalf("keeping a %s: %q", species, problem)
	}
	return id
}

func animalsPig(t *testing.T, x, y, z, radius float64) *animal {
	t.Helper()
	id, ok := animalSpawn(animalSpawnSpec{Species: "pig", X: x, Y: y, Z: z, Radius: radius, Origin: "test"})
	if !ok {
		t.Fatal("no pig")
	}
	animals.mu.Lock()
	defer animals.mu.Unlock()
	return animals.byID[id]
}

// A spider that goes after players from so many blocks, as fast as its kind.
func animalsSpider(t *testing.T, x, y, z, radius, chase float64) *animal {
	t.Helper()
	id, ok := animalSpawn(animalSpawnSpec{Species: "spider", X: x, Y: y, Z: z, Radius: radius, Speed: 0.38, Chase: chase, ChaseSpeed: 1.25, Origin: "test"})
	if !ok {
		t.Fatal("no spider")
	}
	animals.mu.Lock()
	defer animals.mu.Unlock()
	return animals.byID[id]
}

// Rounds with a clock of the test's, with every client given awake all along.
func animalsRun(start time.Time, rounds int, awake ...*Client) time.Time {
	now := start
	for i := 0; i < rounds; i++ {
		now = now.Add(animalsEvery)
		for _, client := range awake {
			client.movedAt.Store(now.UnixNano())
		}
		animalsTick(now)
	}
	return now
}

const (
	animalsAna  = "plr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	animalsBeto = "plr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
)

func TestAKeptAnimalIsSeenByWhoIsNearItAndGoesWithItsOwner(t *testing.T) {
	animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	beto := animalsClient(t, "Beto", animalsBeto, 20, 64, 8)
	cris := animalsClient(t, "Cris", "", 400, 64, 8)
	anaHears, betoHears, crisHears := animalsListen(ana), animalsListen(beto), animalsListen(cris)

	animalsSend(t, ana, "animalKeep", map[string]any{"ref": "abc1", "species": "pig", "variant": 2, "hurt": 4, "extra": map[string]any{"age": 60}})
	id, problem := animalsKept(t, anaHears)
	if problem != "" || id != 1 {
		t.Fatalf("kept as %d: %q", id, problem)
	}
	if _, told, _ := betoHears.heard(t); told {
		t.Fatal("told before the round")
	}

	now := animalsRun(time.Now(), 1)
	for who, ear := range map[string]*animalsEar{"its owner": anaHears, "a neighbour": betoHears} {
		frame := ear.frame(t)
		pig := frame.fresh(id)
		if len(frame.Fresh) != 1 || pig == nil || len(frame.Changed) != 0 || len(frame.Gone) != 0 {
			t.Fatalf("%s hears %+v", who, frame)
		}
		if pig.Species != "pig" || pig.Variant != 2 || pig.Mode != animalFollow || pig.Hurt != 8 || pig.Extra != `{"age":60}` {
			t.Errorf("%s: %+v", who, pig)
		}
		// Whose it is: the page of its owner, to walk it to that avatar, and a name. Never the stable player.
		if pig.Flags != animalNewOwned|animalNewExtra || pig.Session != "page_Ana" || pig.OwnerName != "Ana" {
			t.Errorf("%s, of its owner: %+v", who, pig)
		}
		if pig.Place != [3]float64{8, 64, 8} || pig.Home != pig.Place {
			t.Errorf("%s: it is at %v, home %v, and its owner at 8, 64, 8", who, pig.Place, pig.Home)
		}
	}
	if frame, told, _ := crisHears.heard(t); told {
		t.Fatalf("told to who is 400 blocks away: %+v", frame)
	}

	// Nothing happens: nothing is said, round after round.
	now = animalsRun(now, 10)
	for _, ear := range []*animalsEar{anaHears, betoHears, crisHears} {
		if frame, told, _ := ear.heard(t); told {
			t.Fatalf("a frame with no news: %+v", frame)
		}
	}

	// Its owner walks: nobody is told a thing, it is simply with her. Past the range it is gone for Beto.
	animalsStand(ana, 60, 64, 8)
	now = animalsRun(now, 1)
	if frame, told, _ := betoHears.heard(t); told {
		t.Fatalf("a follower's steps are told: %+v", frame)
	}
	animalsStand(ana, 395, 64, 8)
	animalsRun(now, 1)
	if frame := betoHears.frame(t); len(frame.Gone) != 1 || frame.Gone[0] != id || len(frame.Fresh)+len(frame.Changed) != 0 {
		t.Fatalf("Beto, left behind, hears %+v", frame)
	}
	if frame, told, _ := anaHears.heard(t); told {
		t.Fatalf("its owner is told of her own follower again: %+v", frame)
	}
	if pig := crisHears.frame(t).fresh(id); pig == nil || pig.Place != [3]float64{395, 64, 8} || pig.Session != "page_Ana" {
		t.Fatalf("Cris, where they arrive, hears %+v", pig)
	}
	if len(beto.animals) != 0 || len(cris.animals) != 1 {
		t.Fatalf("what the server thinks they know: %v, %v", beto.animals, cris.animals)
	}
}

func TestAnAnimalComesAndGoesWithRoomToSpareAtTheEdgeOfTheRange(t *testing.T) {
	animalsWorld(t)
	// A pig that does not walk, in chunk 0; the player comes from 5 chunks away.
	pig := animalsPig(t, 8, 64, 8, 0)
	ana := animalsClient(t, "Ana", animalsAna, 5*16+8, 64, 8)
	hears := animalsListen(ana)
	now := animalsRun(time.Now(), 1)
	if _, told, _ := hears.heard(t); told {
		t.Fatal("told from 5 chunks away")
	}
	animalsStand(ana, 4*16+8, 64, 8)
	now = animalsRun(now, 1)
	if _, told, _ := hears.heard(t); told {
		t.Fatal("told from 4 chunks away, where it is only kept")
	}
	animalsStand(ana, 3*16+8, 64, 8)
	now = animalsRun(now, 1)
	if frame := hears.frame(t); frame.fresh(pig.ID) == nil {
		t.Fatalf("at 3 chunks: %+v", frame)
	}
	// A step back over the edge does not take it away...
	animalsStand(ana, 4*16+8, 64, 8)
	now = animalsRun(now, 1)
	if frame, told, _ := hears.heard(t); told {
		t.Fatalf("at 4 chunks, knowing it: %+v", frame)
	}
	// ...another chunk does.
	animalsStand(ana, 5*16+8, 64, 8)
	animalsRun(now, 1)
	if frame := hears.frame(t); len(frame.Gone) != 1 {
		t.Fatalf("at 5 chunks: %+v", frame)
	}
}

func TestRoamingAnimalsWalkOnlyNearSomebodyAwakeAndNeverLeaveTheirCircle(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	asleep := animalsClient(t, "Dormido", "", 1008, 64, 8)
	hears := animalsListen(ana)
	var near, far, unwatched, still []*animal
	for i := 0; i < 6; i++ {
		near = append(near, animalsPig(t, 4+float64(i)*3, 64, 12, 3))
		far = append(far, animalsPig(t, 5000+float64(i)*3, 64, 12, 3))
		unwatched = append(unwatched, animalsPig(t, 1000+float64(i)*3, 64, 12, 3))
		// One that the server does not walk: it only exists.
		still = append(still, animalsPig(t, 4+float64(i)*3, 64, 2, 0))
	}
	start := time.Now()
	asleep.movedAt.Store(start.Add(-time.Minute).UnixNano())

	walks := 0
	now := start
	for round := 0; round < 4*60*2; round++ {
		now = animalsRun(now, 1, ana)
		frame, _, _ := hears.heard(t)
		for _, told := range append(frame.Fresh, frame.Changed...) {
			if told.Walk == nil {
				continue
			}
			walks++
			if far := math.Hypot(told.Walk[0]-told.Home[0], told.Walk[1]-told.Home[2]); far > 3 {
				t.Fatalf("a walk %.2f blocks from home, with a circle of 3: %+v", far, told)
			}
		}
		book.mu.Lock()
		for _, a := range near {
			if away := math.Hypot(a.X-a.HomeX, a.Z-a.HomeZ); away > 3 {
				t.Fatalf("an animal %.2f blocks from home", away)
			}
		}
		book.mu.Unlock()
	}
	if walks < 30 {
		t.Fatalf("%d walks of 6 animals in 4 minutes", walks)
	}
	moved := func(list []*animal) int {
		count := 0
		for _, a := range list {
			if a.X != a.HomeX || a.Z != a.HomeZ || a.walking {
				count++
			}
		}
		return count
	}
	book.mu.Lock()
	defer book.mu.Unlock()
	if moved(near) != len(near) {
		t.Errorf("%d of %d animals near the player have walked", moved(near), len(near))
	}
	if moved(far) != 0 {
		t.Error("an animal walked with nobody near")
	}
	if moved(unwatched) != 0 {
		t.Error("an animal walked for a client that is not watching (a tab in the background)")
	}
	if moved(still) != 0 {
		t.Error("an animal with no circle was walked")
	}
}

// A pig on a walk, told to both clients: the walk it is on, as the frame says it.
func animalsWalking(t *testing.T, book *animalBook, pig *animal, now time.Time, awake ...*Client) (time.Time, int32, int32) {
	t.Helper()
	for i := 0; i < 200; i++ {
		now = animalsRun(now, 1, awake...)
		book.mu.Lock()
		walking, x, z := pig.walking, pig.goalX, pig.goalZ
		book.mu.Unlock()
		if walking {
			return now, x, z
		}
	}
	t.Fatal("the pig never walks")
	return now, 0, 0
}

func TestWhereAnAnimalStopsIsWhatTheFirstClientToSaySoSaw(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	beto := animalsClient(t, "Beto", animalsBeto, 10, 64, 8)
	cris := animalsClient(t, "Cris", "", 900, 64, 8)
	anaHears, betoHears := animalsListen(ana), animalsListen(beto)
	pig := animalsPig(t, 8, 64, 12, 6)
	now, goalX, goalZ := animalsWalking(t, book, pig, time.Now(), ana, beto)
	anaHears.catchUp(t)
	betoHears.catchUp(t)
	report := func(client *Client, x, y, z float64, gx, gz int32) {
		animalsSend(t, client, "animalAt", map[string]any{"id": pig.ID, "x": x, "y": y, "z": z, "gx": gx, "gz": gz})
	}
	place := func() [3]float64 {
		book.mu.Lock()
		defer book.mu.Unlock()
		return [3]float64{pig.X, pig.Y, pig.Z}
	}
	before := place()

	// About another walk, or from a client that does not have the animal around: not heard.
	report(ana, 9, 64, 12, goalX+1, goalZ)
	report(cris, 9, 64, 12, goalX, goalZ)
	if place() != before || !pig.walking || pig.reported {
		t.Fatal("a report that is not about this walk was taken")
	}
	// Blocked by a fence a block and a half from where it stood: there it is, for both.
	report(beto, 9.3, 64, 12.6, goalX, goalZ)
	if got := place(); got != [3]float64{9.25, 64, 12.5} {
		t.Fatalf("after the report it is at %v", got)
	}
	// The second to say so is not heard, whatever it says.
	report(ana, 6, 64, 10, goalX, goalZ)
	if got := place(); got != [3]float64{9.25, 64, 12.5} {
		t.Fatalf("a second report moved it to %v", got)
	}
	now = animalsRun(now, 1, ana, beto)
	for who, ear := range map[string]*animalsEar{"Ana": anaHears, "Beto": betoHears} {
		told := ear.frame(t).changed(pig.ID)
		if told == nil || told.Says != animalSaysPlace || told.Place != [3]float64{9.25, 64, 12.5} {
			t.Fatalf("%s is told %+v", who, told)
		}
	}

	// A place out of its circle is no place: it is back where it stood, and that is said too.
	now, goalX, goalZ = animalsWalking(t, book, pig, now, ana, beto)
	before = place()
	anaHears.catchUp(t)
	report(ana, 30, 64, 12, goalX, goalZ)
	if place() != before || pig.walking {
		t.Fatalf("a report from outside its circle: at %v, walking %v", place(), pig.walking)
	}
	now = animalsRun(now, 1, ana, beto)
	if told := anaHears.frame(t).changed(pig.ID); told == nil || told.Says != animalSaysPlace || told.Place != before {
		t.Fatalf("sent back, Ana is told %+v", told)
	}
	// Nor is a number that is none.
	now, goalX, goalZ = animalsWalking(t, book, pig, now, ana, beto)
	before = place()
	handleMessage(ana, Message{Type: "animalAt", Payload: json.RawMessage(fmt.Sprintf(`{"id":%d,"x":1e999,"y":64,"z":12,"gx":%d,"gz":%d}`, pig.ID, goalX, goalZ))})
	report(ana, 9, 1e6, 12, goalX, goalZ)
	if place() != before {
		t.Fatalf("a report with no sense moved it to %v", place())
	}

	// It got there, but the ground is two blocks higher: only the height is taken.
	now, goalX, goalZ = animalsWalking(t, book, pig, now, ana, beto)
	x, z := pig.goalPlace()
	report(beto, x+0.3, 66, z-0.2, goalX, goalZ)
	if got := place(); got != [3]float64{x, 66, z} {
		t.Fatalf("arrived higher up: at %v, sent to %v, %v", got, x, z)
	}

	// With nothing said by the time it must have arrived, it is where it was sent.
	now, _, _ = animalsWalking(t, book, pig, now, ana, beto)
	x, z = pig.goalPlace()
	for i := 0; i < 400 && pig.walking && place() != [3]float64{x, 66, z}; i++ {
		now = animalsRun(now, 1, ana, beto)
	}
	if got := place(); got != [3]float64{x, 66, z} && !pig.walking {
		t.Fatalf("after a walk nobody complained about it is at %v, not at %v, %v", got, x, z)
	}
}

func TestInAPlotAVisitorCanOnlySendAnAnimalBackAndOnlyTheOwnerOrAMemberStrikesIt(t *testing.T) {
	claimWorld(t)
	book := animalsWorld(t)
	ana := claimAnaPlot(t)
	animalsStand(ana, 101, 120, 101)
	beto := animalsClient(t, "Beto", animalsBeto, 102, 120, 102)
	betoHears := animalsListen(beto)
	pig := animalsPig(t, 100.5, 120, 104.5, 6)
	wild := animalsPig(t, 300.5, 120, 300.5, 6)
	now, goalX, goalZ := animalsWalking(t, book, pig, time.Now(), ana, beto)
	betoHears.catchUp(t)

	// The visitor's copy stopped at a fence. It is not believed, but it is heard: the walk is over.
	animalsSend(t, beto, "animalAt", map[string]any{"id": pig.ID, "x": 102, "y": 120, "z": 105, "gx": goalX, "gz": goalZ})
	if pig.X != 100.5 || pig.Z != 104.5 || pig.walking {
		t.Fatalf("a visitor moved an animal of the plot to %v, %v (walking %v)", pig.X, pig.Z, pig.walking)
	}
	now = animalsRun(now, 1, ana, beto)
	frame, _, messages := betoHears.heard(t)
	if told := frame.changed(pig.ID); told == nil || told.Place != [3]float64{100.5, 120, 104.5} {
		t.Fatalf("the visitor is told %+v", frame)
	}
	if len(messages["claimRefused"]) != 0 {
		t.Fatal("a visitor is told off for what its copy of an animal did")
	}

	// A stranger does not strike it, take it or tame it away: told why, and told the animal again.
	for kind, payload := range map[string]any{
		"animalHurt":  map[string]any{"id": pig.ID, "damage": 4},
		"animalGone":  map[string]any{"id": pig.ID},
		"animalAdopt": map[string]any{"id": pig.ID, "ref": "x1"},
	} {
		animalsSend(t, beto, kind, payload)
		_, _, messages := betoHears.heard(t)
		if refusal := claimRefusalOf(t, messages); refusal == nil || refusal.Reason != claimReasonPlot || refusal.Owner != "Ana" {
			t.Fatalf("%s by a stranger in the plot: %+v", kind, refusal)
		}
		if kind != "animalAdopt" {
			now = animalsRun(now, 1, ana, beto)
			if told := betoHears.frame(t).fresh(pig.ID); told == nil || told.Hurt != 0 {
				t.Fatalf("after a refused %s the stranger is told %+v", kind, told)
			}
		}
	}
	if pig.Hurt != 0 || pig.Owner != "" || book.byID[pig.ID] == nil {
		t.Fatalf("the stranger changed it: %+v", pig.Animal)
	}
	// Out of every plot anybody may.
	animalsStand(beto, 300, 120, 300)
	animalsSend(t, beto, "animalHurt", map[string]any{"id": wild.ID, "damage": 4.5})
	if wild.Hurt != 9 {
		t.Fatalf("struck in the wild: %d half points", wild.Hurt)
	}
	// The owner of the plot strikes it, and takes it.
	animalsSend(t, ana, "animalHurt", map[string]any{"id": pig.ID, "damage": 5})
	if pig.Hurt != 10 {
		t.Fatalf("struck by the plot's owner: %d half points", pig.Hurt)
	}
	animalsSend(t, ana, "animalGone", map[string]any{"id": pig.ID})
	if book.byID[pig.ID] != nil {
		t.Fatal("the plot's owner could not take it")
	}
}

func TestOnlyItsOwnerChangesStrikesOrTakesAnOwnedAnimal(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	beto := animalsClient(t, "Beto", animalsBeto, 10, 64, 8)
	admin := animalsClient(t, "Admin", "plr_cccccccccccccccccccccccccccccccc", 10, 64, 10)
	admin.creative.Store(true)
	anaHears, betoHears := animalsListen(ana), animalsListen(beto)
	id := animalsKeep(t, ana, anaHears, "abc1", "horse")
	second := animalsKeep(t, ana, anaHears, "abc2", "horse")
	now := animalsRun(time.Now(), 1)
	anaHears.heard(t)
	betoHears.heard(t)
	horse := book.byID[id]

	for kind, payload := range map[string]any{
		"animalHurt": map[string]any{"id": id, "damage": 4},
		"animalGone": map[string]any{"id": id},
		"animalSet":  map[string]any{"id": id, "mode": animalStay, "x": 10, "y": 64, "z": 8},
		"animalSet ": map[string]any{"id": id, "hurt": 3, "extra": map[string]any{"age": 1}},
	} {
		animalsSend(t, beto, strings.TrimSpace(kind), payload)
		_, _, messages := betoHears.heard(t)
		if len(messages["animalRefused"]) != 1 || len(messages["claimRefused"]) != 0 {
			t.Fatalf("%s by somebody else: %v", kind, messages)
		}
		now = animalsRun(now, 1)
		if told := betoHears.frame(t).fresh(id); told == nil || told.Hurt != 0 || told.Mode != animalFollow || told.Extra != "" {
			t.Fatalf("after a refused %s it is told again as %+v", kind, told)
		}
	}
	if horse.Hurt != 0 || horse.Mode != animalFollow || len(horse.Extra) != 0 || book.byID[id] == nil {
		t.Fatalf("somebody else changed it: %+v", horse.Animal)
	}

	// Its owner sits it down three blocks away: the others are told where, and that it stays.
	animalsSend(t, ana, "animalSet", map[string]any{"id": id, "mode": animalStay, "x": 11.1, "y": 64, "z": 8.4, "extra": map[string]any{"age": 120}})
	now = animalsRun(now, 1)
	told := betoHears.frame(t).changed(id)
	if told == nil || told.Says != animalSaysHome|animalSaysMode|animalSaysExtra || told.Mode != animalStay || told.Place != [3]float64{11, 64, 8.5} || told.Extra != `{"age":120}` {
		t.Fatalf("sat down, the neighbour is told %+v", told)
	}
	// Its owner said it: she is not told what she knows.
	if frame, told, _ := anaHears.heard(t); told {
		t.Fatalf("its owner is told her own change: %+v", frame)
	}
	// The same said again is no news.
	animalsSend(t, ana, "animalSet", map[string]any{"id": id, "mode": animalStay, "x": 11.1, "y": 64, "z": 8.4, "extra": map[string]any{"age": 120}})
	now = animalsRun(now, 1)
	if frame, told, _ := betoHears.heard(t); told {
		t.Fatalf("a change that changes nothing is told: %+v", frame)
	}
	// It stays as its owner walks away, and she strikes and feeds it: the others see the same bar.
	animalsStand(ana, 20, 64, 8)
	animalsSend(t, ana, "animalHurt", map[string]any{"id": id, "damage": 4})
	animalsSend(t, ana, "animalSet", map[string]any{"id": id, "hurt": 1.5})
	now = animalsRun(now, 1)
	if told := betoHears.frame(t).changed(id); told == nil || told.Says != animalSaysHurt || told.Hurt != 3 {
		t.Fatalf("struck and fed, the neighbour is told %+v", told)
	}
	if horse.X != 11 || horse.Z != 8.5 {
		t.Fatalf("a sitting animal moved to %v, %v", horse.X, horse.Z)
	}
	// Riding it: the others are told only that (they see the mount under the rider).
	animalsSend(t, ana, "animalSet", map[string]any{"id": id, "mode": animalRidden})
	now = animalsRun(now, 1)
	if told := betoHears.frame(t).changed(id); told == nil || told.Says != animalSaysMode || told.Mode != animalRidden {
		t.Fatalf("ridden, the neighbour is told %+v", told)
	}
	if horse.X != 20 || horse.HomeX != 20 {
		t.Fatalf("a ridden animal is at %v, its rider at 20", horse.X)
	}

	// What makes no sense is refused to its owner too: a mode there is not, a place 300 blocks away, an
	// extra that is no object or is too much.
	for name, payload := range map[string]any{
		"roam":       map[string]any{"id": id, "mode": animalRoam},
		"no mode":    map[string]any{"id": id, "mode": 9},
		"far":        map[string]any{"id": id, "mode": animalStay, "x": 320, "y": 64, "z": 8},
		"an array":   map[string]any{"id": id, "extra": []int{1}},
		"too much":   map[string]any{"id": id, "extra": map[string]any{"a": strings.Repeat("x", animalsMaxExtra)}},
		"no number":  map[string]any{"id": id, "hurt": -3},
		"not a spot": map[string]any{"id": id, "mode": animalStay, "x": 20, "y": 1e9, "z": 8},
	} {
		anaHears.heard(t)
		animalsSend(t, ana, "animalSet", payload)
		_, _, messages := anaHears.heard(t)
		if name != "not a spot" && len(messages["animalRefused"]) != 1 {
			t.Errorf("%s: %v", name, messages)
		}
		if horse.Mode != animalRidden || string(horse.Extra) != `{"age":120}` || horse.Hurt != 3 {
			t.Fatalf("%s was taken: %+v", name, horse.Animal)
		}
	}
	// One the server does not have: the client is told, to ask for it to be kept again.
	animalsSend(t, ana, "animalSet", map[string]any{"id": 999, "mode": animalFollow})
	_, _, messages := anaHears.heard(t)
	var refused struct {
		ID   uint32 `json:"id"`
		Gone bool   `json:"gone"`
	}
	if len(messages["animalRefused"]) != 1 || json.Unmarshal(messages["animalRefused"][0], &refused) != nil || refused.ID != 999 || !refused.Gone {
		t.Fatalf("an animal that is not there: %v", messages)
	}

	// The admin passes, as in every plot. Its owner takes the other.
	animalsSend(t, admin, "animalGone", map[string]any{"id": id})
	animalsSend(t, ana, "animalGone", map[string]any{"id": second})
	if len(book.byID) != 0 || len(book.chunks) != 0 {
		t.Fatalf("%d animals left, in %d chunks", len(book.byID), len(book.chunks))
	}
	animalsRun(now, 1)
	if frame := betoHears.frame(t); len(frame.Gone) != 2 {
		t.Fatalf("taken out of the world, the neighbour is told %+v", frame)
	}
}

func TestAnAnimalIsNotLeftToStayInSomebodyElsesPlot(t *testing.T) {
	claimWorld(t)
	book := animalsWorld(t)
	ana := claimAnaPlot(t)
	animalsStand(ana, 101, 120, 101)
	beto := animalsClient(t, "Beto", animalsBeto, 102, 120, 102)
	betoHears := animalsListen(beto)
	id := animalsKeep(t, beto, betoHears, "b1", "dog")
	animalsRun(time.Now(), 1)
	betoHears.heard(t)

	animalsSend(t, beto, "animalSet", map[string]any{"id": id, "mode": animalStay, "x": 103, "y": 120, "z": 103})
	_, _, messages := betoHears.heard(t)
	if refusal := claimRefusalOf(t, messages); refusal == nil || refusal.Reason != claimReasonPlot || refusal.Owner != "Ana" {
		t.Fatalf("left to stay in Ana's plot: %+v", refusal)
	}
	if len(messages["animalRefused"]) != 1 || book.byID[id].Mode != animalFollow {
		t.Fatalf("it stays all the same: %v, mode %d", messages, book.byID[id].Mode)
	}
	// Outside it may.
	animalsSend(t, beto, "animalSet", map[string]any{"id": id, "mode": animalStay, "x": 112, "y": 120, "z": 112})
	if a := book.byID[id]; a.Mode != animalStay || a.X != 112 {
		t.Fatalf("outside the plot: %+v", a.Animal)
	}
}

func TestAnAnimalWithNoOwnerIsTamedOnceAndThenFollowsWhoTamedIt(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	beto := animalsClient(t, "Beto", animalsBeto, 10, 64, 8)
	anaHears, betoHears := animalsListen(ana), animalsListen(beto)
	pig := animalsPig(t, 8, 64, 12, 6)
	now := animalsRun(time.Now(), 1, ana, beto)
	if told := betoHears.frame(t).fresh(pig.ID); told == nil || told.Flags != animalNewWalked || told.Mode != animalRoam {
		t.Fatalf("a roaming pig is told as %+v", told)
	}
	anaHears.heard(t)

	animalsSend(t, ana, "animalAdopt", map[string]any{"ref": "t1", "id": pig.ID})
	if id, problem := animalsKept(t, anaHears); id != pig.ID || problem != "" {
		t.Fatalf("adopted as %d: %q", id, problem)
	}
	now = animalsRun(now, 1, ana, beto)
	told := betoHears.frame(t).changed(pig.ID)
	if told == nil || told.Says != animalSaysHome|animalSaysMode|animalSaysOwner || told.Mode != animalFollow || told.Session != "page_Ana" || told.OwnerName != "Ana" {
		t.Fatalf("adopted, the neighbour is told %+v", told)
	}
	if pig.Radius != 0 || pig.walking || pig.X != 8 || pig.Z != 8 {
		t.Fatalf("an adopted pig still roams: %+v", pig.Animal)
	}
	// Asked again by her it is hers already; by somebody else it has an owner.
	animalsSend(t, ana, "animalAdopt", map[string]any{"ref": "t2", "id": pig.ID})
	if id, problem := animalsKept(t, anaHears); id != pig.ID || problem != "" {
		t.Fatalf("adopted twice: %d, %q", id, problem)
	}
	animalsSend(t, beto, "animalAdopt", map[string]any{"ref": "t3", "id": pig.ID})
	if _, problem := animalsKept(t, betoHears); problem != "owned" {
		t.Fatalf("adopted by another: %q", problem)
	}
	animalsSend(t, beto, "animalAdopt", map[string]any{"ref": "t4", "id": 77})
	if _, problem := animalsKept(t, betoHears); problem != "gone" {
		t.Fatalf("adopting what is not there: %q", problem)
	}
	if len(book.owners[animalsAna].animals) != 1 || book.owners[animalsBeto] != nil {
		t.Fatal("the owners' lists are wrong")
	}
	// No walk is decided for it any more.
	for i := 0; i < 240; i++ {
		now = animalsRun(now, 1, ana, beto)
	}
	if pig.walking || pig.X != 8 {
		t.Fatalf("an owned animal was walked by the server: %+v", pig.Animal)
	}
}

func TestAnOwnerAwayLeavesItsAnimalsWhereTheyWereAndFindsThemByItsSideOnComingBack(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	beto := animalsClient(t, "Beto", animalsBeto, 10, 64, 8)
	anaHears, betoHears := animalsListen(ana), animalsListen(beto)
	id := animalsKeep(t, ana, anaHears, "abc1", "dog")
	now := animalsRun(time.Now(), 1)
	betoHears.heard(t)

	animalsLeave(ana)
	now = animalsRun(now, 1)
	told := betoHears.frame(t).changed(id)
	if told == nil || told.Says != animalSaysOwner || told.Session != "" || told.OwnerName != "Ana" {
		t.Fatalf("its owner gone, the neighbour is told %+v", told)
	}
	if a := book.byID[id]; a.X != 8 || a.Mode != animalFollow {
		t.Fatalf("it did not wait: %+v", a.Animal)
	}
	if !worldAnimals.dirty.Load() {
		t.Error("where it waits is not to be saved")
	}

	// Back from another page (a reload), somewhere else: it is by her side, and hers.
	again := animalsClient(t, "Ana2", animalsAna, 300, 64, 8)
	againHears := animalsListen(again)
	now = animalsRun(now, 1)
	if told := againHears.frame(t).fresh(id); told == nil || told.Session != "page_Ana2" || told.OwnerName != "Ana2" || told.Place != [3]float64{300, 64, 8} {
		t.Fatalf("back, she is told %+v", told)
	}
	if frame := betoHears.frame(t); len(frame.Gone) != 1 {
		t.Fatalf("the neighbour it left: %+v", frame)
	}
	// A second tab of hers changes nothing while the first plays.
	tab := animalsClient(t, "Ana3", animalsAna, 302, 64, 8)
	tabHears := animalsListen(tab)
	for i := 0; i < 6; i++ {
		now = animalsRun(now, 1)
	}
	if told := tabHears.frame(t).fresh(id); told == nil || told.Session != "page_Ana2" {
		t.Fatalf("the second tab is told %+v", told)
	}
	if frame, told, _ := againHears.heard(t); told {
		t.Fatalf("a second tab made news: %+v", frame)
	}
}

func TestWhatCannotBeAnAnimalIsNotKept(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	nobody := animalsClient(t, "Nadie", "", 8, 64, 8)
	hears, nobodyHears := animalsListen(ana), animalsListen(nobody)

	for name, payload := range map[string]map[string]any{
		"a species that is no name": {"ref": "a1", "species": "Pig<script>"},
		"no species":                {"ref": "a2"},
		"a long name":               {"ref": "a3", "species": strings.Repeat("a", 33)},
		"a variant there is not":    {"ref": "a4", "species": "pig", "variant": 300},
		"hurt that is no number":    {"ref": "a5", "species": "pig", "hurt": -1},
		"an extra that is a list":   {"ref": "a6", "species": "pig", "extra": []int{1, 2}},
		"too much extra":            {"ref": "a7", "species": "pig", "extra": map[string]any{"a": strings.Repeat("x", animalsMaxExtra)}},
	} {
		animalsSend(t, ana, "animalKeep", payload)
		if id, problem := animalsKept(t, hears); id != 0 || problem != "invalid" {
			t.Errorf("%s: kept as %d, %q", name, id, problem)
		}
	}
	// No ref to answer to, or one that is no ref, or far too much of anything: not even answered.
	animalsSend(t, ana, "animalKeep", map[string]any{"species": "pig"})
	animalsSend(t, ana, "animalKeep", map[string]any{"ref": "A B", "species": "pig"})
	animalsSend(t, ana, "animalKeep", map[string]any{"ref": "a8", "species": "pig", "junk": strings.Repeat("x", animalsMaxPayload)})
	if _, _, messages := hears.heard(t); len(messages) != 0 {
		t.Fatalf("answered %v", messages)
	}
	// Somebody the server does not know owns nothing; a player that is nowhere yet asks again later.
	animalsSend(t, nobody, "animalKeep", map[string]any{"ref": "n1", "species": "pig"})
	if _, problem := animalsKept(t, nobodyHears); problem != "noPlayer" {
		t.Fatalf("with no player: %q", problem)
	}
	animalsLeave(ana)
	animalsSend(t, ana, "animalKeep", map[string]any{"ref": "a9", "species": "pig"})
	if _, problem := animalsKept(t, hears); problem != "later" {
		t.Fatalf("from the title screen: %q", problem)
	}
	animalsStand(ana, 8, 64, 8)
	if len(book.byID) != 0 {
		t.Fatalf("%d animals kept", len(book.byID))
	}

	// Asked twice with one ref (the answer was lost): kept once.
	first := animalsKeep(t, ana, hears, "same", "pig")
	if again := animalsKeep(t, ana, hears, "same", "pig"); again != first || len(book.byID) != 1 {
		t.Fatalf("kept twice: %d and %d", first, again)
	}
	// So many and no more for one player.
	for i := 1; i < animalsMaxPerOwner; i++ {
		animalsKeep(t, ana, hears, fmt.Sprintf("r%d", i), "pig")
	}
	animalsSend(t, ana, "animalKeep", map[string]any{"ref": "more", "species": "pig"})
	if _, problem := animalsKept(t, hears); problem != "full" {
		t.Fatalf("one more than %d: %q", animalsMaxPerOwner, problem)
	}

	// A machine's animal: the same rules for what it is made of.
	for name, spec := range map[string]animalSpawnSpec{
		"no name":   {Species: "T-Rex", X: 1, Y: 64, Z: 1},
		"nowhere":   {Species: "pig", X: math.NaN(), Y: 64, Z: 1},
		"too high":  {Species: "pig", X: 1, Y: 1e6, Z: 1},
		"no circle": {Species: "pig", X: 1, Y: 64, Z: 1, Radius: math.NaN()},
	} {
		if _, ok := animalSpawn(spec); ok {
			t.Errorf("%s: spawned", name)
		}
	}
	if id, ok := animalSpawn(animalSpawnSpec{Species: "pig", X: 1, Y: 64, Z: 1, Radius: 1000, Speed: 99}); !ok || book.byID[id].Radius != animalsMaxRadius || book.byID[id].Speed != 8 {
		t.Fatal("a circle or a pace out of all measure is not cut down")
	}
}

func TestOnlyACreativeSessionSummonsAnAnimalAndOnlyNextToItself(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	hears := animalsListen(ana)
	summon := map[string]any{"species": "pig", "variant": 1, "x": 10, "y": 64, "z": 8, "radius": 8, "speed": 0.38}
	animalsSend(t, ana, "animalSummon", summon)
	if _, _, messages := hears.heard(t); len(messages) != 0 || len(book.byID) != 0 {
		t.Fatalf("summoned without creative mode: %v", messages)
	}
	ana.creative.Store(true)
	animalsSend(t, ana, "animalSummon", map[string]any{"species": "pig", "x": 100, "y": 64, "z": 8, "radius": 8})
	animalsSend(t, ana, "animalSummon", map[string]any{"species": "no such!", "x": 10, "y": 64, "z": 8})
	if _, _, messages := hears.heard(t); len(messages["animalSummoned"]) != 2 || len(book.byID) != 0 {
		t.Fatalf("summoned far away, or what is no species: %v", messages)
	}
	animalsSend(t, ana, "animalSummon", summon)
	_, _, messages := hears.heard(t)
	var answer struct {
		ID uint32 `json:"id"`
	}
	if len(messages["animalSummoned"]) != 1 || json.Unmarshal(messages["animalSummoned"][0], &answer) != nil || answer.ID == 0 {
		t.Fatalf("summoned: %v", messages)
	}
	pig := book.byID[answer.ID]
	if pig == nil || pig.Mode != animalRoam || pig.Owner != "" || pig.Radius != 8 || pig.Variant != 1 || pig.X != 10 || pig.HomeX != 10 || pig.Origin != "summon" {
		t.Fatalf("the summoned pig: %+v", pig)
	}
	animalsRun(time.Now(), 1, ana)
	if told := hears.frame(t).fresh(pig.ID); told == nil || told.Flags != animalNewWalked {
		t.Fatalf("its summoner is told %+v", told)
	}
	// A hostile species comes with what the page knows of how its kind goes after players.
	animalsSend(t, ana, "animalSummon", map[string]any{"species": "scorpion", "x": 10, "y": 64, "z": 8, "radius": 8, "speed": 0.35, "chase": 8, "chaseDay": 3.5, "chaseSpeed": 1.1})
	_, _, messages = hears.heard(t)
	if len(messages["animalSummoned"]) != 1 || json.Unmarshal(messages["animalSummoned"][0], &answer) != nil {
		t.Fatalf("summoned: %v", messages)
	}
	if scorpion := book.byID[answer.ID]; scorpion == nil || scorpion.Species != "scorpion" || scorpion.Chase != 8 || scorpion.ChaseDay != 3.5 || scorpion.ChaseSpeed != 1.1 {
		t.Fatalf("the summoned scorpion: %+v", scorpion)
	}
}

func TestWhatHasChangedOfAnAnimalFarAwayIsToldNowAndThen(t *testing.T) {
	animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	beto := animalsClient(t, "Beto", animalsBeto, 3*16+8, 64, 8)
	anaHears, betoHears := animalsListen(ana), animalsListen(beto)
	id := animalsKeep(t, ana, anaHears, "abc1", "dog")
	now := animalsRun(time.Now(), 1)
	if betoHears.frame(t).fresh(id) == nil {
		t.Fatal("not told from 3 chunks away")
	}
	rounds := 0
	animalsSend(t, ana, "animalSet", map[string]any{"id": id, "mode": animalStay, "x": 8, "y": 64, "z": 8})
	for ; rounds < 10; rounds++ {
		now = animalsRun(now, 1)
		if frame, told, _ := betoHears.heard(t); told {
			if frame.changed(id) == nil || frame.changed(id).Mode != animalStay {
				t.Fatalf("told %+v", frame)
			}
			break
		}
	}
	if rounds >= animalsFarEvery {
		t.Fatalf("told after %d rounds", rounds+1)
	}
	// Next to it, the same change is told with the very next round, whichever that is.
	animalsStand(beto, 12, 64, 8)
	for i := 0; i < animalsFarEvery; i++ {
		mode := animalFollow
		if i%2 == 1 {
			mode = animalStay
		}
		animalsSend(t, ana, "animalSet", map[string]any{"id": id, "mode": mode, "x": 8, "y": 64, "z": 8})
		now = animalsRun(now, 1)
		if told := betoHears.frame(t).changed(id); told == nil || told.Mode != mode {
			t.Fatalf("round %d: a neighbour is told %+v", i, told)
		}
	}
}

func TestAnimalsAreSavedAndComeBackAsTheyWere(t *testing.T) {
	persistenceWorld(t)
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	hears := animalsListen(ana)
	pig := animalsPig(t, 40.5, 64, -3.5, 8)
	animalsSend(t, ana, "animalKeep", map[string]any{"ref": "abc1", "species": "horse", "variant": 3, "hurt": 2.5, "extra": map[string]any{"age": 120, "genetics": map[string]any{"id": "AB12"}}})
	horse, _ := animalsKept(t, hears)
	animalsSend(t, ana, "animalSet", map[string]any{"id": horse, "mode": animalStay, "x": 9.25, "y": 65, "z": 7.5})
	ridden := animalsKeep(t, ana, hears, "abc2", "camel")
	animalsSend(t, ana, "animalSet", map[string]any{"id": ridden, "mode": animalRidden})
	gone := animalsKeep(t, ana, hears, "abc3", "dog")
	animalsSend(t, ana, "animalGone", map[string]any{"id": gone})
	if !worldAnimals.dirty.Load() {
		t.Fatal("nothing to save after all that")
	}
	if persistenceFile(t, worldAnimals) != "" {
		t.Fatal("written before its round: it is not a section that cannot wait")
	}
	worldFlush()
	saved := persistenceFile(t, worldAnimals)
	if !strings.Contains(saved, `"animals":[`) || !strings.Contains(saved, `"animalNext":5`) || strings.Contains(saved, "page_Ana") {
		t.Fatalf("saved as %s", saved)
	}
	want := map[uint32]Animal{pig.ID: pig.Animal, horse: book.byID[horse].Animal, ridden: book.byID[ridden].Animal}

	// The server starts again.
	animals = newAnimalBook()
	if err := worldLoad(); err != nil {
		t.Fatal(err)
	}
	loaded := animals
	t.Cleanup(func() { worldAnimals.dirty.Store(false) })
	if len(loaded.byID) != 3 || loaded.next != 5 {
		t.Fatalf("%d animals back, the next one would be %d", len(loaded.byID), loaded.next)
	}
	for id, was := range want {
		got := loaded.byID[id]
		if got == nil {
			t.Fatalf("animal %d is not back", id)
		}
		// Nobody is riding as the server starts.
		if was.Mode == animalRidden {
			was.Mode = animalFollow
		}
		if fmt.Sprintf("%+v", got.Animal) != fmt.Sprintf("%+v", was) {
			t.Errorf("animal %d came back as\n%+v, was\n%+v", id, got.Animal, was)
		}
	}
	if a := loaded.byID[horse]; a.Mode != animalStay || a.X != 9.25 || a.Y != 65 || a.Hurt != 5 || a.Owner != animalsAna || !strings.Contains(string(a.Extra), `"AB12"`) {
		t.Fatalf("the horse: %+v", a.Animal)
	}
	if len(loaded.owners[animalsAna].animals) != 2 || len(loaded.chunks) != 2 {
		t.Fatalf("the lists were not made again: %d of Ana's, %d chunks", len(loaded.owners[animalsAna].animals), len(loaded.chunks))
	}
	// Its owner is told of them as hers on coming back, and a new animal takes a number nobody had.
	animalsRun(time.Now(), 1)
	frame := hears.frame(t)
	if told := frame.fresh(horse); told == nil || told.Session != "page_Ana" || told.Mode != animalStay {
		t.Fatalf("after the restart its owner is told %+v", frame)
	}
	if id := animalsKeep(t, ana, hears, "abc4", "pig"); id != 5 {
		t.Fatalf("the next animal is %d", id)
	}
	// And asked again for one kept before the restart, it is the same one.
	if id := animalsKeep(t, ana, hears, "abc1", "horse"); id != horse {
		t.Fatalf("kept again as %d, it was %d", id, horse)
	}

	// What a file should never hold is left out, and the rest is read.
	broken := `{"animals":[{"id":1,"species":"pig","mode":0,"x":1,"y":64,"z":1,"homeX":1,"homeY":64,"homeZ":1},
		{"id":1,"species":"pig","mode":0,"x":1,"y":64,"z":1,"homeX":1,"homeY":64,"homeZ":1},
		{"id":2,"species":"NO","mode":0,"x":1,"y":64,"z":1,"homeX":1,"homeY":64,"homeZ":1},
		{"id":3,"species":"pig","mode":9,"x":1,"y":64,"z":1,"homeX":1,"homeY":64,"homeZ":1},
		{"id":4,"species":"pig","mode":0,"x":1,"y":64000,"z":1,"homeX":1,"homeY":64,"homeZ":1}],"animalNext":2}`
	if err := os.WriteFile(worldAnimals.path(), []byte(broken), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := worldLoad(); err != nil {
		t.Fatal(err)
	}
	if len(animals.byID) != 1 || animals.next != 2 {
		t.Fatalf("from a file with nonsense: %d animals, next %d", len(animals.byID), animals.next)
	}
}

// ---- A hostile one goes after a player: the same one for everybody ----

// Where the server takes an animal to be, and what it is doing.
func animalsWhere(book *animalBook, a *animal) (x, z float64, mode uint8, target string) {
	book.mu.Lock()
	defer book.mu.Unlock()
	return a.X, a.Z, a.Mode, a.target
}

func TestAHostileAnimalGoesAfterTheNearestPlayerThatIsAwakeTheSameOneForEverybody(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 14, 64, 8)
	beto := animalsClient(t, "Beto", animalsBeto, 16, 64, 8)
	// Nearer than both, and no target: one whose tab is in the background, and one still in the title screen.
	asleep := animalsClient(t, "Dormido", "", 9, 64, 8)
	title := animalsClient(t, "Titulo", "", 8, 64, 9)
	start := time.Now()
	asleep.movedAt.Store(start.Add(-time.Minute).UnixNano())
	stateMu.Lock()
	nowhere := gameState.Players[title.ID]
	nowhere.Located = false
	gameState.Players[title.ID] = nowhere
	stateMu.Unlock()
	hears := map[string]*animalsEar{"Ana": animalsListen(ana), "Beto": animalsListen(beto), "who sleeps": animalsListen(asleep)}
	spider := animalsSpider(t, 8, 64, 8, 8, 16)
	// A peaceful animal by its side, and a spider as hostile as it but which the server does not walk.
	pig := animalsPig(t, 10, 64, 8, 8)
	still := animalsSpider(t, 8, 64, 6, 0, 16)
	if still.Chase != 0 {
		t.Fatalf("one the server does not walk is made to go after players: %+v", still.Animal)
	}

	now := animalsRun(start, 1, ana, beto, title)
	for who, ear := range hears {
		frame := ear.frame(t)
		told := frame.fresh(spider.ID)
		if told == nil || told.Mode != animalChase || told.Target != "page_Ana" || told.Flags != animalNewWalked || told.Place != [3]float64{8, 64, 8} {
			t.Fatalf("%s is told %+v", who, told)
		}
		for _, other := range []*animal{pig, still} {
			if told := frame.fresh(other.ID); told == nil || told.Mode != animalRoam || told.Target != "" {
				t.Fatalf("%s is told of one that goes after nobody: %+v", who, told)
			}
		}
	}

	// While it lasts nothing is said of it, whoever comes nearer: Beto walks right up to it.
	animalsStand(beto, 9, 64, 8)
	for round := 0; round < 30; round++ {
		now = animalsRun(now, 1, ana, beto, title)
		for who, ear := range hears {
			if told := ear.frame(t).changed(spider.ID); told != nil {
				t.Fatalf("round %d: %s is told %+v while the chase lasts", round, who, told)
			}
		}
	}
	// The server's idea of where it is has run to its target, at its pace: 6 blocks in 30 rounds and to spare.
	if x, z, mode, target := animalsWhere(book, spider); x != 14 || z != 8 || mode != animalChase || target != "page_Ana" {
		t.Fatalf("after 15 seconds it is at %v, %v in mode %d after %q", x, z, mode, target)
	}
	if _, _, mode, _ := animalsWhere(book, pig); mode != animalRoam {
		t.Fatal("the pig goes after somebody")
	}
	if _, _, mode, _ := animalsWhere(book, still); mode != animalRoam {
		t.Fatal("a spider the server does not walk goes after somebody")
	}
	// Who comes later is told of it as it is: after Ana, where the server takes it to be.
	cris := animalsClient(t, "Cris", "", 20, 64, 8)
	crisHears := animalsListen(cris)
	animalsRun(now, 1, ana, beto, title, cris)
	if told := crisHears.frame(t).fresh(spider.ID); told == nil || told.Mode != animalChase || told.Target != "page_Ana" || told.Place != [3]float64{14, 64, 8} {
		t.Fatalf("who comes later is told %+v", told)
	}
}

func TestAHostileAnimalKeepsItsTargetUntilItIsClearlyOutOfRangeThenTakesAnotherOrWalksHome(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 14, 64, 8)
	beto := animalsClient(t, "Beto", animalsBeto, 8, 64, 20)
	hears := map[string]*animalsEar{"Ana": animalsListen(ana), "Beto": animalsListen(beto)}
	spider := animalsSpider(t, 8, 64, 8, 8, 16)
	now := animalsRun(time.Now(), 30, ana, beto)
	if x, z, _, target := animalsWhere(book, spider); x != 14 || z != 8 || target != "page_Ana" {
		t.Fatalf("it is at %v, %v after %q", x, z, target)
	}
	for _, ear := range hears {
		ear.catchUp(t)
	}
	quiet := func(why string) {
		t.Helper()
		for who, ear := range hears {
			if told := ear.frame(t).changed(spider.ID); told != nil {
				t.Fatalf("%s: %s is told %+v", why, who, told)
			}
		}
	}

	// Further than the 16 blocks it comes from, and not yet the 24 at which it lets go: still after her,
	// though Beto is nearer now.
	animalsStand(ana, 36, 64, 8)
	now = animalsRun(now, 1, ana, beto)
	quiet("22 blocks away")
	// Clearly out of range (and still inside its leash, 32 blocks from its home): it takes Beto, who is
	// within the 16, and both are told so once.
	x, _, _, _ := animalsWhere(book, spider)
	animalsStand(ana, x+24.7, 64, 8)
	if math.Hypot(x+24.7-8, 0) > 32 {
		t.Fatalf("the test left Ana out of the leash: the animal is at %v", x)
	}
	now = animalsRun(now, 1, ana, beto)
	for who, ear := range hears {
		told := ear.frame(t).changed(spider.ID)
		if told == nil || told.Says != animalSaysMode || told.Mode != animalChase || told.Target != "page_Beto" {
			t.Fatalf("%s is told %+v", who, told)
		}
	}
	now = animalsRun(now, 60, ana, beto)
	quiet("after Beto")
	if x, z, _, target := animalsWhere(book, spider); x != 8 || z != 20 || target != "page_Beto" {
		t.Fatalf("it is at %v, %v after %q", x, z, target)
	}

	// Beto leaves the game with nobody else in range: it roams again from where the chase left it, 12
	// blocks from a home it strays 8 from, and walks to the nearest point of its circle.
	animalsLeave(beto)
	now = animalsRun(now, 1, ana)
	told := hears["Ana"].frame(t).changed(spider.ID)
	if told == nil || told.Says != animalSaysPlace|animalSaysWalk|animalSaysMode || told.Mode != animalRoam || told.Target != "" ||
		told.Place != [3]float64{8, 64, 20} || *told.Walk != [2]float64{8, 16} {
		t.Fatalf("at the end of the chase Ana is told %+v", told)
	}
	// With nothing said against it, it gets there, and is in its circle from then on as any roaming animal.
	for round := 0; round < 400; round++ {
		now = animalsRun(now, 1, ana)
		x, z, mode, _ := animalsWhere(book, spider)
		if mode != animalRoam {
			t.Fatalf("round %d: it goes after somebody 30 blocks from its home", round)
		}
		if round > 60 && math.Hypot(x-8, z-8) > 8 {
			t.Fatalf("round %d: it is at %v, %v, out of its circle", round, x, z)
		}
	}
}

func TestAHostileAnimalNeverGoesBeyondItsLeashAndLetsGoOfWhoDoes(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 20, 64, 8)
	hears := animalsListen(ana)
	// As fast as a player who walks backwards from it: 2 blocks a round.
	spider := animalsSpider(t, 8, 64, 8, 8, 16)
	book.mu.Lock()
	spider.ChaseSpeed = 4
	book.mu.Unlock()
	now := animalsRun(time.Now(), 1, ana)
	if told := hears.frame(t).fresh(spider.ID); told == nil || told.Target != "page_Ana" {
		t.Fatalf("12 blocks from it: %+v", told)
	}
	now = animalsRun(now, 8, ana)
	// It has reached her. She walks away with it at her heels: it is the leash that stops it, at 8 + 24.
	var told *animalTold
	at := 20.0
	for told == nil {
		at += 1.5
		if at > 60 {
			t.Fatal("it follows her for ever")
		}
		animalsStand(ana, at, 64, 8)
		now = animalsRun(now, 1, ana)
		told = hears.frame(t).changed(spider.ID)
		if x, z, _, _ := animalsWhere(book, spider); math.Hypot(x-8, z-8) > 32 {
			t.Fatalf("the server takes it to be at %v, %v: beyond its leash", x, z)
		}
	}
	if at <= 8+32 || at > 8+32+1.5 {
		t.Fatalf("she was let go %v blocks from its home", at-8)
	}
	if told.Says != animalSaysPlace|animalSaysWalk|animalSaysMode || told.Mode != animalRoam || told.Place != [3]float64{40, 64, 8} || *told.Walk != [2]float64{16, 8} {
		t.Fatalf("at the leash she is told %+v", told)
	}
	// She stays a step out of it: it does not come back for her.
	for round := 0; round < 20; round++ {
		now = animalsRun(now, 1, ana)
		if _, _, mode, _ := animalsWhere(book, spider); mode != animalRoam {
			t.Fatal("it goes after who stands beyond its leash")
		}
	}

	// On its long way home something stops her copy 22 blocks out: there it is, though that is out of its
	// circle. Nobody could say that of a peaceful animal.
	report := func(x float64) {
		book.mu.Lock()
		gx, gz, walking := spider.goalX, spider.goalZ, spider.walking
		book.mu.Unlock()
		if !walking {
			t.Fatal("it is not on a walk")
		}
		animalsSend(t, ana, "animalAt", map[string]any{"id": spider.ID, "x": x, "y": 64, "z": 8, "gx": gx, "gz": gz})
	}
	report(30.3)
	if x, z, _, _ := animalsWhere(book, spider); x != 30.25 || z != 8 {
		t.Fatalf("after the report it is at %v, %v", x, z)
	}
	// Its next walk is home again, and a place beyond the leash is no place: back where it stood.
	for round := 0; round < 400 && !spider.walking; round++ {
		now = animalsRun(now, 1, ana)
	}
	book.mu.Lock()
	goal := math.Hypot(spider.HomeX+float64(spider.goalX)/4-8, spider.HomeZ+float64(spider.goalZ)/4-8)
	book.mu.Unlock()
	if goal > 8 {
		t.Fatalf("its next walk ends %v blocks from home", goal)
	}
	report(45)
	if x, z, _, _ := animalsWhere(book, spider); x != 30.25 || z != 8 || spider.walking {
		t.Fatalf("after a report from beyond its leash it is at %v, %v", x, z)
	}
}

func TestWhoIsNearAnAnimalIsReckonedFromWhereItsWalkHasTakenItByNow(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 20, 64, 8)
	spider := animalsSpider(t, 8, 64, 8, 8, 16)
	book.mu.Lock()
	spider.ChaseSpeed = 4
	book.mu.Unlock()
	// She takes it to the end of its leash, 32 blocks from its home, and leaves the game: it is sent home,
	// 24 blocks at its 0.38 a second, which is more than a minute.
	now := animalsRun(time.Now(), 9, ana)
	for at := 21.5; at < 42; at += 1.5 {
		animalsStand(ana, at, 64, 8)
		now = animalsRun(now, 1, ana)
	}
	if x, z, mode, _ := animalsWhere(book, spider); x != 40 || z != 8 || mode != animalRoam || !spider.walking {
		t.Fatalf("at the end of its leash it is at %v, %v in mode %d", x, z, mode)
	}
	animalsLeave(ana)
	// Beto waits by the end of that walk: 28 blocks from where it began, 15 from where it ends. The server
	// holds the animal where the walk began until it is over, but it is not there any more.
	beto := animalsClient(t, "Beto", animalsBeto, 16, 64, 23)
	left := now
	for now.Sub(left) < 40*time.Second {
		now = animalsRun(now, 1, beto)
		if _, _, mode, _ := animalsWhere(book, spider); mode != animalRoam {
			t.Fatalf("%v into its walk home it goes after who is still more than 16 blocks from it", now.Sub(left))
		}
	}
	now = animalsRun(now, 40, beto)
	x, z, mode, target := animalsWhere(book, spider)
	if mode != animalChase || target != "page_Beto" {
		t.Fatalf("a minute into its walk home, within 16 blocks of him, it is in mode %d", mode)
	}
	// And the chase began from there, not from the far end of the walk.
	if math.Hypot(x-16, z-23) > 16 {
		t.Fatalf("the server takes it to be at %v, %v", x, z)
	}
}

func TestAnAnimalLetsGoOfAPlayerThatDiesOrLooksAway(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 12, 64, 8)
	hears := animalsListen(ana)
	spider := animalsSpider(t, 8, 64, 8, 8, 16)
	now := animalsRun(time.Now(), 1, ana)
	if told := hears.frame(t).fresh(spider.ID); told == nil || told.Target != "page_Ana" {
		t.Fatalf("4 blocks from it: %+v", told)
	}

	// It gets her. Her client says so, as it always did, and that is all the server needs.
	animalsSend(t, ana, "playerDeath", map[string]string{"reason": "were attacked by a spider"})
	if ana.diedAt.Load() == 0 {
		t.Fatal("the server does not note that she died")
	}
	ana.diedAt.Store(now.UnixNano()) // by the clock of this test
	hears.catchUp(t)
	died := now
	now = animalsRun(now, 1, ana)
	if told := hears.frame(t).changed(spider.ID); told == nil || told.Says&animalSaysMode == 0 || told.Mode != animalRoam {
		t.Fatalf("dead, she is told %+v", told)
	}
	// She is back where she fell, next to it: left alone for the rest of the ten seconds, to walk away.
	for now.Sub(died) < animalsChaseSpare-animalsEvery {
		now = animalsRun(now, 1, ana)
		if _, _, mode, _ := animalsWhere(book, spider); mode != animalRoam {
			t.Fatalf("%v after she died it goes after her again", now.Sub(died))
		}
	}
	// She did not: it is a hostile animal.
	now = animalsRun(now, 3, ana)
	if _, _, mode, target := animalsWhere(book, spider); mode != animalChase || target != "page_Ana" {
		t.Fatal("it never goes after her again")
	}

	// Her tab goes to the background: nobody is watching, and the chase ends for whoever is still told.
	hears.catchUp(t)
	ana.movedAt.Store(now.Add(-time.Minute).UnixNano())
	now = animalsRun(now, 1)
	if told := hears.frame(t).changed(spider.ID); told == nil || told.Mode != animalRoam || told.Says&animalSaysMode == 0 {
		t.Fatalf("with her tab in the background she is told %+v", told)
	}
	// And one that is taken out of the world, or tamed, while it is after somebody is after nobody.
	now = animalsRun(now, 12, ana)
	if _, _, mode, _ := animalsWhere(book, spider); mode != animalChase {
		t.Fatal("back at the game, it does not go after her")
	}
	other := animalsSpider(t, 9, 64, 8, 8, 16)
	now = animalsRun(now, 1, ana)
	animalsSend(t, ana, "animalAdopt", map[string]any{"ref": "abc1", "id": other.ID})
	ana.creative.Store(true)
	animalsSend(t, ana, "animalGone", map[string]any{"id": spider.ID})
	animalsRun(now, 3, ana)
	book.mu.Lock()
	defer book.mu.Unlock()
	if len(book.chasers) != 0 || other.Mode != animalFollow || other.target != "" || book.byID[spider.ID] != nil {
		t.Fatalf("%d animals still after somebody; the tamed one in mode %d after %q", len(book.chasers), other.Mode, other.target)
	}
}

func TestByDayAnAnimalOfTheNightOnlyComesFromCloseBy(t *testing.T) {
	book := animalsWorld(t)
	stateMu.Lock()
	was := gameState.WorldTime
	gameState.WorldTime = 0.25 // noon
	stateMu.Unlock()
	t.Cleanup(func() {
		stateMu.Lock()
		gameState.WorldTime = was
		stateMu.Unlock()
	})
	ana := animalsClient(t, "Ana", animalsAna, 14, 64, 8)
	id, ok := animalSpawn(animalSpawnSpec{Species: "scorpion", X: 8, Y: 64, Z: 8, Radius: 2, Speed: 0.35, Chase: 8, ChaseDay: 3.5, ChaseSpeed: 1.1})
	if !ok {
		t.Fatal("no scorpion")
	}
	scorpion := book.byID[id]
	// Six blocks away at noon: it roams on, never more than 2 blocks from its home.
	now := animalsRun(time.Now(), 120, ana)
	if _, _, mode, _ := animalsWhere(book, scorpion); mode != animalRoam {
		t.Fatal("by day it comes from 6 blocks away")
	}
	// The same six blocks after dusk.
	stateMu.Lock()
	gameState.WorldTime = 0.5
	stateMu.Unlock()
	now = animalsRun(now, 1, ana)
	if _, _, mode, target := animalsWhere(book, scorpion); mode != animalChase || target != "page_Ana" {
		t.Fatal("by night it does not come from 6 blocks away")
	}
	// Dawn, with her 7 blocks from it: more than the 5.25 at which it lets go by day.
	x, z, _, _ := animalsWhere(book, scorpion)
	animalsStand(ana, x+7.5, 64, z)
	stateMu.Lock()
	gameState.WorldTime = 0.01
	stateMu.Unlock()
	now = animalsRun(now, 1, ana)
	if _, _, mode, _ := animalsWhere(book, scorpion); mode != animalRoam {
		t.Fatal("at dawn it is still after who is 7 blocks away")
	}
	// And from close by, also by day.
	for round := 0; round < 400; round++ {
		x, z, mode, _ := animalsWhere(book, scorpion)
		if mode == animalChase {
			return
		}
		animalsStand(ana, x+3, 64, z)
		now = animalsRun(now, 1, ana)
	}
	t.Fatal("by day it does not come from 3 blocks away")
}

func TestWhatAnAnimalGoesAfterIsSavedAndNobodyIsBeingChasedAsTheServerStarts(t *testing.T) {
	persistenceWorld(t)
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 10, 64, 8)
	id, ok := animalSpawn(animalSpawnSpec{Species: "scorpion", X: 8, Y: 64, Z: 8, Radius: 8, Speed: 0.35, Chase: 8, ChaseDay: 3.5, ChaseSpeed: 1.1, Origin: "revival"})
	if !ok {
		t.Fatal("no scorpion")
	}
	scorpion := book.byID[id]
	animalsRun(time.Now(), 2, ana)
	if _, _, mode, target := animalsWhere(book, scorpion); mode != animalChase || target != "page_Ana" {
		t.Fatal("it does not go after who is 2 blocks from it")
	}
	worldFlush()
	saved := persistenceFile(t, worldAnimals)
	for _, want := range []string{`"chase":8`, `"chaseDay":3.5`, `"chaseSpeed":1.1`, `"mode":4`} {
		if !strings.Contains(saved, want) {
			t.Fatalf("no %s in %s", want, saved)
		}
	}
	if strings.Contains(saved, "page_Ana") {
		t.Fatalf("the page it is after is saved, and a page is gone with its connection: %s", saved)
	}

	// The server starts again.
	animals = newAnimalBook()
	if err := worldLoad(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { worldAnimals.dirty.Store(false) })
	back := animals.byID[id]
	if back == nil || back.Mode != animalRoam || back.target != "" || back.Chase != 8 || back.ChaseDay != 3.5 || back.ChaseSpeed != 1.1 || len(animals.chasers) != 0 {
		t.Fatalf("it came back as %+v", back)
	}
	animalsRun(time.Now(), 2, ana)
	if _, _, mode, target := animalsWhere(animals, back); mode != animalChase || target != "page_Ana" {
		t.Fatal("after the restart it goes after nobody")
	}

	// What a mechanic asks for is cut down to what the round can keep, and what is no number is no animal.
	spawn := func(spec animalSpawnSpec) *animal {
		spec.Species, spec.X, spec.Y, spec.Z = "spider", 100, 64, 100
		id, ok := animalSpawn(spec)
		if !ok {
			return nil
		}
		return animals.byID[id]
	}
	if a := spawn(animalSpawnSpec{Radius: 8, Chase: 1000, ChaseDay: 2000, ChaseSpeed: 99}); a == nil || a.Chase != animalsMaxChase || a.ChaseDay != animalsMaxChase || a.ChaseSpeed != 8 {
		t.Fatalf("a chase out of all measure: %+v", a)
	}
	if a := spawn(animalSpawnSpec{Radius: 8, Chase: -3, ChaseDay: 2, ChaseSpeed: 2}); a == nil || a.Chase != 0 || a.ChaseDay != 0 || a.ChaseSpeed != 0 {
		t.Fatalf("a chase of less than nothing: %+v", a)
	}
	if a := spawn(animalSpawnSpec{Radius: 0, Chase: 16, ChaseSpeed: 2}); a == nil || a.Chase != 0 || a.ChaseSpeed != 0 {
		t.Fatalf("one the server does not walk: %+v", a)
	}
	for _, spec := range []animalSpawnSpec{{Radius: 8, Chase: math.NaN()}, {Radius: 8, Chase: 8, ChaseDay: math.NaN()}, {Radius: 8, Chase: 8, ChaseSpeed: math.NaN()}} {
		if a := spawn(spec); a != nil {
			t.Fatalf("made of %+v: %+v", spec, a.Animal)
		}
	}
	if animalsMaxChase*animalsChaseLoose > 2*16 {
		t.Fatal("a target could be kept from further than the chunks where the round looks for it")
	}
}

// The same bytes are in test/js/animals.test.js: what the server writes is what the client reads.
const animalsGoldenFrame = "4d434131" + "03" +
	"07" + "03706967" + "020009" + "5080041b" + "040002" + "05" + "0c11" +
	"ac02" + "05686f727365" + "010106" + "a101b404a006" + "000000" + "00" + "0b706c617965725f61623132" + "03416e61" + "0b7b22616765223a3132307d" +
	"09" + "06737069646572" + "0004" + "08706167655f416e61" + "08" + "10800410" + "080004" + "00" +
	"05" +
	"07" + "04" + "0c11" +
	"08" + "12" + "030002" + "09" +
	"ac02" + "69" + "a201b8049f06" + "03" + "08706167655f416e61" + "03416e61" + "0b7b22616765223a3138307d" +
	"09" + "08" + "04" + "09706167655f4265746f" +
	"0a" + "0e" + "90010000" + "4000" + "00" +
	"02" + "05" + "e807"

func TestAFrameIsTheseBytes(t *testing.T) {
	pig := &animal{Animal: Animal{ID: 7, Species: "pig", Variant: 2, Mode: animalRoam, X: 10.5, Y: 64, Z: -3.25, HomeX: 10, HomeY: 64, HomeZ: -3.5, Radius: 8, Hurt: 5}, goalX: 6, goalZ: -9, walking: true}
	horse := &animal{Animal: Animal{ID: 300, Species: "horse", Variant: 1, Mode: animalStay, X: -20.25, Y: 70.5, Z: 100, HomeX: -20.25, HomeY: 70.5, HomeZ: 100,
		Owner: animalsAna, OwnerName: "Ana", Extra: json.RawMessage(`{"age":120}`)}, owner: &animalOwner{session: "player_ab12"}}
	// One that is after a player: its mode is followed by whom.
	spider := &animal{Animal: Animal{ID: 9, Species: "spider", Mode: animalChase, X: 3, Y: 64, Z: 2.5, HomeX: 2, HomeY: 64, HomeZ: 2, Radius: 8, Chase: 16}, target: "page_Ana"}
	// Five changes: a walk; a place and how hurt; a new home, mode, owner and extra; another player to go
	// after; and the end of a chase, with where it left the animal and its walk home.
	hunts := &animal{Animal: Animal{ID: 9, Mode: animalChase, HomeX: 2, HomeY: 64, HomeZ: 2}, target: "page_Beto", modeRev: 5}
	calms := &animal{Animal: Animal{ID: 10, Mode: animalRoam, X: 20, Y: 64, Z: 2, HomeX: 2, HomeY: 64, HomeZ: 2, Radius: 8}, goalX: 32, walking: true, placeRev: 5, walkRev: 5, modeRev: 5}
	walks := &animal{Animal: Animal{ID: 7, HomeX: 10, HomeY: 64, HomeZ: -3.5}, goalX: 6, goalZ: -9, walking: true, walkRev: 5}
	stopped := &animal{Animal: Animal{ID: 8, X: 4.5, Y: 12, Z: 0.25, HomeX: 5, HomeY: 12, HomeZ: 0, Hurt: 9}, placeRev: 5, hurtRev: 5}
	sits := &animal{Animal: Animal{ID: 300, Mode: animalStay, X: 20.25, Y: 71, Z: -100, HomeX: 20.25, HomeY: 71, HomeZ: -100, Owner: animalsAna, OwnerName: "Ana", Extra: json.RawMessage(`{"age":180}`)},
		owner: &animalOwner{session: "page_Ana"}, homeRev: 5, placeRev: 5, modeRev: 5, ownerRev: 5, extraRev: 5}
	sits.Mode = animalRidden
	frame := animalsAppendFrame(nil, []*animal{pig, horse, spider}, []animalChange{{walks, 4}, {stopped, 4}, {sits, 4}, {hunts, 4}, {calms, 4}}, []uint32{5, 1000})
	if got := hex.EncodeToString(frame); got != animalsGoldenFrame {
		t.Fatalf("the frame is\n%s\nand a client expects\n%s", got, animalsGoldenFrame)
	}
	if !isBinaryFrame(frame) || isBinaryFrame(createMessage("chat", map[string]string{"text": "MCA1"})) || isBinaryFrame(nil) {
		t.Fatal("a frame is not told from a message")
	}

	read := animalsRead(t, frame, map[uint32][3]float64{8: {5, 12, 0}, 10: {2, 64, 2}})
	told := read.fresh(7)
	if told.Species != "pig" || told.Variant != 2 || told.Mode != animalRoam || told.Flags != animalNewWalking|animalNewWalked ||
		told.Home != [3]float64{10, 64, -3.5} || told.Place != [3]float64{10.5, 64, -3.25} || *told.Walk != [2]float64{11.5, -5.75} || told.Hurt != 5 {
		t.Errorf("the pig reads as %+v", told)
	}
	told = read.fresh(300)
	if told.Species != "horse" || told.Mode != animalStay || told.Flags != animalNewOwned|animalNewExtra || told.Place != [3]float64{-20.25, 70.5, 100} ||
		told.Session != "player_ab12" || told.OwnerName != "Ana" || told.Extra != `{"age":120}` {
		t.Errorf("the horse reads as %+v", told)
	}
	if got := read.Changed[0]; got.ID != 7 || got.Says != animalSaysWalk || *got.Walk != [2]float64{11.5, -5.75} {
		t.Errorf("the walk reads as %+v", got)
	}
	if got := read.Changed[1]; got.ID != 8 || got.Says != animalSaysPlace|animalSaysHurt || got.Place != [3]float64{4.5, 12, 0.25} || got.Hurt != 9 {
		t.Errorf("the stop reads as %+v", got)
	}
	if got := read.Changed[2]; got.ID != 300 || got.Says != animalSaysHome|animalSaysMode|animalSaysOwner|animalSaysExtra || got.Place != [3]float64{20.25, 71, -100} ||
		got.Mode != animalRidden || got.Session != "page_Ana" || got.Extra != `{"age":180}` {
		t.Errorf("the sitting down reads as %+v", got)
	}
	told = read.fresh(9)
	if told.Species != "spider" || told.Mode != animalChase || told.Target != "page_Ana" || told.Flags != animalNewWalked || told.Place != [3]float64{3, 64, 2.5} {
		t.Errorf("the spider reads as %+v", told)
	}
	if got := read.Changed[3]; got.ID != 9 || got.Says != animalSaysMode || got.Mode != animalChase || got.Target != "page_Beto" {
		t.Errorf("the new target reads as %+v", got)
	}
	if got := read.Changed[4]; got.ID != 10 || got.Says != animalSaysPlace|animalSaysWalk|animalSaysMode || got.Mode != animalRoam || got.Target != "" ||
		got.Place != [3]float64{20, 64, 2} || *got.Walk != [2]float64{10, 2} {
		t.Errorf("the end of a chase reads as %+v", got)
	}
	if len(read.Gone) != 2 || read.Gone[0] != 5 || read.Gone[1] != 1000 {
		t.Errorf("gone reads as %v", read.Gone)
	}
}

// The round and the clients' messages come from different goroutines: with -race, none of them reads
// what another writes.
func TestTheRoundAndTheMessagesAtTheSameTime(t *testing.T) {
	book := animalsWorld(t)
	ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
	beto := animalsClient(t, "Beto", animalsBeto, 10, 64, 8)
	hears := animalsListen(ana)
	own := animalsKeep(t, ana, hears, "abc1", "dog")
	var pigs []uint32
	for i := 0; i < 20; i++ {
		pigs = append(pigs, animalsPig(t, 4+float64(i), 64, 12, 6).ID)
	}
	// And some that go after them, to be struck, moved and taken out of the world in the middle of a chase.
	for i := 0; i < 6; i++ {
		pigs = append(pigs, animalsSpider(t, 4+float64(i)*4, 64, 4, 6, 16).ID)
	}
	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		now := time.Now()
		for i := 0; i < 400; i++ {
			now = now.Add(animalsEvery)
			ana.movedAt.Store(now.UnixNano())
			beto.movedAt.Store(now.UnixNano())
			animalsTick(now)
			for len(ana.send) > 0 {
				<-ana.send
			}
			for len(beto.send) > 0 {
				<-beto.send
			}
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 400; i++ {
			mode := animalFollow
			if i%2 == 0 {
				mode = animalStay
			}
			animalsSend(t, ana, "animalSet", map[string]any{"id": own, "mode": mode, "x": 9, "y": 64, "z": 8 + float64(i%3), "extra": map[string]any{"age": i}})
			animalsSend(t, ana, "animalKeep", map[string]any{"ref": fmt.Sprintf("k%d", i%50), "species": "pig"})
			animalsStand(ana, 8+float64(i%40), 64, 8)
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 400; i++ {
			id := pigs[i%len(pigs)]
			animalsSend(t, beto, "animalHurt", map[string]any{"id": id, "damage": 0.5})
			animalsSend(t, beto, "animalAt", map[string]any{"id": id, "x": 5, "y": 64, "z": 12, "gx": i % 9, "gz": 0})
			if i%40 == 39 {
				animalsSend(t, beto, "animalGone", map[string]any{"id": id})
			}
			worldAnimals.snapshot()
		}
	}()
	wg.Wait()
	book.mu.Lock()
	defer book.mu.Unlock()
	listed := 0
	for _, list := range book.chunks {
		listed += len(list)
	}
	if listed != len(book.byID) || len(book.owners[animalsAna].animals) != 51 {
		t.Fatalf("%d animals by chunk and %d by number; %d of Ana's", listed, len(book.byID), len(book.owners[animalsAna].animals))
	}
}

// Over real connections: a frame goes out as bytes, in its turn among the JSON messages, and whose an
// animal is comes from the session's player, which the page never says.
func TestAnimalFramesGoOutAsBytesAmongTheMessages(t *testing.T) {
	claimWorldKeepingStorage(t)
	book := animalsWorld(t)
	setupIdentity(t)
	mux := http.NewServeMux()
	mux.Handle("/", SessionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})))
	mux.HandleFunc("/ws", HandleWebSocket)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	ana, beto := newTestBrowser(t, server), newTestBrowser(t, server)
	ana.connect()
	beto.connect()
	// The server's goroutines outlive the handlers: they are gone before the world is put back.
	t.Cleanup(func() {
		ana.conn.Close()
		beto.conn.Close()
		for deadline := time.Now().Add(5 * time.Second); time.Now().Before(deadline); time.Sleep(10 * time.Millisecond) {
			clientsMu.RLock()
			left := len(clients)
			clientsMu.RUnlock()
			if left == 0 {
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
		storage.mu.Lock()
		storage.mu.Unlock()
	})
	ana.send("playerJoin", map[string]string{"playerId": "page_ana", "username": "Ana"})
	beto.send("playerJoin", map[string]string{"playerId": "page_beto", "username": "Beto"})
	ana.await("init")
	beto.await("init")
	ana.send("playerMove", Player{ID: "page_ana", X: 401, Y: 121.6, Z: 401})
	beto.send("playerMove", Player{ID: "page_beto", X: 402, Y: 121.6, Z: 402})
	for deadline := time.Now().Add(5 * time.Second); ; time.Sleep(5 * time.Millisecond) {
		stateMu.RLock()
		located := gameState.Players["page_ana"].Located && gameState.Players["page_beto"].Located
		stateMu.RUnlock()
		if located {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the players never moved")
		}
	}

	ana.send("animalKeep", map[string]any{"ref": "abc1", "species": "pig", "owner": "plr_somebodyelse"})
	payload, _ := ana.await("animalKept")
	var kept struct {
		ID uint32 `json:"id"`
	}
	if json.Unmarshal(payload, &kept) != nil || kept.ID == 0 {
		t.Fatalf("kept: %s", payload)
	}
	book.mu.Lock()
	owner := book.byID[kept.ID].Owner
	book.mu.Unlock()
	if !strings.HasPrefix(owner, "plr_") || owner == "plr_somebodyelse" {
		t.Fatalf("its owner is %q: the player of the session, whatever the page says", owner)
	}

	// A message, the round, another message: Beto reads them in that order, the frame as bytes.
	ana.send("chat", map[string]string{"text": "uno"})
	beto.await("chat")
	animalsTick(time.Now())
	ana.send("chat", map[string]string{"text": "dos"})
	beto.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var frame animalFrame
	for {
		kind, data, err := beto.conn.ReadMessage()
		if err != nil {
			t.Fatalf("waiting for the frame: %v", err)
		}
		if kind == websocket.BinaryMessage {
			frame = animalsRead(t, data, map[uint32][3]float64{})
			break
		}
		if isBinaryFrame(data) {
			t.Fatal("a frame sent as text")
		}
		var message Message
		if json.Unmarshal(data, &message) == nil && message.Type == "chat" {
			t.Fatal("the second message overtook the frame")
		}
	}
	if told := frame.fresh(kept.ID); told == nil || told.Session != "page_ana" || told.OwnerName != "Ana" || told.Mode != animalFollow {
		t.Fatalf("Beto is told %+v", frame)
	}
	if strings.Contains(fmt.Sprintf("%+v", frame), owner) {
		t.Fatal("the frame carries the owner's player id")
	}
	if text, _ := beto.await("chat"); !strings.Contains(string(text), "dos") {
		t.Fatalf("after the frame: %s", text)
	}
}

// What the plan asks to be measured (FEAT_FOSILES.md): 50 animals roaming next to a player.
func TestFiftyAnimalsRoamingNearAPlayerCostFewBytes(t *testing.T) {
	chases := 0
	measure := func(t *testing.T, speed float64, mode uint8, hostile int) (first int, perSecond float64, frames, walks int) {
		book := animalsWorld(t)
		ana := animalsClient(t, "Ana", animalsAna, 8, 64, 8)
		hears := animalsListen(ana)
		for i := 0; i < 50; i++ {
			a := animalsPig(t, float64(i%10)*3-8, 64, float64(i/10)*3-4, 8)
			book.mu.Lock()
			a.Speed = speed
			if i < hostile {
				a.Chase, a.ChaseSpeed = 16, 1.25
			}
			if mode != animalRoam {
				a.Mode, a.Radius, a.Owner, a.OwnerName = mode, 0, animalsBeto, "Beto"
				book.own(a)
			}
			book.mu.Unlock()
		}
		const minutes = 5
		now := time.Unix(1_700_000_000, 0)
		total := 0
		for round := 0; round < minutes*60*int(time.Second/animalsEvery); round++ {
			// With hostile ones about she does not stand there: a quarter of a minute by them and another
			// out of their leashes, 45 blocks away, so each of them starts and ends a chase every time.
			if hostile > 0 && round%60 == 30 {
				animalsStand(ana, 8, 64, 53)
			} else if hostile > 0 && round%60 == 0 {
				animalsStand(ana, 8, 64, 8)
			}
			now = animalsRun(now, 1, ana)
			frame, told, _ := hears.heard(t)
			if !told {
				continue
			}
			if round == 0 {
				first = frame.Bytes
				if len(frame.Fresh) != 50 {
					t.Fatalf("the first frame tells of %d animals", len(frame.Fresh))
				}
				continue
			}
			frames++
			// Two bytes more for each frame: what a WebSocket puts around so few.
			total += frame.Bytes + 2
			for _, told := range frame.Changed {
				if told.Says&animalSaysWalk != 0 {
					walks++
				}
				if told.Says&animalSaysMode != 0 && told.Mode == animalChase {
					chases++
				}
			}
		}
		return first, float64(total) / (minutes * 60), frames, walks
	}

	first, perSecond, frames, walks := measure(t, 0, animalRoam, 0)
	t.Logf("50 pigs roaming for 5 minutes: %.1f bytes/s in %d frames (%d walks, %.1f bytes each with its share of the frame); on coming into range, one frame of %d bytes",
		perSecond, frames, walks, perSecond*300/float64(max(1, walks)), first)
	if perSecond > 600 || first > 2048 || walks < 300 {
		t.Errorf("more than it should cost, or animals that do not walk: %.1f bytes/s, first frame %d bytes, %d walks", perSecond, first, walks)
	}
	// A species that runs gets its turn more often: still far from the bound.
	_, quick, _, quickWalks := measure(t, 3, animalRoam, 0)
	t.Logf("50 animals ten times as fast: %.1f bytes/s (%d walks)", quick, quickWalks)
	if quick > 600 {
		t.Errorf("fast animals: %.1f bytes/s", quick)
	}
	// Animals that sit cost nothing after the first frame.
	_, still, sitFrames, _ := measure(t, 0, animalStay, 0)
	if still != 0 || sitFrames != 0 {
		t.Errorf("50 sitting animals: %.1f bytes/s in %d frames", still, sitFrames)
	}
	// Ten of the fifty are hostile and she keeps coming back to them: a chase is told when it starts and
	// when it ends, and costs nothing while it lasts.
	chases = 0
	_, hunted, _, _ := measure(t, 0, animalRoam, 10)
	t.Logf("10 of the 50 going after her twice a minute: %.1f bytes/s (%d chases)", hunted, chases)
	if hunted > 600 || chases < 40 {
		t.Errorf("with hostile animals among them: %.1f bytes/s, %d chases", hunted, chases)
	}
	t.Logf("an animal takes %d bytes of the server's memory, besides its name, its owner's and its extra", unsafe.Sizeof(animal{}))
}
