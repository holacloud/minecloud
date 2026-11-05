package network

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"minecloud/pkg/terrain"
	"minecloud/pkg/world"
)

// A store and a running index in a temp dir, for the handlers to read.
func setupViewer(t *testing.T) *world.Store {
	t.Helper()
	t.Chdir(t.TempDir())
	previousStore, previousIndex := chunkStore, changeIndex
	store, err := world.Open("chunks", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := startViewerIndexForTest(t, store); err != nil {
		t.Fatal(err)
	}
	chunkStore = store
	t.Cleanup(func() {
		chunkStore, changeIndex = previousStore, previousIndex
	})
	return store
}

func startViewerIndexForTest(t *testing.T, store *world.Store) error {
	t.Helper()
	if err := loadViewerPalette(); err != nil {
		return err
	}
	changeIndex = world.NewChangeIndex(store, viewerSkipsBlock, nil)
	index := changeIndex
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		index.Run(stop)
		close(done)
	}()
	t.Cleanup(func() {
		close(stop)
		<-done
	})
	for index.Scanning() {
		time.Sleep(time.Millisecond)
	}
	return nil
}

func viewerGet(t *testing.T, target string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, target, nil)
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	// With a cookie, as the viewer has after loading its page.
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "visitor"})
	recorder := httptest.NewRecorder()
	ViewerAPI().ServeHTTP(recorder, request)
	return recorder
}

func viewerChangesAt(t *testing.T, target string) viewerChanges {
	t.Helper()
	recorder := viewerGet(t, target, nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("%s: %d %s", target, recorder.Code, recorder.Body.String())
	}
	var changes viewerChanges
	if err := json.Unmarshal(recorder.Body.Bytes(), &changes); err != nil {
		t.Fatal(err)
	}
	return changes
}

func TestViewerRejectsBadInput(t *testing.T) {
	setupViewer(t)
	limit := viewerCoordLimit
	for _, target := range []string{
		"/viewer-api/changes",
		"/viewer-api/changes?since=abc",
		"/viewer-api/changes?since=-1",
		"/viewer-api/changes?since=99999999999",
		"/viewer-api/changes?since=0&limit=0",
		"/viewer-api/changes?since=0&limit=4097",
		"/viewer-api/changes?since=0&limit=x",
		"/viewer-api/surface",
		"/viewer-api/surface?x0=0&z0=0&x1=0",
		"/viewer-api/surface?x0=a&z0=0&x1=0&z1=0",
		"/viewer-api/surface?x0=1&z0=0&x1=0&z1=0",
		"/viewer-api/surface?x0=0&z0=1&x1=0&z1=0",
		"/viewer-api/surface?x0=0&z0=0&x1=32&z1=0",
		"/viewer-api/surface?x0=0&z0=0&x1=0&z1=32",
		fmt.Sprintf("/viewer-api/surface?x0=%d&z0=0&x1=%d&z1=0", limit, limit),
		fmt.Sprintf("/viewer-api/surface?x0=0&z0=%d&x1=0&z1=%d", -limit, -limit),
		"/viewer-api/surface?x0=99999999999999999999&z0=0&x1=0&z1=0",
	} {
		if code := viewerGet(t, target, nil).Code; code != http.StatusBadRequest {
			t.Errorf("%s: %d", target, code)
		}
	}
}

func TestViewerIsReadOnly(t *testing.T) {
	setupViewer(t)
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch} {
		recorder := httptest.NewRecorder()
		ViewerAPI().ServeHTTP(recorder, httptest.NewRequest(method, "/viewer-api/changes?since=0", nil))
		if recorder.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s: %d", method, recorder.Code)
		}
	}
}

func TestViewerChangesList(t *testing.T) {
	store := setupViewer(t)

	empty := viewerChangesAt(t, "/viewer-api/changes?since=0")
	if len(empty.Chunks) != 0 || empty.Version != 0 || empty.Epoch == "" {
		t.Fatalf("empty world: %+v", empty)
	}

	// Merely read chunks are not changes.
	if _, err := store.Encoded(1, 1); err != nil {
		t.Fatal(err)
	}
	for x := 32; x < 36; x++ {
		store.SetBlock(x, 120, 48, "gold_block")
	}
	store.SetBlock(36, 110, 48, "water")
	changeIndex.Flush()
	changes := viewerChangesAt(t, "/viewer-api/changes?since=0")
	if len(changes.Chunks) != 1 {
		t.Fatalf("chunks: %+v", changes.Chunks)
	}
	row := changes.Chunks[0]
	if row[0] != 2 || row[1] != 3 || row[3] != 5 || row[4] != 5 || row[5] != 120 {
		t.Fatalf("row = %v", row)
	}
	gold, _ := paletteEntry("gold_block")
	if row[6] != gold {
		t.Fatalf("colour %x, want %x", row[6], gold)
	}

	// Nothing new since then.
	if later := viewerChangesAt(t, fmt.Sprintf("/viewer-api/changes?since=%d", changes.Version)); len(later.Chunks) != 0 || later.Version != changes.Version {
		t.Fatalf("later = %+v", later)
	}
}

func TestViewerChangesBounded(t *testing.T) {
	store := setupViewer(t)
	for x := range 5 {
		store.SetBlock(x*terrain.ChunkSize, 150, 0, "stone")
	}
	changeIndex.Flush()
	page := viewerChangesAt(t, "/viewer-api/changes?since=0&limit=2")
	if len(page.Chunks) != 2 || !page.More {
		t.Fatalf("page = %+v", page)
	}
	seen := len(page.Chunks)
	for page.More {
		page = viewerChangesAt(t, fmt.Sprintf("/viewer-api/changes?since=%d&limit=2", page.Next))
		seen += len(page.Chunks)
	}
	if seen != 5 {
		t.Fatalf("%d chunks seen", seen)
	}
}

// The surface format, as js/viewer/builtOverlay.js reads it.
func decodeSurfaceForTest(t *testing.T, data []byte) (names []string, chunks map[[2]int][][3]int) {
	t.Helper()
	r := bytes.NewReader(data)
	magic := make([]byte, 4)
	io.ReadFull(r, magic)
	if string(magic) != "MCS1" {
		t.Fatalf("magic %q", magic)
	}
	var count uint16
	binary.Read(r, binary.LittleEndian, &count)
	for range count {
		size, _ := r.ReadByte()
		entry := make([]byte, int(size)+4)
		io.ReadFull(r, entry)
		names = append(names, string(entry[:size]))
	}
	binary.Read(r, binary.LittleEndian, &count)
	chunks = map[[2]int][][3]int{}
	for range count {
		var head struct {
			X, Z    int32
			Version uint32
			Columns uint16
		}
		binary.Read(r, binary.LittleEndian, &head)
		for range head.Columns {
			var column struct {
				Index uint8
				Y     int16
				Block uint16
			}
			binary.Read(r, binary.LittleEndian, &column)
			key := [2]int{int(head.X), int(head.Z)}
			chunks[key] = append(chunks[key], [3]int{int(column.Index), int(column.Y), int(column.Block)})
		}
	}
	if r.Len() != 0 {
		t.Fatalf("%d bytes left over", r.Len())
	}
	return names, chunks
}

func TestViewerSurface(t *testing.T) {
	store := setupViewer(t)
	store.SetBlock(-1, 130, -1, "marble")
	store.SetBlock(16, 131, 0, "brick")
	store.SetBlock(500, 131, 500, "brick")
	changeIndex.Flush()

	recorder := viewerGet(t, "/viewer-api/surface?x0=-1&z0=-1&x1=1&z1=1", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("%d %s", recorder.Code, recorder.Body.String())
	}
	names, chunks := decodeSurfaceForTest(t, recorder.Body.Bytes())
	if len(chunks) != 2 {
		t.Fatalf("chunks = %v (far chunk out of the region)", chunks)
	}
	column := chunks[[2]int{-1, -1}][0]
	if column[0] != 15<<4|15 || column[1] != 130 || names[column[2]] != "marble" {
		t.Fatalf("column = %v in %v", column, names)
	}
	if column := chunks[[2]int{1, 0}][0]; column[0] != 0 || names[column[2]] != "brick" {
		t.Fatalf("column = %v", column)
	}

	// A region with nothing in it is small and valid.
	if recorder := viewerGet(t, "/viewer-api/surface?x0=100&z0=100&x1=131&z1=131", nil); recorder.Code != http.StatusOK || recorder.Body.Len() > 16 {
		t.Fatalf("empty region: %d, %d bytes", recorder.Code, recorder.Body.Len())
	}
}

func TestViewerETag(t *testing.T) {
	store := setupViewer(t)
	store.SetBlock(5, 140, 5, "stone")
	changeIndex.Flush()

	for _, target := range []string{"/viewer-api/changes?since=0", "/viewer-api/surface?x0=0&z0=0&x1=15&z1=15"} {
		first := viewerGet(t, target, nil)
		etag := first.Header().Get("ETag")
		if first.Code != http.StatusOK || etag == "" || first.Header().Get("Cache-Control") != "no-cache" {
			t.Fatalf("%s: %d, etag %q", target, first.Code, etag)
		}
		if again := viewerGet(t, target, map[string]string{"If-None-Match": etag}); again.Code != http.StatusNotModified || again.Body.Len() != 0 {
			t.Fatalf("%s revalidated: %d, %d bytes", target, again.Code, again.Body.Len())
		}
	}

	etag := viewerGet(t, "/viewer-api/surface?x0=0&z0=0&x1=15&z1=15", nil).Header().Get("ETag")
	store.SetBlock(5, 141, 5, "stone")
	changeIndex.Flush()
	if after := viewerGet(t, "/viewer-api/surface?x0=0&z0=0&x1=15&z1=15", map[string]string{"If-None-Match": etag}); after.Code != http.StatusOK {
		t.Fatalf("after an edit: %d", after.Code)
	}
	// An edit elsewhere leaves this region's ETag alone.
	etag = viewerGet(t, "/viewer-api/surface?x0=0&z0=0&x1=15&z1=15", nil).Header().Get("ETag")
	store.SetBlock(5000, 141, 5, "stone")
	changeIndex.Flush()
	if after := viewerGet(t, "/viewer-api/surface?x0=0&z0=0&x1=15&z1=15", map[string]string{"If-None-Match": etag}); after.Code != http.StatusNotModified {
		t.Fatalf("after an edit elsewhere: %d", after.Code)
	}
}

func TestViewerCompresses(t *testing.T) {
	store := setupViewer(t)
	for x := range 16 {
		for z := range 16 {
			store.SetBlock(x, 150, z, "stone_bricks")
		}
	}
	changeIndex.Flush()
	target := "/viewer-api/surface?x0=0&z0=0&x1=0&z1=0"
	plain := viewerGet(t, target, nil)
	packed := viewerGet(t, target, map[string]string{"Accept-Encoding": "gzip"})
	if packed.Header().Get("Content-Encoding") != "gzip" || packed.Body.Len() >= plain.Body.Len() {
		t.Fatalf("gzip %q: %d bytes, plain %d", packed.Header().Get("Content-Encoding"), packed.Body.Len(), plain.Body.Len())
	}
	reader, err := gzip.NewReader(packed.Body)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(reader)
	if err != nil || !bytes.Equal(data, plain.Body.Bytes()) {
		t.Fatalf("does not unpack to the same: %v", err)
	}
}

func TestViewerRefusesWhenBusy(t *testing.T) {
	setupViewer(t)
	for range viewerMaxInFlight {
		viewerSlots <- struct{}{}
	}
	defer func() {
		for range viewerMaxInFlight {
			<-viewerSlots
		}
	}()
	recorder := viewerGet(t, "/viewer-api/changes?since=0", nil)
	if recorder.Code != http.StatusServiceUnavailable || recorder.Header().Get("Retry-After") == "" {
		t.Fatalf("%d, Retry-After %q", recorder.Code, recorder.Header().Get("Retry-After"))
	}
}

func TestViewerSessionLikeThePage(t *testing.T) {
	setupViewer(t)
	previous, previousConfig := sessionStore, auditConfig
	t.Cleanup(func() { sessionStore, auditConfig = previous, previousConfig })
	ConfigureAudit(AuditConfig{SessionGlobalSalt: "test"})
	if err := initializeAuditStores(); err != nil {
		t.Fatal(err)
	}

	// A new visitor gets a session, as on any page.
	recorder := httptest.NewRecorder()
	ViewerAPI().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/viewer-api/changes?since=0", nil))
	if recorder.Code != http.StatusOK || len(recorder.Result().Cookies()) != 1 {
		t.Fatalf("no cookie: %d, cookies %v", recorder.Code, recorder.Result().Cookies())
	}
	count := func() int {
		sessions, err := sessionStore.List(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		return len(sessions)
	}
	if got := count(); got != 1 {
		t.Fatalf("%d sessions after a new visitor", got)
	}

	// One who has the cookie is not looked up or written again by a poll.
	for range 3 {
		if recorder := viewerGet(t, "/viewer-api/changes?since=0", nil); recorder.Code != http.StatusOK || len(recorder.Result().Cookies()) != 0 {
			t.Fatalf("with cookie: %d, cookies %v", recorder.Code, recorder.Result().Cookies())
		}
	}
	if got := count(); got != 1 {
		t.Fatalf("%d sessions after polling", got)
	}
}

func TestViewerExposesNoPlayerData(t *testing.T) {
	store := setupViewer(t)
	const secret = "SECRET-SIGN-TEXT"
	ConfigureCreative(secret)
	defer ConfigureCreative("")
	stateMu.Lock()
	previous := gameState.Blocks
	gameState.Blocks = map[string]Block{"3,150,3": {X: 3, Y: 150, Z: 3, BlockType: "sign", Text: secret}}
	stateMu.Unlock()
	defer func() {
		stateMu.Lock()
		gameState.Blocks = previous
		stateMu.Unlock()
	}()
	store.SetBlock(3, 150, 3, "sign")
	changeIndex.Flush()

	for _, target := range []string{"/viewer-api/changes?since=0", "/viewer-api/surface?x0=0&z0=0&x1=0&z1=0"} {
		recorder := viewerGet(t, target, nil)
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s: %d", target, recorder.Code)
		}
		body := recorder.Body.String()
		if strings.Contains(body, secret) {
			t.Fatalf("%s leaks the text", target)
		}
		for _, field := range []string{"nick", "username", "player", "session", "Text", "chat", "storage"} {
			if strings.Contains(strings.ToLower(body), strings.ToLower(field)) {
				t.Errorf("%s mentions %q", target, field)
			}
		}
		if len(recorder.Header().Values("Set-Cookie")) != 0 {
			t.Errorf("%s sets a cookie for a known visitor", target)
		}
	}
}

func TestViewerDoesNotTouchTheWorldOrThePlayers(t *testing.T) {
	store := setupViewer(t)
	viewerGet(t, "/viewer-api/changes?since=0", nil)
	viewerGet(t, "/viewer-api/surface?x0=-16&z0=-16&x1=15&z1=15", nil)
	if err := store.Flush(); err != nil {
		t.Fatal(err)
	}
	if version := changeIndex.Version(); version != 0 {
		t.Fatalf("version %d after reading", version)
	}
	if files := viewerStoredFiles(t); files != 0 {
		t.Fatalf("%d chunk files after reading", files)
	}
}

func viewerStoredFiles(t *testing.T) int {
	t.Helper()
	entries, err := os.ReadDir("chunks")
	if err != nil {
		t.Fatal(err)
	}
	return len(entries)
}

func TestViewerPaletteKnowsTheGeneratedWorld(t *testing.T) {
	if err := loadViewerPalette(); err != nil {
		t.Fatal(err)
	}
	if viewerSkipsBlock("stone") || viewerSkipsBlock("water") || viewerSkipsBlock("leaves") || !viewerSkipsBlock("tall_grass") || !viewerSkipsBlock("torch") {
		t.Fatal("wrong see-through blocks")
	}
	seen := map[string]bool{}
	for x := -40; x < 40; x += 7 {
		for z := -40; z < 40; z += 7 {
			for _, name := range terrain.Generate(x, z).Palette {
				seen[name] = true
			}
		}
	}
	for name := range seen {
		if name == "air" {
			continue
		}
		if _, ok := viewerPalette[name]; !ok {
			t.Errorf("%s is not in pkg/web/viewer_block_palette.json (node tools/viewerPalette.js)", name)
		}
	}
	// A state finds its base; what nobody knows is solid grey.
	if color, flags := paletteEntry("no_such_block:n"); color != viewerUnknownColor || flags != 0 {
		t.Errorf("unknown block: %x %d", color, flags)
	}
}

// Readers, edits and the game's own chunk reads at once, under -race.
func TestViewerUnderLoad(t *testing.T) {
	store := setupViewer(t)
	handler := ViewerAPI()
	var wg sync.WaitGroup
	stop := make(chan struct{})
	for worker := range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; ; i++ {
				select {
				case <-stop:
					return
				default:
				}
				store.SetBlock(worker*16+i%16, 100+i%100, i%16, "stone")
				store.Encoded(worker, 0)
				if i%50 == 0 {
					store.Flush()
				}
			}
		}()
	}
	for worker := range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; ; i++ {
				select {
				case <-stop:
					return
				default:
				}
				target := "/viewer-api/changes?since=0"
				if (i+worker)%2 == 0 {
					target = "/viewer-api/surface?x0=0&z0=0&x1=15&z1=15"
				}
				request := httptest.NewRequest(http.MethodGet, target, nil)
				request.Header.Set("Accept-Encoding", "gzip")
				request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "visitor"})
				recorder := httptest.NewRecorder()
				handler.ServeHTTP(recorder, request)
				if recorder.Code != http.StatusOK && recorder.Code != http.StatusServiceUnavailable {
					t.Errorf("%s: %d", target, recorder.Code)
					return
				}
			}
		}()
	}
	time.Sleep(300 * time.Millisecond)
	close(stop)
	wg.Wait()
	changeIndex.Flush()
	if changes := viewerChangesAt(t, "/viewer-api/changes?since=0"); len(changes.Chunks) != 4 {
		t.Fatalf("%d chunks", len(changes.Chunks))
	}
}

// A world with thousands of changed chunks, for the numbers in the report.
func benchViewerWorld(b *testing.B, chunks int) {
	b.Helper()
	b.Chdir(b.TempDir())
	store, err := world.Open("chunks", nil)
	if err != nil {
		b.Fatal(err)
	}
	if err := loadViewerPalette(); err != nil {
		b.Fatal(err)
	}
	chunkStore = store
	changeIndex = world.NewChangeIndex(store, viewerSkipsBlock, nil)
	side := 1
	for side*side < chunks {
		side++
	}
	names := []string{"stone_bricks", "limestone", "concrete", "dark_oak_planks", "glass", "slate"}
	for i := range chunks {
		chunkX, chunkZ := i%side, i/side
		// A building's walls and roof over most of the chunk.
		for lx := range 14 {
			for lz := range 14 {
				name := names[(chunkX/4+chunkZ/4+lx/7)%len(names)]
				store.SetBlock(chunkX*16+lx, 60+(chunkX+chunkZ)%20, chunkZ*16+lz, name)
			}
		}
		changeIndex.Flush()
	}
	b.ResetTimer()
}

func benchViewerRequest(b *testing.B, target string, headers map[string]string) {
	b.Helper()
	handler := ViewerAPI()
	var bytesOut int
	for b.Loop() {
		request := httptest.NewRequest(http.MethodGet, target, nil)
		request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "visitor"})
		for key, value := range headers {
			request.Header.Set(key, value)
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code >= 400 {
			b.Fatalf("%d", recorder.Code)
		}
		bytesOut = recorder.Body.Len()
	}
	b.ReportMetric(float64(bytesOut), "bytes/response")
}

func BenchmarkViewerChangesFull5000(b *testing.B) {
	benchViewerWorld(b, 5000)
	benchViewerRequest(b, "/viewer-api/changes?since=0", map[string]string{"Accept-Encoding": "gzip"})
}

func BenchmarkViewerChangesPoll5000(b *testing.B) {
	benchViewerWorld(b, 5000)
	benchViewerRequest(b, fmt.Sprintf("/viewer-api/changes?since=%d", changeIndex.Version()), map[string]string{"Accept-Encoding": "gzip"})
}

func BenchmarkViewerSurfacePage5000(b *testing.B) {
	benchViewerWorld(b, 5000)
	benchViewerRequest(b, "/viewer-api/surface?x0=16&z0=16&x1=31&z1=31", map[string]string{"Accept-Encoding": "gzip"})
}

func BenchmarkViewerSurfaceRevalidate5000(b *testing.B) {
	benchViewerWorld(b, 5000)
	etag := func() string {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/viewer-api/surface?x0=16&z0=16&x1=31&z1=31", nil)
		request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "visitor"})
		ViewerAPI().ServeHTTP(recorder, request)
		return recorder.Header().Get("ETag")
	}()
	benchViewerRequest(b, "/viewer-api/surface?x0=16&z0=16&x1=31&z1=31", map[string]string{"If-None-Match": etag})
}
