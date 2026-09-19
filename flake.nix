{
  description = "Whereabouts – a geography game where you paint a probability distribution";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nodejs = pkgs.nodejs_22;
        # nixpkgs' pnpm bundles its own Node runtime (24.x at this pin).
        # Rebuild it on the shell's Node major so there is one Node here.
        pnpm = pkgs.pnpm.override { nodejs-slim = pkgs.nodejs-slim_22; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            nodejs
            pnpm
            pkgs.jq
          ];

          # Corepack ships inside the Node package and will happily download
          # package managers on demand; keep it inert so pnpm always comes
          # from the Nix store above.
          COREPACK_ENABLE_STRICT = "0";
          COREPACK_ENABLE_AUTO_PIN = "0";
          COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
          COREPACK_ENABLE_NETWORK = "0";

          shellHook = ''
            echo "whereabouts dev shell: node $(node --version), pnpm $(pnpm --version) (nix-pinned)"
          '';
        };
      });
}
