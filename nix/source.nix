{ lib }:
# An allowlist, not a git/ignore filter: local generated or private files must
# remain excluded even for a path: flake built from a dirty working tree.
lib.cleanSourceWith {
  src = ../.;
  name = "alculator-source";
  filter = path: type:
    let
      rel = lib.removePrefix (toString ../. + "/") (toString path);
      parts = lib.splitString "/" rel;
      base = builtins.baseNameOf path;
      forbidden = lib.any (part:
        lib.hasPrefix "." part || builtins.elem part [
          "node_modules" "dist" "bin" "data" "state" "exports"
        ]) parts;
      roots = [ "src" "public" "cmd" "internal" ];
      topFiles = [ "go.mod" "go.sum" "package.json" "pnpm-lock.yaml"
        "index.html" "tsconfig.json" "vite.config.ts" ];
    in !forbidden && (
      if type == "directory" then builtins.elem (builtins.head parts) roots
      else type == "regular" && (
        builtins.elem rel topFiles
        || (lib.hasPrefix "src/" rel && lib.any (s: lib.hasSuffix s base) [ ".ts" ".tsx" ".css" ])
        || (lib.hasPrefix "public/icons/" rel && lib.any (s: lib.hasSuffix s base)
          [ ".png" ".ico" ".xml" ".svg" ".webmanifest" ])
        || (lib.any (p: lib.hasPrefix p rel) [ "cmd/" "internal/" ] && lib.hasSuffix ".go" base)
        || (lib.hasPrefix "internal/catalogue/testdata/" rel && lib.any (s: lib.hasSuffix s base) [ ".json" ".mjs" ])
      )
    );
}
