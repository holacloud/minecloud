package network

import (
	"crypto/subtle"
	"encoding/json"
	"strings"
)

// creativeKey unlocks the hidden creative mode (/creative <key> in the chat). It is only known
// to the server; empty disables creative mode altogether.
var creativeKey string

func ConfigureCreative(key string) {
	creativeKey = normalizeCreativeKey(key)
}

func normalizeCreativeKey(key string) string {
	return strings.ToLower(strings.TrimSpace(key))
}

// checkCreativeKey reports whether key is the creative key, in constant time.
func checkCreativeKey(key string) bool {
	if creativeKey == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(normalizeCreativeKey(key)), []byte(creativeKey)) == 1
}

type creativeAuthRequest struct {
	Key     string `json:"key"`
	Command string `json:"command"`
	Silent  bool   `json:"silent"`
}

// handleCreativeAuth answers a creativeAuth request to the asking client only. The reply never
// says why a key was refused; the client then answers like an unknown command.
func handleCreativeAuth(client *Client, payload json.RawMessage) {
	var request creativeAuthRequest
	if err := json.Unmarshal(payload, &request); err != nil {
		return
	}
	reply := createMessage("creativeAuth", map[string]interface{}{
		"ok":      checkCreativeKey(request.Key),
		"command": request.Command,
		"silent":  request.Silent,
	})
	select {
	case client.send <- reply:
	default:
	}
}
