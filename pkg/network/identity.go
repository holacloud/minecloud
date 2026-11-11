package network

// Player identity (PLAN_PARCELAS.md, phase 1).
//
// A player is a record of its own in data/players, with a stable id ("plr_" and 32 hex digits). The
// browser's session cookie (audit.go) is what says who is playing: the first connection of a session
// creates a player and writes its id into the session record (SessionRecord.PlayerID), and every later
// connection with that cookie is that player. Sessions from before players existed get one the same
// way, on their next connection. What the page sends (its random playerId, its name) never decides
// who someone is: a name is only shown.
//
// Recovery code: four groups, three words and a number, like PATO-ROJO-4821-LUNA, made only when the
// player first asks to see it (a player who never looked has no code anybody could guess). The words
// come from recoveryWords (256 words, 8 bits each) and the number has four digits, so a code is
// 3*8 + log2(10^4) ~ 37.3 bits: 1.7e11 codes. It is kept twice, neither in the clear:
//   - CodeHash: HMAC-SHA256 keyed with the server's SessionGlobalSalt over a salt of its own and the
//     code. This is what a recovery compares, in constant time.
//   - CodeSealed: the code encrypted (AES-256-GCM, key derived from SessionGlobalSalt, bound to the
//     player's id), so its owner can see it again from the pause menu. With 37 bits a stolen hash and
//     salt can be brute-forced offline anyway, so the sealed copy gives away nothing the hash does not;
//     both need the server's secret.
// A code is sent only to a connection of its own player, when it asks. It is never logged (readPump
// hides identityRecover like creativeAuth) and never written anywhere but in those two forms.
//
// Recovering ("I already have a code") links the asking browser's session to the code's player, with
// one atomic write of the session record (StoreDisk writes a temp file and renames it), so it holds
// across a restart. The player the session leaves behind is removed if no other session is that player
// and it holds nothing (playerHolds: no plot): its code would only be one more
// to guess. The inventory lives in each browser and does not travel.
//
// Guessing: each attempt is checked against three limits before the code is even looked at.
//   - Per session: 3 failures free, then a wait of 1 min doubling to at most 1 h.
//   - Per IP (clientIP, which trusts X-Forwarded-For like the rest of the server): 6 free, same waits.
//   - The whole server: at most 30 failures a minute, whatever their IPs or cookies. A flood can make
//     everybody wait a minute, but cannot guess faster than ~43,000 codes a day: with a thousand live
//     codes, years on average for one hit.
// Limits live in memory; a restart forgets them (a restart is not something a guesser controls).

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/holacloud/store"
)

type PlayerRecord struct {
	*store.Id
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	// The last name it played with: shown only, never a permission.
	Nick          string     `json:"nick,omitempty"`
	CodeSalt      string     `json:"codeSalt,omitempty"`
	CodeHash      string     `json:"codeHash,omitempty"`
	CodeSealed    string     `json:"codeSealed,omitempty"`
	CodeCreatedAt *time.Time `json:"codeCreatedAt,omitempty"`
}

// What happened to identities, for the audit: never a code.
type IdentityEventRecord struct {
	*store.Id
	Kind         string    `json:"kind"`
	SessionID    string    `json:"sessionId,omitempty"`
	PlayerID     string    `json:"playerId,omitempty"`
	FromPlayerID string    `json:"fromPlayerId,omitempty"`
	IP           string    `json:"ip,omitempty"`
	UserAgent    string    `json:"userAgent,omitempty"`
	At           time.Time `json:"at"`
}

const (
	identityEventCreated     = "created"
	identityEventCodeMade    = "codeCreated"
	identityEventCodeRenewed = "codeRegenerated"
	identityEventRecovered   = "recovered"
	identityEventFailed      = "recoveryFailed"
	identityEventLimited     = "recoveryLimited"
	identityEventAbandoned   = "abandonedRemoved"
)

var (
	playerStore        *store.StoreDisk[*PlayerRecord]
	identityEventStore *store.StoreDisk[*IdentityEventRecord]

	// Every read-modify-write of a session or a player record goes under identityMu, so a request
	// refreshing a session's UpdatedAt never writes back the player it had before a recovery.
	identityMu sync.Mutex
	// One recovery at a time: the limits are checked and counted with nobody in between.
	recoveryMu sync.Mutex

	recoverySessionLimiter = newAttemptLimiter(3, time.Minute, time.Hour, time.Hour)
	recoveryIPLimiter      = newAttemptLimiter(6, time.Minute, time.Hour, time.Hour)
	recoveryGlobalLimiter  = newWindowLimiter(30, time.Minute)
	// Making new codes writes to disk: a handful in a row, then a wait.
	regenerateLimiter = newAttemptLimiter(5, 30*time.Second, 10*time.Minute, 10*time.Minute)

	// playerHolds says whether a player owns anything (a plot, claims.go), which keeps an abandoned
	// player from being removed.
	playerHolds = func(playerID string) bool { return claims.holds(playerID) }

	errIdentityUnavailable = errors.New("identity unavailable")
)

func initializeIdentityStores() error {
	var err error
	playerStore, err = store.NewStoreDisk[*PlayerRecord]("data/players")
	if err != nil {
		return err
	}
	identityEventStore, err = store.NewStoreDisk[*IdentityEventRecord]("data/identity-events")
	return err
}

// --- Players and sessions ---

func newPlayerID() string {
	return newRandomID("plr")
}

func getPlayer(playerID string) *PlayerRecord {
	if playerStore == nil || playerID == "" {
		return nil
	}
	stored, err := playerStore.Get(context.Background(), playerID)
	if err != nil || stored == nil || *stored == nil {
		return nil
	}
	return *stored
}

func putPlayer(player *PlayerRecord) error {
	item := player
	return playerStore.Put(context.Background(), &item)
}

func getSession(sessionID string) *SessionRecord {
	if sessionStore == nil || sessionID == "" {
		return nil
	}
	stored, err := sessionStore.Get(context.Background(), sessionID)
	if err != nil || stored == nil || *stored == nil {
		return nil
	}
	return *stored
}

func putSession(session *SessionRecord) error {
	item := session
	return sessionStore.Put(context.Background(), &item)
}

// ensurePlayerForSession returns the player of a session, making one if the session has none yet (or
// its player is gone).
func ensurePlayerForSession(sessionID, ip, userAgent string) (string, error) {
	if playerStore == nil || sessionStore == nil || sessionID == "" {
		return "", errIdentityUnavailable
	}
	identityMu.Lock()
	defer identityMu.Unlock()

	session := getSession(sessionID)
	if session == nil {
		return "", fmt.Errorf("session %s not found", sessionID)
	}
	if session.PlayerID != "" && getPlayer(session.PlayerID) != nil {
		return session.PlayerID, nil
	}

	now := time.Now().UTC()
	player := &PlayerRecord{Id: store.NewId(newPlayerID()), CreatedAt: now, UpdatedAt: now, Nick: session.Nick}
	// The player first: a crash in between leaves a player nobody is, never a session pointing nowhere.
	if err := putPlayer(player); err != nil {
		return "", err
	}
	session.PlayerID = player.GetId()
	if err := putSession(session); err != nil {
		return "", err
	}
	recordIdentityEvent(identityEventCreated, sessionID, player.GetId(), "", ip, userAgent)
	return player.GetId(), nil
}

// playerForSession is the session's player, "" if it has none.
func playerForSession(sessionID string) string {
	identityMu.Lock()
	defer identityMu.Unlock()
	if session := getSession(sessionID); session != nil {
		return session.PlayerID
	}
	return ""
}

func updatePlayerNick(playerID, nick string) {
	if playerStore == nil || playerID == "" {
		return
	}
	identityMu.Lock()
	defer identityMu.Unlock()
	player := getPlayer(playerID)
	if player == nil || player.Nick == nick {
		return
	}
	player.Nick = nick
	player.UpdatedAt = time.Now().UTC()
	if err := putPlayer(player); err != nil {
		log.Printf("Failed to update player nick: %v", err)
	}
}

func recordIdentityEvent(kind, sessionID, playerID, fromPlayerID, ip, userAgent string) {
	if identityEventStore == nil {
		return
	}
	record := &IdentityEventRecord{
		Id:           store.NewId(newRandomID("identity")),
		Kind:         kind,
		SessionID:    sessionID,
		PlayerID:     playerID,
		FromPlayerID: fromPlayerID,
		IP:           ip,
		UserAgent:    userAgent,
		At:           time.Now().UTC(),
	}
	item := record
	if err := identityEventStore.Put(context.Background(), &item); err != nil {
		log.Printf("Failed to record identity event %s: %v", kind, err)
	}
}

// --- Codes ---

const recoveryDigits = 10000

func randomBelow(n int) (int, error) {
	// Rejection sampling over 32 random bits, so every value is equally likely.
	// The limit is kept in 64 bits: for a power of two it is 1<<32, which 32 bits cannot hold.
	limit := uint64(1<<32) - uint64(1<<32)%uint64(n)
	var buf [4]byte
	for {
		if _, err := rand.Read(buf[:]); err != nil {
			return 0, err
		}
		if v := uint64(binary.BigEndian.Uint32(buf[:])); v < limit {
			return int(v % uint64(n)), nil
		}
	}
}

// newRecoveryCode makes a code in its canonical form: WORD-WORD-NNNN-WORD.
func newRecoveryCode() (string, error) {
	parts := make([]string, 4)
	for _, i := range []int{0, 1, 3} {
		n, err := randomBelow(len(recoveryWords))
		if err != nil {
			return "", err
		}
		parts[i] = recoveryWords[n]
	}
	n, err := randomBelow(recoveryDigits)
	if err != nil {
		return "", err
	}
	parts[2] = fmt.Sprintf("%04d", n)
	return strings.Join(parts, "-"), nil
}

var recoveryWordSet = func() map[string]bool {
	set := make(map[string]bool, len(recoveryWords))
	for _, word := range recoveryWords {
		set[word] = true
	}
	return set
}()

// Letters a Spanish keyboard may put in by habit, read as the plain ones of the word list.
var recoveryAccents = map[rune]rune{'Á': 'A', 'À': 'A', 'Ä': 'A', 'É': 'E', 'È': 'E', 'Ë': 'E', 'Í': 'I', 'Ì': 'I', 'Ï': 'I',
	'Ó': 'O', 'Ò': 'O', 'Ö': 'O', 'Ú': 'U', 'Ù': 'U', 'Ü': 'U', 'Ñ': 'N'}

// canonicalRecoveryCode reads what a player typed: any case, accents, spaces, dots or dashes between
// the groups. "" if it is not a code at all.
func canonicalRecoveryCode(input string) string {
	if len(input) > 80 {
		return ""
	}
	var plain strings.Builder
	for _, r := range input {
		r = unicode.ToUpper(r)
		if plainLetter, ok := recoveryAccents[r]; ok {
			r = plainLetter
		}
		plain.WriteRune(r)
	}
	groups := strings.FieldsFunc(plain.String(), func(r rune) bool {
		return !(r >= 'A' && r <= 'Z' || r >= '0' && r <= '9')
	})
	if len(groups) != 4 {
		return ""
	}
	for i, group := range groups {
		if i == 2 {
			if len(group) != 4 || strings.Trim(group, "0123456789") != "" {
				return ""
			}
			continue
		}
		if !recoveryWordSet[group] {
			return ""
		}
	}
	return strings.Join(groups, "-")
}

func hashRecoveryCode(salt, canonical string) string {
	mac := hmac.New(sha256.New, []byte("minecloud-recovery-code:"+auditConfig.SessionGlobalSalt))
	mac.Write([]byte(salt + ":" + canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

func recoverySealer() (cipher.AEAD, error) {
	key := sha256.Sum256([]byte("minecloud-recovery-seal:" + auditConfig.SessionGlobalSalt))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func sealRecoveryCode(playerID, code string) (string, error) {
	aead, err := recoverySealer()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := aead.Seal(nonce, nonce, []byte(code), []byte(playerID))
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func openRecoveryCode(playerID, sealed string) (string, error) {
	aead, err := recoverySealer()
	if err != nil {
		return "", err
	}
	data, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil || len(data) < aead.NonceSize() {
		return "", errors.New("malformed sealed code")
	}
	plain, err := aead.Open(nil, data[:aead.NonceSize()], data[aead.NonceSize():], []byte(playerID))
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// setNewCodeLocked gives the player a fresh code, forgetting the one it had. identityMu is held.
func setNewCodeLocked(player *PlayerRecord) (string, error) {
	code, err := newRecoveryCode()
	if err != nil {
		return "", err
	}
	salt, err := newSecureSalt()
	if err != nil {
		return "", err
	}
	sealed, err := sealRecoveryCode(player.GetId(), code)
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	player.CodeSalt = salt
	player.CodeHash = hashRecoveryCode(salt, code)
	player.CodeSealed = sealed
	player.CodeCreatedAt = &now
	player.UpdatedAt = now
	if err := putPlayer(player); err != nil {
		return "", err
	}
	return code, nil
}

// revealRecoveryCode is the player's code, made now if it has none (or it cannot be read back).
func revealRecoveryCode(playerID string) (code string, made bool, err error) {
	if playerStore == nil {
		return "", false, errIdentityUnavailable
	}
	identityMu.Lock()
	defer identityMu.Unlock()
	player := getPlayer(playerID)
	if player == nil {
		return "", false, errIdentityUnavailable
	}
	if player.CodeSealed != "" && player.CodeHash != "" {
		if code, err := openRecoveryCode(playerID, player.CodeSealed); err == nil && canonicalRecoveryCode(code) == code {
			return code, false, nil
		}
		// Sealed under another secret: the old code cannot be shown, so it is replaced.
		log.Printf("Recovery code of %s could not be read back; making a new one", playerID)
	}
	code, err = setNewCodeLocked(player)
	return code, err == nil, err
}

// regenerateRecoveryCode replaces the player's code: the old one stops working at once.
func regenerateRecoveryCode(playerID string) (string, error) {
	if playerStore == nil {
		return "", errIdentityUnavailable
	}
	identityMu.Lock()
	defer identityMu.Unlock()
	player := getPlayer(playerID)
	if player == nil {
		return "", errIdentityUnavailable
	}
	return setNewCodeLocked(player)
}

// findPlayerByCode is the player whose code this is, "" if none. Every player with a code is compared,
// each in constant time.
func findPlayerByCode(input string) string {
	canonical := canonicalRecoveryCode(input)
	if canonical == "" || playerStore == nil {
		return ""
	}
	players, err := playerStore.List(context.Background())
	if err != nil {
		log.Printf("Failed to list players: %v", err)
		return ""
	}
	found := ""
	for _, stored := range players {
		if stored == nil || *stored == nil {
			continue
		}
		player := *stored
		if player.CodeSalt == "" || player.CodeHash == "" {
			continue
		}
		candidate := hashRecoveryCode(player.CodeSalt, canonical)
		if subtle.ConstantTimeCompare([]byte(candidate), []byte(player.CodeHash)) == 1 && found == "" {
			found = player.GetId()
		}
	}
	return found
}

// linkSessionToPlayer makes the session that player, with one atomic write, and removes the player
// it leaves if nobody else is it and it holds nothing. Returns the player it was.
func linkSessionToPlayer(sessionID, playerID, ip, userAgent string) (string, error) {
	identityMu.Lock()
	defer identityMu.Unlock()

	session := getSession(sessionID)
	if session == nil || getPlayer(playerID) == nil {
		return "", errIdentityUnavailable
	}
	previous := session.PlayerID
	if previous == playerID {
		return previous, nil
	}
	session.PlayerID = playerID
	session.UpdatedAt = time.Now().UTC()
	if err := putSession(session); err != nil {
		return "", err
	}
	recordIdentityEvent(identityEventRecovered, sessionID, playerID, previous, ip, userAgent)

	if previous != "" && !playerHolds(previous) && !playerHasSessionLocked(previous) {
		if err := playerStore.Delete(context.Background(), previous); err != nil {
			log.Printf("Failed to remove abandoned player %s: %v", previous, err)
		} else {
			recordIdentityEvent(identityEventAbandoned, sessionID, previous, "", ip, userAgent)
		}
	}
	return previous, nil
}

func playerHasSessionLocked(playerID string) bool {
	sessions, err := sessionStore.List(context.Background())
	if err != nil {
		// Unsure: keep the player.
		return true
	}
	for _, stored := range sessions {
		if stored != nil && *stored != nil && (*stored).PlayerID == playerID {
			return true
		}
	}
	return false
}

// --- Limits ---

type attemptEntry struct {
	failures     int
	last         time.Time
	blockedUntil time.Time
}

// attemptLimiter lets `free` failures through, then makes each further one wait base, 2*base... up to
// max. A key with no failure for `forget` starts again.
type attemptLimiter struct {
	mu      sync.Mutex
	free    int
	base    time.Duration
	max     time.Duration
	forget  time.Duration
	entries map[string]*attemptEntry
	swept   time.Time
	now     func() time.Time
}

func newAttemptLimiter(free int, base, max, forget time.Duration) *attemptLimiter {
	return &attemptLimiter{free: free, base: base, max: max, forget: forget, entries: map[string]*attemptEntry{}, now: time.Now}
}

// wait is how long the key has to wait before trying again: 0 if it may try now.
func (l *attemptLimiter) wait(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	entry := l.entries[key]
	if entry == nil {
		return 0
	}
	if remaining := entry.blockedUntil.Sub(l.now()); remaining > 0 {
		return remaining
	}
	return 0
}

func (l *attemptLimiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.sweepLocked(now)
	entry := l.entries[key]
	if entry == nil || now.Sub(entry.last) > l.forget {
		entry = &attemptEntry{}
		l.entries[key] = entry
	}
	entry.failures++
	entry.last = now
	if over := entry.failures - l.free; over >= 0 {
		wait := l.max
		if over < 20 && l.base<<over < l.max {
			wait = l.base << over
		}
		entry.blockedUntil = now.Add(wait)
	}
}

func (l *attemptLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, key)
}

// Forgets what is old, once a minute at most, so the map does not grow for ever.
func (l *attemptLimiter) sweepLocked(now time.Time) {
	if now.Sub(l.swept) < time.Minute {
		return
	}
	l.swept = now
	for key, entry := range l.entries {
		if now.Sub(entry.last) > l.forget && !now.Before(entry.blockedUntil) {
			delete(l.entries, key)
		}
	}
}

// windowLimiter allows `limit` failures per window, for everybody together.
type windowLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	start  time.Time
	count  int
	now    func() time.Time
}

func newWindowLimiter(limit int, window time.Duration) *windowLimiter {
	return &windowLimiter{limit: limit, window: window, now: time.Now}
}

func (l *windowLimiter) rollLocked(now time.Time) {
	if now.Sub(l.start) >= l.window {
		l.start = now
		l.count = 0
	}
}

func (l *windowLimiter) wait() time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.rollLocked(now)
	if l.count >= l.limit {
		return l.start.Add(l.window).Sub(now)
	}
	return 0
}

func (l *windowLimiter) fail() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rollLocked(l.now())
	l.count++
}

// --- Messages ---

type recoveryOutcome struct {
	OK         bool   `json:"ok"`
	Error      string `json:"error,omitempty"` // "invalid", "rate", "unavailable"
	RetryAfter int    `json:"retryAfter,omitempty"`
	Same       bool   `json:"same,omitempty"`
	PlayerID   string `json:"playerId,omitempty"`
}

// attemptRecovery is one "I already have a code" from a session at an address.
func attemptRecovery(sessionID, ip, userAgent, input string) recoveryOutcome {
	if sessionID == "" || playerStore == nil || sessionStore == nil {
		return recoveryOutcome{Error: "unavailable"}
	}
	recoveryMu.Lock()
	defer recoveryMu.Unlock()

	sessionKey, ipKey := "session:"+sessionID, "ip:"+ip
	wait := recoverySessionLimiter.wait(sessionKey)
	if w := recoveryIPLimiter.wait(ipKey); w > wait {
		wait = w
	}
	if w := recoveryGlobalLimiter.wait(); w > wait {
		wait = w
	}
	if wait > 0 {
		recordIdentityEvent(identityEventLimited, sessionID, "", "", ip, userAgent)
		return recoveryOutcome{Error: "rate", RetryAfter: int((wait + time.Second - 1) / time.Second)}
	}

	playerID := findPlayerByCode(input)
	if playerID == "" {
		recoverySessionLimiter.fail(sessionKey)
		recoveryIPLimiter.fail(ipKey)
		recoveryGlobalLimiter.fail()
		recordIdentityEvent(identityEventFailed, sessionID, "", "", ip, userAgent)
		return recoveryOutcome{Error: "invalid"}
	}
	recoverySessionLimiter.reset(sessionKey)
	previous, err := linkSessionToPlayer(sessionID, playerID, ip, userAgent)
	if err != nil {
		log.Printf("Failed to link session to player: %v", err)
		return recoveryOutcome{Error: "unavailable"}
	}
	return recoveryOutcome{OK: true, Same: previous == playerID, PlayerID: playerID}
}

func identityPayload(playerID string) map[string]string {
	return map[string]string{"playerId": playerID}
}

func sendToClient(client *Client, data []byte) {
	client.trySend(data)
}

// Every open connection of a session (one per tab) becomes the player the session now is.
func refreshSessionClients(sessionID, playerID string) {
	clientsMu.RLock()
	targets := make([]*Client, 0, 2)
	for client := range clients {
		if client.sessionID == sessionID {
			targets = append(targets, client)
		}
	}
	clientsMu.RUnlock()
	message := createMessage("playerIdentity", identityPayload(playerID))
	for _, client := range targets {
		client.setStablePlayerID(playerID)
		sendToClient(client, message)
		// Which plot is its own changes with it.
		claimsSendTo(client)
	}
}

// attachIdentity gives a new connection its player and tells the page which one it is.
func attachIdentity(client *Client) {
	if client.sessionID == "" {
		return
	}
	playerID, err := ensurePlayerForSession(client.sessionID, client.ip, client.userAgent)
	if err != nil {
		log.Printf("Failed to find the player of a session: %v", err)
		return
	}
	client.setStablePlayerID(playerID)
	sendToClient(client, createMessage("playerIdentity", identityPayload(playerID)))
}

func handleIdentityMessage(client *Client, msg Message) {
	switch msg.Type {
	case "identityCodeShow", "identityCodeRegenerate":
		playerID := client.stablePlayerID()
		if playerID == "" {
			sendToClient(client, createMessage("identityCode", map[string]string{"error": "unavailable"}))
			return
		}
		var code string
		var err error
		regenerated := false
		if msg.Type == "identityCodeShow" {
			var made bool
			code, made, err = revealRecoveryCode(playerID)
			if err == nil && made {
				recordIdentityEvent(identityEventCodeMade, client.sessionID, playerID, "", client.ip, client.userAgent)
			}
		} else {
			key := "player:" + playerID
			if wait := regenerateLimiter.wait(key); wait > 0 {
				sendToClient(client, createMessage("identityCode", map[string]interface{}{"error": "rate", "retryAfter": int((wait + time.Second - 1) / time.Second)}))
				return
			}
			regenerateLimiter.fail(key)
			code, err = regenerateRecoveryCode(playerID)
			regenerated = err == nil
			if regenerated {
				recordIdentityEvent(identityEventCodeRenewed, client.sessionID, playerID, "", client.ip, client.userAgent)
			}
		}
		if err != nil {
			log.Printf("Failed to give a player its recovery code: %v", err)
			sendToClient(client, createMessage("identityCode", map[string]string{"error": "unavailable"}))
			return
		}
		sendToClient(client, createMessage("identityCode", map[string]interface{}{"code": code, "regenerated": regenerated}))

	case "identityRecover":
		var request struct {
			Code string `json:"code"`
		}
		if err := json.Unmarshal(msg.Payload, &request); err != nil {
			return
		}
		outcome := attemptRecovery(client.sessionID, client.ip, client.userAgent, request.Code)
		if outcome.OK {
			refreshSessionClients(client.sessionID, outcome.PlayerID)
			// Before the answer, so the page already knows who it is when it reads it.
			client.setStablePlayerID(outcome.PlayerID)
		}
		sendToClient(client, createMessage("identityRecoverResult", outcome))
	}
}

// Messages whose payload must never reach the log.
func messageIsSecret(msgType string) bool {
	return msgType == "creativeAuth" || msgType == "identityRecover"
}

func init() {
	registerMessage(messageSpec{plot: plotNowhere, handle: handleIdentityMessage}, "identityCodeShow", "identityCodeRegenerate", "identityRecover")
}
