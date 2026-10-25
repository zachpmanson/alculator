# Naboo preparation — NOT deployed

Scope: [zpm/alculator#8](https://github.com/zachpmanson/alculator/issues/8). Alculator stays Next.js + PostgreSQL. The separate deployment API Go/SQLite work, other apps, host wiring, provisioning, secrets and cutover are not implemented here. The repository's actual default branch is `main`; all changes stay on Zach's repository.

## Build and develop (no global installs)

```sh
nix develop
npm ci
npm run lint
npm run typecheck
npm test
# No network/DB access during the build; URL is deliberately unusable.
DATABASE_URL=postgresql://build:unused@127.0.0.1:1/build_dummy npm run build
npm run test:db
exit
nix build
nix flake check
# Exercise the actual immutable package with private disposable PG17:
app=$(nix build --no-link --print-out-paths)
ALCULATOR_PACKAGE="$app" nix develop -c bash -c '
  export PRISMA_QUERY_ENGINE_LIBRARY="$ALCULATOR_PACKAGE/node_modules/.prisma/client/libquery_engine-linux-nixos.so.node"
  npm run test:db
'
```

Before the new files are committed, use `path:$PWD` as the flake reference so Nix includes untracked files without staging them. npm/package-lock.json is authoritative (Node22/npm10); no second JS lockfile. `test:db` unsets inherited libpq variables and DATABASE_URL, creates a private /tmp cluster with TCP disabled, a non-superuser `alculator` role, fixture-only DBs, dump/restore and a loopback standalone server. It cleans up on exit. GitHub responses are replaced by test-only preload fixtures. Never use this script as a migration tool.

Package build runs lint, typecheck and unit tests in the sandbox, then Next's webpack standalone build. It copies public/static assets and the native Prisma engine. There is no schema mutation, prerendered DB query or remote drinks fetch during build. Generated client and Nix engine are **both 6.19.3**; package evaluation rejects a different engine version. Runtime uses the exact packaged engine path, not a host nixpkgs engine or a musl filename. OpenSSL is explicitly available in build/dev/service PATH to avoid Prisma's NixOS detection warning. Re-check native query/write behavior when changing Prisma/nixpkgs or architecture.

When dependencies change, regenerate package-lock.json with `npm install` in the shell. Set npmDepsHash in package.nix temporarily to `lib.fakeHash`, build, copy the reported hash and rebuild. Never put environment files or credentials in derivations, flake inputs or the repository.

### Version review and evidence

Validated on x86_64-linux with pinned nixpkgs nixos-26.05 revision in flake.lock (2026-10-25): Node22.23.4, npm10.9.9, Next16.4.3 (active patched major), React/DOM19.3.1, Prisma/client6.19.3, TypeScript5.9.3. Prisma6 avoids a driver-adapter/schema architecture migration and matches fleet-provided engines exactly. Reassess Prisma support/security on each release; do not independently upgrade native engines. The Prisma config-only transitive `deepmerge-ts` is overridden to patched 8.0.0 (GHSA-ggr8-5vv4-36mx); generation, schema push in disposable DB and package build validate the used CLI paths. `npm audit` reports zero vulnerabilities at preparation time, not a permanent guarantee. ESLint9.39.5 is retained for eslint-config-next's plugins' peer compatibility (npm marks it deprecated); it is development-only, not the public service. Upgrade with the Next lint plugin ecosystem when compatible.

Validated: unit regressions; full UI typecheck/production compile; private PG17 exact report fields/IDs/nulls/sequence dump/restore; packaged native engine, homepage/reports SSR and drinks/timestamp/report/admin/blacklist HTTP. NixOS evaluation tests cover loopback, runtime secrets, dedicated user, hardening, absence of DB provisioning/migration/firewall effects. aarch64-linux output is provided but not built/run here. Real systemd hardening/HTTPS/real data must be validated by owner later.

## Separately reviewed host wiring (example only)

```nix
{
  imports = [ inputs.alculator.nixosModules.default ];
  services.alculator = {
    enable = true;
    port = 3002; # confirm unused
    environmentFile = config.age.secrets.alculator.path;
  };
  # Owner adds agenix encrypted secret definition separately (root-readable).
  # Owner adds nginx HTTPS/ACME separately; proxy to http://127.0.0.1:3002.
}
```

Module creates only the dedicated `alculator` system user/group and service. It **does not** provision PostgreSQL, change listeners/authentication, create databases, run Prisma, reset schemas, configure nginx/DNS or open firewall ports. It orders/requires the host's existing postgresql.service. environmentFile is an absolute runtime string (agenix `.path` works); /nix/store paths are rejected. PID1 reads the root-only environment file. Do not use `builtins.readFile`/`writeText`/a Nix path literal for secrets. Module uses a read-only working directory; this Pages UI has no ISR or optimized-image disk cache. Do not add writable app directories without a new requirement.

Owner transfers these **names only**, through a secure local workflow from Vercel to agenix: `REPORT_ADMIN_PASSWORD`, `DATA_REPO`; replace `DATABASE_URL` with the new local dedicated role's connection. No values in terminals/logs/chat/git/store. Set a nonempty admin password; absent/empty fails closed. A systemd env file uses `NAME=value` (no shell exports/expansion). Percent-encode password components in the DB URL; use a local socket or 127.0.0.1, not the old remote account. Keep mode0400/root ownership for the decrypted file. No new remote DB credential is needed.

## Owner-only database migration/cutover runbook

**Stop gate:** instructions below are preparation, not authorization. Require explicit owner approval before source access, root/provisioning, credentials, deployment, writer freeze or DNS. Never point test tools at real databases. Never run `prisma db push`, `migrate reset`, `DROP DATABASE`, `--clean`, or generic cluster restore scripts on Naboo. Do not modify Minecraftle/Penultimate Guitar DBs/roles/services, shared `db.zachmanson.com`, or decommission DO here.

### 1. Inventory, access and rehearsal

- Owner confirms source PG14 database `alculator`, actual schema/table/sequence names, columns/types/defaults/constraints/indexes, encoding/locale, extensions (expected only plpgsql), DB size and all writers (Vercel, admin/report endpoints, alculator-data, scripts). 145 reports is **point-in-time**, not the required final count.
- Record current source and target exact versions and host cluster inventory before changes. PG17 `pg_dump` can read PG14; use the same PG17 client for dump and restore. No physical PG14 data-directory copy. Do not switch a shared host cluster's major version/dataDir or initialize over existing PG data.
- Owner supplies existing approved source read access over verified TLS and target local access through private libpq service/pass files (0600 outside repo/store; never password-bearing command arguments, history, `set -x` or logs). Place backups on private encrypted storage with umask077, checksum, access control and retention policy. Do not publish dump contents; reports can be sensitive.
- Rehearse full dump/restore and HTTP workflow into an **explicitly named disposable database on a disposable/private PG17 instance**, not by resetting the real target. Measure freeze duration. Verify schema matches prisma/schema.prisma; this repo has no migration history. Do not invent/run a baseline migration against imported data.
- Record ordered full-row exports/checksums (all five fields: id, product_code, is_resolved, timestamp BigInt milliseconds, blacklisted including NULL), counts by resolution/blacklist state, duplicate product codes, min/max ID/timestamps, and actual sequence last_value/is_called + column default/ownership. Compare values exactly, not just total count. For deterministic comparison, `COPY (SELECT id,product_code,is_resolved,timestamp,blacklisted FROM public.reports ORDER BY id) TO STDOUT WITH CSV` into private files works; compare with `cmp`/hashes. Verify actual schema before using names below.

### 2. Dedicated local target (owner root/DBA change, separately reviewed)

- On the intended PG17 instance, local-only listener (Unix socket or loopback), no wildcard/public bind, no firewall exposure of5432, least-privilege pg_hba entries (peer for matching Unix user or local SCRAM). Review global changes against existing apps; do not replace their authentication rules. Confirm with socket/listener inspection and external connection denial.
- Create **only** database/role `alculator` if not present, or STOP and inspect existing content/ownership. Role: LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS. Use a separately reviewed owner/DBA identity for restore. Prefer schema owner distinct from runtime: app needs CONNECT, schema USAGE, SELECT/INSERT/UPDATE on reports, USAGE/SELECT on reports_id_seq; no DELETE, DDL or access to other app databases. Revoke unnecessary PUBLIC schema creation and cross-app access only in the alculator database; review role/database ACLs. If the simpler app-owned DB/schema fleet pattern is approved, explicitly accept its additional DDL privileges.
- Keep target service stopped / proxy blocked until final restore and validation. No automatic migration service is supplied. Set up local URL/agenix and admin/data-source env by owner, without importing old superuser credentials.

### 3. Freeze and final copy

1. Schedule maintenance, retain current Vercel/source settings and private backups, record DNS TTL and rollback owner. Lower TTL ahead of time only with approval. Freeze **all writes** on old Vercel host (report POST, admin PATCH) and any direct writers; use a reviewed upstream maintenance gate or stop serving the old app. DNS alone does not freeze cached/direct Vercel clients. Drain in-flight writes, confirm DB activity/counters stay stable and keep freeze active through cutover. Target must also remain inaccessible to public writers.
2. With a PG17 client and private libpq service entries (names below are placeholders configured by owner), take the final DB-specific dump, not pg_dumpall:
   ```sh
   umask 077
   pg_dump --dbname='service=alculator-source' --format=custom \
     --no-owner --no-acl --file=alculator-final.dump
   sha256sum alculator-final.dump > alculator-final.dump.sha256
   pg_restore --list alculator-final.dump > alculator-final.toc
   ```
   Verify command success/checksum/TOC privately, selected DB/version and only expected objects, including reports data and SEQUENCE SET. Record final source checks while freeze persists. Dump preserves original values/IDs and sequence state in a consistent snapshot. No source changes by dump itself; a dump alone does not enforce freeze.
3. Restore **only into the verified empty alculator target DB** as the reviewed owner role, never postgres/other app DB accidentally. Use `--no-owner --no-acl`, not source global roles or grants:
   ```sh
   pg_restore --dbname='service=alculator-target-owner' \
     --exit-on-error --single-transaction --no-owner --no-acl \
     alculator-final.dump
   ```
   Abort on any error; do not use `--clean`, cascade drops or blindly retry into a partially restored DB. `--single-transaction` should leave it unchanged on failure. If a target rehearsal DB is nonempty, restore to a new approved empty DB or stop for review rather than deleting it.
4. Verify all report IDs/fields/NULLs/timestamps/checksums/counts and constraints/defaults/indexes, and sequence **last_value and is_called exactly** vs frozen source. Sequence state need not equal max(id), and may have gaps; do not reset to COUNT or MAX. Confirm the next generated ID cannot collide (if source sequence was inconsistent, STOP for approval rather than quietly repairing it). Apply reviewed local owner/grants for the runtime role, check it is non-superuser and cannot read/write other app databases. Test restore + app query with local-only connection as `alculator`.

### 4. Pre-switch validation, HTTPS and DNS (explicit owner approval)

- Start reviewed service, inspect systemd status/journal for startup/Prisma/OpenSSL errors (never dump environment). Verify HTTP binds only loopback, PostgreSQL only approved local sockets/listeners, runtime secret mode and no plaintext in Nix store. Test restart and systemd sandbox on Naboo.
- Validate through HTTPS reverse proxy with the intended Host/SNI **before DNS switch** (owner-managed local resolution/`curl --resolve`), trusted certificate, HTTPS redirect, proxy timeouts/body limits, origin URL and static assets. No Vercel/DNS changes in this code.
- Read checks: `/`, both existing UI modes/filter/search/paging/locked drinks/report UI; `/reports`; POST `/api/drinks` with current UI body; GET `/api/drinks/timestamp`; GET `/api/blacklist/report` and `/api/blacklist`. Compare existing valid responses/ordering and alculator-data client expectations. Reports are public reads by existing design; admin writes require password. Browser manual interaction remains an owner acceptance gate beyond compile/SSR tests.
- Write/admin checks: first use disposable rehearsal data for POST report →201, active list, wrong/absent admin password denied without mutation, valid Keep/Remove →200, resolved state/blacklist output, invalid bodies→400, unsupported method→405 and missing ID→404. If a final-target canary is required, owner records its ID/fields and approves it; do not silently delete real reports. Successful INSERT consumes sequence values even if later rolled back; document that intentional change vs final snapshot.
- After checks pass and owner approves, switch **only** `alculator.zachmanson.com` to Naboo; retain DO/Vercel and source freeze. Verify HTTPS/public reads from independent clients and no stale old-host writes. Release new-host writer gate deliberately, then validate a controlled report/admin operation and monitor errors/DB connections/resource use. Restart and reboot acceptance is host-side work. Do not mark deployed until these gates actually pass.

### 5. Rollback boundaries and retention

- Before accepting any new target writes, rollback can restore old DNS/routing, stop target app and release old writer freeze after confirming no divergence. Cached DNS means keep exactly one writer even during rollback.
- After target writes occur, old DO is stale. **Do not simply point back/reopen old writes**: that loses reports/admin state. Freeze both sides, take private backups of both, inventory changes including IDs/sequences, obtain an owner-approved reverse logical copy/reconciliation plan and test PG17→PG14 compatibility separately (not guaranteed). Resolve duplicate IDs/conflicts explicitly. This may require a forward fix/longer outage. Never overwrite either side without review.
- Keep Vercel/DO unchanged and backups encrypted through the agreed observation/rollback window. Document timing, counts, hashes and approvals without secrets. Retire old service/database and decide shared DO/DNS decommissioning only in separate owner work.

## Preserved behavior / bounded known issues

The drinks payloads still come from the hardcoded `pavo-etc/alculator-data` master JSON URLs with hourly memory cache. `DATA_REPO` still affects only the timestamp's master-branch GitHub API request (10-minute cache). No new auth requirement was added to public consumers. API response shapes and success codes remain; malformed drink/report/admin input and missing IDs now get explicit errors, DB failures on blacklist/report/admin return generic500 without connection details.

Existing promo pricing uses Math.max despite its comment saying lowest; search case handling, report anti-abuse/rate limiting and external GitHub failures/cache staleness are not redesigned here. Admin remains the existing password-in-JSON HTTPS mechanism, not sessions. Production proxy controls/rate limits, backup automation, source access, real PG14 rehearsal, manual browser acceptance and host hardening verification remain owner/reviewer gates.
