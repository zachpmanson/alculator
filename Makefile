.PHONY: install frontend build test test-go test-http test-browser test-secrets typecheck lint dev clean

install:
	pnpm install --frozen-lockfile

frontend:
	pnpm build

build: frontend
	go build -tags frontend -o bin/alculator ./cmd/alculator

test-go:
	go test ./...
	go test -race ./...
	go vet ./...

test-http: build
	go test -tags frontend ./internal/web ./cmd/alculator
	node tests/http-smoke.mjs

test-secrets:
	node tests/bundle-secrets.mjs

test-browser: frontend
	ALCULATOR_BROWSER_TEST=1 go test -tags frontend ./internal/web -run TestBrowser -count=1 -v

typecheck:
	pnpm typecheck

lint:
	pnpm lint

test: typecheck lint test-go test-secrets test-http test-browser

# Runtime password must be exported by the caller; no credentials in Vite env.
dev: build
	./scripts/dev.sh

clean:
	rm -rf bin internal/web/dist
