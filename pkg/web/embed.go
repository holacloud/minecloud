package web

import (
	"embed"
	"io/fs"
)

//go:embed static
var embeddedFiles embed.FS

func MustStaticFS() fs.FS {
	staticFS, err := fs.Sub(embeddedFiles, "static")
	if err != nil {
		panic(err)
	}

	return staticFS
}
