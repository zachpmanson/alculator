// Package httpapi implements the legacy same-origin JSON API; no frontend yet.
package httpapi

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/zachpmanson/alculator/internal/catalogue"
	"github.com/zachpmanson/alculator/internal/reportstore"
)

const MaxRequestBytes = 64 << 10

type Reports interface {
	Create(context.Context, string, int64) error
	Resolve(context.Context, int64, bool) error
	Active(context.Context) ([]reportstore.ActiveReport, error)
	Blacklist(context.Context) ([]string, error)
}
type Catalogue interface {
	Query(context.Context, catalogue.Request) ([]json.RawMessage, error)
	Details(context.Context, []string) ([]json.RawMessage, error)
	Timestamp(context.Context) (string, error)
}
type API struct {
	reports   Reports
	catalogue Catalogue
	password  [32]byte
	now       func() time.Time
}

func New(reports Reports, drinks Catalogue, password string) (http.Handler, error) {
	if password == "" {
		return nil, errors.New("REPORT_ADMIN_PASSWORD must be nonempty")
	}
	return &API{reports: reports, catalogue: drinks, password: sha256.Sum256([]byte(password)), now: time.Now}, nil
}
func send(w http.ResponseWriter, status int, value any) {
	// Encode first so no partial response can leak an internal encoding failure.
	data, err := json.Marshal(value)
	if err != nil {
		status = http.StatusInternalServerError
		data = []byte(`{"error":"Internal server error"}`)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(append(data, '\n'))
}
func failure(w http.ResponseWriter, err error) {
	if errors.Is(err, reportstore.ErrNotFound) {
		send(w, 404, map[string]string{"error": "Report not found"})
		return
	}
	send(w, 500, map[string]string{"error": "Internal server error"})
}
func decode(w http.ResponseWriter, r *http.Request, out any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, MaxRequestBytes)
	d := json.NewDecoder(r.Body)
	err := d.Decode(out)
	if err == nil {
		err = d.Decode(new(any))
		if err == io.EOF {
			err = nil
		} else if err == nil {
			err = errors.New("trailing data")
		}
	}
	if err != nil {
		status := 400
		var limit *http.MaxBytesError
		if errors.As(err, &limit) {
			status = 413
		}
		send(w, status, map[string]string{"error": "Malformed request"})
		return false
	}
	return true
}
func malformed(w http.ResponseWriter) { send(w, 400, map[string]string{"error": "Malformed request"}) }
func (a *API) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
	defer cancel()
	r = r.WithContext(ctx)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Public reads include changing moderation state; avoid stale proxy/browser data.
	w.Header().Set("Cache-Control", "no-store")
	allow := ""
	switch r.URL.Path {
	case "/api/drinks":
		allow = "POST"
	case "/api/drinks/timestamp", "/api/blacklist", "/api/reports":
		allow = "GET"
	case "/api/blacklist/report":
		allow = "GET, POST"
	case "/api/blacklist/resolve":
		allow = "PATCH"
	default:
		send(w, 404, map[string]string{"error": "Not found"})
		return
	}
	if !(r.Method == allow || (allow == "GET, POST" && (r.Method == "GET" || r.Method == "POST"))) {
		w.Header().Set("Allow", allow)
		send(w, 405, map[string]string{"error": "Invalid method"})
		return
	}
	switch r.URL.Path {
	case "/api/drinks":
		var req catalogue.Request
		if !decode(w, r, &req) {
			return
		}
		if !req.Valid() {
			malformed(w)
			return
		}
		result, err := a.catalogue.Query(ctx, req)
		if err != nil {
			failure(w, err)
			return
		}
		send(w, 200, result)
	case "/api/drinks/timestamp":
		date, err := a.catalogue.Timestamp(ctx)
		if err != nil {
			failure(w, err)
			return
		}
		send(w, 200, map[string]string{"date": date})
	case "/api/blacklist":
		codes, err := a.reports.Blacklist(ctx)
		if err != nil {
			failure(w, err)
			return
		}
		send(w, 200, codes)
	case "/api/blacklist/report":
		if r.Method == http.MethodGet {
			reports, err := a.reports.Active(ctx)
			if err != nil {
				failure(w, err)
				return
			}
			send(w, 200, reports)
			return
		}
		var req struct {
			Code *string `json:"product_code"`
		}
		if !decode(w, r, &req) {
			return
		}
		if req.Code == nil || *req.Code == "" {
			malformed(w)
			return
		}
		if err := a.reports.Create(ctx, *req.Code, a.now().UnixMilli()); err != nil {
			failure(w, err)
			return
		}
		w.WriteHeader(201)
	case "/api/blacklist/resolve":
		var req struct {
			ID          id      `json:"id"`
			Blacklisted *bool   `json:"blacklisted"`
			Password    *string `json:"password"`
		}
		if !decode(w, r, &req) {
			return
		}
		if req.ID < 1 || req.Blacklisted == nil || req.Password == nil {
			malformed(w)
			return
		}
		password := sha256.Sum256([]byte(*req.Password))
		if subtle.ConstantTimeCompare(password[:], a.password[:]) != 1 {
			send(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}
		if err := a.reports.Resolve(ctx, int64(req.ID), *req.Blacklisted); err != nil {
			failure(w, err)
			return
		}
		w.WriteHeader(200)
	case "/api/reports":
		reports, err := a.reports.Active(ctx)
		if err != nil {
			failure(w, err)
			return
		}
		codes := make([]string, 0, len(reports))
		for _, r := range reports {
			codes = append(codes, r.ProductCode)
		}
		details, err := a.catalogue.Details(ctx, codes)
		if err != nil {
			failure(w, err)
			return
		}
		send(w, 200, struct {
			ActiveReports []reportstore.ActiveReport `json:"activeReports"`
			DrinkDetails  []json.RawMessage          `json:"drinkDetails"`
		}{reports, details})
	}
}

type id int64

func (v *id) UnmarshalJSON(raw []byte) error {
	if len(raw) == 0 || raw[0] == '"' {
		return errors.New("invalid id")
	}
	n, err := strconv.ParseFloat(string(raw), 64)
	if err != nil || math.IsNaN(n) || n < 1 || n > reportstore.MaxID || math.Trunc(n) != n {
		return errors.New("invalid id")
	}
	*v = id(n)
	return nil
}
