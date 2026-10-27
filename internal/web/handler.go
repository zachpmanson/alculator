// Package web combines the JSON API, a cheap local health check and static UI.
package web

import (
	"context"
	"errors"
	"io/fs"
	"net/http"
	"strings"
	"time"
)

// New only falls back to index.html for the two application routes. API errors,
// unknown paths, directories and missing assets must never become SPA HTML.
func New(api http.Handler, assets fs.FS, health func(context.Context) error) (http.Handler, error) {
	index, err := fs.ReadFile(assets, "index.html")
	if err != nil || len(index) == 0 {
		return nil, errors.New("frontend bundle missing; run make build")
	}
	files := http.FileServer(http.FS(assets))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			api.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/healthz" {
			w.Header().Set("Cache-Control", "no-store")
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				w.Header().Set("Allow", "GET, HEAD")
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), time.Second)
			defer cancel()
			if health(ctx) != nil {
				http.Error(w, "Unavailable", http.StatusServiceUnavailable)
				return
			}
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			if r.Method != http.MethodHead {
				_, _ = w.Write([]byte("ok\n"))
			}
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path == "/" || r.URL.Path == "/reports" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			if r.Method != http.MethodHead {
				_, _ = w.Write(index)
			}
			return
		}
		// No directory listings, redirects or path-cleaning aliases.
		name := strings.TrimPrefix(r.URL.Path, "/")
		if !fs.ValidPath(name) || name == "index.html" {
			http.NotFound(w, r)
			return
		}
		stat, err := fs.Stat(assets, name)
		if err != nil || !stat.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		files.ServeHTTP(w, r)
	}), nil
}
