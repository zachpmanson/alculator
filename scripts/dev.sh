#!/usr/bin/env bash
set -euo pipefail
: "${REPORT_ADMIN_PASSWORD:?Export a nonempty runtime REPORT_ADMIN_PASSWORD first}"
./bin/alculator serve -listen 127.0.0.1:18080 -db data/dev-reports.sqlite &
backend=$!
trap 'kill "$backend" 2>/dev/null || true; wait "$backend" 2>/dev/null || true' EXIT INT TERM
pnpm dev
