package network

import (
	"encoding/json"
	"testing"
)

// Two ways the whole server used to go down, each from one client's ordinary messages.

// A client too slow for its buffer is dropped by broadcastToAll while its readPump is still running, so its
// next message (a ping) is answered after the drop. The send channel must still take that answer.
func TestADroppedClientCanStillBeAnswered(t *testing.T) {
	slow := &Client{ID: "slow", send: make(chan []byte, 1), chunks: make(chan []byte, 1), done: make(chan struct{})}
	clientsMu.Lock()
	clients[slow] = true
	clientsMu.Unlock()
	t.Cleanup(func() {
		clientsMu.Lock()
		delete(clients, slow)
		clientsMu.Unlock()
	})

	broadcastToAll([]byte(`{"type":"one"}`)) // fills its buffer
	broadcastToAll([]byte(`{"type":"two"}`)) // no room: dropped

	clientsMu.RLock()
	still := clients[slow]
	clientsMu.RUnlock()
	if still {
		t.Fatal("a client with a full buffer is still in the world")
	}

	// With the buffer full, and again with room in it: neither blocks nor panics.
	handleMessage(slow, Message{Type: "ping"})
	<-slow.send
	handleMessage(slow, Message{Type: "ping"})
	var answer map[string]string
	if err := json.Unmarshal(<-slow.send, &answer); err != nil || answer["type"] != "pong" {
		t.Fatalf("the dropped client's ping was answered with %v (%v)", answer, err)
	}
}

// A vote changes a sign's votes while the save and the broadcast still read the map they were handed
// before: the map they hold must never change under them.
func TestASignVoteLeavesTheVotesAlreadyHandedOutAlone(t *testing.T) {
	t.Chdir(t.TempDir())
	key := blockKey(3, 4, 5)
	before := map[string]int{"heart": 2}
	stateMu.Lock()
	previous, had := gameState.Blocks[key]
	gameState.Blocks[key] = Block{X: 3, Y: 4, Z: 5, BlockType: "sign", Text: "hello", Votes: before}
	stateMu.Unlock()
	t.Cleanup(func() {
		stateMu.Lock()
		if had {
			gameState.Blocks[key] = previous
		} else {
			delete(gameState.Blocks, key)
		}
		stateMu.Unlock()
	})

	payload, _ := json.Marshal(map[string]interface{}{"x": 3, "y": 4, "z": 5, "emoji": "heart"})
	handleMessage(&Client{ID: "voter", send: make(chan []byte, 8)}, Message{Type: "signVote", Payload: payload})

	if before["heart"] != 2 || len(before) != 1 {
		t.Fatalf("the map a reader may still hold was changed in place: %v", before)
	}
	stateMu.RLock()
	after := gameState.Blocks[key].Votes
	stateMu.RUnlock()
	if after["heart"] != 3 {
		t.Fatalf("the vote was not counted: %v", after)
	}
}
