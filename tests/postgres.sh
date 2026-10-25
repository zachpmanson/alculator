#!/usr/bin/env bash
# Disposable cluster ONLY; never accepts an external DATABASE_URL or PGDATA.
set -euo pipefail
root=$(pwd)
tmp=$(mktemp -d /tmp/alculator-test.XXXXXXXX)
chmod 700 "$tmp"
server_pid=
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  pg_ctl -D "$tmp/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
# libpq accepts many connection overrides (notably PGHOSTADDR); discard all.
for name in ${!PG@}; do unset "$name"; done
unset DATABASE_URL
initdb -D "$tmp/pg" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=reject >"$tmp/init.log"
pg_ctl -D "$tmp/pg" -l "$tmp/postgres.log" -o "-h '' -k $tmp" start >/dev/null
export PGHOST="$tmp" PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE alculator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE alculator OWNER alculator;
SQL
export DATABASE_URL="postgresql://alculator@localhost/alculator?host=$tmp"
npm exec prisma -- db push --skip-generate
# Provisioning belongs to an owner, not the runtime app. Narrow privileges after
# disposable schema bootstrap; the production module runs no schema commands.
psql -X -d alculator -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE alculator_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE alculator OWNER TO alculator_owner;
ALTER SCHEMA public OWNER TO alculator_owner;
ALTER TABLE reports OWNER TO alculator_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE alculator TO alculator;
GRANT USAGE ON SCHEMA public TO alculator;
GRANT SELECT, INSERT, UPDATE ON reports TO alculator;
GRANT USAGE, SELECT ON SEQUENCE reports_id_seq TO alculator;
SQL
# Fixture sequence setup uses the owner connection; runtime cannot reset it.
psql -X -d alculator -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO reports (id,product_code,is_resolved,timestamp,blacklisted) VALUES
(7,'00042',false,1700000000123,NULL),(15,'blocked',true,1700000000456,true),(20,'kept',true,1700000000789,false);
SELECT setval('reports_id_seq', 50, true);
SQL
# Exercise PG17 dump/restore, ID/field fidelity and sequence preservation.
pg_dump -Fc --no-owner --no-acl -U alculator -d alculator -f "$tmp/copy.dump"
createdb -O alculator_owner alculator_copy
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --role=alculator_owner -d alculator_copy "$tmp/copy.dump"
psql -X -U alculator -d alculator -Atc 'SELECT row_to_json(r) FROM reports r ORDER BY id' >"$tmp/before"
psql -X -d alculator_copy -Atc 'SELECT row_to_json(r) FROM reports r ORDER BY id' >"$tmp/after"
cmp "$tmp/before" "$tmp/after"
test "$(psql -X -d alculator_copy -Atc 'SELECT last_value || chr(58) || is_called FROM reports_id_seq')" = '50:true'
test "$(psql -X -U alculator -d alculator -Atc "SELECT has_schema_privilege(current_user,'public','CREATE') OR has_table_privilege(current_user,'reports','DELETE') OR has_sequence_privilege(current_user,'reports_id_seq','UPDATE')")" = f
# The checked package is preferred; local standalone works after npm run build.
app=${ALCULATOR_PACKAGE:-$root/.next/standalone}
export REPORT_ADMIN_PASSWORD=disposable-test-only HOSTNAME=127.0.0.1 DATA_REPO=test/fixture
# Ask the OS for a free HTTP port; only loopback is bound.
PORT=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
export PORT
node --require "$root/tests/fetch-fixture.cjs" "$app/server.js" >"$tmp/http.log" 2>&1 &
server_pid=$!
if ! node "$root/tests/http-smoke.mjs"; then cat "$tmp/http.log"; exit 1; fi
if grep -Ei 'failed to detect.*openssl|unable to require.*engine|PrismaClientInitializationError' "$tmp/http.log"; then exit 1; fi
printf 'PASS: private PostgreSQL17 dump/restore, exact fields/sequence and standalone HTTP with dedicated non-superuser role\n'
