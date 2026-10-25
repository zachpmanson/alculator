{ lib, buildNpmPackage, nodejs_22, openssl, prisma-engines_6 }:

let engines = prisma-engines_6;
in
assert lib.assertMsg (engines.version == "6.19.3") "Alculator Prisma JS and native engines must match exactly";
buildNpmPackage {
  pname = "alculator";
  version = "0.1.0";
  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let name = baseNameOf path; in
      !(builtins.elem name [ ".git" ".next" "node_modules" "result" "next-env.d.ts" ])
      && !(lib.hasPrefix ".env" name)
      && !(lib.hasSuffix ".tsbuildinfo" name);
  };
  nodejs = nodejs_22;
  npmDepsHash = "sha256-oTqrdoPxln4YWW8UkSZbkpIhAq6+ZeJLRNYkrMwq48Y=";
  nativeBuildInputs = [ openssl ];
  PRISMA_QUERY_ENGINE_LIBRARY = "${engines}/lib/libquery_engine.node";
  PRISMA_SCHEMA_ENGINE_BINARY = "${engines}/bin/schema-engine";
  PRISMA_SKIP_POSTINSTALL_GENERATE = "true";
  PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = "1";
  NEXT_TELEMETRY_DISABLED = "1";
  # Only used to generate the client. No build route connects to a DB or fetches data.
  DATABASE_URL = "postgresql://build:unused@127.0.0.1:1/build_dummy";
  preBuild = ''
    npm run generate
    npm run lint
    npm run typecheck
    npm test
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp -r .next/standalone/. "$out/"
    cp -r .next/static "$out/.next/static"
    cp -r public "$out/public"
    # Next's tracer cannot infer dynamic Prisma engine loading. Use the real
    # NixOS Node-API engine, never a falsely named musl binary. Runtime uses the
    # absolute engine path (also a closure dependency), avoiding OS auto-detection.
    mkdir -p "$out/node_modules/.prisma/client"
    cp ${engines}/lib/libquery_engine.node "$out/node_modules/.prisma/client/libquery_engine-linux-nixos.so.node"
    runHook postInstall
  '';
}
