package catalogue

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

type record struct {
	raw           json.RawMessage
	name, code    string
	standard      float64
	prices, units map[string]float64
}
type snapshot struct{ groups [6][]*record }

func number(raw json.RawMessage) (float64, error) {
	if len(raw) == 0 {
		return math.NaN(), nil
	}
	if bytes.Equal(raw, []byte("null")) {
		return 0, nil
	}
	var n float64
	if err := json.Unmarshal(raw, &n); err != nil {
		return 0, err
	}
	return n, nil
}
func numbers(raw json.RawMessage) (map[string]float64, error) {
	var fields map[string]json.RawMessage
	if len(raw) == 0 || json.Unmarshal(raw, &fields) != nil || fields == nil {
		return nil, errors.New("invalid numeric object")
	}
	out := make(map[string]float64, len(fields))
	for key, value := range fields {
		n, err := number(value)
		if err != nil {
			return nil, err
		}
		out[key] = n
	}
	return out, nil
}
func decodeRecord(raw json.RawMessage) (*record, error) {
	if bytes.Equal(raw, []byte("null")) {
		return nil, nil
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return nil, errors.New("invalid catalogue record")
	}
	r := &record{raw: raw}
	if len(fields["name"]) == 0 || len(fields["stockcode"]) == 0 || json.Unmarshal(fields["name"], &r.name) != nil || json.Unmarshal(fields["stockcode"], &r.code) != nil || bytes.Equal(fields["name"], []byte("null")) || bytes.Equal(fields["stockcode"], []byte("null")) {
		return nil, errors.New("invalid catalogue identity")
	}
	var err error
	r.standard, err = number(fields["standardDrinks"])
	if err != nil {
		return nil, err
	}
	r.prices, err = numbers(fields["prices"])
	if err != nil {
		return nil, err
	}
	r.units, err = numbers(fields["units"])
	if err != nil {
		return nil, err
	}
	return r, nil
}
func lookup(values map[string]float64, key string) float64 {
	if n, ok := values[key]; ok {
		return n
	}
	return math.NaN()
}
func truthy(n float64) bool { return n != 0 && !math.IsNaN(n) }

type Filters struct {
	Type         string  `json:"type"`
	Pack         string  `json:"pack"`
	IncludePromo *bool   `json:"includePromo"`
	Search       *string `json:"search"`
	SortBy       string  `json:"sortBy"`
	Order        string  `json:"order"`
}

// Page accepts a JSON number or numeric string, retaining the legacy callers.
type Page int64

var decimalPage = regexp.MustCompile(`^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$`)

func (p *Page) UnmarshalJSON(raw []byte) error {
	s := string(raw)
	if len(s) > 0 && s[0] == '"' {
		if err := json.Unmarshal(raw, &s); err != nil {
			return err
		}
		s = strings.TrimSpace(s)
	}
	if !decimalPage.MatchString(s) {
		return errors.New("invalid page")
	}
	n, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || n < 1 || n > 9007199254740991 || n != math.Trunc(n) {
		return errors.New("invalid page")
	}
	*p = Page(n)
	return nil
}

type Request struct {
	Filters  Filters `json:"filterOptions"`
	PageNum  Page    `json:"pageNum"`
	PageSize Page    `json:"pageSize"`
}

func (r Request) Valid() bool {
	typeOK := r.Filters.Type == "all"
	for _, category := range categories {
		if category == r.Filters.Type {
			typeOK = true
		}
	}
	packOK := false
	for _, pack := range []string{"bottle", "pack", "case", "promobottle", "promopack", "promocase"} {
		if pack == r.Filters.Pack {
			packOK = true
		}
	}
	return typeOK && packOK && r.Filters.IncludePromo != nil && r.Filters.Search != nil && (r.Filters.SortBy == "price" || r.Filters.SortBy == "ratio" || r.Filters.SortBy == "standardDrinks") && (r.Filters.Order == "asc" || r.Filters.Order == "desc") && r.PageNum > 0 && r.PageSize > 0
}

type candidate struct {
	record                 *record
	standard, price, ratio float64
}

func jsonNumber(n float64) json.RawMessage {
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return json.RawMessage("null")
	}
	b, _ := json.Marshal(n)
	return b
}
func (c *Catalogue) Query(ctx context.Context, req Request) ([]json.RawMessage, error) {
	if !req.Valid() {
		return nil, errors.New("invalid drink request")
	}
	s, err := c.get(ctx)
	if err != nil {
		return nil, err
	}
	f := req.Filters
	fullPack := f.Pack
	if *f.IncludePromo {
		fullPack = "promo" + fullPack
	}
	candidates := make([]candidate, 0)
	// Full default Unicode casing matches JS (final sigma and dotted I included).
	// Casers are stateful, so each query owns its instance.
	lower := cases.Lower(language.Und)
	for i, group := range s.groups {
		if f.Type != "all" && f.Type != categories[i] {
			continue
		}
		for _, r := range group {
			base, promo := lookup(r.prices, f.Pack), lookup(r.prices, fullPack)
			if !truthy(r.standard) || (!truthy(base) && !truthy(promo)) {
				continue
			}
			standard := r.standard
			if f.Pack == "pack" || f.Pack == "case" {
				unit := lookup(r.units, f.Pack)
				if !truthy(unit) {
					continue
				}
				standard *= unit
			}
			if !strings.Contains(lower.String(r.name), *f.Search) {
				continue
			}
			// Deliberately preserve Math.max, including missing operands => NaN.
			price := math.Max(base, promo)
			candidates = append(candidates, candidate{r, standard, price, price / standard})
		}
	}
	// Mixed finite/NaN comparisons reproduce the legacy comparator, not a total
	// order. Their engine-dependent ordering is intentionally not a parity promise.
	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := candidates[i], candidates[j]
		var diff float64
		switch f.SortBy {
		case "price":
			diff = a.price - b.price
		case "ratio":
			diff = a.ratio - b.ratio
		default:
			diff = a.standard - b.standard
		}
		if f.Order == "desc" {
			diff = -diff
		}
		return diff < 0
	})
	out := make([]json.RawMessage, 0)
	// Divide before multiplying: very large valid paging cannot overflow int64.
	n := int64(len(candidates))
	size, page := int64(req.PageSize), int64(req.PageNum)
	if n == 0 || page-1 > (n-1)/size {
		return out, nil
	}
	start := (page - 1) * size
	end := n
	if size < n-start {
		end = start + size
	}
	for _, v := range candidates[start:end] {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(v.record.raw, &fields); err != nil {
			return nil, err
		}
		fields["standardDrinks"] = jsonNumber(v.standard)
		fields["price"] = jsonNumber(v.price)
		fields["ratio"] = jsonNumber(v.ratio)
		raw, err := json.Marshal(fields)
		if err != nil {
			return nil, err
		}
		out = append(out, raw)
	}
	return out, nil
}

// Details implements the old SSR join: catalogue order, raw uncalculated drinks,
// and one result per catalogue record, regardless of duplicate pending reports.
func (c *Catalogue) Details(ctx context.Context, codes []string) ([]json.RawMessage, error) {
	s, err := c.get(ctx)
	if err != nil {
		return nil, err
	}
	wanted := make(map[string]bool, len(codes))
	for _, code := range codes {
		wanted[code] = true
	}
	out := make([]json.RawMessage, 0)
	for _, group := range s.groups {
		for _, r := range group {
			if wanted[r.code] {
				out = append(out, append(json.RawMessage(nil), r.raw...))
			}
		}
	}
	return out, nil
}
