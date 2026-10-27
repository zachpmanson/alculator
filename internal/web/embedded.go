//go:build frontend

package web

import (
	"embed"
	"io/fs"
)

// The frontend tag deliberately requires a real Vite build. Generated files are
// never committed; ordinary Go tests can run before Node/pnpm have been installed.
//
//go:embed dist
var built embed.FS

func Assets() (fs.FS, error) { return fs.Sub(built, "dist") }
