package reportstore

import (
	"context"
	"path/filepath"
	"testing"
)

func TestHealth(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "reports.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Health(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	if err := s.Health(context.Background()); err == nil {
		t.Fatal("closed database reported healthy")
	}
}
