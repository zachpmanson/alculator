# M3: production package and generic NixOS service

This milestone is packaging only: no host activation, agenix wiring, proxy,
firewall, DNS, deployment, real-data import or automatic migration/reset hooks.
The earlier Next/PostgreSQL host draft is superseded, not a prerequisite.
Independent review and owner-controlled live approval are required before any
host integration. Parent retains the private 145-report reconciliation gate.

## Build and checks

```sh
nix build .#default
nix flake check -L
nix path-info -r .#default        # review the entire installed runtime closure
nix run . -- serve -listen 127.0.0.1:18080 -db /private/disposable/reports.sqlite
# The last command requires REPORT_ADMIN_PASSWORD supplied in the environment.
```

During review only, use `"path:$PWD"` instead of `.` to include new, unstaged Nix
files. This worktree contains no real secrets/data; a path flake itself snapshots
its input before package filtering. Production rebuilds must use the published,
reviewed clean Git source, never an arbitrary private worktree.

`flake.lock` pins nixpkgs; `packageManager` must match the pinned pnpm exactly
(currently 11.27.0). `pnpm-lock.yaml` plus `fetchPnpmDeps` fetcher version 5 and its
SHA-256 pin frontend dependencies. `vendorHash` pins Go modules. Changing lockfiles
requires reviewing dependencies and updating the corresponding fixed-output hash;
Nix hash discovery failures are expected only during that explicit update. No
network access is needed in the actual frontend/Go build phases or checks.

The explicit source allowlist in `nix/source.nix` does not depend on Git ignore
rules. It admits only build configuration, Go/React source, public icons and
synthetic catalogue fixtures. Hidden/env files, databases/WAL/SHM, generated
`internal/web/dist`, node_modules, bin, data/state/exports and `.pi-subagents` are
excluded even in dirty path input. Symlinks are not admitted. Vite builds fresh
assets; Go uses CGO SQLite and the `frontend` tag. The installed package contains
one executable, no separate assets/source tree and no Node/pnpm/Prisma/PostgreSQL
runtime. No `VITE_*` credentials or runtime env values enter the derivation.

Flake checks cover tagged Go tests, the installed executable's embedded real
JS/CSS/icons, direct routes and static/API 404s, SQLite-only HTTP operations,
local health, graceful SIGTERM, private state/DB/WAL/SHM modes, source exclusion,
closure, module evaluation/unit generation, and executable environment guards.
They use synthetic passwords, temporary SQLite state and ephemeral loopback ports;
none read the public catalogue or private reports. Python is check-only, not a
service/package runtime dependency. No sudo, VM or system service mutation is used.
The module check is structural plus an executable launcher test, not a claim that
systemd sandboxing has been exercised in a VM. Existing browser checks remain
optional dev-shell tooling (`nix develop .#browser --command make test-browser`).
Actual package/check builds are validated on x86_64 Linux; other outputs are not
claims of tested cross-platform deployment.

## Generic module

Import the flake's `nixosModules.default` (alias `alculator`) in the future host
configuration. The only service options are:

```nix
services.alculator = {
  enable = true;
  # package = inputs.alculator.packages.${pkgs.stdenv.hostPlatform.system}.default;
  # port = 3010;
  # environmentFile = "/run/agenix/alculator-env";  # default, runtime path only
};
```

The exported flake module defaults to this flake's pinned package, even when the
consuming host uses a different pnpm/nixpkgs version; an explicit `package` override
is still supported. The standalone `nix/module.nix` fallback builds with the
consumer's pkgs, so standalone imports need a compatible toolchain or an explicit
package. Checks exercise the exported default against a differing synthetic host
pnpm version.

The module does not import agenix or provision that file. The host owner must
supply a protected, root-controlled systemd EnvironmentFile outside `/nix/store`.
Do not use `builtins.readFile`, inline Nix values, command-line assignments or
frontend variables for credentials. The application runtime names are only:

- `REPORT_ADMIN_PASSWORD`: required, nonempty moderation password. The effective
  environment guard also rejects the known shipped dummy
  `REPLACE_ME_ADMIN_PASSWORD`. Errors are sanitized and never print values.
- `DATA_REPO`: optional `owner/repo`, used **only** for GitHub master-branch
  timestamp lookup. It does not change the six fixed catalogue feed URLs. A
  supplied malformed value is rejected before the app opens state. An absent
  value leaves timestamp lookup unconfigured (it can fail without failing health).

Passwords remain in the inherited process environment, never argv. Root controls
this file and the service: the guard is not a privilege boundary against a
malicious root-owned EnvironmentFile. Other application env names do not override
the explicit `serve -listen 127.0.0.1:<port> -db
/var/lib/alculator/reports.sqlite` flags. The launcher provides a pinned CA bundle;
normal system DNS and outbound IPv4/IPv6 DNS/HTTPS access remain available. The
loopback bind is **not** an outbound restriction. Do not add `PrivateNetwork` or a
localhost-only `IPAddressDeny/Allow` policy: GitHub feeds/metadata require egress.

The dedicated `alculator` user/group owns systemd `StateDirectory=alculator`
(0700), with UMask 0077 and SQLite main/WAL/SHM 0600. Systemd may create the empty
state directory before the guard; invalid env never starts the app or creates a
SQLite database. Installation is immutable, filesystem writes are restricted to
state (plus private temporary space), and SIGTERM allows the existing five-second
Go graceful shutdown within systemd's ten-second stop timeout. There are no PG
roles/databases, import/reset commands, root helpers, backup timers or automatic
live hooks. Host secret-rotation consumer restart triggers are a later parent-owned
integration task, deliberately absent here.

`GET /healthz` retains the Go semantics: cheap local `SELECT 1` availability plus
successfully initialized embedded UI, `ok\n` / 200, no cache; database failure
returns sanitized 503. HEAD is supported. It does not fetch feeds, test timestamp
configuration, count reports or attest upstream freshness. A cold upstream failure
can coexist with healthy local state.

## Operator-controlled state operations (later approval required)

Back up with SQLite's online backup API (for example the SQLite CLI `.backup`
command with a protected destination), or stop the service and capture a
consistent complete state directory. **Never copy only the main database file
while WAL is active.** Protect backup storage/transport separately; encryption,
scheduling and retention are host-owner decisions, not this module's hooks.
Verify backup integrity on a disposable copy and preserve restricted permissions.
For restore, stop the service, retain a rollback copy, restore the consistent
snapshot with `alculator:alculator` ownership and directory 0700/files 0600, verify
integrity and allocation state, then restart only after approval. Never mix an
old main database with unrelated WAL/SHM files.

For the one-time report seam, first use disposable state and the approved
[version 1 contract](report-import-format.md). Verify immutable source checksums
before and after, all fields/counts (including null versus false and leading
zeros), integrity and next-ID continuation. For an approved target, stop the
service and back it up before running the packaged executable's explicit
`import -db <target> -input <approved-immutable-source>` as the state owner; no
moderation password is needed for import. Exact replay inserts zero, conflicts
roll back, and allocation never rewinds. Reconcile before restart; never reset or
silently replace newer state. Private source exports and secret values must stay
outside Git and the Nix store. No real-data operation is performed by these checks.

**Stop gate:** package/module review now. Production clean-source rebuild,
private reconciliation, consumer rotation triggers and any host activation belong
to the parent/owner later; they are not authorized by a successful M3 build.
