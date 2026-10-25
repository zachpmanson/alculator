{
  description = "Alculator standalone Next.js service";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      eachSystem = nixpkgs.lib.genAttrs systems;
    in {
      packages = eachSystem (system: {
        default = nixpkgs.legacyPackages.${system}.callPackage ./nix/package.nix {};
      });
      devShells = eachSystem (system:
        let pkgs = nixpkgs.legacyPackages.${system}; engines = pkgs.prisma-engines_6;
        in { default = pkgs.mkShell {
          packages = [ pkgs.nodejs_22 pkgs.openssl pkgs.postgresql_17 engines ];
          PRISMA_QUERY_ENGINE_LIBRARY = "${engines}/lib/libquery_engine.node";
          PRISMA_SCHEMA_ENGINE_BINARY = "${engines}/bin/schema-engine";
          PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = "1";
          NEXT_TELEMETRY_DISABLED = "1";
        }; });
      checks = eachSystem (system: {
        module = import ./nix/check-module.nix { inherit self nixpkgs system; };
        package = self.packages.${system}.default;
      });
      nixosModules.default = import ./nix/module.nix self;
    };
}
