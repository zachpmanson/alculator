# Alculator

Find the cheapest drinks, per standard. React 18/Vite builds a static UI;
one Go executable embeds it and serves the same-origin API with SQLite reports.
Node/pnpm are development/build tools only. See the
[approved plan](docs/go-static-react-plan.md), [backend contracts](docs/backend-milestone1.md)
and [milestone 2 checks](docs/frontend-milestone2.md).

## Development and checks

```sh
nix develop "path:$PWD"
make install
make build                 # Vite first, then Go with the frontend embedding tag
make typecheck lint test-go test-http test-secrets
```

For the offline synthetic browser suite on Linux:

```sh
nix develop "path:$PWD#browser" --command make test-browser
# Or run make test in that shell for all checks.
```

To serve locally, export a private, nonempty `REPORT_ADMIN_PASSWORD` at runtime
(do not put secrets in frontend variables), then:

```sh
./bin/alculator serve -listen 127.0.0.1:18080 -db data/dev-reports.sqlite
# Or make dev: Go on 18080 + Vite on 5173 with an /api proxy.
```

Normal development contacts the public catalogue/metadata and product image
hosts. Tests do not: browser fixtures use only ephemeral loopback servers and
temporary SQLite databases, with external browser requests intercepted locally.
No real datasets are included.

A bare `go test ./...` works without a frontend build. A bare `go build` is
intentionally **not** a deployable UI build; serving without embedded assets fails
before opening state. Use `make build` for the combined executable. No generated
bundle is committed. Production Nix packaging, service and deployment are a
separate, deferred milestone.
