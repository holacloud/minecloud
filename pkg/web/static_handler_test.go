package web

import (
	"bytes"
	"compress/gzip"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func staticGet(t *testing.T, handler http.Handler, method, target string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, target, nil)
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func staticGunzip(t *testing.T, body []byte) []byte {
	t.Helper()
	reader, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	content, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	return content
}

// A browser that takes gzip gets every text file of the game smaller, and the very same content, with the
// type the plain file server gives it.
func TestTheGameIsServedCompressedAndUnchanged(t *testing.T) {
	handler := StaticHandler()
	gzipHeader := map[string]string{"Accept-Encoding": "gzip, deflate, br"}
	for target, name := range map[string]string{
		"/":                 "index.html",
		"/js/game.js":       "js/game.js",
		"/js/game/crab.js":  "js/game/crab.js",
		"/guide/README.md":  "guide/README.md",
		"/guide-print.html": "guide-print.html",
	} {
		want, err := fs.ReadFile(MustStaticFS(), name)
		if err != nil {
			t.Fatal(err)
		}
		plain := staticGet(t, handler, http.MethodGet, target, nil)
		if plain.Code != http.StatusOK || plain.Header().Get("Content-Encoding") != "" || !bytes.Equal(plain.Body.Bytes(), want) {
			t.Errorf("%s: without gzip it is not served as it is (%d)", target, plain.Code)
		}
		// Twice: the second answer is the kept one.
		for range 2 {
			packed := staticGet(t, handler, http.MethodGet, target, gzipHeader)
			if packed.Code != http.StatusOK || packed.Header().Get("Content-Encoding") != "gzip" {
				t.Fatalf("%s: not gzipped (%d, %q)", target, packed.Code, packed.Header().Get("Content-Encoding"))
			}
			if !bytes.Equal(staticGunzip(t, packed.Body.Bytes()), want) {
				t.Errorf("%s: what comes out of the gzip is not the file", target)
			}
			if packed.Body.Len() >= len(want) {
				t.Errorf("%s: %d bytes gzipped, %d plain", target, packed.Body.Len(), len(want))
			}
			if got, plainType := packed.Header().Get("Content-Type"), plain.Header().Get("Content-Type"); got != plainType {
				t.Errorf("%s: type %q gzipped, %q plain", target, got, plainType)
			}
			if !strings.Contains(packed.Header().Get("Vary"), "Accept-Encoding") {
				t.Errorf("%s: no Vary: Accept-Encoding", target)
			}
		}
	}
}

// Whatever is not a plain GET of a text file goes the old way, and says the same as it did.
func TestWhatIsNotToCompressIsServedAsEver(t *testing.T) {
	handler := StaticHandler()
	old := http.FileServer(http.FS(MustStaticFS()))
	gzipHeader := map[string]string{"Accept-Encoding": "gzip"}
	for name, c := range map[string]struct {
		method, target string
		headers        map[string]string
	}{
		"a missing file":      {http.MethodGet, "/js/nothing.js", gzipHeader},
		"a directory":         {http.MethodGet, "/js/", gzipHeader},
		"index.html by name":  {http.MethodGet, "/index.html", gzipHeader},
		"a path to clean":     {http.MethodGet, "/js/../js/game.js", gzipHeader},
		"a range":             {http.MethodGet, "/js/game.js", map[string]string{"Accept-Encoding": "gzip", "Range": "bytes=0-9"}},
		"gzip refused":        {http.MethodGet, "/js/game.js", map[string]string{"Accept-Encoding": "br, gzip;q=0"}},
		"another method":      {http.MethodPost, "/js/game.js", gzipHeader},
		"only other codings":  {http.MethodGet, "/js/game.js", map[string]string{"Accept-Encoding": "br, xgzip"}},
		"no accepted codings": {http.MethodGet, "/js/game.js", nil},
	} {
		got := staticGet(t, handler, c.method, c.target, c.headers)
		want := staticGet(t, old, c.method, c.target, c.headers)
		if got.Code != want.Code || got.Header().Get("Content-Encoding") != "" || !bytes.Equal(got.Body.Bytes(), want.Body.Bytes()) {
			t.Errorf("%s: %d with encoding %q, the file server says %d", name, got.Code, got.Header().Get("Content-Encoding"), want.Code)
		}
		if got.Header().Get("Location") != want.Header().Get("Location") {
			t.Errorf("%s: goes to %q, the file server to %q", name, got.Header().Get("Location"), want.Header().Get("Location"))
		}
	}

	head := staticGet(t, handler, http.MethodHead, "/js/game.js", gzipHeader)
	if head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Encoding") != "gzip" {
		t.Errorf("HEAD: %d with %d bytes", head.Code, head.Body.Len())
	}
}

// Nothing here lets a browser keep a file: a child must never play yesterday's client on today's server.
func TestNothingIsCached(t *testing.T) {
	answer := staticGet(t, StaticHandler(), http.MethodGet, "/js/game.js", map[string]string{"Accept-Encoding": "gzip"})
	for _, name := range []string{"Cache-Control", "ETag", "Last-Modified", "Expires"} {
		if value := answer.Header().Get(name); value != "" {
			t.Errorf("%s: %s", name, value)
		}
	}
}
