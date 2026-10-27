package web

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestRouting(t *testing.T) {
	assets := fstest.MapFS{
		"index.html":        {Data: []byte("<!doctype html><title>synthetic app</title>")},
		"assets/app.js":     {Data: []byte("console.log('synthetic')")},
		"icons/favicon.ico": {Data: []byte("synthetic icon")},
	}
	api := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, `{"error":"Not found"}`, 404) })
	healthErr := error(nil)
	handler, err := New(api, assets, func(ctx context.Context) error {
		if _, ok := ctx.Deadline(); !ok {
			t.Error("health check has no deadline")
		}
		return healthErr
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		method, path string
		status       int
		body         string
	}{
		{"GET", "/", 200, "synthetic app"},
		{"GET", "/reports", 200, "synthetic app"},
		{"GET", "/reports?direct=1", 200, "synthetic app"},
		{"HEAD", "/reports", 200, ""},
		{"GET", "/assets/app.js", 200, "synthetic"},
		{"GET", "/icons/favicon.ico", 200, "synthetic icon"},
		{"GET", "/healthz", 200, "ok"},
		{"HEAD", "/healthz", 200, ""},
		{"POST", "/healthz", 405, "Method not allowed"},
		{"POST", "/", 405, "Method not allowed"},
		{"GET", "/api/unknown", 404, "Not found"},
		{"GET", "/api", 404, "Not found"},
		{"GET", "/unknown", 404, "404"},
		{"GET", "/reports/extra", 404, "404"},
		{"GET", "/reports/", 404, "404"},
		{"GET", "/assets/missing.js", 404, "404"},
		{"GET", "/icons/missing.png", 404, "404"},
		{"GET", "/assets/", 404, "404"},
		{"GET", "/index.html", 404, "404"},
		{"GET", "/assets/../index.html", 404, "404"},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.body) {
				t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
			}
			if got := w.Header().Get("X-Content-Type-Options"); got != "nosniff" {
				t.Fatalf("nosniff header=%q", got)
			}
			if tc.status == http.StatusMethodNotAllowed && w.Header().Get("Allow") != "GET, HEAD" {
				t.Fatalf("Allow header=%q", w.Header().Get("Allow"))
			}
			wantCache := ""
			switch {
			case tc.path == "/healthz":
				wantCache = "no-store"
			case tc.status == 200 && tc.path == "/assets/app.js":
				wantCache = "public, max-age=31536000, immutable"
			case tc.status == 200:
				wantCache = "no-cache"
			}
			if wantCache != "" && w.Header().Get("Cache-Control") != wantCache {
				t.Fatalf("Cache-Control=%q want %q", w.Header().Get("Cache-Control"), wantCache)
			}
			if tc.method == "HEAD" && w.Body.Len() != 0 {
				t.Fatal("HEAD returned a body")
			}
			if tc.status == 404 && strings.Contains(w.Body.String(), "synthetic app") {
				t.Fatal("404 fell back to SPA")
			}
		})
	}
	healthErr = errors.New("private database error")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/healthz", nil))
	if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("missing failure response safety headers", w.Header())
	}
	if w.Code != 503 || strings.Contains(w.Body.String(), "private") {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err := New(api, fstest.MapFS{}, nil); err == nil {
		t.Fatal("accepted missing bundle")
	}
}
