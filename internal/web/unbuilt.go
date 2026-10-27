//go:build !frontend

package web

import (
	"errors"
	"io/fs"
)

func Assets() (fs.FS, error) {
	return nil, errors.New("frontend bundle not embedded; run make build (or build with -tags frontend after pnpm build)")
}
