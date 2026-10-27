{ config, lib, pkgs, ... }:
let
  cfg = config.services.alculator;
  runner = import ./service-runner.nix {
    inherit pkgs;
    inherit (cfg) package;
    listen = "127.0.0.1:${toString cfg.port}";
    database = "/var/lib/alculator/reports.sqlite";
  };
in {
  options.services.alculator = {
    enable = lib.mkEnableOption "Alculator (loopback Go/SQLite service)";
    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix { };
      description = "Immutable Alculator package with embedded frontend.";
    };
    port = lib.mkOption {
      type = lib.types.port;
      default = 3010;
      description = "Loopback HTTP port (outbound catalogue access remains enabled).";
    };
    environmentFile = lib.mkOption {
      type = lib.types.str;
      default = "/run/agenix/alculator-env";
      description = ''
        Absolute runtime-only EnvironmentFile with REPORT_ADMIN_PASSWORD and
        optional DATA_REPO. Provision outside Nix; never put credentials in the store.
      '';
    };
  };
  config = lib.mkIf cfg.enable {
    assertions = [{
      assertion = lib.hasPrefix "/" cfg.environmentFile && !(lib.hasPrefix "/nix/store/" cfg.environmentFile);
      message = "services.alculator.environmentFile must be an absolute runtime path outside /nix/store";
    }];
    users.groups.alculator = { };
    users.users.alculator = {
      isSystemUser = true;
      group = "alculator";
      home = "/var/lib/alculator";
    };
    systemd.services.alculator = {
      description = "Alculator Go/SQLite HTTP service";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];
      serviceConfig = {
        Type = "simple";
        User = "alculator";
        Group = "alculator";
        EnvironmentFile = cfg.environmentFile;
        ExecStart = runner;
        WorkingDirectory = "/var/lib/alculator";
        StateDirectory = "alculator";
        StateDirectoryMode = "0700";
        UMask = "0077";
        Restart = "on-failure";
        RestartSec = "5s";
        TimeoutStopSec = "10s";
        KillSignal = "SIGTERM";
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        CapabilityBoundingSet = "";
        RestrictAddressFamilies = [ "AF_UNIX" "AF_INET" "AF_INET6" ];
        # Bind loopback, but DO NOT prohibit outbound DNS/HTTPS to GitHub.
        ReadWritePaths = [ "/var/lib/alculator" ];
      };
    };
  };
}
