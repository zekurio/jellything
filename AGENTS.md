# Repository Guidelines

- Inviterr is a self-hosted user-management and invitation app for Jellyfin,
  with optional Seerr and SMTP integration: onboarding, invites, profile
  policies, Jellyfin user lifecycle, email verification, password resets, and
  user expiry/renewal. Hobby project, heavy AI-agent involvement.
- TanStack Start + React 19 SSR app served by Vite/Nitro, SQLite via Drizzle
  ORM. Layering is **routes/loaders → server-fn bridges or ORPC client → ORPC
  router/middleware → domain services → integrations/DB**.
- Layout: `src/routes` (file-based routes, `rpc.$.ts` is the ORPC HTTP entry),
  `src/components` (feature dirs + `ui/` primitives), `src/hooks`, `src/lib`
  (client-safe utils, i18n, schemas, ORPC client, server-fn bridges),
  `src/server` (domain services, `orpc/`, `admin/`, integrations under
  `jellyfin/`, `seerr/`, `email/`, `db/schema.ts`), `src/test`, `drizzle`
  (generated migrations), `scripts` (migration-drift check, Nix hash refresh),
  `flake.nix` (package, dev shell, container image, `services.inviterr` module).
- The default branch is `dev`; local `main` may not exist, so diff against
  `dev` or `origin/dev`.
- Deno 2.9.x is the package manager, task runner, dev runtime, and production
  runtime; never use npm, pnpm, yarn, or Bun. `package.json` stays the npm
  dependency manifest, `deno.lock` is the only lockfile, `node_modules/` is
  generated. `deno install --frozen` installs locked deps.
- Tasks live in `deno.json`: `dev`, `build`, `start`, `format`, `format:check`,
  `lint`, `lint:fix`, `lint:github`, `typecheck`, `check` (lint + typecheck),
  `test`, `db:generate|migrate|push|studio`, `db:check`.
- Formatting is oxfmt and linting is oxlint (type-aware, zero warnings,
  `no-console`, `no-explicit-any`, `prefer-const`, `no-else-return` are
  errors), not Prettier/ESLint; do not add ESLint or Prettier configs.
  Typecheck runs `tsgo --noEmit` (`@typescript/native-preview`).
- All of `deno task format:check`, `deno task lint`, `deno task typecheck`, and
  `deno task test` must pass before a coding task is complete. Persisted-shape
  changes also need the generated migration plus `deno task db:check`.
- Do not run `deno task build` during normal app work; it can disrupt a running
  dev server. Run Nix checks (`nix flake check`) only when touching packaging,
  `flake.nix`, or the NixOS module.
- Priorities in order: performance (no waterfalls, optimistic updates),
  security (tight public endpoints, careful auth/admin checks), convenience,
  customizability, reliability under Jellyfin/Seerr/email/DB failure. When
  forced to trade off, choose correctness, robustness, and security.
- `src/routeTree.gen.ts` is generated — never edit it.

## Branch Names

Use a short branch name of at most three words, separated by hyphens. Do not use slashes or type prefixes such as `feat/` or `fix/`.

Examples: `invite-expiry`, `fix-session-sync`, `bulk-management`.

## Commits and PR Titles

Use conventional commit-style messages and PR titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use the affected area, e.g. `auth`, `invites`, `users`, `profiles`, `settings`, `db`, `jellyfin`, `seerr`, `email`, `ui`, or `nix`.

PR descriptions follow `.github/pull-request-template.md`: What Changed, Why, How to Test, Additional Notes.

## Style Guide

### General Principles

- Keep related logic in one function unless extracting it makes the behavior easier to reuse, test, or reason about. Do not extract single-use helpers preemptively.
- Avoid `try`/`catch` except at external-integration and cleanup boundaries where failures must be translated, logged, retried, or intentionally swallowed.
- Avoid the `any` type; narrow untrusted data with `unknown`, TypeBox schemas, or explicit local types.
- Rely on type inference; add annotations only for exports or clarity. Inline values used once.
- Keep synchronous parsing, validation, and option building synchronous.
- Comment non-obvious constraints and surprising behavior, not obvious assignments.
- Extract shared logic into modules; duplicated logic across files is a code smell.

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
session.userId

// Bad
const { userId } = session
```

### Imports

- Never alias imports (`import { foo as bar }`) and never use star imports (`import * as Foo`).
- Prefer dynamic imports for heavy modules used only in selected code paths, especially startup-sensitive entrypoints and client routes. Destructure the dynamic import binding near the top of the narrowest scope; avoid inline `(await import("./m")).value()` chains.
- Use the `@/*` alias for `src/*`.

### Variables and Control Flow

Prefer `const` over `let`; use ternaries or early returns instead of reassignment. Avoid `else`.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  let result
  if (condition) result = 1
  else result = 2
  return result
}
```

### Complex Logic

Make the main function read as the happy path and move validation branches into small named helpers below it (`requireProfile`, `parseInviteCode`). Extract only when the helper names a real concept.

### Schema Definitions (Drizzle)

New schema work uses snake_case field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  user_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  userID: text("user_id").notNull(),
})
```

Existing schema has camelCase TS fields; do not churn it for style unless the migration and all consumers are part of the task.

## Repo Patterns

- Server modules are named for their domain — no `-service` or `.server.ts` suffix (`src/lib/server/config.server.ts` is the legacy exception). Modules that must never be client-imported start with `import "@tanstack/react-start/server-only"` (`src/server/db.ts`, `src/server/request-context.ts`).
- Service functions return the stable `ActionResult`/`ErrorCode` envelope (`src/lib/api/contracts/errors.ts`); ORPC procedures unwrap it with `unwrapActionResultOrThrow` or raise `throwAppError` (`src/server/orpc/errors.ts`). A top-level error-boundary middleware translates anything else into `OPERATION_FAILED`, so per-procedure catch-alls are redundant.

  ```ts
  login: mutationProcedure
    .use(rateLimitMiddleware(loginLimiter))
    .input(loginSchema)
    .handler(async ({ input }) => unwrapActionResultOrThrow(await login(input))),
  ```

- Browser mutations/queries go through ORPC at `/rpc`, grouped by domain (`app`, `auth`, `onboarding`, `invites`, `email`, `passwordReset`, `me`, `admin`) in `src/server/orpc/procedures.ts`. `src/server/orpc/middleware.ts` enforces session, admin status, config gating, same-origin mutations, and rate limits — endpoints are the security boundary, especially the unauthenticated ones (onboarding, login, password reset, email verification, invites).
- Route loaders call thin `createServerFn` bridges (`src/lib/page-access-fns.ts`, `dashboard-page-fns.ts`, `profile-page-fns.ts`) that lazily import server modules only under SSR. Keep data work in loaders/server functions and preserve TanStack Router intent preloading; no client-side waterfalls or click-time fetching.
- Validation uses TypeBox throughout: `safeParse(schema, value)` from `src/lib/validation.ts` in services → `ErrorCode.VALIDATION_FAILED`. Use `standardSchema(schema)` at oRPC and React Hook Form boundaries. Shared form schemas live in `src/lib/schemas.ts`, request/response DTOs in `src/server/api/schemas/*`; prefer existing helpers over one-off parsing.
- Rate limiting uses named limiters from `src/server/rate-limit.ts` applied via `rateLimitMiddleware`/`enforceRateLimit`. Logging is pino via `createChildLogger({ module: "..." })` (`src/server/logger.ts`).
- Sessions are AES-GCM-encrypted, cookie-backed DB records (`src/server/session.ts`), revalidated against Jellyfin when stale (`src/server/session-resolver.ts`); client session state lives in `src/hooks/use-session.tsx`.
- Each integration (`src/server/jellyfin`, `seerr`, `email`) has a `client.ts` transport that throws a stable API error class, `schemas.ts` TypeBox decoding, and domain operation modules on top. Translate upstream failures into `JellyfinApiError`, `EmailApiError`, or an `ErrorCode`; never leak secrets, tokens, or raw upstream payloads to the browser.
- Forwarded metadata (`x-forwarded-for`, `x-real-ip`, `x-forwarded-host`) is trusted only when `TRUST_PROXY=true`; otherwise client IP is `null` and IP limiters share one fail-closed bucket (`src/server/request-context.ts`, `request-origin.ts`).
- Startup maintenance (user seeding, invite reconciliation, expiry sweeps) runs from `src/server/startup.ts` and `user-lifecycle.ts`; `/healthz` and `/readyz` are the liveness and readiness routes.
- Runtime config (app/auth/Jellyfin/Seerr/email settings from `CONFIG_PATH`) is owned by `src/lib/server/config.server.ts`. Env is limited to `DB_PATH`, `CONFIG_PATH`, `MIGRATIONS_PATH`, `NODE_ENV`, `LOG_LEVEL`, `TRUST_PROXY`, plus `APP_VERSION` and `SKIP_ENV_VALIDATION` (`src/env.ts`).
- State is component-scoped TanStack Store (`src/hooks/store-utils.ts`, `use-scoped-store.ts`, table stores), never a global store. Query defaults live in `src/lib/orpc/query.ts` (`staleTime: 30_000`, no refetch-on-focus). Prefer optimistic updates when rollback is clear and safe.
- User-facing strings are i18n message keys (`src/lib/i18n`); add every key to both `messages/en.ts` and `messages/de.ts`. Error codes map to locale keys via `resolveErrorKey`.
- Reuse `src/components/ui` primitives before adding local ones.
- Tests are Vitest (`src/**/*.test.ts(x)`) run under Deno. Avoid mocks; mock only external boundaries. DB-backed suites use `src/test/db.ts` (`createTestDatabase()`, `configureTestEnvironment()`, `vi.resetModules()`, dynamic imports so modules read temp env, cleanup in `afterEach`/`afterAll`) — follow `src/server/tokens.test.ts`, `session.test.ts`, or `invites.test.ts`. Never duplicate implementation logic into tests.
- After dependency changes run `deno install`, commit `package.json` and `deno.lock`, then refresh the per-platform Nix hashes with `scripts/update-deno-deps-hashes.sh` from `nix develop` (CI verifies with `--check`).
