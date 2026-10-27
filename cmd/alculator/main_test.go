package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/zachpmanson/alculator/internal/reportstore"
)

func emptyEnv(string) string { return "" }
func TestImportWithoutPasswordAndReplay(t *testing.T) {
	path := filepath.Join(t.TempDir(), "reports.sqlite")
	input := `{"version":1,"next_id":42,"reports":[{"id":7,"product_code":"00012","is_resolved":false,"timestamp":1700000000123,"blacklisted":null}]}`
	for i := 0; i < 2; i++ {
		var out bytes.Buffer
		err := run(context.Background(), []string{"import", "-db", path}, strings.NewReader(input), &out, func(string) string { t.Fatal("import must not read runtime secrets"); return "" })
		if err != nil {
			t.Fatal(err)
		}
		expected := `{"inserted":1,"next_id":42,"integrity":"ok"}`
		if i == 1 {
			expected = strings.Replace(expected, `"inserted":1`, `"inserted":0`, 1)
		}
		if strings.TrimSpace(out.String()) != expected {
			t.Fatal(out.String())
		}
	}
	s, err := reportstore.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	rows, err := s.All(context.Background())
	if err != nil || len(rows) != 1 || rows[0].ProductCode != "00012" {
		t.Fatalf("%#v %v", rows, err)
	}
}
func TestFailClosedBeforeDatabaseOpen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "reports.sqlite")
	err := run(context.Background(), []string{"serve", "-db", path}, strings.NewReader(""), &bytes.Buffer{}, emptyEnv)
	if err == nil || !strings.Contains(err.Error(), "REPORT_ADMIN_PASSWORD") {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("serve touched state without password")
	}
}
func TestCLIInvalidAndMalformedInput(t *testing.T) {
	for _, args := range [][]string{nil, {"unknown"}, {"serve", "extra"}, {"import", "-unknown"}, {"serve", "-input", "-"}} {
		if err := run(context.Background(), args, strings.NewReader(""), &bytes.Buffer{}, emptyEnv); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	path := filepath.Join(t.TempDir(), "reports.sqlite")
	if err := run(context.Background(), []string{"import", "-db", path}, strings.NewReader(`{"version":1}`), &bytes.Buffer{}, emptyEnv); err == nil {
		t.Fatal("accepted malformed import")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("malformed import touched state")
	}
}
func TestImportInvalidUnicodeBeforeDatabaseCreation(t *testing.T) {
	for _, code := range []string{"\"\xff\"", `"\ud800"`, `"\udc00"`, `"\ud800\u0041"`, `"\ud800\ud800"`} {
		t.Run(fmt.Sprintf("%q", code), func(t *testing.T) {
			dir := filepath.Join(t.TempDir(), "not-created")
			path := filepath.Join(dir, "reports.sqlite")
			input := `{"version":1,"next_id":2,"reports":[{"id":1,"product_code":` + code + `,"is_resolved":false,"timestamp":1,"blacklisted":null}]}`
			var out bytes.Buffer
			if err := run(context.Background(), []string{"import", "-db", path}, strings.NewReader(input), &out, emptyEnv); err == nil {
				t.Fatal("accepted invalid Unicode")
			}
			if out.Len() != 0 {
				t.Fatal("invalid import produced success output")
			}
			if _, err := os.Stat(dir); !os.IsNotExist(err) {
				t.Fatal("invalid Unicode import touched state directory", err)
			}
		})
	}
}

func TestServeGracefulShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	path := filepath.Join(t.TempDir(), "reports.sqlite")
	done := make(chan error, 1)
	go func() {
		done <- run(ctx, []string{"serve", "-db", path, "-listen", "127.0.0.1:0"}, strings.NewReader(""), &bytes.Buffer{}, func(key string) string {
			if key == "REPORT_ADMIN_PASSWORD" {
				return "synthetic-test-only"
			}
			return ""
		})
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("shutdown hung")
	}
}
