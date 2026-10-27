"""Offline installed-package checks: synthetic state, ephemeral loopback only."""
import http.client
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time

binary = sys.argv[1]
secret = "synthetic-nix-package-not-a-credential"
with tempfile.TemporaryDirectory() as tmp:
    state = Path(tmp) / "state"
    db = state / "reports.sqlite"
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    env = {"REPORT_ADMIN_PASSWORD": secret}
    with tempfile.TemporaryFile() as logs:
        process = subprocess.Popen(
            [binary, "serve", "-listen", f"127.0.0.1:{port}", "-db", str(db)],
            env=env, cwd=tmp, stdout=logs, stderr=logs, umask=0o077,
        )
        def request(path, method="GET", data=None):
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            try:
                conn.request(method, path, body=json.dumps(data) if data is not None else None,
                             headers={"Content-Type": "application/json"} if data is not None else {})
                response = conn.getresponse()
                return response.status, dict(response.getheaders()), response.read()
            finally:
                conn.close()
        try:
            for _ in range(100):
                try:
                    if request("/healthz")[0] == 200:
                        break
                except OSError:
                    pass
                assert process.poll() is None, "server exited"
                time.sleep(0.05)
            else:
                raise AssertionError("server not ready")
            assert request("/healthz")[2] == b"ok\n"
            assert request("/healthz", "HEAD")[2] == b""
            for route in ["/", "/reports", "/reports?direct=true"]:
                code, headers, html = request(route)
                assert code == 200 and "text/html" in headers["Content-Type"]
                assert b'<div id="root">' in html
                scripts = re.findall(rb'src="(/assets/[^\"]+\.js)"', html)
                styles = re.findall(rb'href="(/assets/[^\"]+\.css)"', html)
                assert scripts and styles
                for asset in scripts + styles:
                    code, headers, content = request(asset.decode())
                    assert code == 200 and "immutable" in headers["Cache-Control"]
                    assert secret.encode() not in content and b"REPORT_ADMIN_PASSWORD" not in content
                    assert len(content) > (10000 if asset.endswith(b".js") else 100)
            assert request("/icons/favicon-32x32.png")[2].startswith(b"\x89PNG")
            for route in ["/unknown", "/api/unknown", "/assets/missing.js", "/assets/",
                          "/reports/other", "/.env", "/reports.sqlite"]:
                code, _, content = request(route)
                assert code == 404 and b'<div id="root">' not in content, route
            assert request("/", "POST")[0] == 405
            assert json.loads(request("/api/blacklist")[2]) == []
            assert request("/api/blacklist/report", "POST", {"product_code": "fixture-nix-001"})[0] == 201
            pending = json.loads(request("/api/blacklist/report")[2])
            assert len(pending) == 1
            assert request("/api/blacklist/resolve", "PATCH", {
                "id": pending[0]["id"], "blacklisted": False, "password": secret,
            })[0] == 200
            assert json.loads(request("/api/blacklist/report")[2]) == []
            assert stat.S_IMODE(state.stat().st_mode) == 0o700
            for suffix in ["", "-wal", "-shm"]:
                assert stat.S_IMODE(Path(str(db) + suffix).stat().st_mode) == 0o600
            # Linux package checks also prove the credential is not in argv.
            assert secret.encode() not in Path(f"/proc/{process.pid}/cmdline").read_bytes()
        finally:
            process.send_signal(signal.SIGTERM)
            process.wait(timeout=8)
            logs.seek(0)
            output = logs.read()
        assert process.returncode == 0
        assert secret.encode() not in output
print("PASS installed binary: real embedded bundle/assets/404s, local health, synthetic API, 0700/0600 DB/WAL/SHM, graceful SIGTERM; no upstream reads")
