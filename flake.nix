{
  description = "Alculator Go/SQLite backend development tools";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  outputs = { self, nixpkgs }: let
    systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
  in {
    devShells = nixpkgs.lib.genAttrs systems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      default = pkgs.mkShell {
        packages = [ pkgs.go pkgs.gcc pkgs.sqlite pkgs.pkg-config pkgs.nodejs pkgs.pnpm ];
        CGO_ENABLED = "1";
      };
    });
  };
}
