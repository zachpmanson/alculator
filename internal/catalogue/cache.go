// Package catalogue keeps immutable, atomically replaced public feed snapshots.
package catalogue

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"time"
)

var categories = [...]string{"beer", "cider", "premix", "spirits", "redwine", "whitewine"}

const FeedBase = "https://raw.githubusercontent.com/pavo-etc/alculator-data/master/"
const MaxFeedBytes = 4 << 20

type Options struct {
	// Overrides are dependency injection for offline tests, not runtime feed config.
	Client         *http.Client
	FeedURL        func(category string) string
	TimestampURL   string
	CatalogueTTL   time.Duration
	TimestampTTL   time.Duration
	RefreshTimeout time.Duration
}
type Catalogue struct {
	options   Options
	drinks    cache[*snapshot]
	timestamp cache[string]
}
type flight struct {
	done chan struct{}
	err  error
}
type cache[T any] struct {
	mu      sync.Mutex
	value   T
	good    bool
	expires time.Time
	flight  *flight
}

func (c *cache[T]) get(ctx context.Context, ttl, timeout time.Duration, load func(context.Context) (T, error)) (T, error) {
	c.mu.Lock()
	if c.good && time.Now().Before(c.expires) {
		value := c.value
		c.mu.Unlock()
		return value, nil
	}
	f := c.flight
	if f == nil {
		f = &flight{done: make(chan struct{})}
		c.flight = f
		go func() {
			refreshCtx, cancel := context.WithTimeout(context.Background(), timeout)
			defer cancel()
			value, err := load(refreshCtx)
			c.mu.Lock()
			defer c.mu.Unlock()
			if err == nil {
				c.value = value
				c.good = true
				c.expires = time.Now().Add(ttl)
			}
			f.err = err
			c.flight = nil
			close(f.done)
		}()
	}
	c.mu.Unlock()
	select {
	case <-ctx.Done():
		var zero T
		return zero, ctx.Err()
	case <-f.done:
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.good {
		return c.value, nil
	}
	var zero T
	return zero, f.err
}
func New(dataRepo string, options Options) *Catalogue {
	if options.Client == nil {
		options.Client = &http.Client{Timeout: 15 * time.Second}
	}
	if options.FeedURL == nil {
		options.FeedURL = func(category string) string { return FeedBase + category + ".json" }
	}
	if options.TimestampURL == "" {
		options.TimestampURL = "https://api.github.com/repos/" + dataRepo + "/branches/master"
	}
	if options.CatalogueTTL <= 0 {
		options.CatalogueTTL = time.Hour
	}
	if options.TimestampTTL <= 0 {
		options.TimestampTTL = 10 * time.Minute
	}
	if options.RefreshTimeout <= 0 {
		options.RefreshTimeout = 30 * time.Second
	}
	return &Catalogue{options: options}
}
func (c *Catalogue) fetch(ctx context.Context, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	res, err := c.options.Client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return errors.New("upstream status failure")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, MaxFeedBytes+1))
	if err != nil {
		return err
	}
	if len(data) > MaxFeedBytes {
		return errors.New("upstream response too large")
	}
	return json.Unmarshal(data, out)
}
func (c *Catalogue) get(ctx context.Context) (*snapshot, error) {
	return c.drinks.get(ctx, c.options.CatalogueTTL, c.options.RefreshTimeout, func(ctx context.Context) (*snapshot, error) {
		var wg sync.WaitGroup
		var groups [6][]*record
		var errs [6]error
		for i, category := range categories {
			wg.Add(1)
			go func(i int, category string) {
				defer wg.Done()
				var raw []json.RawMessage
				if err := c.fetch(ctx, c.options.FeedURL(category), &raw); err != nil {
					errs[i] = err
					return
				}
				if raw == nil {
					errs[i] = errors.New("invalid feed array")
					return
				}
				groups[i] = make([]*record, 0, len(raw))
				for _, item := range raw {
					r, err := decodeRecord(item)
					if err != nil {
						errs[i] = err
						return
					}
					if r != nil {
						groups[i] = append(groups[i], r)
					}
				}
			}(i, category)
		}
		wg.Wait()
		for _, err := range errs {
			if err != nil {
				return nil, err
			}
		}
		return &snapshot{groups: groups}, nil
	})
}
func (c *Catalogue) Timestamp(ctx context.Context) (string, error) {
	return c.timestamp.get(ctx, c.options.TimestampTTL, c.options.RefreshTimeout, func(ctx context.Context) (string, error) {
		var data struct {
			Commit struct {
				Commit struct {
					Author struct {
						Date string `json:"date"`
					} `json:"author"`
				} `json:"commit"`
			} `json:"commit"`
		}
		if err := c.fetch(ctx, c.options.TimestampURL, &data); err != nil {
			return "", err
		}
		date := data.Commit.Commit.Author.Date
		if _, err := time.Parse(time.RFC3339, date); err != nil {
			return "", errors.New("invalid upstream timestamp")
		}
		return date, nil
	})
}
