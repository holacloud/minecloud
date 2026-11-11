package network

import (
	"encoding/json"
	"fmt"
	"log"
)

// How a mechanic plugs into the server, so that a new one lives in its own file and edits no other. Each
// file registers what it has from an init():
//
//	func init() {
//		registerMessage(messageSpec{plot: plotGuarded, handle: func(c *Client, m Message) { handleGlowSet(c, m.Payload) }}, "glowSet")
//		registerLoop(runAppliances)               // a goroutine started by Initialize
//		registerOnConnect(claimsSendTo)           // told to every client as it connects
//		registerPlaceFilter(func(x, y, z int, name string) string { return glowSanitizeName(name) })
//	}
//
// What is saved in world.json is still by hand: a field in persistedWorldState (websocket.go).

// Plots (claims.go): every message says what it has to do with them, and there is no default, so a new
// message cannot be left open by forgetting. registerMessage panics on a spec that does not say.
type messagePlot int

const (
	_ messagePlot = iota
	// It acts on no cell of the world: chat, a ping, the player's own identity.
	plotNowhere
	// Its payload is {x, y, z, ...} and it changes that cell or takes from it. handleMessage refuses it in
	// someone else's plot or the spawn zone before the handler runs: the handler never checks.
	plotGuarded
	// It changes the world but the plain check is not enough (several cells, an answer of its own to give
	// back, a rule on top): the handler checks, and messages_test.go wants it walked by a stranger.
	plotChecked
	// It acts on a cell and anyone may, on purpose: `why` says why (reading, a sound).
	plotOpen
)

type messageSpec struct {
	plot   messagePlot
	why    string // plotOpen only: why a visitor may
	handle func(client *Client, msg Message)
}

var messages = map[string]messageSpec{}

// registerMessage gives the client messages of these types to a handler.
func registerMessage(spec messageSpec, types ...string) {
	if spec.handle == nil || len(types) == 0 {
		panic("registerMessage: no handler or no type")
	}
	if spec.plot == 0 {
		panic(fmt.Sprintf("registerMessage %v: say what it has to do with plots (plotNowhere, plotGuarded, plotChecked or plotOpen)", types))
	}
	if (spec.plot == plotOpen) != (spec.why != "") {
		panic(fmt.Sprintf("registerMessage %v: `why` goes with plotOpen, and only with it", types))
	}
	for _, kind := range types {
		if _, taken := messages[kind]; taken {
			panic("registerMessage: " + kind + " registered twice")
		}
		messages[kind] = spec
	}
}

// handleMessage gives a client's message to its mechanic, after the plots' check when it is the plain one.
func handleMessage(client *Client, msg Message) {
	spec, ok := messages[msg.Type]
	if !ok {
		log.Printf("Unknown message type: %s", msg.Type)
		return
	}
	if spec.plot == plotGuarded {
		var at struct {
			X int `json:"x"`
			Y int `json:"y"`
			Z int `json:"z"`
		}
		if err := json.Unmarshal(msg.Payload, &at); err != nil {
			return
		}
		if refusal := claimCheck(client, at.X, at.Z); refusal != nil {
			claimRefuse(client, refusal, [3]int{at.X, at.Y, at.Z})
			return
		}
	}
	spec.handle(client, msg)
}

// Goroutines that run for as long as the server does (a mechanic's tick), started by Initialize.
var loops []func()

func registerLoop(run func()) {
	loops = append(loops, run)
}

// What every client is told as it connects, before any of its messages is read.
var onConnect []func(client *Client)

func registerOnConnect(tell func(client *Client)) {
	onConnect = append(onConnect, tell)
}

// The name a placed block really gets, whatever the client asked for (a glow block's colour within its
// range, an oven that only the server lights). Each filter leaves alone the names that are not its own.
var placeFilters []func(x, y, z int, name string) string

func registerPlaceFilter(filter func(x, y, z int, name string) string) {
	placeFilters = append(placeFilters, filter)
}

func placeFiltered(x, y, z int, name string) string {
	for _, filter := range placeFilters {
		name = filter(x, y, z, name)
	}
	return name
}
