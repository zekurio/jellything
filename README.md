<p align="center">
  <img src="./public/logo-256.png" alt="Inviterr" width="128" />
</p>

<h1 align="center">Inviterr</h1>

<hr />

Self-hosted user management and invitations for Jellyfin: issue invite links,
apply profile-based library and Seerr permissions on redemption, and handle
email verification, password resets, and account expiry/renewal from one
dashboard.

This is a hobby project built for a specific self-hosted workflow, with
substantial AI-agent involvement. Expect sharp edges.

### Requirements

- Jellyfin `10.11.x` plus an administrator API key
- Optional: Seerr `3.x.x`, and an SMTP server for verification and reset email
- Deno 2.9.x for a bare-metal install

Always deploy a tagged release (`vX.Y.Z`), never a moving branch.

### Nix

Run a tagged package from a stable working directory; default database and
config paths are relative to it. Packages are published for `aarch64-darwin`,
`aarch64-linux`, and `x86_64-linux`.

```bash
mkdir -p ~/inviterr && cd ~/inviterr
umask 077
nix run github:zekurio/inviterr/vX.Y.Z
```

For NixOS, pin the same tag as a flake input:

```nix
inputs.inviterr.url = "github:zekurio/inviterr/vX.Y.Z";
```

Then import and configure the module, keeping the app port private when a
reverse proxy runs on the same host:

```nix
{
  imports = [ inputs.inviterr.nixosModules.default ];

  services.inviterr = {
    enable = true;
    host = "127.0.0.1";
    port = 4173;
    dataDir = "/var/lib/inviterr";
    openFirewall = false;
  };
}
```

The module runs as a dedicated system user with a `0750` state directory.
Other options: `package`, `user`, `group`, `configFile`, `logLevel`,
`appVersion`, and `environment`.

### Container

Stable releases are published to GHCR with versioned and `latest` tags; `dev`
commits publish only `unstable`. Persist `/data`, which holds the SQLite
database and runtime config:

```bash
docker run --name inviterr \
  --publish 127.0.0.1:4173:4173 \
  --volume inviterr-data:/data \
  ghcr.io/zekurio/inviterr:X.Y.Z
```

### Bare metal

```bash
git clone https://github.com/zekurio/inviterr.git && cd inviterr
git checkout vX.Y.Z
deno install --frozen
cp .env.example .env
umask 077 && install -d -m 0700 data && chmod 0600 .env
deno task build
deno task --env-file=.env start
```

Run from the repository root so the bundled app can find `drizzle/`;
migrations run automatically at startup. See [`.env.example`](.env.example) for
the full set: `NODE_ENV`, `HOST`, `PORT`, `DB_PATH`, `CONFIG_PATH`,
`LOG_LEVEL`, and `TRUST_PROXY`.

Keep the state directory, database, config, `.env`, backups, and logs readable
only by the service account.

### First run

On first start Inviterr logs `Generated setup key for onboarding` with a
`setupKey` field (`journalctl -u inviterr` on NixOS). Keep that log private.
Enter the key, then set the public app URL and the Jellyfin connection plus
admin API key; Seerr and email can be left blank and configured later in
Settings. `GET /healthz` is liveness; `GET /readyz` returns `200` only after
startup database work succeeds.

### Network and TLS

Inviterr serves plain HTTP. Terminate TLS at a reverse proxy and keep the app
bound to loopback:

```caddyfile
inviterr.example.com {
  reverse_proxy 127.0.0.1:4173
}
```

Set `TRUST_PROXY=true` only when that proxy overwrites forwarded client, host,
and protocol headers and the backend port cannot be reached around it; this
enables correct HTTPS-origin handling and per-client rate limits.

### Backups and upgrades

The SQLite database (`DB_PATH`) and runtime config (`CONFIG_PATH`) are one
recoverable unit, and the config holds secrets. Stop Inviterr, archive both
paths together (the whole `data/` or `/var/lib/inviterr/` directory, including
any `-wal`/`-shm` files), and record the release tag. Restoring only one of the
two can invalidate sessions or integration state.

To upgrade, back up, stop the service, move to the new tag (`nix flake update
inviterr && nixos-rebuild switch`, a new image tag, or `git checkout vX.Y.Z &&
deno install --frozen && deno task build`), and confirm `/readyz` returns
`200`. Rollbacks may require restoring the matching backup, not just an older
tag.

### Development

Deno is the package manager, task runner, and runtime. `package.json` remains
the npm dependency manifest; `deno.lock` is the committed lockfile.

```bash
deno install --frozen
deno task dev
```

With [Nix](https://nixos.org): `nix develop` (or `direnv allow`) provides the
toolchain.

Before opening a pull request, run `deno task format:check`, `deno task lint`,
`deno task typecheck`, and `deno task test`; schema changes also need a
generated migration and `deno task db:check`. After changing dependencies, run
`deno install`, then `scripts/update-deno-deps-hashes.sh` from `nix develop`
and copy the changed per-platform hashes into `flake.nix`.

[AGENTS.md](AGENTS.md) documents architecture, conventions, and repo patterns.

### Contributing

Found a bug or have an idea?
[Open an issue](https://github.com/zekurio/inviterr/issues/new). Branch names
are at most three hyphenated words; commits and PR titles follow
`type(scope): summary`.

### License

[MIT](LICENSE)
