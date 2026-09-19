{
  description = "Hunch Map – a geography game where you paint a probability distribution";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm
            jq
          ];

          shellHook = ''
            echo "hunch-map dev shell: node $(node --version), pnpm $(pnpm --version)"
          '';
        };
      });
}
