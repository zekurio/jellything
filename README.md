# Jellything

Jellything is a self-hosted user-management and invitation app for
Jellyfin.

> **AI disclaimer:** This is a hobby project built for a specific use case,
> with substantial AI-agent involvement.

## Requirements

- Jellyfin `10.11.x` and a Jellyfin administrator API key
- Node.js 24 and pnpm 10 for a bare-metal install
- Optional: Seerr `3.x.x`
- Optional: an SMTP server for verification and password-reset email

Use a tagged release (`vX.Y.Z`) rather than a moving branch in production.

## Install

### Nix package

Run a tagged package from a stable working directory; the default database and
configuration paths are relative to that directory:

```bash
mkdir -p ~/jellything
cd ~/jellything
umask 077
nix run github:zekurio/jellything/vX.Y.Z
```

Open `http://127.0.0.1:4173`. Override `HOST`, `PORT`, `DB_PATH`,
`CONFIG_PATH`, or `LOG_LEVEL` in the environment when needed.

For NixOS, pin the same tag as a flake input:

```nix
inputs.jellything.url = "github:zekurio/jellything/vX.Y.Z";
```

Import the module and keep the application port private when a reverse proxy
runs on the same host:

```nix
{
  imports = [ inputs.jellything.nixosModules.default ];

  services.jellything = {
    enable = true;
    host = "127.0.0.1";
    port = 4173;
    dataDir = "/var/lib/jellything";
    logLevel = "info";
    openFirewall = false;
  };
}
```

The module runs as a dedicated user and creates its state directory with mode
`0750`. Its main options are `package`, `user`, `group`, `host`, `port`,
`dataDir`, `configFile`, `logLevel`, `appVersion`, `openFirewall`, and
`environment`.

### Container

Stable releases are published to GHCR with both versioned and `latest` tags.
Persist `/data`, which contains the SQLite database and runtime configuration:

```bash
docker run --name jellything \
  --publish 127.0.0.1:4173:4173 \
  --volume jellything-data:/data \
  ghcr.io/zekurio/jellything:X.Y.Z
```

The image listens on port `4173`. Set `LOG_LEVEL` or `TRUST_PROXY` with
`--env` when needed. Development commits on `dev` publish only the
`unstable` tag; use a versioned tag in production.

### Bare metal

Check out a release tag, install exactly its locked dependencies, and create
private state:

```bash
git clone https://github.com/zekurio/jellything.git
cd jellything
git checkout vX.Y.Z
pnpm install --frozen-lockfile
cp .env.example .env
umask 077
install -d -m 0700 data
chmod 0600 .env
pnpm run build
node --env-file=.env .output/server/index.mjs
```

The final command is the Nitro production server. `pnpm start` uses the same
`.output/server/index.mjs` entry point when a service manager already supplies
the environment. Run it from the repository root so the bundled application
can find `drizzle/`; database migrations run automatically at startup.

The production environment is intentionally small:

| Variable        | Purpose                                                    |
| --------------- | ---------------------------------------------------------- |
| `NODE_ENV`      | Set to `production`.                                       |
| `HOST` / `PORT` | Nitro address and port; example: `127.0.0.1:4173`.         |
| `DB_PATH`       | SQLite database path.                                      |
| `CONFIG_PATH`   | Config path with integration credentials and auth secrets. |
| `LOG_LEVEL`     | `trace`, `debug`, `info`, `warn`, `error`, or `fatal`.     |
| `TRUST_PROXY`   | Keep `false` unless only a trusted proxy can connect.      |

Keep the state directory, database, config, environment file, backups, and
service logs readable only by the service account or an administrative backup
account. Start the service with `umask 077` on bare metal so newly created
state is private.

## First-run setup

On first start, Jellything logs `Generated setup key for onboarding` with a
`setupKey` field. Read it from the foreground log, or on NixOS with:

```bash
journalctl -u jellything -n 100 --no-pager
```

Keep that log private. Open Jellything, enter the setup key, then provide the
public app URL and the required Jellyfin connection and administrator API key.
The public URL should be the HTTPS URL users will visit. Seerr and email are
optional: leave either section blank during onboarding and configure it later
in Settings. After onboarding, create or customize profiles and issue invites.

`GET /healthz` is the process liveness endpoint. `GET /readyz` returns `200`
only after startup database work succeeds, and `503` on an initialization
failure.

## Network and TLS

Nitro serves HTTP. For Internet access, terminate TLS at a reverse proxy and
leave Jellything bound to loopback. A minimal Caddy site is:

```caddyfile
jellything.example.com {
  reverse_proxy 127.0.0.1:4173
}
```

Set `TRUST_PROXY=true` only when that proxy overwrites forwarded client,
host, and protocol headers and the backend port cannot be reached around the
proxy. This enables correct HTTPS-origin handling and per-client rate limits
without trusting headers supplied directly by users. If the proxy is on
another machine, bind Jellything to a private interface and firewall the port
so only that proxy can connect. Do not expose the unencrypted application port
directly to the Internet.

## Back up and restore

The SQLite database and runtime config are one recoverable unit. The config
contains secrets, so encrypt or otherwise restrict every backup.

1. Stop Jellything before copying files. This gives a consistent SQLite
   snapshot and prevents config changes during the copy.
2. Back up the files at `DB_PATH` and `CONFIG_PATH` together. With the default
   layout, archive the whole `data/` directory (bare metal) or
   `/var/lib/jellything/` (NixOS), including any SQLite `-wal` or `-shm` files
   that remain.
3. Record the Jellything release tag used with that backup.
4. Restart Jellything and confirm `/readyz` returns `200`.

To restore, stop Jellything, replace both paths from the same backup, restore
their service-account ownership and restrictive directory/file modes, then
start the recorded release. Confirm `/readyz` before upgrading. Restoring only
the database or only the config can invalidate sessions or integration state.

## Upgrade

For `nix run`, stop the old process, back up its state, and run the new tag
from the same working directory:

```bash
nix run github:zekurio/jellything/vX.Y.Z
```

Back up first. For NixOS, change the pinned input URL to the new tag, update
that input, and rebuild:

```bash
nix flake update jellything
sudo nixos-rebuild switch --flake .#your-host
```

For bare metal, stop the service, then:

```bash
git fetch --tags
git checkout vX.Y.Z
pnpm install --frozen-lockfile
pnpm run build
node --env-file=.env .output/server/index.mjs
```

Migrations run on startup. A rollback may require restoring the matching
database and config backup rather than only checking out an older tag.

## Maintainer releases

Dispatch the `Release` workflow from `dev`. Choose a patch, minor, or major
bump, or provide an exact plain-semver override. The workflow runs the complete
format, lint, typecheck, test, migration-drift, production-build, and Nix gate;
commits the version bump; atomically pushes `dev` and the tag; publishes the
versioned and `latest` container images; and creates the GitHub release.
Interrupted runs recover the pending version or tag rather than bumping again.
Only stable `vX.Y.Z` releases are supported; release candidates and other
prereleases are not published.
