{ lib, stdenvNoCC, buildGoModule, nodejs, pnpm, pnpmConfigHook, fetchPnpmDeps }:
let
  src = import ./source.nix { inherit lib; };
  version = (lib.importJSON ../package.json).version;
  expectedPnpm = lib.removePrefix "pnpm@" (lib.importJSON ../package.json).packageManager;
  frontend = assert pnpm.version == expectedPnpm; stdenvNoCC.mkDerivation {
    pname = "alculator-frontend";
    inherit version src;
    nativeBuildInputs = [ nodejs pnpm pnpmConfigHook ];
    pnpmDeps = fetchPnpmDeps {
      pname = "alculator";
      inherit version src pnpm;
      fetcherVersion = 5;
      hash = "sha256-KgrwTNRWcNUqlJ10xrfhHs6owdVso3iErZ/YYMbWt+U=";
    };
    buildPhase = ''
      runHook preBuild
      pnpm build
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      cp -r internal/web/dist $out
      runHook postInstall
    '';
  };
in buildGoModule {
  pname = "alculator";
  inherit version src;
  vendorHash = "sha256-hu+fxVRnIQqV8jgM8sKq/yohGRXO2wXhH9L3SqLvxfY=";
  env.CGO_ENABLED = "1";
  subPackages = [ "cmd/alculator" ];
  tags = [ "frontend" ];
  preBuild = ''
    cp -r ${frontend} internal/web/dist
  '';
  # Exercise the tagged binary's packages too; browser tests remain opt-in/dev.
  checkPhase = ''
    runHook preCheck
    go test -tags frontend ./...
    runHook postCheck
  '';
  passthru = { inherit frontend; source = src; };
  meta = {
    description = "Static React UI and Go API with SQLite reports";
    homepage = "https://github.com/zachpmanson/alculator";
    license = lib.licenses.mit;
    mainProgram = "alculator";
    platforms = lib.platforms.unix;
  };
}
