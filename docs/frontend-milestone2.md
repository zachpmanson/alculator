# Milestone 2: static React and embedded Go serving

This is the UI/embedding review slice, **not production packaging or cutover**.
No production Nix package/module, service, deployment, import, backup policy or
new authentication policy is implemented here. The only flake changes are dev
Make tooling and an optional Linux Chromium shell. Existing Go API/catalogue
contracts remain unchanged; SQLite gains only a cheap health query.

## Frontend

- React stays at 18.2.0. Vite replaces Next shell/head/document/link/image plumbing.
  Existing CSS, cards, table toggle, filters, paging, locks, reporting and moderation
  remain. Sized lazy `<img>` elements replace already-unoptimized Next images.
- A two-route History API router (`/`, `/reports`) keeps the global provider
  mounted across client navigation and back/forward. Reports retain their original
  filter reset/report-mode exit behavior; locked drinks survive navigation.
- `/reports` loads `{activeReports, drinkDetails}` from `GET /api/reports`, with
  loading/failure/empty states. Raw pack-card arithmetic is unchanged. A product
  disappears only after all its pending IDs resolve successfully; wrong passwords
  retain the card and show a retry message. Password stays in component memory and
  the existing PATCH body; it is not stored or included in build configuration.
- Page advances share a synchronous in-flight guard: button clicks and scroll
  timers cannot skip a pending page. Filters can still abort/reset to page one;
  generation checks also reject stale already-decoded responses. Pages stay at20,
  and only a successful empty page finishes paging. Failed pages retain the last
  successful cursor so Load more retries the same page. Initial requests show a
  spinner. Pending scroll and stable search-debounce timers are cancelled on
  unmount; debounce cleanup also follows callback identity changes. Report fetch
  failures allow retry without leaving the clicked card permanently greyed out.
- pnpm is the sole package manager/lock. Next/Prisma/memory-cache and the old TS
  server/API files are removed. TypeScript/ESLint are standalone dev tooling.
  Vite exposes **no** environment-variable prefix (`envPrefix: []`); there is no
  frontend configuration or secret contract. Never set a real secret in VITE_*.

## Building and serving

```sh
nix develop "path:$PWD"
make install                       # pnpm install --frozen-lockfile
make build                         # pnpm build; go build -tags frontend
```

Vite writes the ignored `internal/web/dist` tree, including original public icons.
The `frontend` Go build tag uses `go:embed dist`; compilation requires that tree.
The default Go build excludes it so a clean clone can run Go tests without Node
or checked-in generated files. An untagged executable refuses to serve before
opening state and tells the operator to use `make build`. Import remains usable
without a frontend. `make clean` removes only local generated bundle/binaries.

`bin/alculator` needs neither Node nor a filesystem bundle at runtime. It serves
HTML only for `/` and `/reports` (including query strings). Unknown API paths,
unknown application paths, missing files and asset directories return actual
404s. Non-API static paths allow GET/HEAD only; directory listings and path-cleaning
aliases are disabled. Hashed assets have immutable cache headers; app HTML is
revalidated. Existing API method/JSON/error handling is not changed.

`GET /healthz` (also HEAD) executes `SELECT 1` with a one-second context. It returns
200 `ok`, or sanitized503 `Unavailable`, without reading reports/catalogue data or
fetching upstream. It deliberately does **not** assert catalogue freshness: cold
API catalogue reads may fail while health remains200, and catalogue refreshes
keep last-good snapshots on upstream failure (see milestone1). No secret/request
body logging was added. Runtime secret validation remains milestone1's nonempty
password check; auth/password policy changes are not bundled into this slice.

For development, `make dev` starts the combined Go server on loopback18080 with
`data/dev-reports.sqlite`, plus Vite on loopback5173 proxying API/health to18080.
The runtime password must be exported by the caller. These dev ports are not used
by automated tests, and no check writes to3010.

## Repeatable Linux validation

```sh
nix develop "path:$PWD#browser"
make install
make test
# Further checks:
go test -race -tags frontend ./...
go vet -tags frontend ./...
```

- `test-go`: unit/integration suites, race detector and vet; succeeds without dist.
- `test-http`: builds the actual executable; tests route/method/health/static
  handling and graceful shutdown. Node then launches that executable on a free
  ephemeral loopback port with a temporary SQLite DB and synthetic password. It
  checks both HTML routes, real embedded JS/CSS/icon bytes, non-SPA404s, HEAD/405s,
  health, report creation/resolution and private DB mode. It never reads catalogue
  endpoints or contacts upstream. Port reservation is released immediately before
  launch (a small test-only port-allocation race remains).
- `test-secrets`: builds with synthetic server/VITE_* canaries and scans every
  generated output file for leakage. These are dummy markers, not credentials.
- `test-browser`: tagged Go fixture uses a temporary SQLite DB, injected loopback
  feeds (25 synthetic beers/one cider), a loopback timestamp endpoint and real
  API/embedded handlers. Playwright Core uses `CHROMIUM_EXECUTABLE`, supplied by
  the optional `browser` devshell; it does not download browsers. All non-fixture
  browser requests are intercepted: expected product images are fulfilled with a
  local pixel and unexpected requests are blocked and fail the test. Covers direct
  `/reports`, home/reload, cards/table, category/pack/promo/search/all sort options,
  paging/filter reset, lock/unlock, reporting, duplicate IDs, wrong-password retry,
  Keep/Remove, client/history navigation, empty reports and reload. Final DB checks
  assert no pending reports, only the expected synthetic blacklist code and SQLite
  integrity. Virtual-clock/held-response regressions cover initial loading,
  same-tick/repeated paging while page two is held, failed-page retry, short-page
  continuation until an empty page, filter resets against held and already-decoded
  obsolete responses, scroll/search navigation cleanup and stable debounce across
  renders. Synthetic report-load and partial duplicate-resolution failures retain
  retry/error behavior without mutating seeded reports. Header tests check nosniff,
  immutable static caching, HTML revalidation, health no-store and405 Allow.
  Timeout90s; all writes disappear with fixture teardown.

Build/check observations in this worktree: React JS about158kB (50kB gzip), CSS
about3.2kB; ordinary Go/race/vet, tagged Go race/vet, HTTP smoke and Chromium browser
checks passed. Go tests were also run with generated dist removed, and the built
executable HTTP smoke passed while its on-disk dist tree was temporarily absent. These are bundle sizes, **not** whole-service memory measurements. See the
implementation acceptance report for exact commands and any subsequent reruns.

## Still deferred

Milestone3 owns reproducible production Nix dependencies/hashes/source whitelisting,
package/module/service hardening, runtime ownership, backup/restore, memory
measurement and separately authorized cutover. No live data, private exports,
production writes or cross-platform builds were used for this milestone.
