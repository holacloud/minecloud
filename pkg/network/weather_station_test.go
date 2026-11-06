package network

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"minecloud/pkg/world"
)

// A weather station is a block in two cells (js/game/weather.js): these go through the messages every
// client sends, so everything a station needs from the server is what a door needs.

func weatherStationWorld(t *testing.T) (dir string, send func(*Client, string, Block)) {
	t.Helper()
	t.Chdir(t.TempDir())
	dir = filepath.Join(t.TempDir(), "chunks")
	previous := chunkStore
	store, err := world.Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	chunkStore = store
	storage = newStorageBook()
	t.Cleanup(func() {
		chunkStore = previous
		storage = newStorageBook()
	})
	send = func(client *Client, kind string, block Block) {
		payload, err := json.Marshal(block)
		if err != nil {
			t.Fatal(err)
		}
		handleMessage(client, Message{Type: kind, Payload: payload})
	}
	return dir, send
}

// A connected client that hears what is broadcast.
func weatherStationClient(t *testing.T, id string) *Client {
	t.Helper()
	client := &Client{ID: id, send: make(chan []byte, 64), chunks: make(chan []byte, 64), done: make(chan struct{})}
	clientsMu.Lock()
	clients[client] = true
	clientsMu.Unlock()
	t.Cleanup(func() {
		clientsMu.Lock()
		delete(clients, client)
		clientsMu.Unlock()
	})
	return client
}

// Every message of `kind` the client has been sent so far, as blocks.
func weatherStationHeard(client *Client, kind string) (blocks []Block) {
	for {
		select {
		case raw := <-client.send:
			var message Message
			if json.Unmarshal(raw, &message) != nil || message.Type != kind {
				continue
			}
			var block Block
			if json.Unmarshal(message.Payload, &block) == nil {
				blocks = append(blocks, block)
			}
		default:
			return blocks
		}
	}
}

func TestWeatherStationIsSavedSeenAndRemovedLikeAnyBlock(t *testing.T) {
	dir, send := weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")
	bob := weatherStationClient(t, "bob")
	lower := Block{X: 3, Y: 40, Z: -5, BlockType: "weather_station"}
	upper := Block{X: 3, Y: 41, Z: -5, BlockType: "weather_station:upper"}

	send(alice, "blockPlace", lower)
	send(alice, "blockPlace", upper)
	heard := weatherStationHeard(bob, "blockPlace")
	if len(heard) != 2 || heard[0].BlockType != "weather_station" || heard[1].BlockType != "weather_station:upper" {
		t.Fatalf("the other player heard %+v", heard)
	}

	// Placed twice (a second tab moving the same old station): nothing changes.
	send(alice, "blockPlace", lower)
	send(alice, "blockPlace", upper)
	if got, _ := chunkStore.Block(3, 40, -5); got != "weather_station" {
		t.Fatalf("lower cell: %q", got)
	}

	// A server restart, and with it the chunk out of memory.
	if err := chunkStore.Flush(); err != nil {
		t.Fatal(err)
	}
	store, err := world.Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	chunkStore = store
	if got, _ := chunkStore.Block(3, 40, -5); got != "weather_station" {
		t.Fatalf("after a restart, lower cell: %q", got)
	}
	if got, _ := chunkStore.Block(3, 41, -5); got != "weather_station:upper" {
		t.Fatalf("after a restart, upper cell: %q", got)
	}
	// It goes out with the chunk as a client gets it, states and all.
	chunk, err := chunkStore.Snapshot(0, -1)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, name := range chunk.Palette {
		names[name] = true
	}
	if !names["weather_station"] || !names["weather_station:upper"] {
		t.Fatalf("not in the chunk's palette: %v", chunk.Palette)
	}

	// Bob breaks it: gone for everyone, and the server gives nothing to anybody (the item is the
	// breaker's own drop, on the client). Alice hears the same two blockBreak as anyone.
	weatherStationHeard(alice, "")
	send(bob, "blockBreak", Block{X: 3, Y: 40, Z: -5})
	send(bob, "blockBreak", Block{X: 3, Y: 41, Z: -5})
	if got := weatherStationHeard(alice, "blockBreak"); len(got) != 2 {
		t.Fatalf("alice heard %+v", got)
	}
	if got, _ := chunkStore.Block(3, 40, -5); got != "air" {
		t.Fatalf("after breaking: %q", got)
	}
	if err := chunkStore.Flush(); err != nil {
		t.Fatal(err)
	}
	store, err = world.Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	chunkStore = store
	if got, _ := chunkStore.Block(3, 41, -5); got != "air" {
		t.Fatalf("came back after a restart: %q", got)
	}
}

func TestWeatherStationNeedsNothingInWorldJSON(t *testing.T) {
	if hasBlockMetadata(Block{BlockType: "weather_station"}) || hasBlockMetadata(Block{BlockType: "weather_station:upper"}) {
		t.Fatal("a station is all in the chunk: its block name is everything it has")
	}
}

func TestWeatherStationHasAColourInTheViewer(t *testing.T) {
	if err := loadViewerPalette(); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"weather_station", "weather_station:upper"} {
		if color, _ := paletteEntry(name); color == viewerUnknownColor {
			t.Errorf("%s has no colour", name)
		}
	}
}
