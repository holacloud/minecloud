package network

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"strconv"
	"strings"
)

// handleViewerChunks serves whole chunks for the viewer's near detail, the format the game
// receives (pkg/world/codec.go) inside a small envelope, little endian:
//
//	"MCB1", u16 count, then per chunk (in the order asked): u32 length + its bytes
//
// The world is not touched: a chunk never generated is built for the answer and forgotten.
func handleViewerChunks(w http.ResponseWriter, r *http.Request) {
	if chunkStore == nil {
		http.Error(w, "no store", http.StatusServiceUnavailable)
		return
	}
	parts := strings.Split(r.URL.Query().Get("c"), ",")
	if len(parts) < 2 || len(parts)%2 != 0 || len(parts) > viewerMaxChunks*2 {
		http.Error(w, "bad chunk list", http.StatusBadRequest)
		return
	}
	coords := make([]int, len(parts))
	for i, part := range parts {
		value, err := strconv.Atoi(part)
		if err != nil || !validChunkCoord(value) {
			http.Error(w, "bad chunk list", http.StatusBadRequest)
			return
		}
		coords[i] = value
	}

	var out bytes.Buffer
	out.WriteString("MCB1")
	out.Write(binary.LittleEndian.AppendUint16(nil, uint16(len(coords)/2)))
	for i := 0; i < len(coords); i += 2 {
		data, err := chunkStore.Peek(coords[i], coords[i+1])
		if err != nil {
			log.Printf("viewer chunk %d,%d: %v", coords[i], coords[i+1], err)
			http.Error(w, "chunk unavailable", http.StatusInternalServerError)
			return
		}
		out.Write(binary.LittleEndian.AppendUint32(nil, uint32(len(data))))
		out.Write(data)
	}
	hash := fnv.New64a()
	hash.Write(out.Bytes())
	// The chunk format is already compressed.
	writeViewerBody(w, r, fmt.Sprintf(`"%x"`, hash.Sum64()), "application/octet-stream", false, out.Bytes)
}
