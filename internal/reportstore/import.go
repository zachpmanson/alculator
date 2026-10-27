package reportstore

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"strconv"
	"unicode/utf8"
)

const MaxImportBytes = 64 << 20

type Import struct {
	Version int      `json:"version"`
	NextID  int64    `json:"next_id"`
	Reports []Report `json:"reports"`
}

// DecodeImport requires every v1 field, including an explicit nullable blacklist.
// Inputs are private operator files; errors never echo their contents.
func DecodeImport(r io.Reader) (Import, error) {
	fail := func() (Import, error) { return Import{}, errors.New("invalid version 1 report import") }
	data, err := io.ReadAll(io.LimitReader(r, MaxImportBytes+1))
	if err != nil || len(data) > MaxImportBytes {
		return fail()
	}
	var wire struct {
		Version *int            `json:"version"`
		NextID  *int64          `json:"next_id"`
		Reports json.RawMessage `json:"reports"`
	}
	if strictDecode(data, &wire) != nil || wire.Version == nil || *wire.Version != 1 || wire.NextID == nil || len(wire.Reports) == 0 || bytes.Equal(wire.Reports, []byte("null")) {
		return fail()
	}
	var records []json.RawMessage
	if json.Unmarshal(wire.Reports, &records) != nil {
		return fail()
	}
	out := Import{Version: 1, NextID: *wire.NextID, Reports: make([]Report, 0, len(records))}
	for _, raw := range records {
		var row struct {
			ID          *int64          `json:"id"`
			Code        *string         `json:"product_code"`
			Resolved    *bool           `json:"is_resolved"`
			Timestamp   *int64          `json:"timestamp"`
			Blacklisted json.RawMessage `json:"blacklisted"`
		}
		if strictDecode(raw, &row) != nil || row.ID == nil || row.Code == nil || row.Resolved == nil || row.Timestamp == nil || len(row.Blacklisted) == 0 {
			return fail()
		}
		var blacklisted *bool
		if json.Unmarshal(row.Blacklisted, &blacklisted) != nil {
			return fail()
		}
		out.Reports = append(out.Reports, Report{*row.ID, *row.Code, *row.Resolved, *row.Timestamp, blacklisted})
	}
	if out.validate() != nil {
		return fail()
	}
	return out, nil
}

// encoding/json replaces invalid UTF-8 and unpaired surrogate escapes with U+FFFD.
// Reject those inputs before decoding so importing cannot silently change strings.
func validJSONUnicode(data []byte) bool {
	if !utf8.Valid(data) || !json.Valid(data) {
		return false
	}
	inString := false
	for i := 0; i < len(data); i++ {
		if data[i] == '"' {
			inString = !inString
			continue
		}
		if !inString || data[i] != '\\' {
			continue
		}
		i++ // JSON validity guarantees a complete escape.
		if data[i] != 'u' {
			continue
		}
		u, _ := strconv.ParseUint(string(data[i+1:i+5]), 16, 16)
		i += 4
		if u >= 0xD800 && u <= 0xDBFF {
			if len(data)-i < 7 || data[i+1] != '\\' || data[i+2] != 'u' {
				return false
			}
			low, err := strconv.ParseUint(string(data[i+3:i+7]), 16, 16)
			if err != nil || low < 0xDC00 || low > 0xDFFF {
				return false
			}
			i += 6
		} else if u >= 0xDC00 && u <= 0xDFFF {
			return false
		}
	}
	return true
}

func strictDecode(data []byte, dst any) error {
	if !validJSONUnicode(data) {
		return errors.New("invalid JSON Unicode")
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(dst); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}
func (in Import) validate() error {
	if in.Version != 1 || in.NextID < 1 || in.NextID > MaxID || in.Reports == nil {
		return errors.New("invalid import header")
	}
	seen := make(map[int64]bool, len(in.Reports))
	for _, r := range in.Reports {
		if r.ID < 1 || r.ID >= in.NextID || seen[r.ID] {
			return errors.New("invalid or duplicate report ID")
		}
		seen[r.ID] = true
	}
	return nil
}

// Import inserts absent records atomically, accepting exact replays only. Neither
// unrelated rows nor a newer allocation sequence can be overwritten or rewound.
func (s *Store) Import(ctx context.Context, in Import) (int, error) {
	if err := in.validate(); err != nil {
		return 0, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	inserted := 0
	for _, r := range in.Reports {
		var existing Report
		err = tx.QueryRowContext(ctx, `SELECT id,product_code,is_resolved,timestamp,blacklisted FROM reports WHERE id=?`, r.ID).Scan(&existing.ID, &existing.ProductCode, &existing.IsResolved, &existing.Timestamp, &existing.Blacklisted)
		if err == nil {
			if !reflect.DeepEqual(r, existing) {
				return 0, ErrConflict
			}
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return 0, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO reports(id,product_code,is_resolved,timestamp,blacklisted) VALUES(?,?,?,?,?)`, r.ID, r.ProductCode, r.IsResolved, r.Timestamp, r.Blacklisted); err != nil {
			return 0, err
		}
		inserted++
	}
	// sqlite_sequence has no unique constraint on name: update, then insert only
	// when absent (including an empty import into a fresh database).
	result, err := tx.ExecContext(ctx, `UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='reports'`, in.NextID-1)
	if err != nil {
		return 0, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	if n == 0 {
		if _, err = tx.ExecContext(ctx, `INSERT INTO sqlite_sequence(name,seq) VALUES('reports',?)`, in.NextID-1); err != nil {
			return 0, err
		}
	}
	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return inserted, nil
}
