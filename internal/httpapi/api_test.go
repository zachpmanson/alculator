package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/zachpmanson/alculator/internal/catalogue"
	"github.com/zachpmanson/alculator/internal/reportstore"
)

const testPassword = "synthetic-test-only"
const drinkRequest = `{"filterOptions":{"type":"beer","pack":"bottle","includePromo":false,"search":"","sortBy":"ratio","order":"asc"},"pageNum":"1","pageSize":"20"}`

type fakeCatalogue struct {
	requests int
	codes    []string
	err      error
}

func (c *fakeCatalogue) Query(_ context.Context, req catalogue.Request) ([]json.RawMessage, error) {
	c.requests++
	return []json.RawMessage{json.RawMessage(`{"stockcode":"001","price":6,"ratio":3}`)}, c.err
}
func (c *fakeCatalogue) Details(_ context.Context, codes []string) ([]json.RawMessage, error) {
	c.codes = codes
	return []json.RawMessage{json.RawMessage(`{"stockcode":"001","standardDrinks":2,"prices":{"pack":10},"units":{"pack":4}}`)}, c.err
}
func (c *fakeCatalogue) Timestamp(context.Context) (string, error) {
	return "2026-10-27T00:00:00Z", c.err
}
func setup(t *testing.T) (http.Handler, *reportstore.Store, *fakeCatalogue) {
	t.Helper()
	s, err := reportstore.Open(filepath.Join(t.TempDir(), "reports.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	c := &fakeCatalogue{}
	h, err := New(s, c, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	h.(*API).now = func() time.Time { return time.UnixMilli(1700000000123) }
	return h, s, c
}
func request(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func assertStatus(t *testing.T, w *httptest.ResponseRecorder, status int) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status %d want %d: %s", w.Code, status, w.Body.String())
	}
}
func TestPublicReportLifecycle(t *testing.T) {
	h, s, _ := setup(t)
	ctx := context.Background()
	for _, path := range []string{"/api/blacklist", "/api/blacklist/report"} {
		w := request(h, "GET", path, "")
		assertStatus(t, w, 200)
		if strings.TrimSpace(w.Body.String()) != "[]" {
			t.Fatal(w.Body.String())
		}
	}
	for i := 0; i < 2; i++ {
		w := request(h, "POST", "/api/blacklist/report", `{"product_code":"001"}`)
		assertStatus(t, w, 201)
		if w.Body.Len() != 0 {
			t.Fatal(w.Body.String())
		}
	}
	all, err := s.All(ctx)
	if err != nil || len(all) != 2 || all[0].Timestamp != 1700000000123 || all[0].Blacklisted != nil || all[0].IsResolved {
		t.Fatalf("%#v %v", all, err)
	}
	w := request(h, "GET", "/api/blacklist/report", "")
	assertStatus(t, w, 200)
	if strings.TrimSpace(w.Body.String()) != `[{"id":1,"product_code":"001"},{"id":2,"product_code":"001"}]` {
		t.Fatal(w.Body.String())
	}
	for _, id := range []string{"1", "2"} {
		w = request(h, "PATCH", "/api/blacklist/resolve", `{"id":`+id+`,"blacklisted":true,"password":"`+testPassword+`"}`)
		assertStatus(t, w, 200)
		if w.Body.Len() != 0 {
			t.Fatal("nonempty success body")
		}
	}
	w = request(h, "GET", "/api/blacklist", "")
	assertStatus(t, w, 200)
	if strings.TrimSpace(w.Body.String()) != `["001","001"]` {
		t.Fatal(w.Body.String())
	}
	// Repeated resolution preserves the original timestamp and updates the decision.
	w = request(h, "PATCH", "/api/blacklist/resolve", `{"id":1.0,"blacklisted":false,"password":"`+testPassword+`"}`)
	assertStatus(t, w, 200)
	w = request(h, "GET", "/api/blacklist", "")
	if strings.TrimSpace(w.Body.String()) != `["001"]` {
		t.Fatal(w.Body.String())
	}
	all, _ = s.All(ctx)
	if all[0].Timestamp != 1700000000123 {
		t.Fatal(all)
	}
}
func TestAllMethodsAnd404s(t *testing.T) {
	h, _, _ := setup(t)
	for path, allow := range map[string]string{"/api/drinks": "POST", "/api/drinks/timestamp": "GET", "/api/blacklist": "GET", "/api/blacklist/report": "GET, POST", "/api/blacklist/resolve": "PATCH", "/api/reports": "GET"} {
		for _, method := range []string{"DELETE", "HEAD", "OPTIONS", "PUT"} {
			w := request(h, method, path, "")
			assertStatus(t, w, 405)
			if w.Header().Get("Allow") != allow {
				t.Fatal(w.Header())
			}
		}
	}
	for _, path := range []string{"/api/unknown", "/api/drinks/", "/", "/reports", "/missing.js"} {
		w := request(h, "GET", path, "")
		assertStatus(t, w, 404)
		if strings.Contains(w.Body.String(), "html") {
			t.Fatal("SPA fallback outside milestone")
		}
	}
}
func TestRejectInvalidReportBodies(t *testing.T) {
	h, s, _ := setup(t)
	for _, body := range []string{"", `null`, `{}`, `[]`, `{"product_code":null}`, `{"product_code":""}`, `{"product_code":42}`, `{"product_code":"ok"} {}`, `{"product_code":"ok"}garbage`} {
		t.Run(body, func(t *testing.T) { assertStatus(t, request(h, "POST", "/api/blacklist/report", body), 400) })
	}
	all, _ := s.All(context.Background())
	if len(all) != 0 {
		t.Fatal(all)
	}
	assertStatus(t, request(h, "POST", "/api/blacklist/report", `{"product_code":"`+strings.Repeat("a", MaxRequestBytes)+`"}`), 413)
	// Preserve whitespace rather than normalizing product identifiers.
	assertStatus(t, request(h, "POST", "/api/blacklist/report", `{"product_code":" "}`), 201)
}
func TestResolveValidationAndFailClosed(t *testing.T) {
	h, s, _ := setup(t)
	if _, err := New(s, &fakeCatalogue{}, ""); err == nil {
		t.Fatal("empty runtime password accepted")
	}
	for _, id := range []string{`0`, `-1`, `1.5`, `2147483648`, `"1"`, `null`, `true`} {
		body := `{"id":` + id + `,"blacklisted":false,"password":"x"}`
		assertStatus(t, request(h, "PATCH", "/api/blacklist/resolve", body), 400)
	}
	for _, body := range []string{`null`, `{}`, `{"id":1,"blacklisted":true}`, `{"id":1,"blacklisted":null,"password":"x"}`, `{"id":1,"blacklisted":true,"password":null}`, `{"id":1,"blacklisted":"true","password":"x"}`} {
		assertStatus(t, request(h, "PATCH", "/api/blacklist/resolve", body), 400)
	}
	for _, password := range []string{"", "wrong"} {
		assertStatus(t, request(h, "PATCH", "/api/blacklist/resolve", `{"id":1,"blacklisted":true,"password":"`+password+`"}`), 401)
	}
	w := request(h, "PATCH", "/api/blacklist/resolve", `{"id":99,"blacklisted":false,"password":"`+testPassword+`"}`)
	assertStatus(t, w, 404)
	if !strings.Contains(w.Body.String(), "Report not found") {
		t.Fatal(w.Body.String())
	}
}
func TestDrinkValidationAndNumericStringPaging(t *testing.T) {
	h, _, c := setup(t)
	for _, body := range []string{"", `null`, `{}`, `[]`, strings.Replace(drinkRequest, `"1"`, `0`, 1), strings.Replace(drinkRequest, `"beer"`, `"bad"`, 1), strings.Replace(drinkRequest, `"bottle"`, `"bad"`, 1), strings.Replace(drinkRequest, `"asc"`, `"bad"`, 1), strings.Replace(drinkRequest, `"ratio"`, `"bad"`, 1), strings.Replace(drinkRequest, `false`, `null`, 1), strings.Replace(drinkRequest, `"search":""`, `"search":null`, 1), strings.Replace(drinkRequest, `"20"`, `true`, 1)} {
		assertStatus(t, request(h, "POST", "/api/drinks", body), 400)
	}
	if c.requests != 0 {
		t.Fatal("invalid request fetched catalogue")
	}
	w := request(h, "POST", "/api/drinks", drinkRequest)
	assertStatus(t, w, 200)
	if c.requests != 1 || !strings.Contains(w.Body.String(), `"ratio":3`) {
		t.Fatal(w.Body.String())
	}
}
func TestReportsJoinAndTimestamp(t *testing.T) {
	h, s, c := setup(t)
	ctx := context.Background()
	for _, code := range []string{"001", "001", "missing"} {
		if err := s.Create(ctx, code, 1); err != nil {
			t.Fatal(err)
		}
	}
	w := request(h, "GET", "/api/reports", "")
	assertStatus(t, w, 200)
	if !reflect.DeepEqual(c.codes, []string{"001", "001", "missing"}) {
		t.Fatal(c.codes)
	}
	var result struct {
		ActiveReports []reportstore.ActiveReport
		DrinkDetails  []map[string]any
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.ActiveReports) != 3 || len(result.DrinkDetails) != 1 || result.DrinkDetails[0]["price"] != nil || result.DrinkDetails[0]["standardDrinks"] != float64(2) {
		t.Fatal(w.Body.String())
	}
	w = request(h, "GET", "/api/drinks/timestamp", "")
	assertStatus(t, w, 200)
	if strings.TrimSpace(w.Body.String()) != `{"date":"2026-10-27T00:00:00Z"}` {
		t.Fatal(w.Body.String())
	}
}
func TestSanitizedFailures(t *testing.T) {
	h, s, c := setup(t)
	c.err = errors.New("synthetic-sensitive-error-must-not-escape")
	for _, pair := range [][2]string{{"POST", "/api/drinks"}, {"GET", "/api/reports"}, {"GET", "/api/drinks/timestamp"}} {
		w := request(h, pair[0], pair[1], drinkRequest)
		assertStatus(t, w, 500)
		if strings.TrimSpace(w.Body.String()) != `{"error":"Internal server error"}` {
			t.Fatal(w.Body.String())
		}
	}
	_ = s.Close()
	for _, path := range []string{"/api/blacklist", "/api/blacklist/report", "/api/reports"} {
		w := request(h, "GET", path, "")
		assertStatus(t, w, 500)
		if strings.TrimSpace(w.Body.String()) != `{"error":"Internal server error"}` {
			t.Fatal(w.Body.String())
		}
	}
}
func TestRealHTTPServer(t *testing.T) {
	h, _, _ := setup(t)
	server := httptest.NewServer(h)
	defer server.Close()
	res, err := server.Client().Post(server.URL+"/api/blacklist/report", "application/json", strings.NewReader(`{"product_code":"0042"}`))
	if err != nil {
		t.Fatal(err)
	}
	_ = res.Body.Close()
	if res.StatusCode != 201 {
		t.Fatal(res.StatusCode)
	}
	res, err = server.Client().Get(server.URL + "/api/blacklist/report")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if !strings.Contains(string(body), `"product_code":"0042"`) {
		t.Fatal(string(body))
	}
}
