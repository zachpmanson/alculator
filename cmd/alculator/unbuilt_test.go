//go:build !frontend

package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUnbuiltServeFailsBeforeOpeningState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "not-created", "reports.sqlite")
	err := run(context.Background(), []string{"serve", "-db", path, "-listen", "127.0.0.1:0"}, strings.NewReader(""), &bytes.Buffer{}, func(string) string { return "synthetic-only" })
	if err == nil || !strings.Contains(err.Error(), "frontend bundle not embedded") {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Dir(path)); !os.IsNotExist(err) {
		t.Fatal("unbuilt serve touched state")
	}
}
