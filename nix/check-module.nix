{ self, nixpkgs, system }:
let
  pkgs = nixpkgs.legacyPackages.${system};
  evaluate = environmentFile: (nixpkgs.lib.nixosSystem {
    inherit system;
    modules = [
      self.nixosModules.default
      {
        system.stateVersion = "26.05";
        services.alculator = { enable = true; inherit environmentFile; };
        services.postgresql = { enable = true; package = pkgs.postgresql_17; };
      }
    ];
  }).config;
  cfg = evaluate "/run/agenix/alculator";
  svc = cfg.systemd.services.alculator;
  bad = evaluate "/nix/store/not-a-runtime-secret";
in
assert svc.environment.HOSTNAME == "127.0.0.1";
assert svc.serviceConfig.User == "alculator";
assert svc.serviceConfig.EnvironmentFile == "/run/agenix/alculator";
assert svc.serviceConfig.ProtectSystem == "strict";
assert cfg.users.users.alculator.isSystemUser;
assert cfg.services.postgresql.ensureDatabases == [];
assert cfg.services.postgresql.ensureUsers == [];
assert cfg.networking.firewall.allowedTCPPorts == [];
assert !(builtins.hasAttr "alculator-migrate" cfg.systemd.services);
assert builtins.any (entry: !entry.assertion && nixpkgs.lib.hasPrefix "Alculator environmentFile" entry.message) bad.assertions;
pkgs.runCommand "alculator-module-check" {} ''
  echo 'PASS: loopback, dedicated user, runtime secret assertion, hardening; no DB provisioning/migrations/firewall' > "$out"
''
