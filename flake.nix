{
  description = "Jellything - user management and invitations for Jellyfin";

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

      mkJellythingPackage =
        pkgs:
        {
          appVersion ? null,
          host ? "0.0.0.0",
          port ? 4173,
          dbPath ? "./data/jellything.db",
          configPath ? "./data/config.json",
          logLevel ? "info",
        }:
        let
          packageJson = lib.importJSON ./package.json;
          version = if appVersion != null then appVersion else packageJson.version;
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
                || baseName == ".vercel"
                || baseName == ".vscode"
                || baseName == "coverage"
                || baseName == "data"
                || baseName == "dist"
                || baseName == "node_modules"
                || baseName == "result"
              );
          };
        in
        pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
          pname = "jellything";
          inherit version src;

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            fetcherVersion = 3;
            hash = "sha256-VThSwKfhqCfs/wCBGmoH5iDd3RBZZywX6NFBn9rBBE0=";
          };

          nativeBuildInputs = [
            pkgs.nodejs_24
            pkgs.pnpm
            pkgs.pnpmConfigHook
          ];

          env = {
            APP_VERSION = version;
            NODE_ENV = "production";
            SKIP_ENV_VALIDATION = "true";
          };

          buildPhase = ''
            runHook preBuild
            pnpm run build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            appDir="$out/share/jellything"
            mkdir -p "$appDir" "$out/bin"
            cp -R \
              dist \
              drizzle \
              node_modules \
              public \
              src \
              package.json \
              pnpm-lock.yaml \
              tsconfig.json \
              vite.config.ts \
              "$appDir/"

            cat > "$out/bin/jellything" <<'EOF'
            #!${pkgs.runtimeShell}
            set -euo pipefail

            export APP_VERSION="''${APP_VERSION:-${version}}"
            export NODE_ENV="''${NODE_ENV:-production}"
            export HOST="''${HOST:-${host}}"
            export PORT="''${PORT:-${toString port}}"
            export DB_PATH="''${DB_PATH:-${dbPath}}"
            export CONFIG_PATH="''${CONFIG_PATH:-${configPath}}"
            export LOG_LEVEL="''${LOG_LEVEL:-${logLevel}}"

            cd "${placeholder "out"}/share/jellything"
            exec ${lib.getExe pkgs.nodejs_24} node_modules/vite/bin/vite.js preview \
              --configLoader runner \
              --host "$HOST" \
              --port "$PORT" \
              --strictPort \
              "$@"
            EOF
            chmod +x "$out/bin/jellything"

            runHook postInstall
          '';

          passthru.withOptions = mkJellythingPackage pkgs;

          meta = {
            description = "User management and invitation app for Jellyfin";
            homepage = "https://github.com/zekurio/jellything";
            license = lib.licenses.mit;
            mainProgram = "jellything";
            platforms = lib.platforms.linux ++ lib.platforms.darwin;
          };
        });

      mkNixosModule =
        { config, pkgs, ... }:
        let
          cfg = config.services.jellything;
          inherit (lib)
            mkEnableOption
            mkIf
            mkOption
            types
            ;
        in
        {
          options.services.jellything = {
            enable = mkEnableOption "Jellything";

            package = mkOption {
              type = types.package;
              default = self.packages.${pkgs.system}.default;
              defaultText = lib.literalExpression "jellything.packages.${pkgs.system}.default";
              description = "Jellything package to run.";
            };

            user = mkOption {
              type = types.str;
              default = "jellything";
              description = "User account that runs Jellything.";
            };

            group = mkOption {
              type = types.str;
              default = "jellything";
              description = "Group account that runs Jellything.";
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
              default = "/var/lib/jellything";
              description = "Directory for Jellything state and the SQLite database.";
            };

            configFile = mkOption {
              type = types.path;
              default = "${cfg.dataDir}/config.json";
              defaultText = lib.literalExpression ''"${config.services.jellything.dataDir}/config.json"'';
              description = "Path to Jellything's runtime configuration file.";
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
              description = "Whether to open the Jellything port in the firewall.";
            };

            environment = mkOption {
              type = types.attrsOf types.str;
              default = { };
              description = "Additional environment variables for the Jellything service.";
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

            systemd.services.jellything = {
              description = "Jellything";
              wantedBy = [ "multi-user.target" ];
              after = [ "network-online.target" ];
              wants = [ "network-online.target" ];

              environment =
                {
                  NODE_ENV = "production";
                  HOST = cfg.host;
                  PORT = toString cfg.port;
                  DB_PATH = "${cfg.dataDir}/jellything.db";
                  CONFIG_PATH = toString cfg.configFile;
                  LOG_LEVEL = cfg.logLevel;
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
                StateDirectory = "jellything";
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
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        jellything = mkJellythingPackage pkgs { };
      in
      {
        packages = {
          default = jellything;
          jellything = jellything;
        };

        apps.default = flake-utils.lib.mkApp {
          drv = jellything;
        };

        checks.default = jellything;

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_24
            pnpm
          ];
        };
      }
    )
    // {
      overlays.default = final: _prev: {
        jellything = mkJellythingPackage final { };
      };

      lib.mkJellythingPackage = mkJellythingPackage;

      nixosModules.default = mkNixosModule;
      nixosModules.jellything = mkNixosModule;
    };
}
