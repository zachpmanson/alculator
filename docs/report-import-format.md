# Version1 report import contract

Private operator input, never committed real data or fetched from a live app:

```json
{
  "version": 1,
  "next_id": 2,
  "reports": [
    {
      "id": 1,
      "product_code": "00123",
      "is_resolved": false,
      "timestamp": 1700000000000,
      "blacklisted": null
    }
  ]
}
```

- Example is synthetic. All five report fields are required: positive integer ID,
  exact string product code, boolean resolved flag, int64 UTC-millisecond timestamp,
  and explicit nullable boolean blacklist flag. Preserve strings/leading zeros,
  timestamps and null distinctly from false; do not trim/reclassify existing data.
- `next_id` is the source PostgreSQL sequence's effective next value (last_value
  plus increment when is_called, otherwise last_value), **not** count+1. It must
  exceed every imported ID and remain representable by the existing positive
  signed-32-bit API ID contract. Inconsistent source state requires review.
- Import is one transaction: reject malformed input, duplicate IDs and conflicting
  existing records. Insert missing records; accept already identical records.
  Never delete unrelated/newer rows or overwrite an existing differing record.
- Set SQLite's ID continuation to at least `next_id - 1` without ever rewinding
  existing allocation state. Repeat import inserts zero and cannot rewind IDs.
- CLI import needs no moderation password; serving requires the runtime password.
  Operator still verifies source checksums, target state, all fields/counts,
  integrity and continuation on disposable fixtures before any approved cutover.
