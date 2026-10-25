self: { config, lib, pkgs, ... }:
let cfg = config.services.alculator;
in {
  options.services.alculator = {
    enable = lib.mkEnableOption "Alculator standalone Next.js service";
    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      description = "Standalone Alculator package, including the matching Prisma engine.";
    };
    port = lib.mkOption { type = lib.types.port; default = 3002; };
    hostname = lib.mkOption {
      type = lib.types.enum [ "127.0.0.1" "::1" ];
      default = "127.0.0.1";
      description = "Loopback bind address; put an HTTPS reverse proxy in front.";
    };
    environmentFile = lib.mkOption {
      type = lib.types.str;
      description = ''
        Absolute runtime path to a root-readable systemd environment file
        (for example config.age.secrets.alculator.path). Never a Nix store path.
        Required: DATABASE_URL, REPORT_ADMIN_PASSWORD, DATA_REPO.
      '';
    };
  };
  config = lib.mkIf cfg.enable {
    assertions = [{
      assertion = lib.hasPrefix "/" cfg.environmentFile && !(lib.hasPrefix "/nix/store/" cfg.environmentFile);
      message = "Alculator environmentFile must be an absolute runtime path outside the Nix store.";
    }];
    users.groups.alculator = {};
    users.users.alculator = {
      isSystemUser = true;
      group = "alculator";
      description = "Alculator app service";
    };
    # Deliberately no PostgreSQL provisioning, schema commands, migration unit,
    # firewall, DNS, nginx or ACME settings. Host wiring is separately reviewed.
    systemd.services.alculator = {
      description = "Alculator Next.js app";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" "postgresql.service" ];
      requires = [ "postgresql.service" ];
      path = [ pkgs.openssl ];
      environment = {
        NODE_ENV = "production";
        NEXT_TELEMETRY_DISABLED = "1";
        PORT = toString cfg.port;
        HOSTNAME = cfg.hostname;
        PRISMA_QUERY_ENGINE_LIBRARY = "${cfg.package}/node_modules/.prisma/client/libquery_engine-linux-nixos.so.node";
      };
      serviceConfig = {
        User = "alculator";
        Group = "alculator";
        EnvironmentFile = cfg.environmentFile;
        ExecStart = "${pkgs.nodejs_22}/bin/node ${cfg.package}/server.js";
        WorkingDirectory = cfg.package;
        Restart = "on-failure";
        RestartSec = "5s";
        UMask = "0077";
        NoNewPrivileges = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        RestrictRealtime = true;
        RestrictNamespaces = true;
        LockPersonality = true;
        CapabilityBoundingSet = "";
        RestrictAddressFamilies = [ "AF_UNIX" "AF_INET" "AF_INET6" ];
      };
    };
  };
}
