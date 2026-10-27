# Milestone 1: Go API and SQLite (review slice only)

This is an additive backend, **not a cutover**. Existing Next/React/Prisma files
and package managers are unchanged. No frontend bundle, SPA fallback, Nix package,
service, live-state conversion or deployment is included. `/` and `/reports` are
404s on this backend until milestone 2.

## Development

All tools come from the pinned flake (Go, CGo/GCC, SQLite, Node and pnpm):

```sh
nix develop "path:$PWD"
go test ./...
go test -race ./...
go vet ./...
go build -o bin/alculator ./cmd/alculator
```

The `path:` form lets Nix see newly added files during review without staging
anything. Once tracked, ordinary `nix develop` also works.

Serve with a nonempty `REPORT_ADMIN_PASSWORD` supplied via the process's runtime
environment, never a command argument or frontend variable:

```sh
go run ./cmd/alculator serve
# Optional: -db /private/disposable/reports.sqlite -listen 127.0.0.1:3010
```

Defaults: loopback `127.0.0.1:3010`, `data/reports.sqlite`. A missing/empty password
fails **before opening state**. New database directories use 0700, database files
0600, WAL and synchronous FULL, with a 5-second SQLite busy timeout. Operational
service ownership, encrypted backups and production cutover remain separate.

Import only approved operator input, outside Git, into disposable state first:

```sh
go run ./cmd/alculator import -db /private/disposable/reports.sqlite -input /private/export.json
# -input - (default) reads stdin; no runtime password is read for import.
```

See [the version 1 seam contract](report-import-format.md). Input is bounded to
64 MiB and the database transaction to 30 seconds. Output contains only inserted
count, next allocation ID and integrity result. Every field is preserved, including
int64 milliseconds, leading zeros, duplicate codes, null versus false, and existing
empty/whitespace codes. IDs must be positive signed-32-bit values; `next_id` must
exceed every imported ID and fit that same range. Exact replays insert zero;
conflicts roll back the entire import. Sequence continuation never rewinds, even
if high rows have been deleted. Exhausted ID space fails rather than exceeding
the existing API ID contract. No export, archive, private data or production access
is part of this milestone. Invalid UTF-8 and unpaired/mismatched JSON surrogate
escapes are rejected before opening state rather than silently replaced; legitimate
U+FFFD characters and valid surrogate pairs are preserved.

## HTTP contracts

| Path | Methods | Success |
| --- | --- | --- |
| `/api/drinks` | POST | Calculated/paginated raw drink objects |
| `/api/drinks/timestamp` | GET | `{ "date": "…" }` |
| `/api/blacklist` | GET | Ordered strings, including duplicates |
| `/api/blacklist/report` | GET, POST | Pending IDs/codes; empty 201 for creation |
| `/api/blacklist/resolve` | PATCH | Password in JSON; empty 200 for resolution |
| `/api/reports` | GET | `{ "activeReports": […], "drinkDetails": […] }` |

The last route replaces only the old reports SSR join: pending reports are ordered
by timestamp then ID; matching **raw** details remain in catalogue order, once per
catalogue record, not once per report. No pack multiplication is applied to the
moderation details. Public reads and public creation are intentional. Resolution
accepts Keep/Remove, including repeated changes; nonexistent IDs return 404.

JSON bodies are bounded to 64 KiB. Invalid bodies/fields return 400, excessive
bodies 413, incorrect passwords 401, unsupported methods 405 with `Allow`, unknown
paths 404, and internal/feed failures sanitized 500. No upstream/database error
strings are returned. Decimal/scientific numeric-string pagination and all six
legacy pack enum values remain accepted. Paging must be positive integral and at
most JavaScript's MAX_SAFE_INTEGER, as in PR9; there is no additional page-size
cap. Deliberate validation narrowing: exotic JS coercions such as `true`, `[1]`
and hexadecimal/binary/octal strings are rejected, not coerced. The 64 KiB body
and 64 MiB import bounds are new explicit limits. Unknown JSON API fields are
ignored as before. These choices are not a claim of unqualified JS input parity.

The catalogue uses only the six fixed `pavo-etc/alculator-data/master` feeds in
beer/cider/premix/spirits/redwine/whitewine order. `DATA_REPO` controls **only** the
GitHub branch timestamp URL, exactly as before. URL overrides exist only as Go
constructor dependency injection for tests, not runtime flags/environment config.
There is no inline blacklist filter: the feed generator already performs it.

Catalogue TTL is one hour; timestamp TTL ten minutes. Concurrent refreshes are
coalesced, bounded to 30 seconds (individual default HTTP client timeout 15 seconds,
4 MiB per response), validated and atomically replaced. Failed refreshes retain
last-good state; cold failures return sanitized errors and later requests retry.
Caller cancellation does not cancel a shared refresh. No cached records are handed
out mutably. Only selected result pages are serialized with calculated overrides.

Known JS arithmetic quirks are intentionally retained: `Math.max`, missing promo
operands producing NaN/JSON null, raw moderation pack ratios, finite ordering and
stable finite ties. Search remains case-sensitive against full default-Unicode
lowercased names (including Greek final sigma and dotted-I expansion).

Deliberate portability exception: mixed finite/NaN sort keys do **not** promise V8
ordering. The legacy subtraction comparator is inconsistent in that domain, so its
ordering depends on the sorting engine. We retain the comparator and null wire
values, without adding a NaN-first/last policy, changing prices or porting V8's
sort. Mixed fixtures assert record membership, arithmetic and valid JSON separately
from ordinary finite ordering/ties for all three UI packs. Small historical mixed
goldens still pass but are not a general mixed-order parity guarantee.

Synthetic golden fixtures are generated by
`internal/catalogue/testdata/generate-golden.mjs`, reproducing the legacy handler
pipeline without any Next runtime or real products; a separate Unicode fixture
exercises actual queries. Regenerate both golden files with:

```sh
nix develop "path:$PWD" --command node internal/catalogue/testdata/generate-golden.mjs
```

Review must still cover milestone 2 UI/browser behavior, live private-import
reconciliation, runtime memory measurements, backup/restore and deployment gates.
