{ pkgs, package, listen, database }:
# Validate the effective EnvironmentFile values, not build-time Nix values.
# No values are printed; reject configuration before the executable opens SQLite.
pkgs.writeShellScript "alculator-start" ''
  if [[ -z "''${REPORT_ADMIN_PASSWORD:-}" || "''${REPORT_ADMIN_PASSWORD:-}" == REPLACE_ME_ADMIN_PASSWORD ]]; then
    echo 'alculator: invalid REPORT_ADMIN_PASSWORD configuration' >&2
    exit 1
  fi
  if [[ -n "''${DATA_REPO:-}" && ! "''${DATA_REPO}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    echo 'alculator: invalid DATA_REPO configuration' >&2
    exit 1
  fi
  # Credentials remain in the inherited environment, never command arguments.
  export REPORT_ADMIN_PASSWORD
  export DATA_REPO="''${DATA_REPO:-}"
  export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
  exec ${package}/bin/alculator serve \
    -listen ${pkgs.lib.escapeShellArg listen} -db ${pkgs.lib.escapeShellArg database}
''
