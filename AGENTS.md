# Repository Guidelines

## Project Overview

Inviterr is a self-hosted user management and invitation app for Jellyfin, with optional Seerr integration. It handles onboarding, admin settings, invite creation/redemption, profile policy application, Jellyfin user lifecycle, email verification, password resets, and user expiry/renewal.

Hobby project tailored to a self-hosted workflow. Priorities in order: performance (no waterfalls, optimistic updates), security (tight public endpoints, careful auth/admin checks), convenience, customizability, reliability under Jellyfin/Seerr/email/DB failure. When forced to trade off, choose correctness, robustness, and security.

## Architecture & Data Flow

TanStack Start + React 19 SSR app served by Vite, SQLite via Drizzle ORM.

Layering: **routes/loaders → server-fn bridges or ORPC client → ORPC router/middleware → domain services → integrations/DB**.

- Router lives in `src/router.tsx`; the root shell and global bootstrap loader in `src/routes/__root.tsx`.
- Route loaders call thin `createServerFn` bridges (`src/lib/page-access-fns.ts`, `src/lib/dashboard-page-fns.ts`, `src/lib/profile-page-fns.ts`) that lazily import server modules only under SSR — keep data work in loaders/server functions, not client-side waterfalls.
- Browser mutations/queries go through ORPC at `/rpc` (`src/routes/rpc.$.ts` mounts `RPCHandler(orpcRouter)`). Procedures are grouped by domain (`app`, `auth`, `onboarding`, `invites`, `email`, `passwordReset`, `me`, `admin`) in `src/server/orpc/procedures.ts`. Middleware (`src/server/orpc/middleware.ts`) enforces session, admin status, config gating, same-origin mutation checks, and rate limits.
- Service functions return a stable `ActionResult`/`ErrorCode` envelope (`src/lib/api/contracts/errors.ts`); procedures unwrap it via `unwrapActionResultOrThrow` (`src/server/orpc/errors.ts`):

  ```ts
  login: mutationProcedure
    .use(rateLimitMiddleware(loginLimiter))
    .input(loginSchema)
    .handler(async ({ input }) => unwrapActionResultOrThrow(await login(input))),
  ```

- Sessions are AES-GCM-encrypted, cookie-backed DB records (`src/server/session.ts`), revalidated against Jellyfin when stale (`src/server/session-resolver.ts`). Client session state lives in `src/hooks/use-session.tsx`.
- Each external integration (`src/server/jellyfin`, `src/server/seerr`, `src/server/email`) follows the same shape: a `client.ts` transport that throws a stable API error class, `schemas.ts` zod decoding, and domain operation modules on top.
- Startup maintenance (user seeding, invite reconciliation, expiry sweeps) runs from `src/server/startup.ts` and `src/server/user-lifecycle.ts`.

## Key Directories

- `src/routes` — file-based TanStack routes, loaders, public page boundaries. `rpc.$.ts` is the ORPC HTTP entry.
- `src/components` — feature UI (`dashboard/`, `invites/`, `profiles/`, `users/`, `settings/`, `profile/`, `shared/`); `src/components/ui` holds reusable primitives — use these before adding new local ones.
- `src/hooks` — client hooks and TanStack Store helpers (`store-utils.ts`, `use-session.tsx`, table stores, `use-dialog-action.ts`).
- `src/lib` — client/server-safe utilities: shared zod form schemas (`schemas.ts`), ORPC client (`orpc/client.ts`, `orpc/query.ts`), server-fn bridges, error contracts (`api/contracts/errors.ts`). `src/lib/server/config.server.ts` is the server-only runtime config manager.
- `src/server` — domain services, ORPC layer (`orpc/`), admin services (`admin/`), auth/session, rate limits, logging, startup.
- `src/server/db` — Drizzle schema (`schema.ts`) and relations; DB singleton in `src/server/db.ts`.
- `src/server/api/schemas` — ORPC request/response DTO schemas and zod helpers.
- `src/server/jellyfin`, `src/server/seerr`, `src/server/email` — integration adapters (email templates under `email/templates/`).
- `src/test` — test helpers (temp-SQLite in `db.ts`).
- `drizzle` — generated migrations (`0000_baseline.sql`, `meta/`).
- `scripts` — `check-migration-drift.mjs`, backing `pnpm run db:check`.
- `flake.nix` — Nix package, dev shell, and NixOS module (`services.inviterr`).

## Development Commands

Use `pnpm` for everything.

- `pnpm run dev` — Vite dev server.
- `pnpm run format` / `format:check` — Oxfmt apply / verify.
- `pnpm run lint` / `lint:fix` — Oxlint.
- `pnpm run typecheck` — `tsgo --noEmit`.
- `pnpm run check` — lint + typecheck shortcut.
- `pnpm run test` — `vitest run`.
- `pnpm run db:generate` / `db:migrate` / `db:push` (dev only) / `db:studio` — Drizzle workflows.
- `pnpm run db:check` — fail on schema/migration drift (CI-safe).

Do **not** run `pnpm run build` during normal app work unless explicitly needed; it can disrupt the running dev server.

**Coding-task completion checklist** (all must pass): `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`. When changing persisted data shape, include the schema change plus generated migration and run `pnpm run db:check`.

## Code Conventions & Common Patterns

Formatting is Oxfmt (`.oxfmtrc.json`: 80 cols, 2-space indent, no semicolons, double quotes, sorted imports/Tailwind classes). Linting is Oxlint (`.oxlintrc.json`: type-aware, zero warnings, `no-console`, `no-explicit-any`, `prefer-const`, `no-else-return` enforced).

### General style

- Prefer `const` over `let`; use ternaries, local helpers, or early returns instead of reassignment.
- Avoid `else`; prefer early returns.
- Avoid unnecessary destructuring — use dot notation (`session.userId`, not `const { userId } = session`).
- Never alias imports (`import { foo as bar }`) and never use star imports (`import * as Foo`).
- Prefer dynamic imports for heavy modules used only in selected code paths (startup-sensitive entrypoints, client routes). Destructure the dynamic import binding near the top of the narrowest scope; no inline `(await import("./m")).value()` chains.
- Avoid `any`; narrow third-party data with `unknown`, zod schemas, or explicit local types.
- Rely on type inference; avoid explicit annotations unless needed for exports or clarity. Inline single-use values.
- Avoid `try`/`catch` except at external-integration and cleanup boundaries where failures must be translated, logged, retried, or intentionally swallowed.
- Keep the main function reading as the happy path; move validation branches into small named helpers below it (`requireProfile`, `parseInviteCode`). Do not extract single-use helpers preemptively.
- Keep synchronous parsing/validation synchronous; no gratuitous async.
- Comment non-obvious constraints and surprising behavior only.
- Extract shared logic into modules; duplicated logic across files is a code smell.

### Server & security

- Server modules are named for their domain, no `-service` or `.server.ts` suffix. Modules that must never be client-imported start with `import "@tanstack/react-start/server-only"` (see `src/server/db.ts`, `src/server/request-context.ts`).
- Endpoints and server functions are security boundaries: check session, admin status, and user status before mutating protected data. Be extra careful with unauthenticated routes (onboarding, login, password reset, email verification, invites, RPC).
- Translate external errors into stable application errors (`JellyfinApiError`, `EmailApiError`, `ActionResult` + `ErrorCode`); never expose secrets, tokens, or raw upstream payloads to the browser.
- Validation is zod throughout: `safeParse` in services → `ErrorCode.VALIDATION_FAILED`; shared DTOs in `src/server/api/schemas/*`; prefer existing schema helpers over one-off parsing.
- Rate limiting: named limiters in `src/server/rate-limit.ts`, applied with `rateLimitMiddleware` in ORPC.
- Logging: pino via `createChildLogger({ module: "..." })` from `src/server/logger.ts`.
- Forwarded request metadata (`x-forwarded-for`/`x-real-ip`/`x-forwarded-host`) is trusted only when `TRUST_PROXY=true`; by default client IP is `null` and IP rate limiters share one fail-closed bucket. Keep this in mind for rate limiting, request-origin, and onboarding app-URL code (`src/server/request-context.ts`, `src/server/request-origin.ts`).

### React & TanStack

- Route loaders and server functions do the data work; preserve TanStack Router intent preloading — no manual click-time fetching.
- Prefer optimistic updates when rollback is clear and safe.
- State is component-scoped TanStack Store (`src/hooks/store-utils.ts`, `use-scoped-store.ts`, table stores) — not a global store. Query defaults live in `src/lib/orpc/query.ts` (`staleTime: 30_000`, no refetch-on-focus).
- Route shape:

  ```ts
  export const Route = createFileRoute("/login")({
    loader: async () => enforcePageAccessFn({ data: "login" }),
    component: LoginPage,
  })
  ```

### Drizzle schema

New schema work uses snake_case field names so column names need no string redefinition:

```ts
const table = sqliteTable("session", {
  id: text().primaryKey(),
  user_id: text().notNull(),
  created_at: integer().notNull(),
})
```

Existing schema has some camelCase TS fields; do not churn it for style unless the migration and all consumers are part of the task.

### Git & PRs

- Default branch is `dev`; local `main` may not exist — diff against `dev`/`origin/dev`.
- Branch names: at most three hyphen-separated words, no slashes or type prefixes (`invite-expiry`, `fix-session-sync`).
- Commits/PR titles: conventional style `type(scope): summary`; types `feat|fix|docs|chore|refactor|test`; scopes like `auth`, `invites`, `users`, `profiles`, `settings`, `db`, `jellyfin`, `seerr`, `email`, `ui`, `nix`.
- PR descriptions follow `.github/pull-request-template.md`: What Changed, Why, How to Test, Additional Notes.

## Important Files

- `src/router.tsx` — router creation + SSR query integration.
- `src/routes/__root.tsx` — app shell, bootstrap loader, providers.
- `src/routes/rpc.$.ts` — ORPC HTTP entry.
- `src/server/orpc/procedures.ts`, `middleware.ts`, `errors.ts` — API surface, guards, error translation.
- `src/server/db.ts`, `src/server/db/schema.ts`, `drizzle.config.ts` — DB singleton, schema, Drizzle config (sqlite dialect, migrations in `./drizzle`).
- `src/env.ts` — env schema: `DB_PATH`, `CONFIG_PATH`, `LOG_LEVEL`, `TRUST_PROXY`, `APP_VERSION`, `SKIP_ENV_VALIDATION`.
- `src/lib/server/config.server.ts` — runtime config manager (app/auth/Jellyfin/Seerr/email settings from `CONFIG_PATH`).
- `vite.config.ts`, `vitest.config.ts`, `tsconfig.json` (path alias `@/*` → `./src/*`).
- `.oxfmtrc.json`, `.oxlintrc.json` — format/lint rules.
- `flake.nix` — package, dev shell (`nodejs_24`, `pnpm_10`), NixOS module.
- `.github/workflows/checks.yml` — CI pipeline.
- `src/routeTree.gen.ts` is generated — never edit.

## Runtime/Tooling Preferences

- Node 24 (pinned in CI and Nix); package manager pinned to `pnpm@10.28.0` via `packageManager` — always use `pnpm`.
- Vite 7 + TanStack Start; SQLite through `@libsql/client` with `drizzle-orm/libsql/node`. `DB_PATH` accepts plain paths, `sqlite://`, `file://`, and `:memory:`.
- Lint/format are Oxlint/Oxfmt only — no ESLint or Prettier configs exist; do not add them.
- Nix: `nix develop` provides the toolchain (direnv via `.envrc`). Run Nix checks only when touching packaging, the flake, the NixOS module, or service behavior.
- No Dockerfile; the container image is built from `packages.dockerImage` in
  `flake.nix`. Deployment supports the published GHCR image, Nix (recommended),
  or bare-metal Node + pnpm.

## Testing & QA

- Vitest (`vitest.config.ts`): Node environment, discovers `src/**/*.test.ts(x)`. Run with `pnpm run test`; no coverage gate configured.
- Avoid mocks as much as possible. Pure-logic suites (`src/lib/invite-codes.test.ts`, `src/server/renewal.test.ts`, `src/server/rate-limit.test.ts`) use none; mock only external boundaries (Jellyfin admin API, email, config) where needed, e.g. `src/server/admin/users.test.ts`.
- Test actual implementation; never duplicate implementation logic into tests. Prefer integration-style coverage for auth, invites, profile policy application, and external-service adapters.
- DB-backed suites use `src/test/db.ts` (`createTestDatabase()`, `configureTestEnvironment()`): set temp env paths, `vi.resetModules()`, dynamically import target modules so they read the temp env, run migrations, clean up in `afterEach`/`afterAll`. Follow `src/server/tokens.test.ts`, `session.test.ts`, or `invites.test.ts` as the pattern.
- Run targeted tests while iterating; run the full completion checklist (format:check, lint, typecheck, test) before calling a coding task done.
- CI (`.github/workflows/checks.yml`, on push): install → `format:check` → `lint:github` → `typecheck` → `test` → `db:check` → `build` → `nix flake check`.
- For non-coding tasks (docs, Nix, ops), propose verification steps and let the user decide validation depth.
