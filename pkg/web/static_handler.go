package web

import (
	"bytes"
	"compress/gzip"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"
)

// The game is some hundred scripts and as many guide pages, all text: gzipped they are about a quarter of
// their size, which is most of what a child on a slow connection waits for. Each file is compressed once,
// the first time somebody asks for it, and kept: they are embedded and never change while the server runs.

// What is worth compressing. Everything else (and anything unusual: a range, a directory) is served as ever.
var staticCompressed = map[string]bool{
	".js": true, ".css": true, ".html": true, ".json": true, ".md": true, ".svg": true, ".txt": true,
}

type staticFile struct {
	contentType string
	gzipped     []byte // nil when compressing did not make it smaller
}

type staticHandler struct {
	files fs.FS
	plain http.Handler
	kept  sync.Map // name -> *staticFile, nil for what is not a file to compress
}

// StaticHandler serves the embedded game, gzipped for the browsers that take it.
func StaticHandler() http.Handler {
	return newStaticHandler(MustStaticFS())
}

func newStaticHandler(files fs.FS) http.Handler {
	return &staticHandler{files: files, plain: http.FileServer(http.FS(files))}
}

func (h *staticHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	file := h.fileFor(r)
	if file == nil {
		h.plain.ServeHTTP(w, r)
		return
	}
	header := w.Header()
	header.Set("Content-Type", file.contentType)
	header.Set("Content-Encoding", "gzip")
	header.Set("Content-Length", strconv.Itoa(len(file.gzipped)))
	// The same address answers differently to who does not take gzip.
	header.Add("Vary", "Accept-Encoding")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		w.Write(file.gzipped)
	}
}

// fileFor gives the compressed file this request can be answered with, or nil to serve it the plain way.
func (h *staticHandler) fileFor(r *http.Request) *staticFile {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return nil
	}
	if r.Header.Get("Range") != "" || !acceptsGzip(r.Header.Get("Accept-Encoding")) {
		return nil
	}
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "" {
		name = "index.html"
	} else if r.URL.Path != "/"+name || path.Base(name) == "index.html" {
		// Not written the plain way, or one the file server redirects: it knows what to do.
		return nil
	}
	if !staticCompressed[path.Ext(name)] {
		return nil
	}
	if kept, ok := h.kept.Load(name); ok {
		return kept.(*staticFile)
	}
	file := h.compress(name)
	h.kept.Store(name, file)
	return file
}

func (h *staticHandler) compress(name string) *staticFile {
	content, err := fs.ReadFile(h.files, name)
	if err != nil {
		return nil
	}
	var buffer bytes.Buffer
	writer, _ := gzip.NewWriterLevel(&buffer, gzip.BestCompression)
	writer.Write(content)
	writer.Close()
	if buffer.Len() >= len(content) {
		return nil
	}
	// As the file server says it: by the extension, and by the content when the extension says nothing.
	contentType := mime.TypeByExtension(path.Ext(name))
	if contentType == "" {
		contentType = http.DetectContentType(content)
	}
	return &staticFile{contentType: contentType, gzipped: buffer.Bytes()}
}

func acceptsGzip(header string) bool {
	for _, part := range strings.Split(header, ",") {
		coding, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if strings.TrimSpace(coding) != "gzip" {
			continue
		}
		q := strings.TrimSpace(params)
		return q != "q=0" && q != "q=0.0" && q != "q=0.00" && q != "q=0.000"
	}
	return false
}
