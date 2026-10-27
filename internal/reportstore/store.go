// Package reportstore owns the persistent reports-only SQLite database.
package reportstore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const MaxID = 2147483647

var ErrNotFound = errors.New("report not found")
var ErrConflict = errors.New("conflicting report")

type Report struct {
	ID          int64  `json:"id"`
	ProductCode string `json:"product_code"`
	IsResolved  bool   `json:"is_resolved"`
	Timestamp   int64  `json:"timestamp"`
	Blacklisted *bool  `json:"blacklisted"`
}
type ActiveReport struct {
	ID          int64  `json:"id"`
	ProductCode string `json:"product_code"`
}
type Store struct{ db *sql.DB }

func Open(path string) (*Store, error) {
	path, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	if info, e := os.Lstat(path); e == nil && !info.Mode().IsRegular() {
		return nil, errors.New("database must be a regular file")
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	err = f.Chmod(0600)
	closeErr := f.Close()
	if err != nil {
		return nil, err
	}
	if closeErr != nil {
		return nil, closeErr
	}
	u := url.URL{Scheme: "file", Path: path}
	db, err := sql.Open("sqlite3", u.String()+"?_journal_mode=WAL&_synchronous=FULL&_busy_timeout=5000&_foreign_keys=on&_txlock=immediate")
	if err != nil {
		return nil, err
	}
	// Serialize writes and avoid separate per-connection initialization state.
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id BETWEEN 1 AND 2147483647),
 product_code TEXT NOT NULL,
 is_resolved INTEGER NOT NULL CHECK(is_resolved IN (0,1)),
 timestamp INTEGER NOT NULL,
 blacklisted INTEGER CHECK(blacklisted IN (0,1))
 ); CREATE INDEX IF NOT EXISTS reports_pending ON reports(is_resolved, timestamp, id);`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// Health checks database availability without scanning reports or the catalogue.
func (s *Store) Health(ctx context.Context) error {
	var one int
	return s.db.QueryRowContext(ctx, "SELECT 1").Scan(&one)
}
func (s *Store) Close() error { return s.db.Close() }
func (s *Store) Create(ctx context.Context, code string, timestamp int64) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO reports(product_code,is_resolved,timestamp) VALUES(?,0,?)`, code, timestamp)
	return err
}
func (s *Store) Resolve(ctx context.Context, id int64, blacklisted bool) error {
	result, err := s.db.ExecContext(ctx, `UPDATE reports SET is_resolved=1, blacklisted=? WHERE id=?`, blacklisted, id)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
func (s *Store) Active(ctx context.Context) ([]ActiveReport, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,product_code FROM reports WHERE is_resolved=0 ORDER BY timestamp,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ActiveReport, 0)
	for rows.Next() {
		var r ActiveReport
		if err := rows.Scan(&r.ID, &r.ProductCode); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *Store) Blacklist(ctx context.Context) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT product_code FROM reports WHERE is_resolved=1 AND blacklisted=1 ORDER BY timestamp,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		out = append(out, code)
	}
	return out, rows.Err()
}
func (s *Store) All(ctx context.Context) ([]Report, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,product_code,is_resolved,timestamp,blacklisted FROM reports ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Report, 0)
	for rows.Next() {
		var r Report
		if err := rows.Scan(&r.ID, &r.ProductCode, &r.IsResolved, &r.Timestamp, &r.Blacklisted); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// NextID includes both the retained allocation sequence and all extant rows.
func (s *Store) NextID(ctx context.Context) (int64, error) {
	var next int64
	err := s.db.QueryRowContext(ctx, `SELECT MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name='reports'),0), COALESCE((SELECT MAX(id) FROM reports),0))+1`).Scan(&next)
	return next, err
}
func (s *Store) Integrity(ctx context.Context) error {
	var result string
	if err := s.db.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&result); err != nil {
		return err
	}
	if result != "ok" {
		return fmt.Errorf("database integrity check failed")
	}
	return nil
}
