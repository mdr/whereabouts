{
  description = "Whereabouts – a geography game where you paint a probability distribution";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          # The 1Password CLI is the one unfree package we use.
          config.allowUnfreePredicate = pkg: builtins.elem (pkgs.lib.getName pkg) [ "1password-cli" ];
        };
        lib = pkgs.lib;
        nodejs = pkgs.nodejs_22;
        # nixpkgs' pnpm bundles its own Node runtime (24.x at this pin).
        # Rebuild it on the shell's Node major so there is one Node here.
        pnpm = pkgs.pnpm.override { nodejs-slim = pkgs.nodejs-slim_22; };

        # Just the files the build needs: pnpm resolves from the lockfile, the
        # workspace packages hold the source. Docs, CI and scripts stay out so
        # editing them does not rebuild the image.
        src = lib.cleanSourceWith {
          src = self;
          filter = path: _type:
            let name = baseNameOf path;
            in !(builtins.elem name [ ".github" "README.md" "flake.nix" "flake.lock" "fly.toml" "deploy" "scripts" "smoke-out" ]);
        };

        # The built app: client bundle plus the server and its production
        # dependencies in the pnpm workspace layout it runs from in dev.
        whereabouts = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "whereabouts";
          version = "0.0.1";
          inherit src;

          nativeBuildInputs = [ nodejs pnpm pkgs.pnpmConfigHook ];

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            inherit pnpm;
            fetcherVersion = 4;
            hash = "sha256-CnJkNwXN/oQ7H81Jpf1SFxjXNpKHGMJY7Mq2tnCB2fA=";
          };

          # Keep corepack out of the way, as in the dev shell.
          COREPACK_ENABLE_STRICT = "0";
          COREPACK_ENABLE_AUTO_PIN = "0";
          COREPACK_ENABLE_NETWORK = "0";

          buildPhase = ''
            runHook preBuild
            pnpm --filter @whereabouts/client build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            # Re-link node_modules with production dependencies only, for the
            # server and the workspace packages it depends on. The client's
            # build output is already in packages/client/dist.
            rm -rf node_modules packages/*/node_modules
            pnpm install --offline --frozen-lockfile --ignore-scripts --prod --filter '@whereabouts/server...'
            mkdir -p $out
            cp -a package.json pnpm-workspace.yaml pnpm-lock.yaml node_modules $out/
            # Per package: manifest, what it runs from, and its links.
            for dir in packages/*; do
              mkdir -p $out/$dir
              for entry in package.json src dist questions.json node_modules; do
                [ -e "$dir/$entry" ] && cp -a "$dir/$entry" "$out/$dir/"
              done
            done
            rm -rf $out/packages/client/src
            runHook postInstall
          '';
        });

        # Runs the server the same way `pnpm start` does; serves the client
        # from packages/client/dist next to it.
        run = pkgs.writeShellApplication {
          name = "whereabouts-server";
          runtimeInputs = [ nodejs ];
          text = ''
            exec node --experimental-strip-types --disable-warning=ExperimentalWarning \
              ${whereabouts}/packages/server/src/main.ts "$@"
          '';
        };

        deployTools = [ pkgs.flyctl pkgs.skopeo ];
      in
      {
        packages = {
          inherit whereabouts;
          default = run;
        } // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          # Container for Fly. Streams a docker-archive to stdout; see
          # .github/workflows/ci.yml for how it is pushed.
          image = pkgs.dockerTools.streamLayeredImage {
            name = "registry.fly.io/whereabouts-game";
            tag = "latest";
            contents = [ pkgs.cacert pkgs.tzdata ];
            config = {
              Cmd = [ "${run}/bin/whereabouts-server" ];
              Env = [ "PORT=8080" "HOST=0.0.0.0" "NODE_ENV=production" ];
              ExposedPorts = { "8080/tcp" = { }; };
            };
          };
        };

        apps.default = {
          type = "app";
          program = "${run}/bin/whereabouts-server";
        };

        devShells.default = pkgs.mkShell {
          packages = [
            nodejs
            pnpm
            pkgs.jq
            pkgs._1password-cli
          ] ++ deployTools;

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

        # What the checks need and nothing else: every path here comes
        # straight from cache.nixos.org, so CI needs no cache of its own.
        devShells.ci = pkgs.mkShell {
          packages = [ nodejs pnpm pkgs.jq ];
          COREPACK_ENABLE_STRICT = "0";
          COREPACK_ENABLE_AUTO_PIN = "0";
          COREPACK_ENABLE_NETWORK = "0";
        };

        # Just what CI needs to push an image and deploy it.
        devShells.deploy = pkgs.mkShell { packages = deployTools; };
      });
}
