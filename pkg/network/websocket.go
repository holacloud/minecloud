package network

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	ID           string
	conn         *websocket.Conn
	send         chan []byte
	username     string
	voiceEnabled bool
}

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type ChatMessage struct {
	PlayerID  string `json:"playerId"`
	Username  string `json:"username"`
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
}

type iceServer struct {
	URLs       interface{} `json:"urls"`
	Username   string      `json:"username,omitempty"`
	Credential string      `json:"credential,omitempty"`
}

type ICEConfig struct {
	STUNURLs       string
	TURNURLs       string
	TURNUsername   string
	TURNCredential string
	MeteredAPIBase string
	MeteredAPIKey  string
}

type Block struct {
	X         int            `json:"x"`
	Y         int            `json:"y"`
	Z         int            `json:"z"`
	BlockType string         `json:"blockType"`
	Text      string         `json:"text,omitempty"`
	Votes     map[string]int `json:"votes,omitempty"`
}

type Player struct {
	ID         string  `json:"id"`
	Username   string  `json:"username,omitempty"`
	ShirtColor string  `json:"shirtColor,omitempty"`
	HeldItem   string  `json:"heldItem,omitempty"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Z          float64 `json:"z"`
	Yaw        float64 `json:"yaw"`
	Pitch      float64 `json:"pitch"`
}

type GameState struct {
	Players   map[string]Player `json:"players"`
	Blocks    map[string]Block  `json:"blocks"`
	WorldTime float64           `json:"worldTime"`
	WorldDay  int               `json:"worldDay"`
}

type persistedWorldState struct {
	Blocks map[string]Block `json:"blocks"`
}

var (
	clients   = make(map[*Client]bool)
	clientsMu sync.RWMutex
	broadcast = make(chan []byte)

	gameState = &GameState{
		Players:   make(map[string]Player),
		Blocks:    make(map[string]Block),
		WorldTime: 0.22,
		WorldDay:  0,
	}
	stateMu sync.RWMutex

	iceConfig = ICEConfig{
		STUNURLs: "stun:stun.l.google.com:19302",
	}
)

const worldStatePath = "data/world.json"

func Initialize() error {
	if err := loadWorldState(); err != nil {
		return err
	}

	go runWorldClock()
	return nil
}

func ConfigureICE(config ICEConfig) {
	if config.STUNURLs == "" {
		config.STUNURLs = "stun:stun.l.google.com:19302"
	}
	iceConfig = config
}

func runWorldClock() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		stateMu.Lock()
		gameState.WorldTime += 1.0 / 240.0
		if gameState.WorldTime >= 1 {
			gameState.WorldTime = math.Mod(gameState.WorldTime, 1)
			gameState.WorldDay++
		}
		currentTime := gameState.WorldTime
		currentDay := gameState.WorldDay
		stateMu.Unlock()

		broadcastToAll(createMessage("timeSync", map[string]interface{}{"timeOfDay": currentTime, "worldDay": currentDay}))
	}
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

func HandleICEServers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if iceConfig.MeteredAPIKey != "" {
		servers, err := fetchMeteredICEServers(r)
		if err == nil && len(servers) > 0 {
			if err := json.NewEncoder(w).Encode(map[string]interface{}{"iceServers": servers}); err != nil {
				log.Printf("Failed to encode Metered ICE servers: %v", err)
			}
			return
		}
		log.Printf("Failed to fetch Metered ICE servers, using static fallback: %v", err)
	}

	servers := make([]iceServer, 0, 2)
	for _, stunURL := range splitConfigList(iceConfig.STUNURLs) {
		servers = append(servers, iceServer{URLs: stunURL})
	}

	turnURLs := splitConfigList(iceConfig.TURNURLs)
	if len(turnURLs) > 0 && iceConfig.TURNUsername != "" && iceConfig.TURNCredential != "" {
		servers = append(servers, iceServer{
			URLs:       turnURLs,
			Username:   iceConfig.TURNUsername,
			Credential: iceConfig.TURNCredential,
		})
	}

	if err := json.NewEncoder(w).Encode(map[string]interface{}{"iceServers": servers}); err != nil {
		log.Printf("Failed to encode ICE servers: %v", err)
	}
}

func fetchMeteredICEServers(r *http.Request) ([]iceServer, error) {
	apiBase := iceConfig.MeteredAPIBase
	if apiBase == "" {
		apiBase = "https://minecloud.metered.live"
	}

	endpoint, err := url.Parse(strings.TrimRight(apiBase, "/") + "/api/v1/turn/credentials")
	if err != nil {
		return nil, err
	}
	query := endpoint.Query()
	query.Set("apiKey", iceConfig.MeteredAPIKey)
	endpoint.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}

	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Metered returned %s", response.Status)
	}

	var servers []iceServer
	if err := json.NewDecoder(response.Body).Decode(&servers); err != nil {
		return nil, err
	}
	return servers, nil
}

func splitConfigList(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}
	return result
}

func (c *Client) readPump() {
	defer func() {
		log.Println("Client disconnected:", c.ID)
		leftName := c.username
		if leftName == "" {
			leftName = c.ID
		}
		clientsMu.Lock()
		delete(clients, c)
		clientsMu.Unlock()

		stateMu.Lock()
		delete(gameState.Players, c.ID)
		stateMu.Unlock()

		if c.ID != "" {
			c.voiceEnabled = false
			broadcastToAll(createMessage("system", map[string]string{"text": fmt.Sprintf("%s left the world", leftName)}))
		}
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
			PlayerID   string `json:"playerId"`
			Username   string `json:"username,omitempty"`
			ShirtColor string `json:"shirtColor,omitempty"`
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
			ID:         client.ID,
			Username:   client.username,
			ShirtColor: payload.ShirtColor,
			X:          0, Y: 4, Z: 0,
		}
		stateMu.Unlock()

		log.Printf("Player joined: %s (%s)", client.username, client.ID)
		broadcastToAll(createMessage("system", map[string]string{"text": fmt.Sprintf("%s joined the world", client.username)}))

		sendInitialState(client)
		broadcastPlayerList()

	case "playerMove":
		var payload Player
		json.Unmarshal(msg.Payload, &payload)

		stateMu.Lock()
		if existing, ok := gameState.Players[payload.ID]; ok {
			payload.Username = existing.Username
			if payload.ShirtColor == "" {
				payload.ShirtColor = existing.ShirtColor
			}
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
		if payload.BlockType == "sign" {
			if len(payload.Text) > 288 {
				payload.Text = payload.Text[:288]
			}
			if payload.Votes == nil {
				payload.Votes = map[string]int{"thumbup": 0, "thumbdown": 0, "heart": 0, "happy": 0, "star": 0}
			}
		} else {
			payload.Text = ""
			payload.Votes = nil
		}

		key := blockKey(payload.X, payload.Y, payload.Z)
		stateMu.Lock()
		gameState.Blocks[key] = payload
		stateMu.Unlock()
		saveWorldState()

		log.Printf("Block placed at %d,%d,%d type: %s", payload.X, payload.Y, payload.Z, payload.BlockType)
		broadcastToAll(createMessage("blockPlace", payload))

	case "chat":
		var payload struct {
			Text string `json:"text"`
		}
		json.Unmarshal(msg.Payload, &payload)

		text := payload.Text
		if len(text) == 0 {
			return
		}
		if len(text) > 140 {
			text = text[:140]
		}

		chat := ChatMessage{
			PlayerID:  client.ID,
			Username:  client.username,
			Text:      text,
			Timestamp: time.Now().UnixMilli(),
		}

		broadcastToAll(createMessage("chat", chat))

	case "voiceState":
		var payload struct {
			Enabled bool `json:"enabled"`
		}
		json.Unmarshal(msg.Payload, &payload)
		client.voiceEnabled = payload.Enabled
		broadcastToAll(createMessage("voiceState", map[string]interface{}{
			"playerId": client.ID,
			"enabled":  payload.Enabled,
		}))
		broadcastPlayerList()

	case "playerDeath":
		var payload struct {
			Reason string `json:"reason"`
		}
		json.Unmarshal(msg.Payload, &payload)
		reason := payload.Reason
		if reason == "" {
			reason = "died"
		}
		broadcastToAll(createMessage("system", map[string]string{"text": fmt.Sprintf("%s %s", client.username, reason)}))

	case "signVote":
		var payload struct {
			X     int    `json:"x"`
			Y     int    `json:"y"`
			Z     int    `json:"z"`
			Emoji string `json:"emoji"`
		}
		json.Unmarshal(msg.Payload, &payload)
		emojiLabels := map[string]string{"thumbup": "👍", "thumbdown": "👎", "heart": "❤️", "happy": "😊", "star": "⭐"}
		emojiLabel, validEmoji := emojiLabels[payload.Emoji]
		if !validEmoji {
			return
		}
		key := blockKey(payload.X, payload.Y, payload.Z)
		stateMu.Lock()
		block, ok := gameState.Blocks[key]
		if ok && block.BlockType == "sign" {
			if block.Votes == nil {
				block.Votes = map[string]int{}
			}
			block.Votes[payload.Emoji] = block.Votes[payload.Emoji] + 1
			gameState.Blocks[key] = block
		} else {
			ok = false
		}
		stateMu.Unlock()
		if ok {
			saveWorldState()
			broadcastToAll(createMessage("signVoteUpdate", block))
			broadcastToAll(createMessage("system", map[string]string{"text": fmt.Sprintf("El usuario %s ha votado %s", client.username, emojiLabel)}))
		}

	case "sleepInBed":
		stateMu.Lock()
		gameState.WorldTime = 0
		gameState.WorldDay++
		currentDay := gameState.WorldDay
		stateMu.Unlock()
		broadcastToAll(createMessage("timeSync", map[string]interface{}{"timeOfDay": 0, "worldDay": currentDay}))
		broadcastToAll(createMessage("system", map[string]string{"text": fmt.Sprintf("%s slept until dawn", client.username)}))

	case "webrtcOffer":
		forwardSignalMessage(client.ID, "webrtcOffer", msg.Payload)

	case "webrtcAnswer":
		forwardSignalMessage(client.ID, "webrtcAnswer", msg.Payload)

	case "webrtcIceCandidate":
		forwardSignalMessage(client.ID, "webrtcIceCandidate", msg.Payload)

	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

func forwardSignalMessage(fromPlayerID string, msgType string, rawPayload json.RawMessage) {
	var payload map[string]interface{}
	if err := json.Unmarshal(rawPayload, &payload); err != nil {
		return
	}

	toPlayerID, _ := payload["toPlayerId"].(string)
	if toPlayerID == "" {
		return
	}

	delete(payload, "toPlayerId")
	payload["fromPlayerId"] = fromPlayerID
	sendToPlayer(toPlayerID, createMessage(msgType, payload))
}

func sendToPlayer(playerID string, data []byte) {
	clientsMu.RLock()
	defer clientsMu.RUnlock()

	for client := range clients {
		if client.ID != playerID {
			continue
		}

		select {
		case client.send <- data:
		default:
		}
		return
	}
}

func blockKey(x, y, z int) string {
	return fmt.Sprintf("%d,%d,%d", x, y, z)
}

func sendInitialState(client *Client) {
	stateMu.RLock()
	defer stateMu.RUnlock()

	initMsg := map[string]interface{}{
		"type":      "init",
		"players":   gameState.Players,
		"blocks":    gameState.Blocks,
		"timeOfDay": gameState.WorldTime,
		"worldDay":  gameState.WorldDay,
	}

	data, _ := json.Marshal(initMsg)
	client.send <- data
}

func broadcastPlayerList() {
	stateMu.RLock()
	players := make([]map[string]interface{}, 0)
	for id, p := range gameState.Players {
		name := p.Username
		if name == "" {
			name = p.ID
		}

		voiceEnabled := false
		clientsMu.RLock()
		for client := range clients {
			if client.ID == id {
				voiceEnabled = client.voiceEnabled
				break
			}
		}
		clientsMu.RUnlock()

		players = append(players, map[string]interface{}{"id": id, "name": name, "shirtColor": p.ShirtColor, "voiceEnabled": voiceEnabled})
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
