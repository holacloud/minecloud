package network

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	ID       string
	conn     *websocket.Conn
	send     chan []byte
	username string
}

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type Block struct {
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Z        int    `json:"z"`
	BlockType string `json:"blockType"`
}

type Player struct {
	ID      string  `json:"id"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Z       float64 `json:"z"`
	Yaw     float64 `json:"yaw"`
	Pitch   float64 `json:"pitch"`
}

type GameState struct {
	Players map[string]Player    `json:"players"`
	Blocks  map[string]Block     `json:"blocks"`
}

type persistedWorldState struct {
	Blocks map[string]Block `json:"blocks"`
}

var (
	clients   = make(map[*Client]bool)
	clientsMu sync.RWMutex
	broadcast = make(chan []byte)
	
	gameState = &GameState{
		Players: make(map[string]Player),
		Blocks:  make(map[string]Block),
	}
	stateMu   sync.RWMutex
)

const worldStatePath = "data/world.json"

func Initialize() error {
	return loadWorldState()
}

func loadWorldState() error {
	data, err := os.ReadFile(worldStatePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var persisted persistedWorldState
	if err := json.Unmarshal(data, &persisted); err != nil {
		return err
	}

	stateMu.Lock()
	if persisted.Blocks != nil {
		gameState.Blocks = persisted.Blocks
	} else {
		gameState.Blocks = make(map[string]Block)
	}
	stateMu.Unlock()

	log.Printf("Loaded %d persisted blocks", len(gameState.Blocks))
	return nil
}

func saveWorldState() {
	stateMu.RLock()
	persisted := persistedWorldState{
		Blocks: make(map[string]Block, len(gameState.Blocks)),
	}
	for key, block := range gameState.Blocks {
		persisted.Blocks[key] = block
	}
	stateMu.RUnlock()

	if err := os.MkdirAll(filepath.Dir(worldStatePath), 0o755); err != nil {
		log.Printf("Failed to create world state directory: %v", err)
		return
	}

	data, err := json.MarshalIndent(persisted, "", "  ")
	if err != nil {
		log.Printf("Failed to marshal world state: %v", err)
		return
	}

	tmpPath := worldStatePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		log.Printf("Failed to write world state temp file: %v", err)
		return
	}

	if err := os.Rename(tmpPath, worldStatePath); err != nil {
		log.Printf("Failed to replace world state file: %v", err)
	}
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	log.Println("WebSocket connection request from:", r.RemoteAddr)
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan []byte, 256),
	}

	clientsMu.Lock()
	clients[client] = true
	clientsMu.Unlock()

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		log.Println("Client disconnected:", c.ID)
		clientsMu.Lock()
		delete(clients, c)
		clientsMu.Unlock()
		
		stateMu.Lock()
		delete(gameState.Players, c.ID)
		stateMu.Unlock()
		
		broadcastPlayerList()
		c.conn.Close()
	}()

	log.Println("Starting readPump for client")
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		log.Printf("Received message: %s", message)
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Println("JSON unmarshal error:", err)
			continue
		}

		handleMessage(c, msg)
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()

	for {
		message, ok := <-c.send
		if !ok {
			c.conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}

		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
}

func handleMessage(client *Client, msg Message) {
	switch msg.Type {
	case "ping":
		response, _ := json.Marshal(map[string]string{"type": "pong"})
		client.send <- response
		
	case "playerJoin":
		var payload struct {
			PlayerID string `json:"playerId"`
			Username string `json:"username,omitempty"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		client.ID = payload.PlayerID
		if payload.Username != "" {
			client.username = payload.Username
		} else {
			client.username = payload.PlayerID
		}
		
		stateMu.Lock()
		gameState.Players[client.ID] = Player{
			ID: client.ID,
			X:  0, Y: 4, Z: 0,
		}
		stateMu.Unlock()
		
		log.Printf("Player joined: %s (%s)", client.username, client.ID)
		
		sendInitialState(client)
		broadcastPlayerList()
		
	case "playerMove":
		var payload Player
		json.Unmarshal(msg.Payload, &payload)
		
		stateMu.Lock()
		if _, ok := gameState.Players[payload.ID]; ok {
			gameState.Players[payload.ID] = payload
		}
		stateMu.Unlock()
		
		broadcastToAll(createMessage("playerMove", payload))
		
	case "blockBreak":
		var payload struct {
			X int `json:"x"`
			Y int `json:"y"`
			Z int `json:"z"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		key := blockKey(payload.X, payload.Y, payload.Z)
		stateMu.Lock()
		delete(gameState.Blocks, key)
		stateMu.Unlock()
		saveWorldState()
		
		log.Printf("Block broken at %d,%d,%d", payload.X, payload.Y, payload.Z)
		broadcastToAll(createMessage("blockBreak", payload))
		
	case "blockPlace":
		var payload Block
		json.Unmarshal(msg.Payload, &payload)
		
		key := blockKey(payload.X, payload.Y, payload.Z)
		stateMu.Lock()
		gameState.Blocks[key] = payload
		stateMu.Unlock()
		saveWorldState()
		
		log.Printf("Block placed at %d,%d,%d type: %s", payload.X, payload.Y, payload.Z, payload.BlockType)
		broadcastToAll(createMessage("blockPlace", payload))
		
	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

func blockKey(x, y, z int) string {
	return fmt.Sprintf("%d,%d,%d", x, y, z)
}

func sendInitialState(client *Client) {
	stateMu.RLock()
	defer stateMu.RUnlock()
	
	initMsg := map[string]interface{}{
		"type":    "init",
		"players": gameState.Players,
		"blocks":  gameState.Blocks,
	}
	
	data, _ := json.Marshal(initMsg)
	client.send <- data
}

func broadcastPlayerList() {
	stateMu.RLock()
	players := make([]map[string]string, 0)
	for id, p := range gameState.Players {
		players = append(players, map[string]string{"id": id, "name": p.ID})
	}
	stateMu.RUnlock()
	
	msg := map[string]interface{}{
		"type":    "playerList",
		"players": players,
	}
	
	data, _ := json.Marshal(msg)
	broadcastToAll(data)
}

func createMessage(msgType string, data interface{}) []byte {
	msg := Message{Type: msgType}
	payload, _ := json.Marshal(data)
	msg.Payload = payload
	result, _ := json.Marshal(msg)
	return result
}

func broadcastToAll(data []byte) {
	staleClients := make([]*Client, 0)

	clientsMu.RLock()
	for client := range clients {
		select {
		case client.send <- data:
		default:
			staleClients = append(staleClients, client)
		}
	}
	clientsMu.RUnlock()

	if len(staleClients) == 0 {
		return
	}

	clientsMu.Lock()
	for _, client := range staleClients {
		if clients[client] {
			delete(clients, client)
			close(client.send)
		}
	}
	clientsMu.Unlock()
}
