package web

import (
	"embed"
	"io/fs"
)

//go:embed static
var embeddedFiles embed.FS

// Written by tools/viewerPalette.js from the game's block definitions.
//
//go:embed viewer_block_palette.json
var viewerBlockPalette []byte

// ViewerBlockPalette is the JSON object mapping a block name to its [rgb, flags].
func ViewerBlockPalette() []byte {
	return viewerBlockPalette
}

func MustStaticFS() fs.FS {
	staticFS, err := fs.Sub(embeddedFiles, "static")
	if err != nil {
		panic(err)
	}

	return staticFS
}
