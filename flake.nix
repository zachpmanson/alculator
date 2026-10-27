{
  description = "Alculator Go/SQLite and static React development tools";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  outputs = { self, nixpkgs }: let
    systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
  in {
    devShells = nixpkgs.lib.genAttrs systems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      tools = [ pkgs.go pkgs.gcc pkgs.sqlite pkgs.pkg-config pkgs.nodejs pkgs.pnpm pkgs.gnumake ];
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
