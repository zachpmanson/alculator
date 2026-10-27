package catalogue

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"reflect"
	"testing"
)

func mixedCatalogue(t *testing.T) *Catalogue {
	t.Helper()
	feed, err := os.ReadFile("testdata/mixed-nan.json")
	if err != nil {
		t.Fatal(err)
	}
	return serverCatalogue(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/beer" {
			_, _ = w.Write(feed)
		} else {
			_, _ = w.Write([]byte("[]"))
		}
	}, Options{})
}

func TestMixedNaNValuesWithoutOrderingContract(t *testing.T) {
	c := mixedCatalogue(t)
	for _, sortBy := range []string{"price", "ratio"} {
		for _, order := range []string{"asc", "desc"} {
			t.Run(sortBy+"/"+order, func(t *testing.T) {
				req := defaultRequest()
				req.Filters.Type, req.Filters.SortBy, req.Filters.Order = "beer", sortBy, order
				*req.Filters.IncludePromo = true
				got, err := c.Query(context.Background(), req)
				if err != nil || len(got) != 7 {
					t.Fatalf("query: %d %v", len(got), err)
				}
				if wire, err := json.Marshal(got); err != nil || !json.Valid(wire) {
					t.Fatalf("invalid wire JSON: %s %v", wire, err)
				}
				// No mixed-order assertion: the legacy comparator isn't a total order.
				want := map[string]any{
					"f-expensive": float64(12), "f-cheap": float64(6), "f-tie": float64(6),
					"missing-promo": nil, "missing-base": nil, "null-base": float64(3), "null-promo": float64(8),
				}
				for _, raw := range got {
					var row map[string]any
					if err := json.Unmarshal(raw, &row); err != nil {
						t.Fatal(err)
					}
					code, _ := row["stockcode"].(string)
					price, ok := want[code]
					if !ok || row["price"] != price {
						t.Fatalf("unexpected price: %s", raw)
					}
					if _, ok := row["price"]; !ok {
						t.Fatal("missing price field")
					}
					ratio := price
					if price != nil {
						ratio = price.(float64) / 2
					}
					if value, ok := row["ratio"]; !ok || value != ratio {
						t.Fatalf("unexpected ratio: %s", raw)
					}
					prices := row["prices"].(map[string]any)
					if code == "missing-base" {
						if _, ok := prices["bottle"]; ok {
							t.Fatal("missing base became present")
						}
					} else if code == "null-base" {
						if value, ok := prices["bottle"]; !ok || value != nil {
							t.Fatal("explicit null base changed")
						}
					}
					delete(want, code)
				}
				if len(want) != 0 {
					t.Fatal("missing records", want)
				}
			})
		}
	}
}

func TestFiniteOrderingAndStableTiesForUIPacks(t *testing.T) {
	c := mixedCatalogue(t)
	for _, pack := range []string{"bottle", "pack", "case"} {
		for _, promo := range []bool{false, true} {
			for _, sortBy := range []string{"price", "ratio", "standardDrinks"} {
				for _, order := range []string{"asc", "desc"} {
					req := defaultRequest()
					req.Filters.Type, req.Filters.Pack = "beer", pack
					req.Filters.SortBy, req.Filters.Order = sortBy, order
					*req.Filters.IncludePromo, *req.Filters.Search = promo, "finite"
					got, err := c.Query(context.Background(), req)
					if err != nil {
						t.Fatal(err)
					}
					var codes []string
					for _, raw := range got {
						var row struct{ Stockcode string }
						if err := json.Unmarshal(raw, &row); err != nil {
							t.Fatal(err)
						}
						codes = append(codes, row.Stockcode)
					}
					want := []string{"f-cheap", "f-tie", "f-expensive"}
					if order == "desc" || sortBy == "standardDrinks" {
						want = []string{"f-expensive", "f-cheap", "f-tie"}
					}
					if !reflect.DeepEqual(codes, want) {
						t.Fatalf("%s promo=%t %s %s: got %v, want %v", pack, promo, sortBy, order, codes, want)
					}
				}
			}
		}
	}
}
