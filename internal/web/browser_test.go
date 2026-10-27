//go:build frontend

package web_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/zachpmanson/alculator/internal/catalogue"
	"github.com/zachpmanson/alculator/internal/httpapi"
	"github.com/zachpmanson/alculator/internal/reportstore"
	"github.com/zachpmanson/alculator/internal/web"
)

// Entirely synthetic, loopback-only catalogue plus disposable SQLite; production
// feed URLs and live state are never used by this test or the browser.
func TestBrowser(t *testing.T) {
	if os.Getenv("ALCULATOR_BROWSER_TEST") != "1" {
		t.Skip("run make test-browser with Chromium available")
	}
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/timestamp" {
			fmt.Fprint(w, `{"commit":{"commit":{"author":{"date":"2026-01-01T00:00:00Z"}}}}`)
			return
		}
		drinks := make([]map[string]any, 0)
		category := r.URL.Path[1:]
		if category == "beer" || category == "cider" {
			n := 25
			if category == "cider" {
				n = 1
			}
			for i := 1; i <= n; i++ {
				drinks = append(drinks, map[string]any{
					"name": fmt.Sprintf("Fixture %s %02d", category, i), "stockcode": fmt.Sprintf("fixture-%s-%02d", category, i),
					"standardDrinks": 2, "units": map[string]int{"pack": 4, "case": 12},
					"prices":     map[string]int{"bottle": i * 2, "pack": i * 6, "case": i * 12, "promobottle": i * 3, "promopack": i * 8, "promocase": i * 16},
					"percentage": "5%",
				})
			}
		}
		_ = json.NewEncoder(w).Encode(drinks)
	}))
	defer feed.Close()
	store, err := reportstore.Open(filepath.Join(t.TempDir(), "reports.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	// Seed a duplicate to cover resolving every pending ID for one product.
	for _, code := range []string{"fixture-beer-01", "fixture-beer-01", "fixture-beer-02"} {
		if err := store.Create(context.Background(), code, 1); err != nil {
			t.Fatal(err)
		}
	}
	drinks := catalogue.New("unused", catalogue.Options{
		Client: feed.Client(), FeedURL: func(category string) string { return feed.URL + "/" + category }, TimestampURL: feed.URL + "/timestamp",
	})
	api, err := httpapi.New(store, drinks, "synthetic-browser-password")
	if err != nil {
		t.Fatal(err)
	}
	assets, err := web.Assets()
	if err != nil {
		t.Fatal(err)
	}
	handler, err := web.New(api, assets, store.Health)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(handler)
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", "../../tests/browser.mjs")
	cmd.Env = append(os.Environ(), "FIXTURE_URL="+server.URL)
	output, err := cmd.CombinedOutput()
	t.Log(string(output))
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Integrity(context.Background()); err != nil {
		t.Fatal(err)
	}
	pending, err := store.Active(context.Background())
	if err != nil || len(pending) != 0 {
		t.Fatalf("pending=%v err=%v", pending, err)
	}
	blacklist, err := store.Blacklist(context.Background())
	if err != nil || len(blacklist) != 1 || blacklist[0] != "fixture-beer-02" {
		t.Fatalf("blacklist=%v err=%v", blacklist, err)
	}
}
