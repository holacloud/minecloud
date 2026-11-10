package network

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/holacloud/store"
)

// setupIdentity gives a test fresh stores in a temp dir, a known secret and fresh limits, and puts
// everything back afterwards.
func setupIdentity(t *testing.T) {
	t.Helper()
	t.Chdir(t.TempDir())
	prevSession, prevReg, prevChat, prevSign, prevState := sessionStore, registrationStore, chatMessageStore, signMessageStore, playerStateStore
	prevPlayers, prevEvents, prevConfig, prevHolds := playerStore, identityEventStore, auditConfig, playerHolds
	prevLimits := []any{recoverySessionLimiter, recoveryIPLimiter, recoveryGlobalLimiter, regenerateLimiter}
	t.Cleanup(func() {
		sessionStore, registrationStore, chatMessageStore, signMessageStore, playerStateStore = prevSession, prevReg, prevChat, prevSign, prevState
		playerStore, identityEventStore, auditConfig, playerHolds = prevPlayers, prevEvents, prevConfig, prevHolds
		recoverySessionLimiter = prevLimits[0].(*attemptLimiter)
		recoveryIPLimiter = prevLimits[1].(*attemptLimiter)
		recoveryGlobalLimiter = prevLimits[2].(*windowLimiter)
		regenerateLimiter = prevLimits[3].(*attemptLimiter)
	})
	ConfigureAudit(AuditConfig{SessionGlobalSalt: "identity-test-secret"})
	if err := initializeAuditStores(); err != nil {
		t.Fatal(err)
	}
	recoverySessionLimiter = newAttemptLimiter(3, time.Minute, time.Hour, time.Hour)
	recoveryIPLimiter = newAttemptLimiter(6, time.Minute, time.Hour, time.Hour)
	recoveryGlobalLimiter = newWindowLimiter(30, time.Minute)
	regenerateLimiter = newAttemptLimiter(5, 30*time.Second, 10*time.Minute, 10*time.Minute)
}

// restartIdentity is what a restart does to the identity: new stores on the same files, limits forgotten.
func restartIdentity(t *testing.T) {
	t.Helper()
	if err := initializeAuditStores(); err != nil {
		t.Fatal(err)
	}
}

// newTestSession makes a session like a first visit does, and returns it with its cookie's token.
func newTestSession(t *testing.T) (*SessionRecord, string) {
	t.Helper()
	session, cookie, err := ensureSession(httptest.NewRequest(http.MethodGet, "/", nil))
	if err != nil || session == nil || cookie == nil {
		t.Fatalf("session %v, cookie %v, err %v", session, cookie, err)
	}
	return session, cookie.Value
}

func newTestPlayer(t *testing.T) (sessionID, playerID string) {
	t.Helper()
	session, _ := newTestSession(t)
	playerID, err := ensurePlayerForSession(session.GetId(), "10.0.0.1", "test")
	if err != nil {
		t.Fatal(err)
	}
	return session.GetId(), playerID
}

func countPlayers(t *testing.T) int {
	t.Helper()
	players, err := playerStore.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return len(players)
}

var recoveryCodePattern = regexp.MustCompile(`^[A-Z]{3,6}-[A-Z]{3,6}-[0-9]{4}-[A-Z]{3,6}$`)

func TestRecoveryWords(t *testing.T) {
	if len(recoveryWords) != 256 {
		t.Fatalf("%d words, want 256 (8 bits each)", len(recoveryWords))
	}
	seen := map[string]bool{}
	for _, word := range recoveryWords {
		if !regexp.MustCompile(`^[A-Z]{3,6}$`).MatchString(word) {
			t.Errorf("%q: plain capital letters, 3 to 6 of them", word)
		}
		if seen[word] {
			t.Errorf("%q twice", word)
		}
		seen[word] = true
	}
}

func TestRecoveryCodesAreCanonicalAndVaried(t *testing.T) {
	seen := map[string]bool{}
	for range 300 {
		code, err := newRecoveryCode()
		if err != nil {
			t.Fatal(err)
		}
		if !recoveryCodePattern.MatchString(code) || canonicalRecoveryCode(code) != code {
			t.Fatalf("%q is not a canonical code", code)
		}
		seen[code] = true
	}
	if len(seen) < 299 {
		t.Fatalf("only %d different codes in 300", len(seen))
	}
}

func TestCanonicalRecoveryCode(t *testing.T) {
	cases := map[string]string{
		"PATO-ROJO-4821-LUNA":        "PATO-ROJO-4821-LUNA",
		"pato-rojo-4821-luna":        "PATO-ROJO-4821-LUNA",
		"  Pato Rojo 4821 Luna \n":   "PATO-ROJO-4821-LUNA",
		"pato.rojo_4821--luna":       "PATO-ROJO-4821-LUNA",
		"león-azúcar-0007-búho":      "LEON-AZUCAR-0007-BUHO",
		"PATO-ROJO-482-LUNA":         "",
		"PATO-ROJO-48210-LUNA":       "",
		"PATO-ROJO-LUNA-4821":        "",
		"PATO-XYZZY-4821-LUNA":       "",
		"PATO-ROJO-4821":             "",
		"PATO-ROJO-4821-LUNA-SOL":    "",
		"":                           "",
		strings.Repeat("PATO-", 100): "",
	}
	for input, want := range cases {
		if got := canonicalRecoveryCode(input); got != want {
			t.Errorf("canonicalRecoveryCode(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestPlayerMadeOncePerSessionAndKeptAcrossRestart(t *testing.T) {
	setupIdentity(t)
	session, token := newTestSession(t)
	first, err := ensurePlayerForSession(session.GetId(), "10.0.0.1", "test")
	if err != nil || !strings.HasPrefix(first, "plr_") {
		t.Fatalf("player %q, err %v", first, err)
	}
	again, _ := ensurePlayerForSession(session.GetId(), "10.0.0.1", "test")
	if again != first || countPlayers(t) != 1 {
		t.Fatalf("a second connection made %q (%d players), want %q", again, countPlayers(t), first)
	}
	code, made, err := revealRecoveryCode(first)
	if err != nil || !made {
		t.Fatalf("first reveal: made %v, err %v", made, err)
	}

	restartIdentity(t)
	found := findSessionByToken(token)
	if found == nil || found.PlayerID != first {
		t.Fatalf("after a restart the cookie is %+v, want player %s", found, first)
	}
	if after, _ := ensurePlayerForSession(found.GetId(), "10.0.0.1", "test"); after != first {
		t.Fatalf("after a restart the session is %q, want %q", after, first)
	}
	shown, made, err := revealRecoveryCode(first)
	if err != nil || made || shown != code {
		t.Fatalf("after a restart the code is %q (made %v, %v), want the same one", shown, made, err)
	}
	if findPlayerByCode(code) != first {
		t.Fatal("after a restart the code finds nobody")
	}
}

func TestOldSessionGetsAPlayer(t *testing.T) {
	setupIdentity(t)
	// A session written before players existed: no playerId in its file.
	old := &SessionRecord{Id: store.NewId("sess_old"), CreatedAt: time.Now().UTC(), TokenSalt: "s", TokenHash: "h"}
	if err := putSession(old); err != nil {
		t.Fatal(err)
	}
	playerID, err := ensurePlayerForSession("sess_old", "", "")
	if err != nil || playerID == "" || getSession("sess_old").PlayerID != playerID {
		t.Fatalf("old session got %q (%v)", playerID, err)
	}
	// And a session whose player file went missing gets a new one, not an error.
	if err := playerStore.Delete(context.Background(), playerID); err != nil {
		t.Fatal(err)
	}
	if again, err := ensurePlayerForSession("sess_old", "", ""); err != nil || again == "" || again == playerID {
		t.Fatalf("lost player replaced by %q (%v)", again, err)
	}
}

func TestRecoveryLinksTheSessionAndRemovesTheEmptyPlayer(t *testing.T) {
	setupIdentity(t)
	sessionA, playerA := newTestPlayer(t)
	sessionB, playerB := newTestPlayer(t)
	code, _, err := revealRecoveryCode(playerA)
	if err != nil {
		t.Fatal(err)
	}

	outcome := attemptRecovery(sessionB, "10.0.0.2", "test", strings.ToLower(strings.ReplaceAll(code, "-", " ")))
	if !outcome.OK || outcome.PlayerID != playerA || outcome.Same {
		t.Fatalf("recovery: %+v", outcome)
	}
	if got := getSession(sessionB).PlayerID; got != playerA {
		t.Fatalf("session B is %q, want %q", got, playerA)
	}
	if getPlayer(playerB) != nil {
		t.Fatal("the empty player B was left behind")
	}
	if getSession(sessionA).PlayerID != playerA || getPlayer(playerA) == nil {
		t.Fatal("player A was touched")
	}

	restartIdentity(t)
	if got := getSession(sessionB).PlayerID; got != playerA {
		t.Fatalf("after a restart session B is %q", got)
	}
	if again := attemptRecovery(sessionB, "10.0.0.2", "test", code); !again.OK || !again.Same {
		t.Fatalf("own code again: %+v", again)
	}
}

func TestRecoveryKeepsAPlayerSomebodyElseIsOrThatHoldsSomething(t *testing.T) {
	setupIdentity(t)
	_, playerA := newTestPlayer(t)
	codeA, _, _ := revealRecoveryCode(playerA)

	// B is also C's player: when B's browser leaves it, C still is it.
	sessionB, playerB := newTestPlayer(t)
	codeB, _, _ := revealRecoveryCode(playerB)
	sessionC, _ := newTestPlayer(t)
	if out := attemptRecovery(sessionC, "10.0.0.3", "", codeB); !out.OK {
		t.Fatalf("C takes B: %+v", out)
	}
	if out := attemptRecovery(sessionB, "10.0.0.2", "", codeA); !out.OK {
		t.Fatalf("B takes A: %+v", out)
	}
	if getPlayer(playerB) == nil {
		t.Fatal("player B was removed while session C is it")
	}

	// A player that holds something (phase 2: a parcel) is never removed.
	playerHolds = func(id string) bool { return id == playerB }
	if out := attemptRecovery(sessionC, "10.0.0.3", "", codeA); !out.OK {
		t.Fatalf("C takes A: %+v", out)
	}
	if getPlayer(playerB) == nil {
		t.Fatal("a player holding something was removed")
	}
}

func TestRecoveryWithAWrongCodeChangesNothing(t *testing.T) {
	setupIdentity(t)
	_, playerA := newTestPlayer(t)
	code, _, _ := revealRecoveryCode(playerA)
	sessionB, playerB := newTestPlayer(t)

	wrong := "PATO-ROJO-0000-LUNA"
	if wrong == code {
		wrong = "PATO-ROJO-0001-LUNA"
	}
	for _, input := range []string{wrong, "nonsense", ""} {
		if out := attemptRecovery(sessionB, "10.0.0.2", "", input); out.OK || out.Error != "invalid" {
			t.Fatalf("%q: %+v", input, out)
		}
	}
	if getSession(sessionB).PlayerID != playerB || getPlayer(playerB) == nil {
		t.Fatal("a failed recovery changed session B")
	}
	// A player that never looked at its code has none to guess.
	if getPlayer(playerB).CodeHash != "" {
		t.Fatal("player B has a code it never asked for")
	}
}

func TestRegeneratingInvalidatesTheOldCode(t *testing.T) {
	setupIdentity(t)
	_, playerA := newTestPlayer(t)
	old, _, _ := revealRecoveryCode(playerA)
	fresh, err := regenerateRecoveryCode(playerA)
	if err != nil || fresh == old || !recoveryCodePattern.MatchString(fresh) {
		t.Fatalf("regenerated %q from %q (%v)", fresh, old, err)
	}
	if findPlayerByCode(old) != "" {
		t.Fatal("the old code still works")
	}
	if findPlayerByCode(fresh) != playerA {
		t.Fatal("the new code does not work")
	}
	if shown, _, _ := revealRecoveryCode(playerA); shown != fresh {
		t.Fatalf("showing the code gives %q, want the new %q", shown, fresh)
	}
}

func TestStoredCodeIsNeitherInTheClearNorReadableWithAnotherSecret(t *testing.T) {
	setupIdentity(t)
	_, playerA := newTestPlayer(t)
	code, _, _ := revealRecoveryCode(playerA)
	assertNoCodeOnDisk(t, code)

	// Another server secret cannot read it back, nor match it: a new code replaces it.
	ConfigureAudit(AuditConfig{SessionGlobalSalt: "another-secret"})
	if findPlayerByCode(code) != "" {
		t.Fatal("the code matched under another secret")
	}
	shown, made, err := revealRecoveryCode(playerA)
	if err != nil || !made || shown == code {
		t.Fatalf("under another secret: %q made %v (%v)", shown, made, err)
	}
}

// assertNoCodeOnDisk fails if any file under data/ has the code, in any case or spacing.
func assertNoCodeOnDisk(t *testing.T, code string) {
	t.Helper()
	needles := []string{code, strings.ToLower(code), strings.ReplaceAll(code, "-", " "), strings.ReplaceAll(code, "-", "")}
	filepath.WalkDir("data", func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		data, _ := os.ReadFile(path)
		for _, needle := range needles {
			if bytes.Contains(bytes.ToUpper(data), bytes.ToUpper([]byte(needle))) {
				t.Errorf("%s holds the code", path)
			}
		}
		return nil
	})
}

func TestAttemptLimiterBacksOff(t *testing.T) {
	now := time.Unix(1000, 0)
	limiter := newAttemptLimiter(3, time.Minute, 10*time.Minute, time.Hour)
	limiter.now = func() time.Time { return now }
	for i := range 3 {
		if w := limiter.wait("k"); w != 0 {
			t.Fatalf("failure %d had to wait %v", i, w)
		}
		limiter.fail("k")
		if i < 2 && limiter.wait("k") != 0 {
			t.Fatalf("blocked after %d failures", i+1)
		}
	}
	for _, want := range []time.Duration{time.Minute, 2 * time.Minute, 4 * time.Minute, 8 * time.Minute, 10 * time.Minute, 10 * time.Minute} {
		if w := limiter.wait("k"); w != want {
			t.Fatalf("wait %v, want %v", w, want)
		}
		now = now.Add(want)
		if w := limiter.wait("k"); w != 0 {
			t.Fatalf("still waiting %v after the wait", w)
		}
		limiter.fail("k")
	}
	if limiter.wait("other") != 0 {
		t.Fatal("one key's failures blocked another")
	}
	// An hour with no failure and it starts again.
	now = now.Add(2 * time.Hour)
	limiter.fail("k")
	if w := limiter.wait("k"); w != 0 {
		t.Fatalf("forgotten failures still count: %v", w)
	}
	limiter.reset("k")
	if len(limiter.entries) > 2 {
		t.Fatalf("%d entries kept", len(limiter.entries))
	}
}

func TestRecoveryIsRateLimitedPerSessionPerIPAndOverall(t *testing.T) {
	setupIdentity(t)
	now := time.Unix(5000, 0)
	clock := func() time.Time { return now }
	recoverySessionLimiter.now, recoveryIPLimiter.now, recoveryGlobalLimiter.now = clock, clock, clock

	_, playerA := newTestPlayer(t)
	code, _, _ := revealRecoveryCode(playerA)
	wrong := "PATO-ROJO-0000-LUNA"
	if wrong == code {
		wrong = "PATO-ROJO-0001-LUNA"
	}

	// Per session: three failures, then even the right code waits.
	sessionB, playerB := newTestPlayer(t)
	for range 3 {
		if out := attemptRecovery(sessionB, "10.0.0.2", "", wrong); out.Error != "invalid" {
			t.Fatalf("%+v", out)
		}
	}
	out := attemptRecovery(sessionB, "10.0.0.2", "", code)
	if out.OK || out.Error != "rate" || out.RetryAfter != 60 {
		t.Fatalf("right code while blocked: %+v", out)
	}
	if getSession(sessionB).PlayerID != playerB {
		t.Fatal("a blocked attempt linked the session")
	}
	now = now.Add(time.Minute)
	if out := attemptRecovery(sessionB, "10.0.0.2", "", code); !out.OK {
		t.Fatalf("after the wait: %+v", out)
	}

	// Per IP: new cookies do not help past six failures from one address.
	now = now.Add(2 * time.Hour)
	for i := range 6 {
		session, _ := newTestPlayer(t)
		if out := attemptRecovery(session, "10.9.9.9", "", wrong); out.Error != "invalid" {
			t.Fatalf("failure %d from the address: %+v", i, out)
		}
	}
	fresh, _ := newTestPlayer(t)
	if out := attemptRecovery(fresh, "10.9.9.9", "", code); out.Error != "rate" {
		t.Fatalf("seventh try from the address: %+v", out)
	}
	if out := attemptRecovery(fresh, "10.9.9.10", "", code); !out.OK {
		t.Fatalf("another address: %+v", out)
	}

	// Overall: thirty failures a minute from anywhere, then everybody waits for the minute to end.
	now = now.Add(2 * time.Hour)
	for i := range 30 {
		session, _ := newTestPlayer(t)
		if out := attemptRecovery(session, fmt.Sprintf("10.1.%d.%d", i/200, i%200), "", wrong); out.Error != "invalid" {
			t.Fatalf("failure %d overall: %+v", i, out)
		}
	}
	other, _ := newTestPlayer(t)
	if out := attemptRecovery(other, "10.2.0.1", "", code); out.Error != "rate" {
		t.Fatalf("after 30 failures in a minute: %+v", out)
	}
	now = now.Add(time.Minute)
	if out := attemptRecovery(other, "10.2.0.1", "", code); !out.OK {
		t.Fatalf("next minute: %+v", out)
	}
}

// A page refreshing its session (every HTTP request does) while the same browser recovers another
// player must never write the old player back.
func TestRecoveryIsNotUndoneByConcurrentRequests(t *testing.T) {
	setupIdentity(t)
	_, playerA := newTestPlayer(t)
	code, _, _ := revealRecoveryCode(playerA)
	sessionB, tokenB := newTestSession(t)
	if _, err := ensurePlayerForSession(sessionB.GetId(), "", ""); err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	stop := make(chan struct{})
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				request := httptest.NewRequest(http.MethodGet, "/", nil)
				request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: tokenB})
				if _, _, err := ensureSession(request); err != nil {
					t.Error(err)
					return
				}
				updateSessionNick(sessionB.GetId(), "Ana")
			}
		}()
	}
	time.Sleep(20 * time.Millisecond)
	if out := attemptRecovery(sessionB.GetId(), "10.0.0.2", "", code); !out.OK {
		t.Fatalf("%+v", out)
	}
	time.Sleep(20 * time.Millisecond)
	close(stop)
	wg.Wait()
	if got := getSession(sessionB.GetId()).PlayerID; got != playerA {
		t.Fatalf("session B ended as %q, want %q", got, playerA)
	}
}

func TestConcurrentFirstConnectionsMakeOnePlayer(t *testing.T) {
	setupIdentity(t)
	session, _ := newTestSession(t)
	var wg sync.WaitGroup
	ids := make([]string, 8)
	for i := range ids {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ids[i], _ = ensurePlayerForSession(session.GetId(), "", "")
		}()
	}
	wg.Wait()
	for _, id := range ids {
		if id != ids[0] || id == "" {
			t.Fatalf("one session became %v", ids)
		}
	}
	if countPlayers(t) != 1 {
		t.Fatalf("%d players for one session", countPlayers(t))
	}
}

// --- The whole thing over real connections: two browsers, two cookie jars ---

type testBrowser struct {
	t    *testing.T
	jar  http.CookieJar
	base string
	conn *websocket.Conn
}

func newTestBrowser(t *testing.T, server *httptest.Server) *testBrowser {
	t.Helper()
	jar, _ := cookiejar.New(nil)
	browser := &testBrowser{t: t, jar: jar, base: server.URL}
	response, err := (&http.Client{Jar: jar}).Get(server.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	return browser
}

func (b *testBrowser) connect() {
	b.t.Helper()
	dialer := websocket.Dialer{Jar: b.jar}
	conn, _, err := dialer.Dial("ws"+strings.TrimPrefix(b.base, "http")+"/ws", nil)
	if err != nil {
		b.t.Fatal(err)
	}
	b.conn = conn
	b.t.Cleanup(func() { conn.Close() })
}

func (b *testBrowser) send(msgType string, payload any) {
	b.t.Helper()
	data, _ := json.Marshal(payload)
	if err := b.conn.WriteJSON(Message{Type: msgType, Payload: data}); err != nil {
		b.t.Fatal(err)
	}
}

// await reads until a message of this type, returning it and everything read on the way.
func (b *testBrowser) await(msgType string) (json.RawMessage, []string) {
	b.t.Helper()
	var seen []string
	b.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		_, data, err := b.conn.ReadMessage()
		if err != nil {
			b.t.Fatalf("waiting for %s: %v (read %v)", msgType, err, seen)
		}
		seen = append(seen, string(data))
		var msg Message
		if json.Unmarshal(data, &msg) == nil && msg.Type == msgType {
			return msg.Payload, seen
		}
	}
}

func TestIdentityOverWebSocketsTwoBrowsers(t *testing.T) {
	setupIdentity(t)
	var logs bytes.Buffer
	var logsMu sync.Mutex
	log.SetOutput(writerFunc(func(p []byte) (int, error) {
		logsMu.Lock()
		defer logsMu.Unlock()
		return logs.Write(p)
	}))
	t.Cleanup(func() { log.SetOutput(os.Stderr) })

	mux := http.NewServeMux()
	mux.Handle("/", SessionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})))
	mux.HandleFunc("/ws", HandleWebSocket)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	ana, beto := newTestBrowser(t, server), newTestBrowser(t, server)
	ana.connect()
	beto.connect()
	var anaIdentity, betoIdentity struct{ PlayerID string }
	payload, _ := ana.await("playerIdentity")
	json.Unmarshal(payload, &anaIdentity)
	payload, _ = beto.await("playerIdentity")
	json.Unmarshal(payload, &betoIdentity)
	if anaIdentity.PlayerID == "" || betoIdentity.PlayerID == "" || anaIdentity.PlayerID == betoIdentity.PlayerID {
		t.Fatalf("identities %q and %q", anaIdentity.PlayerID, betoIdentity.PlayerID)
	}
	// Joining works as before, and the page's own id stays the page's.
	ana.send("playerJoin", map[string]string{"playerId": "player_ana", "username": "Ana"})
	beto.send("playerJoin", map[string]string{"playerId": "player_beto", "username": "Beto"})
	_, betoSaw := beto.await("init")

	// A reconnection of the same browser is the same player.
	ana.conn.Close()
	ana.connect()
	payload, _ = ana.await("playerIdentity")
	var again struct{ PlayerID string }
	json.Unmarshal(payload, &again)
	if again.PlayerID != anaIdentity.PlayerID {
		t.Fatalf("Ana reconnected as %q, was %q", again.PlayerID, anaIdentity.PlayerID)
	}

	// Ana asks for her code; only she gets it.
	ana.send("identityCodeShow", map[string]any{})
	payload, _ = ana.await("identityCode")
	var shown struct{ Code string }
	json.Unmarshal(payload, &shown)
	if !recoveryCodePattern.MatchString(shown.Code) {
		t.Fatalf("Ana's code %q", shown.Code)
	}

	// Beto types a wrong code, then Ana's.
	beto.send("identityRecover", map[string]string{"code": "PATO-ROJO-0000-LUNA"})
	payload, more := beto.await("identityRecoverResult")
	betoSaw = append(betoSaw, more...)
	var outcome recoveryOutcome
	json.Unmarshal(payload, &outcome)
	if outcome.OK && shown.Code != "PATO-ROJO-0000-LUNA" {
		t.Fatalf("a wrong code worked: %+v", outcome)
	}
	beto.send("identityRecover", map[string]string{"code": strings.ToLower(shown.Code)})
	payload, more = beto.await("identityRecoverResult")
	betoSaw = append(betoSaw, more...)
	outcome = recoveryOutcome{}
	json.Unmarshal(payload, &outcome)
	if !outcome.OK || outcome.PlayerID != anaIdentity.PlayerID {
		t.Fatalf("Ana's code from Beto's browser: %+v", outcome)
	}
	identityMessage := false
	for _, message := range more {
		if strings.Contains(message, `"playerIdentity"`) && strings.Contains(message, anaIdentity.PlayerID) {
			identityMessage = true
		}
	}
	if !identityMessage {
		t.Fatalf("Beto's page was not told who it is now: %v", more)
	}
	// Beto's browser never received the code, and nobody's page another player's identity.
	for _, message := range betoSaw {
		if strings.Contains(strings.ToUpper(message), shown.Code) {
			t.Fatalf("Beto's page received Ana's code: %s", message)
		}
		if strings.Contains(message, anaIdentity.PlayerID) && !strings.Contains(message, "playerIdentity") && !strings.Contains(message, "identityRecoverResult") {
			t.Fatalf("Beto's page received Ana's player id in %s", message)
		}
	}

	// Beto's browser stays Ana's player when it comes back.
	beto.conn.Close()
	beto.connect()
	payload, _ = beto.await("playerIdentity")
	json.Unmarshal(payload, &again)
	if again.PlayerID != anaIdentity.PlayerID {
		t.Fatalf("Beto's browser reconnected as %q", again.PlayerID)
	}

	// Ana makes a new code: the old one stops working.
	ana.send("identityCodeRegenerate", map[string]any{})
	payload, _ = ana.await("identityCode")
	var renewed struct {
		Code        string
		Regenerated bool
	}
	json.Unmarshal(payload, &renewed)
	if !renewed.Regenerated || renewed.Code == shown.Code || findPlayerByCode(shown.Code) != "" {
		t.Fatalf("regenerate: %+v", renewed)
	}

	// Registrations know the stable player.
	registrations, _ := registrationStore.List(context.Background())
	stable := 0
	for _, record := range registrations {
		if (*record).StablePlayerID != "" {
			stable++
		}
	}
	if stable != 2 {
		t.Fatalf("%d registrations with a stable player", stable)
	}

	time.Sleep(50 * time.Millisecond)
	logsMu.Lock()
	written := logs.String()
	logsMu.Unlock()
	for _, code := range []string{shown.Code, renewed.Code} {
		if strings.Contains(strings.ToUpper(written), code) {
			t.Fatalf("the log has a code:\n%s", written)
		}
		assertNoCodeOnDisk(t, code)
	}
	if !strings.Contains(written, "identityRecover (payload hidden)") {
		t.Fatalf("recovery messages were not logged as hidden:\n%s", written)
	}
}

type writerFunc func(p []byte) (int, error)

func (f writerFunc) Write(p []byte) (int, error) { return f(p) }
