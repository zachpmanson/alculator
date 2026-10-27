{ pkgs, package, nixpkgsPath, module }:
let
  inherit (pkgs) lib;
  evaluate = settings: (import (nixpkgsPath + "/nixos/lib/eval-config.nix") {
    system = pkgs.stdenv.hostPlatform.system;
    modules = [ module {
      system.stateVersion = "26.05";
      boot.loader.grub.enable = false;
      fileSystems."/" = { device = "none"; fsType = "tmpfs"; };
    } settings ];
  }).config;
  disabled = evaluate { };
  enabled = evaluate { services.alculator.enable = true; };
  differentHost = evaluate {
    services.alculator.enable = true;
    nixpkgs.overlays = [ (final: prev: {
      pnpm = prev.pnpm // { version = "synthetic-different-host-version"; };
    }) ];
  };
  invalid = path: evaluate {
    services.alculator = { enable = true; environmentFile = path; };
  };
  unit = enabled.systemd.services.alculator;
  service = unit.serviceConfig;
  no = attr: !(builtins.hasAttr attr service);
  stub = pkgs.runCommand "alculator-guard-stub" { } ''
    mkdir -p $out/bin
    cat > $out/bin/alculator <<'PY'
    #!${pkgs.python3}/bin/python3
    import json, os, pathlib, sys
    assert os.environ['REPORT_ADMIN_PASSWORD'] == 'synthetic-guard-not-a-credential'
    assert os.environ['SSL_CERT_FILE'].endswith('/etc/ssl/certs/ca-bundle.crt')
    pathlib.Path(os.environ['GUARD_TEST_MARKER']).touch()
    print(json.dumps(sys.argv[1:]))
    PY
    chmod +x $out/bin/alculator
  '';
  guardRunner = import ./service-runner.nix {
    inherit pkgs;
    package = stub;
    listen = "127.0.0.1:3010";
    database = "/var/lib/alculator/reports.sqlite";
  };
  source = package.source;
  excluded = [ ".env" ".env.production" ".pi-subagents/fixture.go"
    "node_modules/fixture.ts" "internal/web/dist/index.html" "bin/alculator"
    "data/reports.sqlite" "state/fixture.go" "exports/fixture.json"
    "src/.env" "src/fixture.sqlite" "internal/fixture.db-wal"
    "internal/web/dist/fixture.go" "public/icons/.env.png" ];
  filterRejects = rel: !(source.filter (toString ../. + "/" + rel) "regular");
in {
  package = package;
  package-http = pkgs.runCommand "alculator-package-http" {
    nativeBuildInputs = [ pkgs.python3 ];
  } ''
    python3 ${./tests/package.py} ${package}/bin/alculator
    touch $out
  '';
  runtime-guards = pkgs.runCommand "alculator-runtime-guards" {
    nativeBuildInputs = [ pkgs.python3 ];
  } ''
    python3 ${./tests/guards.py} ${guardRunner}
    touch $out
  '';
  module = assert !(disabled.systemd.services ? alculator);
    assert !(disabled.users.users ? alculator);
    assert !(disabled.users.groups ? alculator);
    assert lib.all (a: a.assertion) enabled.assertions;
    assert lib.any (a: !a.assertion) (invalid "relative.env").assertions;
    assert lib.any (a: !a.assertion) (invalid "/nix/store/fixture-env").assertions;
    assert toString enabled.services.alculator.package == toString package;
    assert toString differentHost.services.alculator.package == toString package;
    assert enabled.users.users.alculator.isSystemUser;
    assert enabled.users.users.alculator.group == "alculator";
    assert service.User == "alculator" && service.Group == "alculator";
    assert service.EnvironmentFile == "/run/agenix/alculator-env";
    assert service.StateDirectory == "alculator" && service.StateDirectoryMode == "0700";
    assert service.UMask == "0077" && service.ProtectSystem == "strict";
    assert service.ReadWritePaths == [ "/var/lib/alculator" ];
    assert service.TimeoutStopSec == "10s" && service.KillSignal == "SIGTERM";
    assert no "PrivateNetwork" && no "IPAddressDeny" && no "IPAddressAllow";
    assert no "ExecStartPre" && no "ExecStartPost";
    assert unit.preStart == "" && unit.postStart == "";
    assert !(service ? Environment);
    assert lib.all (family: builtins.elem family service.RestrictAddressFamilies) [ "AF_INET" "AF_INET6" "AF_UNIX" ];
    assert unit.restartTriggers == [ ];
    pkgs.runCommand "alculator-module-check" { } ''
      # Force generation of the actual NixOS unit without starting any service.
      test -s ${enabled.systemd.units."alculator.service".unit}/alculator.service
      grep -Fq -- '-listen 127.0.0.1:3010 -db /var/lib/alculator/reports.sqlite' ${service.ExecStart}
      grep -Fq -- 'exec ${package}/bin/alculator serve' ${service.ExecStart}
      ! grep -Fq -- 'env -i' ${service.ExecStart}
      echo 'PASS module: disabled inert; dedicated identity/state/modes; fixed CLI; runtime EnvFile; outbound IP families enabled; no host wiring'
      touch $out
    '';
  source-filter = assert lib.all filterRejects excluded;
    pkgs.runCommand "alculator-source-filter" { } ''
      test -f ${source}/go.mod
      test -f ${source}/src/main.tsx
      test -f ${source}/internal/catalogue/testdata/golden.json
      test -z "$(find ${source} \( -name '.*' -o -name node_modules -o -name dist -o -name '*.sqlite*' -o -name '*.db*' -o -name bin \) -print)"
      echo 'PASS explicit source filter: required sources/fixtures only; no hidden/generated/state files'
      touch $out
    '';
  closure = pkgs.runCommand "alculator-runtime-closure" { } ''
    test -x ${package}/bin/alculator
    test "$(find ${package} -type f | wc -l)" -eq 1
    if grep -E '/[^/]*-(nodejs[^/]*|pnpm[^/]*|alculator-frontend[^/]*|alculator-source)$' \
      ${pkgs.closureInfo { rootPaths = [ package ]; }}/store-paths; then
      echo 'unexpected build-time runtime dependency' >&2
      exit 1
    fi
    cat ${pkgs.closureInfo { rootPaths = [ package ]; }}/store-paths
    echo 'PASS runtime closure: no Node/pnpm/frontend/source tree'
    touch $out
  '';
}
