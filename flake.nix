{
  description = "User management and invitation app for Jellyfin";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    let
      inherit (nixpkgs) lib;
      supportedSystems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];

      mkInviterrPackage =
        pkgs:
        {
          appVersion ? null,
          host ? "127.0.0.1",
          port ? 4173,
          dbPath ? "./data/inviterr.db",
          configPath ? "./data/config.json",
          logLevel ? "info",
          denoDepsHashes ? {
            aarch64-darwin = "sha256-m871REz9psAET//UYEqMb/bpKOy8LCP/Uq/P+bWOl+M=";
            x86_64-darwin = "sha256-FP7dW7dBTNoQRXDJapGWJGbMfeDfef4e+yfxRtvuztc=";
            aarch64-linux = "sha256-63Ubn/cfE3oboQxqRaGPuV3APOcQrh7l8jVorY6OunM=";
            x86_64-linux = "sha256-A4ipkFKHfAQJWgKl3gphzLdqzNzfAtgUbnw/APJmTOI=";
          },
        }:
        let
          packageJson = lib.importJSON ./package.json;
          version = if appVersion != null then appVersion else packageJson.version;
          dependencyFingerprint = builtins.substring 0 12 (
            builtins.hashString "sha256" (
              builtins.concatStringsSep ":" (
                map (builtins.hashFile "sha256") [
                  ./deno.json
                  ./deno.lock
                  ./package.json
                ]
              )
            )
          );
          system = pkgs.stdenvNoCC.hostPlatform.system;
          targetOS = if pkgs.stdenvNoCC.hostPlatform.isDarwin then "darwin" else "linux";
          targetArch = if pkgs.stdenvNoCC.hostPlatform.isAarch64 then "arm64" else "x64";
          dependencySource = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./deno.json
              ./deno.lock
              ./package.json
            ];
          };
          src = lib.cleanSourceWith {
            src = ./.;
            filter =
              path: type:
              let
                baseName = baseNameOf path;
              in
              !(
                baseName == ".direnv"
                || baseName == ".git"
                || baseName == ".next"
                || baseName == ".output"
                || baseName == ".vercel"
                || baseName == ".vscode"
                || baseName == "coverage"
                || baseName == "data"
                || baseName == "dist"
                || baseName == "node_modules"
                || baseName == "result"
              );
          };
          denoDeps = pkgs.stdenvNoCC.mkDerivation {
            pname = "inviterr-deno-dependencies";
            version = dependencyFingerprint;
            src = dependencySource;

            nativeBuildInputs = [ pkgs.deno ];
            dontConfigure = true;
            dontFixup = true;

            buildPhase = ''
              runHook preBuild
              export DENO_DIR=$TMPDIR/deno-cache
              deno install \
                --os ${targetOS} \
                --arch ${targetArch} \
                --frozen \
                --quiet
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out
              rm -f node_modules/.deno/.setup-cache.bin node_modules/.deno/.deno.lock
              cp -a node_modules $out/node_modules
              runHook postInstall
            '';

            outputHashMode = "recursive";
            outputHashAlgo = "sha256";
            outputHash = denoDepsHashes.${system};
          };
        in
        pkgs.stdenvNoCC.mkDerivation {
          pname = "inviterr";
          inherit version src;

          nativeBuildInputs = [ pkgs.deno ];

          env = {
            APP_VERSION = version;
            NODE_ENV = "production";
            SKIP_ENV_VALIDATION = "true";
          };

          buildPhase = ''
            runHook preBuild
            cp -R ${denoDeps}/node_modules node_modules
            chmod -R u+w node_modules
            export DENO_DIR=$TMPDIR/deno-cache
            deno run \
              --cached-only \
              --node-modules-dir=manual \
              -A \
              npm:vite@7.3.6 \
              build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            appDir="$out/share/inviterr"
            mkdir -p "$appDir" "$out/bin"
            cp -R .output drizzle "$appDir/"

            cat > "$out/bin/inviterr" <<'EOF'
            #!${pkgs.runtimeShell}
            set -euo pipefail

            export APP_VERSION="''${APP_VERSION:-${version}}"
            export NODE_ENV="''${NODE_ENV:-production}"
            export HOST="''${HOST:-${host}}"
            export PORT="''${PORT:-${toString port}}"
            export DB_PATH="''${DB_PATH:-${dbPath}}"
            export CONFIG_PATH="''${CONFIG_PATH:-${configPath}}"
            export LOG_LEVEL="''${LOG_LEVEL:-${logLevel}}"
            export MIGRATIONS_PATH="''${MIGRATIONS_PATH:-${placeholder "out"}/share/inviterr/drizzle}"

            exec ${lib.getExe pkgs.deno} run \
              --cached-only \
              --no-prompt \
              --allow-env \
              --allow-net \
              --allow-read \
              --allow-write \
              --allow-ffi \
              --allow-sys \
              "${placeholder "out"}/share/inviterr/.output/server/index.mjs" \
              "$@"
            EOF
            chmod +x "$out/bin/inviterr"

            runHook postInstall
          '';

          passthru = {
            inherit denoDeps;
            withOptions = mkInviterrPackage pkgs;
          };

          meta = {
            description = "User management and invitation app for Jellyfin";
            homepage = "https://github.com/zekurio/inviterr";
            license = lib.licenses.mit;
            mainProgram = "inviterr";
            platforms = supportedSystems;
          };
        };

      mkNixosModule =
        { config, pkgs, ... }:
        let
          cfg = config.services.inviterr;
          system = pkgs.stdenv.hostPlatform.system;
          inherit (lib)
            mkEnableOption
            mkIf
            mkOption
            types
            ;
        in
        {
          options.services.inviterr = {
            enable = mkEnableOption "Inviterr";

            package = mkOption {
              type = types.package;
              default = self.packages.${system}.default;
              defaultText = lib.literalExpression "inviterr.packages.${system}.default";
              description = "Inviterr package to run.";
            };

            user = mkOption {
              type = types.str;
              default = "inviterr";
              description = "User account that runs Inviterr.";
            };

            group = mkOption {
              type = types.str;
              default = "inviterr";
              description = "Group account that runs Inviterr.";
            };

            host = mkOption {
              type = types.str;
              default = "0.0.0.0";
              description = "Host address to bind.";
            };

            port = mkOption {
              type = types.port;
              default = 4173;
              description = "Port to listen on.";
            };

            dataDir = mkOption {
              type = types.path;
              default = "/var/lib/inviterr";
              description = "Directory for Inviterr state and the SQLite database.";
            };

            configFile = mkOption {
              type = types.path;
              default = "${cfg.dataDir}/config.json";
              defaultText = lib.literalExpression ''"${config.services.inviterr.dataDir}/config.json"'';
              description = "Path to Inviterr's runtime configuration file.";
            };

            logLevel = mkOption {
              type = types.enum [
                "trace"
                "debug"
                "info"
                "warn"
                "error"
                "fatal"
              ];
              default = "info";
              description = "Application log level.";
            };

            appVersion = mkOption {
              type = types.nullOr types.str;
              default = null;
              description = "Optional version string shown by the app.";
            };

            openFirewall = mkOption {
              type = types.bool;
              default = false;
              description = "Whether to open the Inviterr port in the firewall.";
            };

            environment = mkOption {
              type = types.attrsOf types.str;
              default = { };
              description = "Additional environment variables for the Inviterr service.";
            };
          };

          config = mkIf cfg.enable {
            users.groups.${cfg.group} = { };
            users.users.${cfg.user} = {
              inherit (cfg) group;
              isSystemUser = true;
              home = cfg.dataDir;
            };

            networking.firewall.allowedTCPPorts = mkIf cfg.openFirewall [ cfg.port ];

            systemd.tmpfiles.rules = [
              "d ${cfg.dataDir} 0750 ${cfg.user} ${cfg.group} - -"
              "d ${dirOf cfg.configFile} 0750 ${cfg.user} ${cfg.group} - -"
            ];

            systemd.services.inviterr = {
              description = "Inviterr";
              wantedBy = [ "multi-user.target" ];
              after = [ "network-online.target" ];
              wants = [ "network-online.target" ];

              environment = {
                NODE_ENV = "production";
                HOST = cfg.host;
                PORT = toString cfg.port;
                DB_PATH = "${cfg.dataDir}/inviterr.db";
                CONFIG_PATH = toString cfg.configFile;
                LOG_LEVEL = cfg.logLevel;
                DENO_DIR = "${cfg.dataDir}/.deno";
              }
              // lib.optionalAttrs (cfg.appVersion != null) {
                APP_VERSION = cfg.appVersion;
              }
              // cfg.environment;

              serviceConfig = {
                ExecStart = "${lib.getExe cfg.package}";
                Restart = "on-failure";
                User = cfg.user;
                Group = cfg.group;
                WorkingDirectory = cfg.dataDir;
                StateDirectory = "inviterr";
                StateDirectoryMode = "0750";
                NoNewPrivileges = true;
                PrivateTmp = true;
                ProtectHome = true;
                ProtectSystem = "strict";
                ReadWritePaths = [
                  cfg.dataDir
                  (dirOf cfg.configFile)
                ];
              };
            };
          };
        };
    in
    flake-utils.lib.eachSystem supportedSystems (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        inviterr = mkInviterrPackage pkgs { };
        dockerImage = pkgs.dockerTools.buildLayeredImage {
          name = "inviterr";
          tag = inviterr.version;
          contents = [ inviterr ];
          config = {
            Cmd = [ (lib.getExe inviterr) ];
            Env = [
              "CONFIG_PATH=/data/config.json"
              "DB_PATH=/data/inviterr.db"
              "HOST=0.0.0.0"
              "PORT=4173"
              "DENO_DIR=/data/.deno"
            ];
            ExposedPorts."4173/tcp" = { };
            Volumes."/data" = { };
          };
        };
      in
      {
        packages = {
          default = inviterr;
          inviterr = inviterr;
        }
        // lib.optionalAttrs pkgs.stdenv.isLinux {
          dockerImage = dockerImage;
        };

        apps.default = flake-utils.lib.mkApp {
          drv = inviterr;
        };

        checks.default = inviterr;

        devShells.default = pkgs.mkShell {
          packages = [ pkgs.deno ];
        };
      }
    )
    // {
      overlays.default = final: _prev: {
        inviterr = mkInviterrPackage final { };
      };

      lib.mkInviterrPackage = mkInviterrPackage;

      nixosModules.default = mkNixosModule;
      nixosModules.inviterr = mkNixosModule;
    };
}
