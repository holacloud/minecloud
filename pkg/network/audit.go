package network

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/holacloud/store"
)

const sessionCookieName = "minecloud_session"

type AuditConfig struct {
	SessionGlobalSalt string
}

type SessionRecord struct {
	*store.Id
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	TokenSalt string    `json:"tokenSalt"`
	TokenHash string    `json:"tokenHash"`
	IP        string    `json:"ip"`
	UserAgent string    `json:"userAgent"`
	Nick      string    `json:"nick,omitempty"`
}

type RegistrationRecord struct {
	*store.Id
	SessionID    string    `json:"sessionId"`
	PlayerID     string    `json:"playerId"`
	Nick         string    `json:"nick"`
	IP           string    `json:"ip"`
	UserAgent    string    `json:"userAgent"`
	RegisteredAt time.Time `json:"registeredAt"`
}

type ChatMessageRecord struct {
	*store.Id
	SessionID string    `json:"sessionId"`
	PlayerID  string    `json:"playerId"`
	Nick      string    `json:"nick"`
	Text      string    `json:"text"`
	IP        string    `json:"ip"`
	UserAgent string    `json:"userAgent"`
	SentAt    time.Time `json:"sentAt"`
}

type SignMessageRecord struct {
	*store.Id
	SessionID string    `json:"sessionId"`
	PlayerID  string    `json:"playerId"`
	Nick      string    `json:"nick"`
	X         int       `json:"x"`
	Y         int       `json:"y"`
	Z         int       `json:"z"`
	Text      string    `json:"text"`
	IP        string    `json:"ip"`
	UserAgent string    `json:"userAgent"`
	CreatedAt time.Time `json:"createdAt"`
}

type PlayerStateRecord struct {
	*store.Id
	SessionID  string    `json:"sessionId"`
	PlayerID   string    `json:"playerId"`
	Username   string    `json:"username,omitempty"`
	ShirtColor string    `json:"shirtColor,omitempty"`
	HeldItem   string    `json:"heldItem,omitempty"`
	X          float64   `json:"x"`
	Y          float64   `json:"y"`
	Z          float64   `json:"z"`
	Yaw        float64   `json:"yaw"`
	Pitch      float64   `json:"pitch"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

var (
	sessionStore      *store.StoreDisk[*SessionRecord]
	registrationStore *store.StoreDisk[*RegistrationRecord]
	chatMessageStore  *store.StoreDisk[*ChatMessageRecord]
	signMessageStore  *store.StoreDisk[*SignMessageRecord]
	playerStateStore  *store.StoreDisk[*PlayerStateRecord]
	auditConfig       AuditConfig
)

func ConfigureAudit(config AuditConfig) {
	config.SessionGlobalSalt = strings.TrimSpace(config.SessionGlobalSalt)
	auditConfig = config
}

func initializeAuditStores() error {
	if auditConfig.SessionGlobalSalt == "" {
		return fmt.Errorf("SessionGlobalSalt is required for secure session cookie hashing")
	}

	var err error
	sessionStore, err = store.NewStoreDisk[*SessionRecord]("data/sessions")
	if err != nil {
		return err
	}

	registrationStore, err = store.NewStoreDisk[*RegistrationRecord]("data/registrations")
	if err != nil {
		return err
	}

	chatMessageStore, err = store.NewStoreDisk[*ChatMessageRecord]("data/chat-messages")
	if err != nil {
		return err
	}

	signMessageStore, err = store.NewStoreDisk[*SignMessageRecord]("data/sign-messages")
	if err != nil {
		return err
	}

	playerStateStore, err = store.NewStoreDisk[*PlayerStateRecord]("data/player-states")
	return err
}

func SessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, cookie, err := ensureSession(r)
		if err != nil {
			log.Printf("Failed to ensure session: %v", err)
		} else if cookie != nil {
			http.SetCookie(w, cookie)
		}

		next.ServeHTTP(w, r)
	})
}

func ensureSession(r *http.Request) (*SessionRecord, *http.Cookie, error) {
	if sessionStore == nil {
		return nil, nil, nil
	}

	now := time.Now().UTC()
	ip := clientIP(r)
	userAgent := r.UserAgent()
	var session *SessionRecord
	var token string
	var setCookie *http.Cookie

	if cookie, err := r.Cookie(sessionCookieName); err == nil && cookie.Value != "" {
		token = cookie.Value
		session = findSessionByToken(token)
	}

	if session == nil {
		var err error
		token, err = newSecureToken()
		if err != nil {
			return nil, nil, err
		}
		salt, err := newSecureSalt()
		if err != nil {
			return nil, nil, err
		}
		session = &SessionRecord{
			Id:        store.NewId(newRandomID("sess")),
			CreatedAt: now,
			TokenSalt: salt,
			TokenHash: hashSessionToken(auditConfig.SessionGlobalSalt, salt, token),
		}
		setCookie = sessionCookie(token)
	}

	session.UpdatedAt = now
	session.IP = ip
	session.UserAgent = userAgent
	item := session
	if err := sessionStore.Put(context.Background(), &item); err != nil {
		return nil, nil, err
	}

	return session, setCookie, nil
}

func findSessionByToken(token string) *SessionRecord {
	if sessionStore == nil || token == "" {
		return nil
	}

	sessions, err := sessionStore.List(context.Background())
	if err != nil {
		log.Printf("Failed to list sessions: %v", err)
		return nil
	}

	for _, stored := range sessions {
		if stored == nil || *stored == nil {
			continue
		}

		session := *stored
		if session.TokenSalt == "" || session.TokenHash == "" {
			continue
		}

		candidateHash := hashSessionToken(auditConfig.SessionGlobalSalt, session.TokenSalt, token)
		if subtle.ConstantTimeCompare([]byte(candidateHash), []byte(session.TokenHash)) == 1 {
			return session
		}
	}

	return nil
}

func sessionCookie(token string) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  time.Now().UTC().Add(365 * 24 * time.Hour),
		SameSite: http.SameSiteLaxMode,
		HttpOnly: true,
	}
}

func recordRegistration(client *Client, playerID string) {
	if registrationStore == nil || client == nil {
		return
	}

	now := time.Now().UTC()
	record := &RegistrationRecord{
		Id:           store.NewId(newRandomID("registration")),
		SessionID:    client.sessionID,
		PlayerID:     playerID,
		Nick:         client.username,
		IP:           client.ip,
		UserAgent:    client.userAgent,
		RegisteredAt: now,
	}
	item := record
	if err := registrationStore.Put(context.Background(), &item); err != nil {
		log.Printf("Failed to record registration audit: %v", err)
	}

	updateSessionNick(client.sessionID, client.username)
}

func recordChatMessage(client *Client, text string) {
	if chatMessageStore == nil || client == nil {
		return
	}

	record := &ChatMessageRecord{
		Id:        store.NewId(newRandomID("chat")),
		SessionID: client.sessionID,
		PlayerID:  client.ID,
		Nick:      client.username,
		Text:      text,
		IP:        client.ip,
		UserAgent: client.userAgent,
		SentAt:    time.Now().UTC(),
	}
	item := record
	if err := chatMessageStore.Put(context.Background(), &item); err != nil {
		log.Printf("Failed to record chat message audit: %v", err)
	}
}

func recordSignMessage(client *Client, block Block) {
	if signMessageStore == nil || client == nil || block.BlockType != "sign" || block.Text == "" {
		return
	}

	record := &SignMessageRecord{
		Id:        store.NewId(newRandomID("sign")),
		SessionID: client.sessionID,
		PlayerID:  client.ID,
		Nick:      client.username,
		X:         block.X,
		Y:         block.Y,
		Z:         block.Z,
		Text:      block.Text,
		IP:        client.ip,
		UserAgent: client.userAgent,
		CreatedAt: time.Now().UTC(),
	}
	item := record
	if err := signMessageStore.Put(context.Background(), &item); err != nil {
		log.Printf("Failed to record sign message audit: %v", err)
	}
}

func updateSessionNick(sessionID string, nick string) {
	if sessionStore == nil || sessionID == "" {
		return
	}

	stored, err := sessionStore.Get(context.Background(), sessionID)
	if err != nil || stored == nil || *stored == nil {
		return
	}

	session := *stored
	session.Nick = nick
	session.UpdatedAt = time.Now().UTC()
	item := session
	if err := sessionStore.Put(context.Background(), &item); err != nil {
		log.Printf("Failed to update session nick: %v", err)
	}
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if ip := strings.TrimSpace(parts[0]); ip != "" {
			return ip
		}
	}

	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func newRandomID(prefix string) string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return prefix + "_" + strings.ReplaceAll(time.Now().UTC().Format(time.RFC3339Nano), ":", "")
	}
	return prefix + "_" + hex.EncodeToString(bytes)
}

func newSecureToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func newSecureSalt() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func hashSessionToken(globalSalt string, tokenSalt string, token string) string {
	sum := sha256.Sum256([]byte(globalSalt + ":" + tokenSalt + ":" + token))
	return hex.EncodeToString(sum[:])
}
