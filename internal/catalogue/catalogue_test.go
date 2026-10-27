package catalogue

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const oneDrink = `[{"name":"Example","stockcode":"001","standardDrinks":2,"prices":{"bottle":6,"pack":20},"units":{"pack":4},"extra":"raw"}]`

func defaultRequest() Request {
	var req Request
	_ = json.Unmarshal([]byte(`{"filterOptions":{"type":"all","pack":"bottle","includePromo":false,"search":"","sortBy":"ratio","order":"asc"},"pageNum":"1","pageSize":"20"}`), &req)
	return req
}
func serverCatalogue(t *testing.T, handler http.HandlerFunc, opts Options) *Catalogue {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	opts.Client = server.Client()
	opts.FeedURL = func(category string) string { return server.URL + "/" + category }
	opts.TimestampURL = server.URL + "/timestamp"
	return New("not-used/for-feeds", opts)
}
func jsonValue(t *testing.T, v any) any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var out any
	if err = json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}
func TestJavaScriptGoldenFixtures(t *testing.T) {
	for _, path := range []string{"testdata/golden.json", "testdata/unicode-golden.json"} {
		t.Run(path, func(t *testing.T) { testJavaScriptGoldenFixtures(t, path) })
	}
}
func testJavaScriptGoldenFixtures(t *testing.T, path string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var golden struct {
		Feeds map[string]json.RawMessage
		Cases []struct {
			Name     string
			Request  Request
			Expected []json.RawMessage
		}
	}
	if err = json.Unmarshal(data, &golden); err != nil {
		t.Fatal(err)
	}
	c := serverCatalogue(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(golden.Feeds[strings.TrimPrefix(r.URL.Path, "/")])
	}, Options{})
	for _, tc := range golden.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			actual, err := c.Query(context.Background(), tc.Request)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(jsonValue(t, actual), jsonValue(t, tc.Expected)) {
				t.Fatalf("got %s\nwant %s", mustJSON(actual), mustJSON(tc.Expected))
			}
		})
	}
}
func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }
func TestCoalescedColdStartAndImmutableResults(t *testing.T) {
	var requests atomic.Int64
	c := serverCatalogue(t, func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		time.Sleep(15 * time.Millisecond)
		fmt.Fprint(w, oneDrink)
	}, Options{})
	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results, err := c.Query(context.Background(), defaultRequest())
			if err != nil || len(results) != 6 {
				t.Errorf("query %d %v", len(results), err)
				return
			}
			results[0][0] = 'x'
		}()
	}
	wg.Wait()
	if requests.Load() != 6 {
		t.Fatalf("cold start made %d requests", requests.Load())
	}
	first, err := c.Details(context.Background(), []string{"001", "001"})
	if err != nil || len(first) != 6 {
		t.Fatalf("%d %v", len(first), err)
	}
	for _, raw := range first {
		var fields map[string]any
		_ = json.Unmarshal(raw, &fields)
		if fields["standardDrinks"] != float64(2) || fields["price"] != nil || fields["extra"] != "raw" {
			t.Fatal(fields)
		}
	}
	first[0][0] = 'x'
	second, _ := c.Details(context.Background(), []string{"001"})
	if !json.Valid(second[0]) {
		t.Fatal("caller mutated cache")
	}
	pack := defaultRequest()
	pack.Filters.Pack = "pack"
	_, _ = c.Query(context.Background(), pack)
	results, _ := c.Query(context.Background(), defaultRequest())
	var fields map[string]any
	_ = json.Unmarshal(results[0], &fields)
	if fields["standardDrinks"] != float64(2) {
		t.Fatal("pack query mutated cache")
	}
}
func TestAtomicRefreshLastGoodAndRecovery(t *testing.T) {
	var mode atomic.Int64
	c := serverCatalogue(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/beer" {
			switch mode.Load() {
			case 1:
				w.WriteHeader(503)
				return
			case 2:
				fmt.Fprint(w, `{"bad":"shape"}`)
				return
			case 3:
				fmt.Fprint(w, `[{"name":5}]`)
				return
			case 4:
				fmt.Fprint(w, `null`)
				return
			}
		}
		data := oneDrink
		if mode.Load() != 0 {
			data = strings.ReplaceAll(data, "Example", "Replacement")
		}
		fmt.Fprint(w, data)
	}, Options{CatalogueTTL: time.Nanosecond})
	before, err := c.Query(context.Background(), defaultRequest())
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range []int64{1, 2, 3, 4} {
		mode.Store(m)
		got, err := c.Query(context.Background(), defaultRequest())
		if err != nil || !reflect.DeepEqual(got, before) {
			t.Fatalf("refresh %d discarded last-good snapshot: %v", m, err)
		}
	}
	mode.Store(5)
	got, err := c.Query(context.Background(), defaultRequest())
	if err != nil || reflect.DeepEqual(got, before) {
		t.Fatalf("did not recover: %v", err)
	}
}
func TestFeedFailureBoundsAndCancellation(t *testing.T) {
	tests := []struct {
		name    string
		handler http.HandlerFunc
		opts    Options
	}{
		{"status", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, Options{}},
		{"invalid-json", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `[`) }, Options{}},
		{"oversize", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, strings.Repeat(" ", MaxFeedBytes+1)) }, Options{}},
		{"timeout", func(w http.ResponseWriter, r *http.Request) {
			select {
			case <-r.Context().Done():
			case <-time.After(time.Second):
			}
		}, Options{RefreshTimeout: 10 * time.Millisecond}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c := serverCatalogue(t, tc.handler, tc.opts)
			if _, err := c.Query(context.Background(), defaultRequest()); err == nil {
				t.Fatal("accepted invalid upstream")
			}
		})
	}
	entered := make(chan struct{}, 6)
	release := make(chan struct{})
	c := serverCatalogue(t, func(w http.ResponseWriter, r *http.Request) {
		entered <- struct{}{}
		<-release
		fmt.Fprint(w, oneDrink)
	}, Options{})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := c.Query(ctx, defaultRequest()); done <- err }()
	<-entered
	cancel()
	if err := <-done; err != context.Canceled {
		t.Fatal(err)
	}
	close(release)
	if _, err := c.Query(context.Background(), defaultRequest()); err != nil {
		t.Fatal("first caller cancellation poisoned shared refresh", err)
	}
}
func TestTimestampCacheLastGoodAndSourceSeparation(t *testing.T) {
	var count atomic.Int64
	var bad atomic.Bool
	c := serverCatalogue(t, func(w http.ResponseWriter, r *http.Request) {
		count.Add(1)
		if bad.Load() {
			fmt.Fprint(w, `{"commit":{}}`)
			return
		}
		fmt.Fprint(w, `{"commit":{"commit":{"author":{"date":"2026-10-27T01:02:03Z"}}}}`)
	}, Options{TimestampTTL: time.Nanosecond})
	for i := 0; i < 2; i++ {
		date, err := c.Timestamp(context.Background())
		if err != nil || date != "2026-10-27T01:02:03Z" {
			t.Fatalf("%s %v", date, err)
		}
		bad.Store(true)
	}
	if count.Load() != 2 {
		t.Fatal(count.Load())
	}
	prod := New("example/timestamp-only", Options{})
	if got := prod.options.FeedURL("beer"); got != FeedBase+"beer.json" {
		t.Fatal(got)
	}
	if prod.options.TimestampURL != "https://api.github.com/repos/example/timestamp-only/branches/master" {
		t.Fatal(prod.options.TimestampURL)
	}
	var hits atomic.Int64
	cached := serverCatalogue(t, func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		fmt.Fprint(w, `{"commit":{"commit":{"author":{"date":"2026-10-27T01:02:03Z"}}}}`)
	}, Options{})
	for i := 0; i < 2; i++ {
		if _, err := cached.Timestamp(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if hits.Load() != 1 {
		t.Fatal(hits.Load())
	}
}
func TestRequestValidation(t *testing.T) {
	for _, value := range []string{`0`, `-1`, `1.5`, `""`, `null`, `true`, `[1]`, `"NaN"`, `9007199254740992`, `"Infinity"`, `"1_0"`, `"0x1p0"`, `"0x10"`, `"0b10"`, `"0o10"`, `"1e"`, `"1e+"`, `"1 0"`} {
		var page Page
		if json.Unmarshal([]byte(value), &page) == nil {
			t.Fatalf("accepted %s", value)
		}
	}
	for _, value := range []string{`1`, `"2"`, `" 3 "`, `1e2`, `" 1e0 "`, `"+1"`, `"01"`, `"1."`, `".1e1"`, `"1E+1"`, `"10e-1"`, `"9007199254740991"`} {
		var page Page
		if err := json.Unmarshal([]byte(value), &page); err != nil {
			t.Fatalf("rejected %s: %v", value, err)
		}
	}
	req := defaultRequest()
	req.Filters.Type = "not-a-category"
	if req.Valid() {
		t.Fatal("invalid type accepted")
	}
}
