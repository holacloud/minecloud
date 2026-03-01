package network

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	conn *websocket.Conn
	send chan []byte
}

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

var (
	clients   = make(map[*Client]bool)
	clientsMu sync.RWMutex
	broadcast = make(chan []byte)
)

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
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
		clientsMu.Lock()
		delete(clients, c)
		clientsMu.Unlock()
		c.conn.Close()
	}()

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
		}
		json.Unmarshal(msg.Payload, &payload)
		log.Printf("Player joined: %s", payload.PlayerID)
		broadcastToAll(createMessage("playerJoined", payload))
	case "playerMove":
		broadcastToAll(msg.Payload)
	case "blockBreak":
		log.Printf("Block broken: %s", msg.Payload)
		broadcastToAll(msg.Payload)
	case "blockPlace":
		log.Printf("Block placed: %s", msg.Payload)
		broadcastToAll(msg.Payload)
	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

func createMessage(msgType string, data interface{}) []byte {
	msg := Message{Type: msgType}
	payload, _ := json.Marshal(data)
	msg.Payload = payload
	result, _ := json.Marshal(msg)
	return result
}

func broadcastToAll(data []byte) {
	clientsMu.RLock()
	defer clientsMu.RUnlock()

	for client := range clients {
		select {
		case client.send <- data:
		default:
			close(client.send)
			delete(clients, client)
		}
	}
}
