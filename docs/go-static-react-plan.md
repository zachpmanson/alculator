# Proposal: Go backend, static React, SQLite

Status: implementation approved by Zach,27October2026; SQLite selected explicitly.
This replaces the Next-runtime hosting direction, rather than requiring the
pending Next-specific hosting PR to merge. Live data conversion/cutover still
requires the verification and operational gates below.

## Target

```text
Caddy / HTTPS -> one Go HTTP service
                 |- embedded Vite-built React/CSS/icons
                 |- existing same-origin /api routes
                 |- immutable drinks-feed cache
                 `- SQLite reports/moderation state
```

Node/pnpm are build/dev tools only. No Next server, Prisma, PostgreSQL role,
DATABASE_URL/password, image-optimization server or extra production API service.
Keep the current UI/CSS and both routes (`/`, `/reports`), not a redesign.
A CGo SQLite driver matching the already-deployed API is the default unless a
concrete platform requirement justifies another driver.

## 1. Freeze the application contract

Use actual `main` as the branch base; compare the reviewed but unmerged hosting
branch for its tested validation/fail-closed fixes, not its Next upgrades/runtime.
Capture synthetic golden fixtures before porting:

- `POST /api/drinks`: filters, pack/promo arithmetic, stable sorting and paging.
- `GET /api/drinks/timestamp`.
- `GET /api/blacklist`: ordered product-code strings, including duplicates.
- `GET/POST /api/blacklist/report`: pending IDs/codes; public creation returns201.
- `PATCH /api/blacklist/resolve`: existing password-in-JSON mutation, status/error
  behavior, missing IDs, duplicate reports and repeated resolutions.

Preserve the category order, numeric-string paging, null/missing/zero handling,
search casing and stable ties. JavaScript NaN becomes JSON null; Go must not turn
an existing edge case into an encoder failure by accident. Keep report reads
public and password-protect resolution as today; any auth/session redesign is a
separate decision. Add request bounds and sanitized failures deliberately.

## 2. Extract the static React application

- Vite + React; retain components, global provider, CSS, assets and icon package.
- Replace Next head/link/image/document plumbing. A small client router preserves
  navigation/global state for both pages; plain sized/lazy images suffice because
  image optimization is already disabled.
- Replace `/reports` getServerSideProps with a dedicated Go endpoint returning
  the pending-report IDs/codes plus matching raw catalogue details. Do not misuse
  the calculated/paginated drinks endpoint for this join or change old endpoints.
- Embed the final bundle with go:embed. Unknown `/api/*` and missing assets return
  real404s, never SPA HTML; application deep links render the correct route.
- Keep REPORT_ADMIN_PASSWORD server-side, never in VITE_* or bundled JavaScript.

## 3. Implement the Go data/API layer

- Standard net/http handlers, typed DTOs and direct parameterized SQLite SQL.
- One immutable catalogue snapshot; stable six-category order. Single-flight
  refresh, bounded HTTP timeouts/response sizes, atomic validated replacement and
  last-good data on refresh failure. Preserve current freshness semantics first.
- Compute filter/sort candidates without deep-copying the whole catalogue on each
  request; serialize only the requested result page.
- Catalogue stays JSON, not database rows. SQLite stores only reports.

Feed/source changes are not implicit in the rewrite: currently catalogue URLs
use pavo-etc/alculator-data master; DATA_REPO affects timestamp lookup only.
Making one config control both is a separate explicit change.

**Blacklist correction:** the owner's alculator-data/api.js already fetches the
public blacklist and skips matching stockcodes during feed generation. Preserve
that integration and string IDs ([generator source](https://github.com/zachpmanson/alculator-data/blob/7941bb2a78b929ab580deb4c05bbaa818d79c818/api.js)); absence of another runtime filter is not by
itself a missing feature. Do not silently introduce different suppression timing.

Known arithmetic quirks (notably Math.max despite a lowest-price comment, missing
promo operands and raw moderation-card pack ratios) need explicit follow-up
fixtures/decisions, not accidental fixes bundled into language conversion.

## 4. Convert the saved reports safely

No live Alculator DB has been imported on Naboo. Its retained PostgreSQL archive
contains145 reports and was previously restore/fingerprint verified.

- Export from a disposable private restore of that archive, not shared/live PG.
- Preserve integer report IDs, string stockcodes/leading zeros, resolved flags,
  int64 millisecond timestamps and nullable blacklisted values.
- Preserve ID allocation continuation using both records and the saved source
  sequence state; do not assume count145 means maxID145.
- Transactional, idempotent importer: conflicting existing IDs stop; never reset
  nonempty/newer state. Verify all fields, counts, sequence continuation and
  integrity, then rehearse create/resolve operations only on disposable copies.
- Runtime state: private service-owned `/var/lib/alculator/` with SQLite WAL,
  restrictive modes and consistent encrypted backups. No new PG role/password.

## 5. Validate and deploy

- Go unit/integration tests plus differential golden fixtures and offline feed
  failure/refresh/concurrent-cold-start tests.
- Browser checks for cards/table toggle, filtering/paging/search, locks, reporting,
  moderation and direct `/reports` loading. Validate the data generator contract.
- Nix build frontend then Go; one hardened loopback service behind existing Caddy.
  Preserve the now-live API and other services. Existing Next hosting plans must
  be superseded/reworked, never merged unchanged beside the Go implementation.
- Private restore/verification first, then reviewed public cutover with one report
  writer. Keep originals/checkpoints and a rollback plan that preserves new writes.

## Memory evidence, not a whole-server promise

27October public-feed sample: six files,5918 drinks,1375336 JSON bytes. A throwaway
Go decoder using typed fields and nullable numeric pointers retained1573112 heap
bytes after GC (1630208 extra heap-in-use). This is not a running backend/RSS
benchmark. Budget roughly5–10MB for cache/refresh/temporary work initially; measure
idle, warmed full-catalogue, paging and concurrent load once implemented. The
existing Next sample (~158MiB app RAM) is a comparison, not the expected Go floor.

## Acceptance / non-goals

UI and existing normal-client/API behavior preserved, all145 rows reconciled,
no production canary rows, no Node/Prisma runtime, measured memory, safe backup and
restore, and no changes to the deployed API or existing PostgreSQL databases.
Implementation was separately approved on27October2026. Live cutover remains
separate, after private data/behaviour/runtime verification.
