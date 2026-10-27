{
  description = "Alculator Go/SQLite and static React development tools";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  outputs = { self, nixpkgs }: let
    systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
  in {
    packages = nixpkgs.lib.genAttrs systems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      package = pkgs.callPackage ./nix/package.nix { };
    in { default = package; alculator = package; });
    apps = nixpkgs.lib.genAttrs systems (system: {
      default = {
        type = "app";
        program = "${self.packages.${system}.default}/bin/alculator";
        meta.description = "Alculator embedded Go/SQLite server and report importer";
      };
    });
    nixosModules.default = { lib, pkgs, ... }: {
      imports = [ ./nix/module.nix ];
      services.alculator.package = lib.mkDefault self.packages.${pkgs.stdenv.hostPlatform.system}.default;
    };
    nixosModules.alculator = self.nixosModules.default;
    checks = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system:
      import ./nix/checks.nix {
        pkgs = nixpkgs.legacyPackages.${system};
        package = self.packages.${system}.default;
        nixpkgsPath = nixpkgs.outPath;
        module = self.nixosModules.default;
      });
    devShells = nixpkgs.lib.genAttrs systems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      tools = [ pkgs.go pkgs.stdenv.cc pkgs.sqlite pkgs.pkg-config pkgs.nodejs pkgs.pnpm pkgs.gnumake ];
    in {
      default = pkgs.mkShell {
        packages = tools;
        CGO_ENABLED = "1";
      };
      # Browser tooling is dev/test only, not a production package or service.
      browser = pkgs.mkShell {
        packages = tools ++ pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.chromium ];
        CGO_ENABLED = "1";
        CHROMIUM_EXECUTABLE = if pkgs.stdenv.isLinux then "${pkgs.chromium}/bin/chromium" else "";
      };
    });
  };
}
