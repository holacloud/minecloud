package network

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"minecloud/pkg/terrain"
	"minecloud/pkg/web"
	"minecloud/pkg/world"
)

// The terrain viewer's read-only endpoints, mounted at /viewer-api/. Nothing here joins the game:
// no websocket client, no player, nothing in a player list, and no way to change the world. What
// goes out is block types and their colours and nothing else: signs' text, chat, storage, players
// and sessions live elsewhere and are never read. As viewer.html, they need no login.
//
//	GET changes?since=V[&limit=N]  chunks changed after version V, oldest first (JSON)
//	GET surface?x0=&z0=&x1=&z1=    the changed columns of the chunks in a rectangle (binary)
//	GET chunks?c=x,z,x,z...        whole chunks, as the game receives them (binary)
//
// The first two read only the index in memory (world.ChangeIndex); chunks reads the store through
// Peek, which never creates anything. See js/viewer/builtBlocks.js for the reader.
const (
	viewerMaxChanges = 4096
	// One side of a surface rectangle, which bounds a response: 1024 chunks of at most 256
	// columns of 5 bytes, about 1.3 MB before compression. The viewer asks for 16.
	viewerMaxRegion = 32
	// Chunks in one chunks request (at most about 2 MB).
	viewerMaxChunks = 16
	// Same coordinate limit as the game's chunkRequest.
	viewerCoordLimit = 1 << 20 / terrain.ChunkSize
	// Requests served at once; more get a 503 and try again later, so the viewer can never
	// take the machine from the game.
	viewerMaxInFlight = 8
	// Below this, compressing costs more than it saves.
	viewerGzipMin = 512
)

// Flags of a palette entry; see tools/viewerPalette.js, which writes them.
const (
	paletteSeeThrough = 1
	paletteFluid      = 2
)

// A fluid's colour carries this bit in the changes list.
const viewerFluidBit = 1 << 24

const viewerUnknownColor = 0x808080

var changeIndex *world.ChangeIndex

var viewerPalette map[string][2]int

var viewerSlots = make(chan struct{}, viewerMaxInFlight)

var viewerGzip = sync.Pool{New: func() any {
	w, _ := gzip.NewWriterLevel(io.Discard, gzip.BestSpeed)
	return w
}}

func loadViewerPalette() error {
	return json.Unmarshal(web.ViewerBlockPalette(), &viewerPalette)
}

// paletteEntry finds a block by name, a state of a block ("oak_door:n:closed") by its own entry or
// else its base name's. A name it does not know is a solid grey block.
func paletteEntry(name string) (color, flags int) {
	entry, ok := viewerPalette[name]
	if !ok {
		base, _, _ := strings.Cut(name, ":")
		if entry, ok = viewerPalette[base]; !ok {
			return viewerUnknownColor, 0
		}
	}
	return entry[0], entry[1]
}

func viewerSkipsBlock(name string) bool {
	_, flags := paletteEntry(name)
	return flags&paletteSeeThrough != 0
}

// startChangeIndex begins finding what players changed, in the background.
func startChangeIndex(store *world.Store) error {
	if err := loadViewerPalette(); err != nil {
		return fmt.Errorf("viewer block palette: %w", err)
	}
	store.SetLegacyPreview(previewLegacyEdits)
	changeIndex = world.NewChangeIndex(store, viewerSkipsBlock, pendingLegacyChunks)
	go changeIndex.Run(make(chan struct{}))
	return nil
}

// ViewerAPI handles /viewer-api/. A visitor gets a session as on any page of the site, but one
// who already has the cookie is not looked up again: SessionMiddleware reads every session and
// writes one back each time, which is no price for a poll every few seconds.
func ViewerAPI() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/viewer-api/changes", handleViewerChanges)
	mux.HandleFunc("/viewer-api/surface", handleViewerSurface)
	mux.HandleFunc("/viewer-api/chunks", handleViewerChunks)
	withSession := SessionMiddleware(mux)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "read-only", http.StatusMethodNotAllowed)
			return
		}
		select {
		case viewerSlots <- struct{}{}:
			defer func() { <-viewerSlots }()
		default:
			w.Header().Set("Retry-After", "1")
			http.Error(w, "busy", http.StatusServiceUnavailable)
			return
		}
		if cookie, err := r.Cookie(sessionCookieName); err == nil && cookie.Value != "" {
			mux.ServeHTTP(w, r)
			return
		}
		withSession.ServeHTTP(w, r)
	})
}

func viewerInt(r *http.Request, name string) (int, bool) {
	value, err := strconv.Atoi(r.URL.Query().Get(name))
	return value, err == nil
}

func validChunkCoord(v int) bool {
	return v > -viewerCoordLimit && v < viewerCoordLimit
}

// writeViewerBody answers with a body and its ETag, or a 304 when the client already holds it.
func writeViewerBody(w http.ResponseWriter, r *http.Request, etag, contentType string, compressible bool, body func() []byte) {
	header := w.Header()
	header.Set("ETag", etag)
	// Keep it, but ask each time: the ETag makes asking cheap.
	header.Set("Cache-Control", "no-cache")
	if compressible {
		header.Set("Vary", "Accept-Encoding")
	}
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	data := body()
	header.Set("Content-Type", contentType)
	if compressible && len(data) >= viewerGzipMin && strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		var out bytes.Buffer
		gz := viewerGzip.Get().(*gzip.Writer)
		gz.Reset(&out)
		gz.Write(data)
		gz.Close()
		viewerGzip.Put(gz)
		data = out.Bytes()
		header.Set("Content-Encoding", "gzip")
	}
	header.Set("Content-Length", strconv.Itoa(len(data)))
	w.Write(data)
}

type viewerChanges struct {
	Epoch    string `json:"epoch"`
	Version  uint32 `json:"version"`
	Next     uint32 `json:"next"`
	More     bool   `json:"more"`
	Scanning bool   `json:"scanning"`
	// [x, z, version, columns, raised count, raised top, raised colour, lowered count, lowered
	// top, lowered colour]; heights are of the top block, colours rgb (see viewerFluidBit).
	Chunks [][10]int `json:"chunks"`
}

func handleViewerChanges(w http.ResponseWriter, r *http.Request) {
	if changeIndex == nil {
		http.Error(w, "no index", http.StatusServiceUnavailable)
		return
	}
	since, err := strconv.ParseUint(r.URL.Query().Get("since"), 10, 32)
	if err != nil {
		http.Error(w, "bad since", http.StatusBadRequest)
		return
	}
	limit := viewerMaxChanges
	if r.URL.Query().Has("limit") {
		value, ok := viewerInt(r, "limit")
		if !ok || value < 1 || value > viewerMaxChanges {
			http.Error(w, "bad limit", http.StatusBadRequest)
			return
		}
		limit = value
	}
	version := changeIndex.Version()
	scanning := changeIndex.Scanning()
	etag := fmt.Sprintf(`W/"%s-%d-%d-%d-%t"`, changeIndex.Epoch(), version, since, limit, scanning)
	writeViewerBody(w, r, etag, "application/json", true, func() []byte {
		chunks, next, more := changeIndex.Changes(uint32(since), limit)
		names := changeIndex.Names()
		response := viewerChanges{Epoch: changeIndex.Epoch(), Version: version, Next: next, More: more, Scanning: scanning, Chunks: make([][10]int, len(chunks))}
		for i, chunk := range chunks {
			response.Chunks[i] = [10]int{
				chunk.X, chunk.Z, int(chunk.Version), len(chunk.Columns),
				chunk.Raised.Count, int(chunk.Raised.Top), summaryColor(names, chunk.Raised),
				chunk.Lowered.Count, int(chunk.Lowered.Top), summaryColor(names, chunk.Lowered),
			}
		}
		data, err := json.Marshal(response)
		if err != nil {
			log.Printf("viewer changes: %v", err)
		}
		return data
	})
}

func summaryColor(names []string, summary world.SurfaceSummary) int {
	if summary.Count == 0 {
		return 0
	}
	color, flags := paletteEntry(names[summary.Block])
	if flags&paletteFluid != 0 {
		color |= viewerFluidBit
	}
	return color
}

func handleViewerSurface(w http.ResponseWriter, r *http.Request) {
	if changeIndex == nil {
		http.Error(w, "no index", http.StatusServiceUnavailable)
		return
	}
	x0, okX0 := viewerInt(r, "x0")
	z0, okZ0 := viewerInt(r, "z0")
	x1, okX1 := viewerInt(r, "x1")
	z1, okZ1 := viewerInt(r, "z1")
	if !okX0 || !okZ0 || !okX1 || !okZ1 || !validChunkCoord(x0) || !validChunkCoord(z0) || !validChunkCoord(x1) || !validChunkCoord(z1) {
		http.Error(w, "bad region", http.StatusBadRequest)
		return
	}
	if x1 < x0 || z1 < z0 || x1-x0 >= viewerMaxRegion || z1-z0 >= viewerMaxRegion {
		http.Error(w, "region too large", http.StatusBadRequest)
		return
	}
	chunks := changeIndex.Region(x0, z0, x1, z1)
	hash := fnv.New64a()
	var scratch [12]byte
	for _, chunk := range chunks {
		binary.LittleEndian.PutUint32(scratch[0:], uint32(int32(chunk.X)))
		binary.LittleEndian.PutUint32(scratch[4:], uint32(int32(chunk.Z)))
		binary.LittleEndian.PutUint32(scratch[8:], chunk.Version)
		hash.Write(scratch[:])
	}
	etag := fmt.Sprintf(`W/"%s-%x"`, changeIndex.Epoch(), hash.Sum64())
	writeViewerBody(w, r, etag, "application/octet-stream", true, func() []byte {
		return encodeSurface(chunks, changeIndex.Names())
	})
}

// encodeSurface writes the surface format, little endian (read by js/viewer/builtOverlay.js):
//
//	"MCS1"                                       magic
//	u16 count, then (u8 len + name, u8 r, g, b, u8 flags) per name
//	u16 chunks, then for each:
//	  int32 x, z; u32 version; u16 columns
//	  per column: u8 lz<<4|lx, int16 y of its top block, u16 index into the names above
func encodeSurface(chunks []*world.ChangedChunk, names []string) []byte {
	local := make(map[uint16]uint16)
	var palette []uint16
	columns := 0
	for _, chunk := range chunks {
		columns += len(chunk.Columns)
		for _, column := range chunk.Columns {
			if _, seen := local[column.Block]; !seen {
				local[column.Block] = uint16(len(palette))
				palette = append(palette, column.Block)
			}
		}
	}

	out := bytes.NewBuffer(make([]byte, 0, 8+len(palette)*32+len(chunks)*14+columns*5))
	out.WriteString("MCS1")
	out.Write(binary.LittleEndian.AppendUint16(nil, uint16(len(palette))))
	for _, id := range palette {
		name := names[id]
		color, flags := paletteEntry(name)
		out.WriteByte(byte(len(name)))
		out.WriteString(name)
		out.Write([]byte{byte(color >> 16), byte(color >> 8), byte(color), byte(flags)})
	}
	out.Write(binary.LittleEndian.AppendUint16(nil, uint16(len(chunks))))
	var row [5]byte
	for _, chunk := range chunks {
		head := binary.LittleEndian.AppendUint32(nil, uint32(int32(chunk.X)))
		head = binary.LittleEndian.AppendUint32(head, uint32(int32(chunk.Z)))
		head = binary.LittleEndian.AppendUint32(head, chunk.Version)
		head = binary.LittleEndian.AppendUint16(head, uint16(len(chunk.Columns)))
		out.Write(head)
		for _, column := range chunk.Columns {
			row[0] = column.Index
			binary.LittleEndian.PutUint16(row[1:], uint16(column.Y))
			binary.LittleEndian.PutUint16(row[3:], local[column.Block])
			out.Write(row[:])
		}
	}
	return out.Bytes()
}
