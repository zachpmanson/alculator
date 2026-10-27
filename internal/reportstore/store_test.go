package reportstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func openTest(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "private", "reports.sqlite")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s, path
}

const syntheticImport = `{"version":1,"next_id":100,"reports":[
 {"id":9,"product_code":"00123","is_resolved":false,"timestamp":1700000000123,"blacklisted":null},
 {"id":2,"product_code":"00123","is_resolved":true,"timestamp":-9223372036854775808,"blacklisted":true},
 {"id":7,"product_code":"00123","is_resolved":true,"timestamp":9223372036854775807,"blacklisted":true},
 {"id":5,"product_code":"  ","is_resolved":true,"timestamp":1700000000123,"blacklisted":false},
 {"id":6,"product_code":"","is_resolved":false,"timestamp":1700000000123,"blacklisted":false}]}`

func TestImportLosslessPersistentAndNeverRewinds(t *testing.T) {
	ctx := context.Background()
	s, path := openTest(t)
	in, err := DecodeImport(strings.NewReader(syntheticImport))
	if err != nil {
		t.Fatal(err)
	}
	for attempt := 0; attempt < 2; attempt++ {
		n, err := s.Import(ctx, in)
		expected := 5
		if attempt == 1 {
			expected = 0
		}
		if err != nil || n != expected {
			t.Fatalf("import %d: %d %v", attempt, n, err)
		}
	}
	all, err := s.All(ctx)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[int64]Report{}
	for _, r := range all {
		byID[r.ID] = r
	}
	for _, r := range in.Reports {
		if !reflect.DeepEqual(byID[r.ID], r) {
			t.Fatalf("record changed: %#v != %#v", byID[r.ID], r)
		}
	}
	active, _ := s.Active(ctx)
	if !reflect.DeepEqual(active, []ActiveReport{{6, ""}, {9, "00123"}}) {
		t.Fatal(active)
	}
	blacklist, _ := s.Blacklist(ctx)
	if !reflect.DeepEqual(blacklist, []string{"00123", "00123"}) {
		t.Fatal(blacklist)
	}
	if next, _ := s.NextID(ctx); next != 100 {
		t.Fatal(next)
	}
	if err := s.Create(ctx, "new", 1700000000123); err != nil {
		t.Fatal(err)
	}
	// Even deleting a high row must not rewind AUTOINCREMENT.
	if _, err := s.db.Exec(`DELETE FROM reports WHERE id=100`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Import(ctx, in); err != nil {
		t.Fatal(err)
	}
	if next, _ := s.NextID(ctx); next != 101 {
		t.Fatal(next)
	}
	if err := s.Integrity(ctx); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if next, _ := reopened.NextID(ctx); next != 101 {
		t.Fatal(next)
	}
	if info, err := os.Stat(path); err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("database permissions: %v %v", info, err)
	}
	var mode string
	if err := reopened.db.QueryRow(`PRAGMA journal_mode`).Scan(&mode); err != nil || mode != "wal" {
		t.Fatalf("journal %q %v", mode, err)
	}
}
func TestConflictRollsBackRecordsAndSequence(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()
	if err := s.Create(ctx, "existing", 1); err != nil {
		t.Fatal(err)
	}
	in := Import{Version: 1, NextID: 100, Reports: []Report{{ID: 50, ProductCode: "new"}, {ID: 1, ProductCode: "conflict"}}}
	if n, err := s.Import(ctx, in); n != 0 || !errors.Is(err, ErrConflict) {
		t.Fatalf("%d %v", n, err)
	}
	all, _ := s.All(ctx)
	if len(all) != 1 || all[0].ProductCode != "existing" {
		t.Fatal(all)
	}
	if next, _ := s.NextID(ctx); next != 2 {
		t.Fatal(next)
	}
}
func TestDecodeRejectsMalformedImports(t *testing.T) {
	var base map[string]any
	if err := json.Unmarshal([]byte(`{"version":1,"next_id":2,"reports":[{"id":1,"product_code":"001","is_resolved":false,"timestamp":1700000000001,"blacklisted":null}]}`), &base); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"id", "product_code", "is_resolved", "timestamp", "blacklisted"} {
		t.Run("missing_"+field, func(t *testing.T) {
			var copy map[string]any
			b, _ := json.Marshal(base)
			_ = json.Unmarshal(b, &copy)
			delete(copy["reports"].([]any)[0].(map[string]any), field)
			b, _ = json.Marshal(copy)
			if _, err := DecodeImport(strings.NewReader(string(b))); err == nil {
				t.Fatal("accepted missing field")
			}
		})
	}
	for _, input := range []string{
		`{}`, `null`, `{"version":1,"next_id":2,"reports":null}`,
		strings.Replace(syntheticImport, `"version":1`, `"version":2`, 1),
		strings.Replace(syntheticImport, `"next_id":100`, `"next_id":9`, 1),
		strings.Replace(syntheticImport, `"next_id":100`, `"next_id":2147483648`, 1),
		strings.Replace(syntheticImport, `"id":9`, `"id":2`, 1),
		strings.Replace(syntheticImport, `"id":9`, `"id":0`, 1),
		strings.Replace(syntheticImport, `"id":9`, `"id":1.5`, 1),
		strings.Replace(syntheticImport, `"timestamp":1700000000123`, `"timestamp":9223372036854775808`, 1),
		strings.Replace(syntheticImport, `"is_resolved":false`, `"is_resolved":null`, 1),
		strings.Replace(syntheticImport, `"product_code":"00123"`, `"product_code":123`, 1),
		strings.Replace(syntheticImport, `"blacklisted":null`, `"blacklisted":0`, 1),
		syntheticImport + ` {}`, strings.Replace(syntheticImport, `"version":1`, `"unknown":1,"version":1`, 1),
	} {
		if _, err := DecodeImport(strings.NewReader(input)); err == nil {
			t.Fatalf("accepted malformed synthetic input: %s", input)
		}
	}
}
func TestImportUnicodeLossless(t *testing.T) {
	input := func(code string) string {
		return `{"version":1,"next_id":2,"reports":[{"id":1,"product_code":` + code + `,"is_resolved":false,"timestamp":1,"blacklisted":null}]}`
	}
	for _, code := range []string{
		"\"\xff\"", `"\ud800"`, `"\udc00"`, `"\ud800\ud800"`, `"\ud800\u0041"`,
		`"\udc00\ud800"`, `"\ud800x"`, `"\ud800\\udc00"`, `"\ud800\n"`,
	} {
		if _, err := DecodeImport(strings.NewReader(input(code))); err == nil {
			t.Fatalf("accepted invalid Unicode %q", code)
		}
	}
	for _, tc := range []struct{ name, code, want string }{
		{"paired", `"\ud83d\ude00"`, "😀"},
		{"pair-boundaries", `"\uD800\uDC00\uDBFF\uDFFF"`, "\U00010000\U0010ffff"},
		{"raw-unicode", `"ΟΣ İ 😀"`, "ΟΣ İ 😀"},
		{"replacement-literal", `"�"`, "�"},
		{"replacement-escaped", `"\ufffd"`, "�"},
		{"escaped-surrogate-text", `"\\ud800"`, `\ud800`},
		{"escaped-quotes", `"\"\\\ud83d\ude00\""`, "\"\\😀\""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			in, err := DecodeImport(strings.NewReader(input(tc.code)))
			if err != nil || len(in.Reports) != 1 || in.Reports[0].ProductCode != tc.want {
				t.Fatalf("decode: %#v %v", in, err)
			}
			s, _ := openTest(t)
			if _, err := s.Import(context.Background(), in); err != nil {
				t.Fatal(err)
			}
			rows, err := s.All(context.Background())
			if err != nil || len(rows) != 1 || rows[0].ProductCode != tc.want {
				t.Fatalf("stored: %#v %v", rows, err)
			}
		})
	}
}

func TestPrivateSQLiteModes(t *testing.T) {
	s, path := openTest(t)
	for _, tc := range []struct {
		path string
		mode os.FileMode
	}{
		{filepath.Dir(path), 0700}, {path, 0600}, {path + "-wal", 0600}, {path + "-shm", 0600},
	} {
		info, err := os.Stat(tc.path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != tc.mode {
			t.Errorf("%s: mode %04o, want %04o", tc.path, info.Mode().Perm(), tc.mode)
		}
	}
	var synchronous int
	if err := s.db.QueryRow(`PRAGMA synchronous`).Scan(&synchronous); err != nil || synchronous != 2 {
		t.Fatalf("synchronous = %d, want FULL (2): %v", synchronous, err)
	}
}

func TestResolveRepeatedAndConcurrentCreation(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := s.Create(ctx, fmt.Sprintf("%03d", i), int64(i)); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if err := s.Resolve(ctx, 1, true); err != nil {
		t.Fatal(err)
	}
	if err := s.Resolve(ctx, 1, false); err != nil {
		t.Fatal(err)
	}
	if err := s.Resolve(ctx, 100, false); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	all, _ := s.All(ctx)
	if len(all) != 30 || !all[0].IsResolved || all[0].Blacklisted == nil || *all[0].Blacklisted {
		t.Fatal(all)
	}
	if next, _ := s.NextID(ctx); next != 31 {
		t.Fatal(next)
	}
}
func TestEmptyImportAndIDExhaustion(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()
	if n, err := s.Import(ctx, Import{Version: 1, NextID: MaxID, Reports: []Report{}}); n != 0 || err != nil {
		t.Fatalf("%d %v", n, err)
	}
	if err := s.Create(ctx, "last", 1); err != nil {
		t.Fatal(err)
	}
	if err := s.Create(ctx, "overflow", 1); err == nil {
		t.Fatal("created out-of-contract ID")
	}
	rows, _ := s.All(ctx)
	if len(rows) != 1 || rows[0].ID != MaxID {
		t.Fatal(rows)
	}
	if _, err := s.Import(ctx, Import{Version: 1, NextID: 1, Reports: []Report{}}); err != nil {
		t.Fatal(err)
	}
	if next, _ := s.NextID(ctx); next != MaxID+1 {
		t.Fatal(next)
	}
}
