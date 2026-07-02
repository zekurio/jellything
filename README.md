# Jellything

Jellything is a user management and invitation app for Jellyfin.

> **AI Disclaimer**: This is a hobby project of mine, as I needed something for my specific use case. AI agents were heavily involved in building this. Be warned.

## Run Jellything

Pick one installation method:

1. Nix package or NixOS module (recommended)
2. Bare-metal install with Node.js and pnpm

You need a Jellyfin server and an admin API key during first-run setup.

Minimum supported server versions:

- Jellyfin `10.11.x`
- Seerr `3.x.x`

### 1) Nix

Run Jellything directly from the flake:

```bash
nix run github:zekurio/jellything
```

Then open `http://localhost:4173`.

Build the package locally:

```bash
git clone https://github.com/zekurio/jellything.git
cd jellything
nix build
./result/bin/jellything
```

The package supports common runtime defaults through Nix overrides:

```nix
inputs.jellything.lib.mkJellythingPackage pkgs {
  port = 8080;
  dbPath = "/var/lib/jellything/jellything.db";
  configPath = "/var/lib/jellything/config.json";
  logLevel = "info";
}
```

For NixOS, import the module and enable the service:

```nix
{
  imports = [
    inputs.jellything.nixosModules.default
  ];

  services.jellything = {
    enable = true;
    port = 4173;
    dataDir = "/var/lib/jellything";
    logLevel = "info";
    openFirewall = true;
  };
}
```

Available service options include:

- `package`
- `user`
- `group`
- `host`
- `port`
- `dataDir`
- `configFile`
- `logLevel`
- `appVersion`
- `openFirewall`
- `environment`

Maintainers can cut a release from the GitHub Actions `Release` workflow by entering a semver version. That workflow bumps `package.json`, creates the git tag, and opens a GitHub release with generated notes.

### 2) Bare-metal install (Node.js + pnpm)

Requirements:

- Node.js 24.x
- pnpm 10.x

Install and configure:

```bash
git clone https://github.com/zekurio/jellything.git
cd jellything
pnpm install
cp .env.example .env
```

Set these values in `.env`:

- `DB_PATH=./data/jellything.db`
- `CONFIG_PATH=./data/config.json`

Jellything stores the public app URL in config during onboarding and lets you update it later in settings.

Build and start:

```bash
pnpm run build
pnpm start
```

Jellything handles database migrations automatically.

For local development instead:

```bash
pnpm run dev
```

## First-run setup

When you first open Jellything:

1. Complete onboarding in the web UI (Jellyfin, Seerr and email setup)
2. Create some profiles to use for your invites, or customize the default ones
3. Create invites and invite users

## Common operations

NixOS service logs:

```bash
journalctl -u jellything -f
```

Restart the NixOS service:

```bash
systemctl restart jellything
```

Update a flake input:

```bash
nix flake update jellything
```
