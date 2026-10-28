// Package world stores the authoritative voxel world on the server: chunks are generated
// once by pkg/terrain, edited by players and persisted, and streamed to clients.
package world

import (
	"bytes"
	"compress/flate"
	"encoding/binary"
	"errors"
	"fmt"
	"io"

	"minecloud/pkg/terrain"
)

// Chunk encoding, used both on disk and on the wire (decoded by js/chunkDecoder.js):
//
//	"MCK1"                 magic
//	int32  chunkX, chunkZ  little endian
//	u8 len + bytes         biome
//	u16 count, then (u8 len + bytes) per name   palette (palette[0] = "air")
//	u16 layers             layers stored from WorldMinY upwards (above them: air)
//	u8 indexWidth          1 or 2 bytes per block
//	deflate (raw)          layers * 16 * 16 palette indices, little endian
const magic = "MCK1"

const layerSize = terrain.ChunkSize * terrain.ChunkSize

// Encode serialises a chunk, trimming empty layers at the top.
func Encode(c *terrain.Chunk) ([]byte, error) {
	layers := 0
	for i := len(c.Blocks) - 1; i >= 0; i-- {
		if c.Blocks[i] != 0 {
			layers = i/layerSize + 1
			break
		}
	}

	var out bytes.Buffer
	out.WriteString(magic)
	binary.Write(&out, binary.LittleEndian, int32(c.X))
	binary.Write(&out, binary.LittleEndian, int32(c.Z))
	if err := writeString(&out, c.Biome); err != nil {
		return nil, err
	}
	binary.Write(&out, binary.LittleEndian, uint16(len(c.Palette)))
	for _, name := range c.Palette {
		if err := writeString(&out, name); err != nil {
			return nil, err
		}
	}
	binary.Write(&out, binary.LittleEndian, uint16(layers))
	width := 1
	if len(c.Palette) > 256 {
		width = 2
	}
	out.WriteByte(byte(width))

	raw := make([]byte, layers*layerSize*width)
	for i, id := range c.Blocks[:layers*layerSize] {
		if width == 1 {
			raw[i] = byte(id)
		} else {
			binary.LittleEndian.PutUint16(raw[i*2:], id)
		}
	}
	w, err := flate.NewWriter(&out, flate.DefaultCompression)
	if err != nil {
		return nil, err
	}
	if _, err := w.Write(raw); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// Decode parses data produced by Encode.
func Decode(data []byte) (*terrain.Chunk, error) {
	r := bytes.NewReader(data)
	head := make([]byte, len(magic))
	if _, err := io.ReadFull(r, head); err != nil || string(head) != magic {
		return nil, errors.New("world: not a chunk")
	}
	var x, z int32
	if err := binary.Read(r, binary.LittleEndian, &x); err != nil {
		return nil, err
	}
	if err := binary.Read(r, binary.LittleEndian, &z); err != nil {
		return nil, err
	}
	c := terrain.NewChunk(int(x), int(z))
	biome, err := readString(r)
	if err != nil {
		return nil, err
	}
	c.Biome = biome

	var count uint16
	if err := binary.Read(r, binary.LittleEndian, &count); err != nil {
		return nil, err
	}
	c.Palette = c.Palette[:0]
	for range count {
		name, err := readString(r)
		if err != nil {
			return nil, err
		}
		c.Palette = append(c.Palette, name)
	}
	if len(c.Palette) == 0 || c.Palette[0] != "air" {
		return nil, errors.New("world: palette must start with air")
	}
	c.PaletteID("air") // rebuild the name index

	var layers uint16
	if err := binary.Read(r, binary.LittleEndian, &layers); err != nil {
		return nil, err
	}
	width, err := r.ReadByte()
	if err != nil {
		return nil, err
	}
	if int(layers) > terrain.WorldHeight || (width != 1 && width != 2) {
		return nil, fmt.Errorf("world: bad chunk layout (%d layers, width %d)", layers, width)
	}
	raw := make([]byte, int(layers)*layerSize*int(width))
	if _, err := io.ReadFull(flate.NewReader(r), raw); err != nil {
		return nil, err
	}
	for i := 0; i < int(layers)*layerSize; i++ {
		if width == 1 {
			c.Blocks[i] = uint16(raw[i])
		} else {
			c.Blocks[i] = binary.LittleEndian.Uint16(raw[i*2:])
		}
		if int(c.Blocks[i]) >= len(c.Palette) {
			return nil, errors.New("world: block index outside palette")
		}
	}
	return c, nil
}

func writeString(w *bytes.Buffer, s string) error {
	if len(s) > 255 {
		return fmt.Errorf("world: name too long: %q", s)
	}
	w.WriteByte(byte(len(s)))
	w.WriteString(s)
	return nil
}

func readString(r *bytes.Reader) (string, error) {
	n, err := r.ReadByte()
	if err != nil {
		return "", err
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r, buf); err != nil {
		return "", err
	}
	return string(buf), nil
}
