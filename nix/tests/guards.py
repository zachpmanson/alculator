"""Exercise the module's actual launcher template using a non-serving stub."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

runner = sys.argv[1]
secret = "synthetic-guard-not-a-credential"
with tempfile.TemporaryDirectory() as tmp:
    marker = Path(tmp) / "started"
    base = {"GUARD_TEST_MARKER": str(marker)}
    for password, repo, field in [
        (None, "", "REPORT_ADMIN_PASSWORD"),
        ("", "", "REPORT_ADMIN_PASSWORD"),
        ("REPLACE_ME_ADMIN_PASSWORD", "", "REPORT_ADMIN_PASSWORD"),
        (secret, "https://synthetic.invalid/private-value", "DATA_REPO"),
        (secret, "owner/repo?synthetic-sensitive-value", "DATA_REPO"),
    ]:
        env = base | {"DATA_REPO": repo}
        if password is not None:
            env["REPORT_ADMIN_PASSWORD"] = password
        result = subprocess.run([runner], env=env, capture_output=True, timeout=5)
        assert result.returncode == 1 and not marker.exists()
        assert result.stdout == b""
        assert result.stderr.decode() == f"alculator: invalid {field} configuration\n"
    for repo in ["", "synthetic-owner/fixture.repo"]:
        env = base | {"REPORT_ADMIN_PASSWORD": secret, "DATA_REPO": repo,
                      "DATABASE_URL": "postgres://synthetic.invalid/no-connection",
                      "LISTEN": "0.0.0.0:1", "PORT": "1", "DB": str(Path(tmp) / "redirected.sqlite")}
        # Extra argv and unrelated env cannot redirect the module's fixed flags.
        result = subprocess.run([runner, "-db", "ignored.sqlite", "-listen", "0.0.0.0:1"],
                                env=env, capture_output=True, timeout=5)
        assert result.returncode == 0 and marker.exists(), result.stderr
        assert json.loads(result.stdout) == ["serve", "-listen", "127.0.0.1:3010", "-db", "/var/lib/alculator/reports.sqlite"]
        assert secret.encode() not in result.stdout + result.stderr
        assert not (Path(tmp) / "redirected.sqlite").exists()
        marker.unlink()
print("PASS effective-env guard: absent/empty/shipped dummy admin and malformed DATA_REPO fail sanitized before app/state; fixed CLI ignores ambient env/argv; credentials inherited, never argv")
