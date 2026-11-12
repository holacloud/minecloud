package network

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/holacloud/store"

	"minecloud/pkg/terrain"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	ID   string
	conn *websocket.Conn
	send chan []byte
	// What this client was last told of each player around it: the moves' round only (player_moves.go).
	moves        map[string]*movesSeen
	chunks       chan []byte // binary chunk frames, written after regular messages
	done         chan struct{}
	stream       *chunkStream
	username     string
	voiceEnabled bool
	sessionID    string
	ip           string
	userAgent    string
	// Whether this session passed creative auth (creative.go): set by each creativeAuth answer, cleared by
	// creativeOff. Only constructionStock reads it.
	creative atomic.Bool
	// The stable player this connection is (identity.go), from its session cookie, never from the page.
	// A recovery from another tab of the same browser changes it, hence atomic.
	stablePlayer atomic.Value
}

func (c *Client) stablePlayerID() string {
	id, _ := c.stablePlayer.Load().(string)
	return id
}

func (c *Client) setStablePlayerID(id string) {
	c.stablePlayer.Store(id)
}

// trySend queues a message for the client without ever blocking: false when its buffer is full. Every
// message to one client goes through here (or through broadcastToAll). The send channel is never closed,
// so this is safe from any goroutine at any time, also after the client was dropped or has left.
func (c *Client) trySend(data []byte) bool {
	select {
	case c.send <- data:
		return true
	default:
		return false
	}
}

// drop ends the connection of a client that cannot keep up: its readPump then fails, which removes it from
// the world and stops its writePump. Safe to call more than once, and next to the pumps.
func (c *Client) drop() {
	if c.conn != nil {
		c.conn.Close()
	}
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
	X          int            `json:"x"`
	Y          int            `json:"y"`
	Z          int            `json:"z"`
	BlockType  string         `json:"blockType"`
	Text       string         `json:"text,omitempty"`
	Votes      map[string]int `json:"votes,omitempty"`
	Instrument string         `json:"instrument,omitempty"`
	Note       int            `json:"note,omitempty"`
	Facing     string         `json:"facing,omitempty"`
}

type SprayPaint struct {
	X             int     `json:"x"`
	Y             int     `json:"y"`
	Z             int     `json:"z"`
	Face          string  `json:"face"`
	Color         string  `json:"color"`
	Author        string  `json:"author,omitempty"`
	ExpiresAtDay  int     `json:"expiresAtDay"`
	ExpiresAtTime float64 `json:"expiresAtTime"`
}

type Player struct {
	ID         string  `json:"id"`
	Username   string  `json:"username,omitempty"`
	ShirtColor string  `json:"shirtColor,omitempty"`
	HairStyle  string  `json:"hairStyle,omitempty"`
	HairColor  string  `json:"hairColor,omitempty"`
	HeldItem   string  `json:"heldItem,omitempty"`
	Action     string  `json:"action,omitempty"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Z          float64 `json:"z"`
	Yaw        float64 `json:"yaw"`
	Pitch      float64 `json:"pitch"`
	// Mount is "species:variant" while riding (e.g. "horse:2"), MountYaw its facing.
	Mount    string  `json:"mount,omitempty"`
	MountYaw float64 `json:"mountYaw,omitempty"`
	// Whether X, Y, Z come from the player: until their first move they are playerJoin's placeholder.
	Located bool `json:"-"`
	// OffhandItem is what the left hand holds; clients that know nothing of it never send it.
	OffhandItem string `json:"offhandItem,omitempty"`
	// What tells a change from the last one each client heard of (player_moves.go): rev is new with
	// anything of the player, look with its name or its looks.
	rev, look uint64
}

type GameState struct {
	Players       map[string]Player     `json:"players"`
	Blocks        map[string]Block      `json:"blocks"`
	RemovedBlocks map[string]bool       `json:"removedBlocks"`
	SprayPaints   map[string]SprayPaint `json:"sprayPaints"`
	WorldTime     float64               `json:"worldTime"`
	WorldDay      int                   `json:"worldDay"`
}

var (
	clients   = make(map[*Client]bool)
	clientsMu sync.RWMutex
	broadcast = make(chan []byte)

	gameState = &GameState{
		Players:       make(map[string]Player),
		Blocks:        make(map[string]Block),
		RemovedBlocks: make(map[string]bool),
		SprayPaints:   make(map[string]SprayPaint),
		WorldTime:     0.22,
		WorldDay:      0,
	}
	stateMu sync.RWMutex

	iceConfig = ICEConfig{
		STUNURLs: "stun:stun.l.google.com:19302",
	}
)

func Initialize() error {
	if err := initializeAuditStores(); err != nil {
		return err
	}

	if err := worldLoad(); err != nil {
		return err
	}
	if err := initChunkStore(); err != nil {
		return err
	}

	for _, run := range loops {
		go run()
	}
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
		expiredPaints := pruneExpiredSprayPaintsLocked()
		currentTime := gameState.WorldTime
		currentDay := gameState.WorldDay
		stateMu.Unlock()

		broadcastToAll(createMessage("timeSync", map[string]interface{}{"timeOfDay": currentTime, "worldDay": currentDay}))
		for _, key := range expiredPaints {
			broadcastToAll(createMessage("sprayPaintRemove", map[string]string{"key": key}))
		}
	}
}

func sprayPaintExpired(paint SprayPaint, day int, worldTime float64) bool {
	return day > paint.ExpiresAtDay || (day == paint.ExpiresAtDay && worldTime >= paint.ExpiresAtTime)
}

func pruneExpiredSprayPaintsLocked() []string {
	expired := make([]string, 0)
	for key, paint := range gameState.SprayPaints {
		if sprayPaintExpired(paint, gameState.WorldDay, gameState.WorldTime) {
			delete(gameState.SprayPaints, key)
			expired = append(expired, key)
			worldPaints.mark()
		}
	}
	return expired
}

// Every message of every client in the log is a line for each step of each player: only to debug
// (-logmessages), and what happens seldom (a plot claimed, a refusal) is logged regardless.
var logMessages bool

// ConfigureMessageLog turns the log of every message, and of every block placed or broken, on or off.
func ConfigureMessageLog(on bool) {
	logMessages = on
}

// The blocks that say more than their name: the text and votes of a sign, the note of a sound block, the
// side of a ladder. removedBlocks is from when edits were kept here and not in the chunks (chunks.go).
type blocksSaved struct {
	Blocks        map[string]Block `json:"blocks"`
	RemovedBlocks map[string]bool  `json:"removedBlocks"`
}

type paintsSaved struct {
	SprayPaints map[string]SprayPaint `json:"sprayPaints"`
}

var worldBlocks, worldPaints *worldSection

func init() {
	worldBlocks = registerWorldSection(worldSectionSpec{
		name: "blocks",
		snapshot: func() any {
			stateMu.RLock()
			defer stateMu.RUnlock()
			saved := blocksSaved{
				Blocks:        make(map[string]Block, len(gameState.Blocks)),
				RemovedBlocks: make(map[string]bool, len(gameState.RemovedBlocks)),
			}
			for key, block := range gameState.Blocks {
				saved.Blocks[key] = block
			}
			for key, removed := range gameState.RemovedBlocks {
				saved.RemovedBlocks[key] = removed
			}
			return saved
		},
		load: func(data []byte) error {
			var saved blocksSaved
			if err := json.Unmarshal(data, &saved); err != nil {
				return err
			}
			if saved.Blocks == nil {
				saved.Blocks = make(map[string]Block)
			}
			if saved.RemovedBlocks == nil {
				saved.RemovedBlocks = make(map[string]bool)
			}
			stateMu.Lock()
			gameState.Blocks = saved.Blocks
			gameState.RemovedBlocks = saved.RemovedBlocks
			stateMu.Unlock()
			log.Printf("Loaded %d persisted blocks and %d removed blocks", len(saved.Blocks), len(saved.RemovedBlocks))
			return nil
		},
	})
	worldPaints = registerWorldSection(worldSectionSpec{
		name: "paints",
		snapshot: func() any {
			stateMu.RLock()
			defer stateMu.RUnlock()
			saved := paintsSaved{SprayPaints: make(map[string]SprayPaint, len(gameState.SprayPaints))}
			for key, paint := range gameState.SprayPaints {
				saved.SprayPaints[key] = paint
			}
			return saved
		},
		load: func(data []byte) error {
			var saved paintsSaved
			if err := json.Unmarshal(data, &saved); err != nil {
				return err
			}
			if saved.SprayPaints == nil {
				saved.SprayPaints = make(map[string]SprayPaint)
			}
			stateMu.Lock()
			gameState.SprayPaints = saved.SprayPaints
			pruneExpiredSprayPaintsLocked()
			stateMu.Unlock()
			return nil
		},
	})
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	log.Println("WebSocket connection request from:", r.RemoteAddr)
	session, cookie, err := ensureSession(r)
	if err != nil {
		log.Printf("Failed to ensure websocket session: %v", err)
	}

	responseHeader := http.Header{}
	if cookie != nil {
		responseHeader.Add("Set-Cookie", cookie.String())
	}

	conn, err := upgrader.Upgrade(w, r, responseHeader)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	sessionID := ""
	if session != nil {
		sessionID = session.GetId()
	}

	client := &Client{
		conn:      conn,
		send:      make(chan []byte, 256),
		chunks:    make(chan []byte, 4),
		done:      make(chan struct{}),
		sessionID: sessionID,
		ip:        clientIP(r),
		userAgent: r.UserAgent(),
	}
	client.stream = newChunkStream(client)
	attachIdentity(client)

	clientsMu.Lock()
	clients[client] = true
	clientsMu.Unlock()
	for _, tell := range onConnect {
		tell(client)
	}

	go client.writePump()
	go client.readPump()
	go client.stream.run()
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
		close(c.done)
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
		if playerClients[c.ID] == c {
			delete(playerClients, c.ID)
		}
		stateMu.Unlock()
		storage.forget(c)

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

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Println("JSON unmarshal error:", err)
			continue
		}
		if msg.Type == "chunkRequest" || msg.Type == "chunkFocus" {
			handleChunkMessage(c, msg)
			continue
		}

		if logMessages {
			// Never log a creative key or a recovery code.
			if messageIsSecret(msg.Type) {
				log.Printf("Received message: %s (payload hidden)", msg.Type)
			} else {
				log.Printf("Received message: %s", message)
			}
		}
		handleMessage(c, msg)
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()

	writeText := func(message []byte) bool {
		return c.conn.WriteMessage(websocket.TextMessage, message) == nil
	}

	for {
		// Regular messages always go first; chunk frames fill the gaps.
		select {
		case message := <-c.send:
			if !writeText(message) {
				return
			}
			continue
		default:
		}

		select {
		case message := <-c.send:
			if !writeText(message) {
				return
			}
		case data := <-c.chunks:
			if err := c.conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}

// blockEditable says whether a player's message may change the cell (x, y, z). The world is what
// lies between WorldMinY and WorldMaxY, negative heights included, and bedrock stays where it is:
// the game never asks otherwise (world.js marks it unbreakable), so this only stops other clients.
func blockEditable(x, y, z int) bool {
	if y < terrain.WorldMinY || y > terrain.WorldMaxY {
		return false
	}
	name, err := chunkStore.Block(x, y, z)
	return err != nil || name != "bedrock"
}

// Blocks placed and broken by clients go one edit at a time, so a strip of curtains changed together
// (curtainStrip) is checked and written with nobody breaking one of them in between.
var blockEditMu sync.Mutex

// Places what a client sent (a blockPlace) with the server's own rules, and says whether it was
// placed and what exactly, to tell everybody. The caller holds blockEditMu.
func placeBlock(client *Client, payload Block) (Block, bool) {
	if !blockEditable(payload.X, payload.Y, payload.Z) {
		return payload, false
	}
	sanitizeSignPayload(&payload)
	if payload.BlockType == "sound_block" {
		payload.Instrument = strings.TrimSpace(payload.Instrument)
		if payload.Instrument == "" {
			payload.Instrument = "bell"
		}
		if payload.Note < 0 || payload.Note > 7 {
			payload.Note = 0
		}
	} else {
		payload.Instrument = ""
		payload.Note = 0
	}
	if payload.BlockType == "ladder" {
		payload.Facing = normalizeLadderFacing(payload.Facing)
		if payload.Facing == "" {
			payload.Facing = "pz"
		}
	} else {
		payload.Facing = ""
	}

	if payload.BlockType == "" {
		return payload, false
	}
	// What the mechanics make of the name (glow_block.go, appliances.go...).
	payload.BlockType = placeFiltered(payload.X, payload.Y, payload.Z, payload.BlockType)
	spill, _, err := storage.replace(chunkStore, payload.X, payload.Y, payload.Z, payload.BlockType, func() (bool, error) {
		return setBlockTracked(payload.X, payload.Y, payload.Z, payload.BlockType)
	})
	if err != nil {
		log.Printf("blockPlace: %v", err)
		return payload, false
	}
	// Only blocks with metadata (signs, sound blocks, ladders) are kept besides the chunks (worldBlocks).
	key := blockKey(payload.X, payload.Y, payload.Z)
	stateMu.Lock()
	_, hadMetadata := gameState.Blocks[key]
	if hasBlockMetadata(payload) {
		gameState.Blocks[key] = payload
	} else {
		delete(gameState.Blocks, key)
	}
	stateMu.Unlock()
	// The crops and the power say for themselves that they changed (setBlockTracked).
	if hadMetadata || hasBlockMetadata(payload) {
		worldBlocks.changed()
	}
	if len(spill) > 0 {
		worldStorage.changed()
	}
	storageSendDrop(client, payload.X, payload.Y, payload.Z, spill)
	recordSignMessage(client, payload)

	if logMessages {
		log.Printf("Block placed at %d,%d,%d type: %s", payload.X, payload.Y, payload.Z, payload.BlockType)
	}
	return payload, true
}

// The messages of the world itself; every mechanic registers its own from its file (registry.go).
func init() {
	nowhere := func(handle func(*Client, Message), types ...string) {
		registerMessage(messageSpec{plot: plotNowhere, handle: handle}, types...)
	}
	nowhere(handlePing, "ping")
	nowhere(handlePlayerJoin, "playerJoin")
	nowhere(handlePlayerMove, "playerMove")
	nowhere(handleWorldNote, "worldNote")
	nowhere(handleWorldPing, "worldPing")
	nowhere(handlePlayerReaction, "playerReaction")
	nowhere(handleProximityEmote, "proximityEmote")
	nowhere(handleChat, "chat")
	nowhere(handleVoiceState, "voiceState")
	nowhere(handlePlayerDeath, "playerDeath")
	nowhere(handleSleepInBed, "sleepInBed")
	nowhere(func(client *Client, msg Message) { forwardSignalMessage(client.ID, msg.Type, msg.Payload) },
		"webrtcOffer", "webrtcAnswer", "webrtcIceCandidate")
	// A break or a place has the plots' own rules on top of the check: the marker, builder mode (claims.go).
	registerMessage(messageSpec{plot: plotChecked, handle: handleBlockBreak}, "blockBreak")
	registerMessage(messageSpec{plot: plotChecked, handle: handleBlockPlace}, "blockPlace")
	// Checked once the face and the colour are known to be real ones.
	registerMessage(messageSpec{plot: plotChecked, handle: handleSprayPaint}, "sprayPaint")
	registerMessage(messageSpec{plot: plotOpen, why: "a sound changes nothing", handle: handleSoundBlockPlay}, "soundBlockPlay")
	registerMessage(messageSpec{plot: plotOpen, why: "a visitor may read and vote a sign", handle: handleSignVote}, "signVote")

	registerLoop(runWorldClock)
}

func handlePing(client *Client, msg Message) {
	response, _ := json.Marshal(map[string]string{"type": "pong"})
	client.trySend(response)
}

func handlePlayerJoin(client *Client, msg Message) {
	var payload struct {
		PlayerID   string `json:"playerId"`
		Username   string `json:"username,omitempty"`
		ShirtColor string `json:"shirtColor,omitempty"`
		HairStyle  string `json:"hairStyle,omitempty"`
		HairColor  string `json:"hairColor,omitempty"`
	}
	json.Unmarshal(msg.Payload, &payload)

	client.ID = payload.PlayerID
	if payload.Username != "" {
		client.username = payload.Username
	} else {
		client.username = payload.PlayerID
	}
	recordRegistration(client, payload.PlayerID)
	claimRenameOwner(client)

	stateMu.Lock()
	gameState.Players[client.ID] = Player{
		ID:         client.ID,
		Username:   client.username,
		ShirtColor: payload.ShirtColor,
		HairStyle:  payload.HairStyle,
		HairColor:  payload.HairColor,
		X:          0, Y: 4, Z: 0,
	}
	stateMu.Unlock()

	log.Printf("Player joined: %s (%s)", client.username, client.ID)
	broadcastToAll(createMessage("system", map[string]string{"text": fmt.Sprintf("%s joined the world", client.username)}))

	sendInitialState(client)
	broadcastPlayerList()
}

// Whose each player is, and the number the next change of any player takes (stateMu, as the players).
var (
	playerClients  = make(map[string]*Client)
	playerRevision uint64
)

// handlePlayerMove keeps where a client says its player is. Nobody is told here: each client hears of
// the players around it from the moves' round (player_moves.go).
func handlePlayerMove(client *Client, msg Message) {
	var payload Player
	json.Unmarshal(msg.Payload, &payload)
	// A client moves its own player and nobody else's.
	if payload.ID == "" || payload.ID != client.ID {
		return
	}

	payload.Located = true
	stateMu.Lock()
	// A connection that died unnoticed takes the player's entry with it when it finally
	// closes, after they are back on a new one; their next move brings the entry back.
	existing, ok := gameState.Players[payload.ID]
	if !ok {
		existing = Player{ID: client.ID, Username: client.username}
	}
	if payload.Username == "" {
		payload.Username = existing.Username
	}
	if payload.ShirtColor == "" {
		payload.ShirtColor = existing.ShirtColor
	}
	if payload.HairStyle == "" {
		payload.HairStyle = existing.HairStyle
	}
	if payload.HairColor == "" {
		payload.HairColor = existing.HairColor
	}
	payload.rev, payload.look = existing.rev, existing.look
	if payload.look == 0 || payload.Username != existing.Username || payload.ShirtColor != existing.ShirtColor ||
		payload.HairStyle != existing.HairStyle || payload.HairColor != existing.HairColor {
		playerRevision++
		payload.look = playerRevision
	}
	// The same as last time (a player standing still) is no news for anybody.
	if payload != existing {
		playerRevision++
		payload.rev = playerRevision
		gameState.Players[payload.ID] = payload
	}
	playerClients[payload.ID] = client
	stateMu.Unlock()
}

func handleBlockBreak(client *Client, msg Message) {
	blockEditMu.Lock()
	defer blockEditMu.Unlock()
	var payload struct {
		X int `json:"x"`
		Y int `json:"y"`
		Z int `json:"z"`
	}
	json.Unmarshal(msg.Payload, &payload)
	if !blockEditable(payload.X, payload.Y, payload.Z) {
		return
	}
	// Someone else's plot, or the spawn zone (claims.go): the sender puts its copy back.
	if refusal := claimBreakAllowed(client, payload.X, payload.Y, payload.Z); refusal != nil {
		claimRefuse(client, refusal, [3]int{payload.X, payload.Y, payload.Z})
		return
	}
	was, _ := chunkStore.Block(payload.X, payload.Y, payload.Z)

	// The chunk store is the source of truth; never call it while holding stateMu.
	spill, _, err := storage.replace(chunkStore, payload.X, payload.Y, payload.Z, "", func() (bool, error) {
		return setBlockTracked(payload.X, payload.Y, payload.Z, "")
	})
	if err != nil {
		log.Printf("blockBreak: %v", err)
		return
	}
	key := blockKey(payload.X, payload.Y, payload.Z)
	stateMu.Lock()
	_, hadMetadata := gameState.Blocks[key]
	delete(gameState.Blocks, key)
	removeSprayPaintsForBlockLocked(payload.X, payload.Y, payload.Z)
	stateMu.Unlock()
	if hadMetadata {
		worldBlocks.changed()
	}
	if len(spill) > 0 {
		worldStorage.changed()
	}
	storageSendDrop(client, payload.X, payload.Y, payload.Z, spill)

	if logMessages {
		log.Printf("Block broken at %d,%d,%d", payload.X, payload.Y, payload.Z)
	}
	broadcastToAll(createMessage("blockBreak", payload))
	// Breaking a marker removes its plot (claims.go).
	claimBroken(was, payload.X, payload.Y, payload.Z)
}

func handleBlockPlace(client *Client, msg Message) {
	var payload Block
	json.Unmarshal(msg.Payload, &payload)
	// From builder mode's palette (builder.go): only in a plot of the sender's, and nothing to give back.
	var from struct {
		Palette bool `json:"palette"`
	}
	json.Unmarshal(msg.Payload, &from)
	blockEditMu.Lock()
	placed, refusal, ok := claimPlaceBlock(client, payload, from.Palette)
	blockEditMu.Unlock()
	if refusal != nil {
		if !from.Palette {
			refusal.Placed = payload.BlockType
		}
		claimRefuse(client, refusal, [3]int{payload.X, payload.Y, payload.Z})
	}
	if ok {
		broadcastToAll(createMessage("blockPlace", placed))
	}
}

func handleSprayPaint(client *Client, msg Message) {
	var payload SprayPaint
	json.Unmarshal(msg.Payload, &payload)
	payload.Face = normalizeSprayFace(payload.Face)
	payload.Color = normalizeSprayColor(payload.Color)
	if payload.Face == "" || payload.Color == "" {
		return
	}
	if refusal := claimCheck(client, payload.X, payload.Z); refusal != nil {
		claimRefuse(client, refusal)
		return
	}

	stateMu.Lock()
	payload.Author = client.username
	payload.ExpiresAtDay = gameState.WorldDay + 1
	payload.ExpiresAtTime = gameState.WorldTime
	key := sprayPaintKey(payload.X, payload.Y, payload.Z, payload.Face)
	gameState.SprayPaints[key] = payload
	stateMu.Unlock()
	worldPaints.changed()

	broadcastToAll(createMessage("sprayPaint", payload))
}

func handleSoundBlockPlay(client *Client, msg Message) {
	var payload struct {
		X          int    `json:"x"`
		Y          int    `json:"y"`
		Z          int    `json:"z"`
		Instrument string `json:"instrument"`
		Note       int    `json:"note"`
	}
	json.Unmarshal(msg.Payload, &payload)
	payload.Instrument = strings.TrimSpace(payload.Instrument)
	if payload.Instrument == "" {
		payload.Instrument = "bell"
	}
	if payload.Note < 0 || payload.Note > 7 {
		payload.Note = 0
	}
	broadcastToAll(createMessage("soundBlockPlay", payload))
}

func handleWorldNote(client *Client, msg Message) {
	var payload struct {
		Text     string  `json:"text"`
		Username string  `json:"username,omitempty"`
		X        float64 `json:"x"`
		Y        float64 `json:"y"`
		Z        float64 `json:"z"`
	}
	json.Unmarshal(msg.Payload, &payload)
	payload.Text = strings.TrimSpace(payload.Text)
	if payload.Text == "" {
		return
	}
	if len(payload.Text) > 80 {
		payload.Text = payload.Text[:80]
	}
	payload.Username = client.username
	broadcastToAll(createMessage("worldNote", payload))
}

func handleWorldPing(client *Client, msg Message) {
	var payload struct {
		Username string  `json:"username,omitempty"`
		X        float64 `json:"x"`
		Y        float64 `json:"y"`
		Z        float64 `json:"z"`
	}
	json.Unmarshal(msg.Payload, &payload)
	payload.Username = client.username
	broadcastToAll(createMessage("worldPing", payload))
}

func handlePlayerReaction(client *Client, msg Message) {
	var payload struct {
		TargetID string `json:"targetId"`
		Kind     string `json:"kind"`
	}
	json.Unmarshal(msg.Payload, &payload)
	payload.TargetID = strings.TrimSpace(payload.TargetID)
	payload.Kind = strings.TrimSpace(payload.Kind)
	if payload.TargetID == "" {
		return
	}
	if payload.Kind != "heart" && payload.Kind != "clap" && payload.Kind != "confetti" {
		payload.Kind = "heart"
	}
	broadcastToAll(createMessage("playerReaction", payload))
}

func handleProximityEmote(client *Client, msg Message) {
	var payload struct {
		Kind string  `json:"kind"`
		X    float64 `json:"x"`
		Y    float64 `json:"y"`
		Z    float64 `json:"z"`
	}
	json.Unmarshal(msg.Payload, &payload)
	payload.Kind = strings.TrimSpace(payload.Kind)
	if payload.Kind != "laugh" && payload.Kind != "cheer" && payload.Kind != "boo" {
		return
	}
	broadcastToAll(createMessage("proximityEmote", payload))
}

func handleChat(client *Client, msg Message) {
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
	recordChatMessage(client, text)

	broadcastToAll(createMessage("chat", chat))
}

func handleVoiceState(client *Client, msg Message) {
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
}

func handlePlayerDeath(client *Client, msg Message) {
	var payload struct {
		Reason string `json:"reason"`
	}
	json.Unmarshal(msg.Payload, &payload)
	reason := payload.Reason
	if reason == "" {
		reason = "died"
	}
	broadcastToAll(createMessage("system", map[string]string{"text": fmt.Sprintf("%s %s", client.username, reason)}))
}

func handleSignVote(client *Client, msg Message) {
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
	if ok && isSignBlock(block.BlockType) {
		// A new map each time, never a change in place: the save (worldBlocks) and the broadcasts below
		// read the old one with stateMu released, and a map read while written aborts the server.
		votes := make(map[string]int, len(block.Votes)+1)
		for emoji, count := range block.Votes {
			votes[emoji] = count
		}
		votes[payload.Emoji]++
		block.Votes = votes
		gameState.Blocks[key] = block
	} else {
		ok = false
	}
	stateMu.Unlock()
	if ok {
		worldBlocks.changed()
		broadcastToAll(createMessage("signVoteUpdate", block))
		broadcastToAll(createMessage("system", map[string]string{"text": fmt.Sprintf("El usuario %s ha votado %s", client.username, emojiLabel)}))
	}
}

func handleSleepInBed(client *Client, msg Message) {
	stateMu.Lock()
	gameState.WorldTime = 0
	gameState.WorldDay++
	currentDay := gameState.WorldDay
	stateMu.Unlock()
	broadcastToAll(createMessage("timeSync", map[string]interface{}{"timeOfDay": 0, "worldDay": currentDay}))
	broadcastToAll(createMessage("system", map[string]string{"text": fmt.Sprintf("%s slept until dawn", client.username)}))
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

		client.trySend(data)
		return
	}
}

func blockKey(x, y, z int) string {
	return fmt.Sprintf("%d,%d,%d", x, y, z)
}

func sprayPaintKey(x, y, z int, face string) string {
	return fmt.Sprintf("%d,%d,%d,%s", x, y, z, face)
}

func normalizeSprayFace(face string) string {
	switch face {
	case "px", "nx", "py", "ny", "pz", "nz":
		return face
	default:
		return ""
	}
}

func normalizeSprayColor(color string) string {
	switch strings.ToLower(strings.TrimSpace(color)) {
	case "green", "pink", "blue":
		return strings.ToLower(strings.TrimSpace(color))
	default:
		return ""
	}
}

func normalizeLadderFacing(facing string) string {
	switch facing {
	case "px", "nx", "pz", "nz":
		return facing
	default:
		return ""
	}
}

func removeSprayPaintsForBlockLocked(x, y, z int) {
	prefix := fmt.Sprintf("%d,%d,%d,", x, y, z)
	for key := range gameState.SprayPaints {
		if strings.HasPrefix(key, prefix) {
			delete(gameState.SprayPaints, key)
			worldPaints.mark()
		}
	}
}

func sendInitialState(client *Client) {
	stateMu.RLock()
	defer stateMu.RUnlock()

	// Terrain (with every edit) is streamed per chunk on request; the init message only
	// carries block metadata such as sign texts.
	blockMetadata := make(map[string]Block)
	for key, b := range gameState.Blocks {
		if hasBlockMetadata(b) {
			blockMetadata[key] = b
		}
	}

	initMsg := map[string]interface{}{
		"type":        "init",
		"blocks":      blockMetadata,
		"sprayPaints": gameState.SprayPaints,
		"timeOfDay":   gameState.WorldTime,
		"worldDay":    gameState.WorldDay,
	}

	data, _ := json.Marshal(initMsg)
	// Never a blocking send under stateMu: a client with no room for its first message is beyond help.
	if !client.trySend(data) {
		client.drop()
	}
}

func SavePlayerStates() error {
	if playerStateStore == nil {
		return nil
	}

	stateMu.RLock()
	players := make([]Player, 0, len(gameState.Players))
	for _, player := range gameState.Players {
		players = append(players, player)
	}
	stateMu.RUnlock()

	sessionsByPlayer := make(map[string]string, len(players))
	clientsMu.RLock()
	for client := range clients {
		if client.ID != "" {
			sessionsByPlayer[client.ID] = client.sessionID
		}
	}
	clientsMu.RUnlock()

	now := time.Now().UTC()
	for _, player := range players {
		if player.ID == "" {
			continue
		}

		record := &PlayerStateRecord{
			Id:         store.NewId(player.ID),
			SessionID:  sessionsByPlayer[player.ID],
			PlayerID:   player.ID,
			Username:   player.Username,
			ShirtColor: player.ShirtColor,
			HairStyle:  player.HairStyle,
			HairColor:  player.HairColor,
			HeldItem:   player.HeldItem,
			Action:     player.Action,
			X:          player.X,
			Y:          player.Y,
			Z:          player.Z,
			Yaw:        player.Yaw,
			Pitch:      player.Pitch,
			UpdatedAt:  now,
		}

		if err := playerStateStore.Put(context.Background(), &record); err != nil {
			return err
		}
	}

	log.Printf("Saved %d player states", len(players))
	return nil
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

		players = append(players, map[string]interface{}{"id": id, "name": name, "shirtColor": p.ShirtColor, "hairStyle": p.HairStyle, "hairColor": p.HairColor, "voiceEnabled": voiceEnabled})
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
		if !client.trySend(data) {
			staleClients = append(staleClients, client)
		}
	}
	clientsMu.RUnlock()

	if len(staleClients) == 0 {
		return
	}

	// A client whose buffer is full is dropped by closing its connection, never its send channel: its
	// readPump may be in the middle of answering it, and a send on a closed channel would take the
	// whole server down.
	clientsMu.Lock()
	for _, client := range staleClients {
		if clients[client] {
			delete(clients, client)
			client.drop()
		}
	}
	clientsMu.Unlock()
}
