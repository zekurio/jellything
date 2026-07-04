# AGENTS.md

This file gives AI agents the repo-specific context they need when working in Jellything.

- The default branch in this repo is `dev`.
- Local `main` ref may not exist; use `dev` or `origin/dev` for diffs.
- Use `pnpm` for package management and scripts.
- Do not run `pnpm run build` during normal app work unless explicitly needed; it can disrupt the running dev server.

## Branch Names

Use a short branch name of at most three words, separated by hyphens. Do not use slashes or type prefixes such as `feat/` or `fix/`.

Examples: `invite-expiry`, `fix-session-sync`, `email-templates`.

## Commits and PR Titles

Use conventional commit-style messages and PR titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use the affected area when helpful, e.g. `auth`, `invites`, `users`, `profiles`, `settings`, `db`, `jellyfin`, `seerr`, `email`, `ui`, or `nix`.

Examples: `fix(auth): refresh session state`, `feat(invites): add expiry warning`, `docs: update install guide`.

## Style Guide

### General Principles

- Keep related logic in one function unless extracting it makes the behavior easier to reuse, test, or reason about.
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Avoid `try`/`catch` where possible. Use it at external integration and cleanup boundaries where failures need to be translated, logged, retried, or intentionally swallowed.
- Avoid using the `any` type. If a third-party package exposes loose data, narrow with `unknown`, schemas, or explicit local types before using it.
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity.
- Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const invite = await db.query.invites.findFirst({
  where: eq(invites.id, inviteId),
})

// Bad
const inviteIdFilter = eq(invites.id, inviteId)
const invite = await db.query.invites.findFirst({ where: inviteIdFilter })
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
session.userId
session.isAdmin

// Bad
const { userId, isAdmin } = session
```

### Imports

- Never alias imports. Do not use `import { foo as bar } from "..."` or renamed imports like `resolve as pathResolve`.
- Never use star imports. Do not use `import * as Foo from "..."` or `import type * as Foo from "..."`.
- If a namespace-style value is needed, import the module's own exported namespace by name, then reference `Namespace.Value`.
- Prefer dynamic imports for heavy modules that are only needed in selected code paths, especially in startup-sensitive entrypoints and client routes. Destructure dynamic import bindings near the top of the narrowest scope that needs them so they read like normal imports. Avoid inline chains such as `await import("./module").then((mod) => mod.value())` or `(await import("./module")).value()`. Keep branch-specific imports inside the branch that needs them to preserve lazy loading.

### Variables

Prefer `const` over `let`. Use ternaries, local helpers, or early returns instead of reassignment.

```ts
// Good
const nextStatus = invite.isDisabled ? "disabled" : "active"

// Bad
let nextStatus
if (invite.isDisabled) nextStatus = "disabled"
else nextStatus = "active"
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function requireAdmin(session: SessionData | null) {
  if (!session?.isAdmin) return false
  return true
}

// Bad
function requireAdmin(session: SessionData | null) {
  if (!session?.isAdmin) return false
  else return true
}
```

### Complex Logic

When a function has several validation branches or supporting details, make the main function read as the happy path and move supporting details into small helpers below it.

```ts
// Good
export async function createInvite(input: unknown) {
  const data = requireInviteInput(input)
  const profile = await requireProfile(data.profileId)
  return insertInvite({ data, profile })
}

function requireInviteInput(input: unknown) {
  // ...
}
```

- Keep helpers close to the code they support, below the main export when that improves readability.
- Do not over-abstract simple expressions into many single-use helpers; extract only when it names a real concept like `requireProfile`, `parseInviteCode`, or `resolveJellyfinUser`.
- Keep synchronous parsing, validation, and option building synchronous. Do not introduce async control flow unless the operation is actually asynchronous.
- Prefer the repo's existing validation and parsing utilities over one-off parsing logic. When parsing untrusted JSON strings, validate the resulting shape before using it.
- Add comments for non-obvious constraints and surprising behavior, not for obvious assignments or control flow.

### React and TanStack

- Keep route loaders and server functions doing the data work so pages avoid client-side waterfalls.
- Preserve TanStack Router's intent preloading and prewarm behavior; do not replace it with manual click-time fetching.
- Prefer optimistic updates for mutations when rollback behavior is clear and safe.
- Keep user-facing UI responsive: avoid expensive render-time work, memoize only when it addresses a real cost, and prefer small data transformations near the data boundary.
- Use shared components from `src/components/ui` and feature components from `src/components/*` before introducing new local primitives.

### Server, API, and Security

- Treat endpoints and server functions as security boundaries. Check session, admin status, and user status before changing protected data.
- Be especially careful with routes exposed to unauthenticated users: onboarding, login, password reset, email verification, invites, and RPC entrypoints.
- Keep Jellyfin, Seerr, email, and database integration failures predictable. Translate external errors into stable application errors instead of leaking internals.
- Never expose secrets, API keys, tokens, or full upstream error payloads to the browser.
- Prefer shared ORPC contracts, schemas, and error helpers over ad-hoc request/response shapes.
- Forwarded request metadata (`x-forwarded-for`/`x-real-ip`/`x-forwarded-host`) is only trusted when `TRUST_PROXY=true`; by default the client IP is `null` and IP rate limiters share one fail-closed bucket. Deployments behind a trusted, header-overwriting proxy set `TRUST_PROXY=true` for per-client buckets. Keep this in mind when touching rate limiting, request-origin, or onboarding app-URL code.

### Server Module Names

- Name `src/server` modules for their domain without a `-service` suffix.
- Do not use a `.server.ts` suffix for server modules.
- Modules that must never be client-imported carry `import "@tanstack/react-start/server-only"` as their first import.

### Schema Definitions (Drizzle)

For new schema work, use snake_case field names so column names do not need to be redefined as strings.

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
  userId: text("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

Existing schema uses some camelCase TypeScript fields. Do not churn the entire schema just for style unless the migration and all consumers are part of the task.

## Testing

- Avoid mocks as much as possible.
- Test actual implementation; do not duplicate implementation logic into tests.
- Prefer integration-style coverage for auth, invites, profile policy application, and external-service adapters when practical.
- Tests run on Vitest via `pnpm run test`. A baseline lives under `src/**/*.test.ts`; use the temp-SQLite helper in `src/test/db.ts` for DB-backed tests and follow the existing suites (e.g. `src/server/tokens.test.ts`) as the pattern.
- Run targeted checks while iterating, then run the completion checks below before calling a coding task done.

## Task Completion Requirements

### Coding Tasks

All of these must pass before considering a coding task completed:

- `pnpm run format:check`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test`

Use `pnpm run format` to apply formatting when needed. `pnpm run check` is a shortcut for lint + typecheck only.

Do not run `pnpm run build` unless the task specifically requires a production build or packaging verification.

### Database Tasks

Jellything uses Drizzle ORM for database interactions.

Relevant scripts:

- `pnpm run db:generate` — generate a new migration from schema changes
- `pnpm run db:migrate` — run pending migrations
- `pnpm run db:push` — push schema directly (dev only)
- `pnpm run db:studio` — open Drizzle Studio
- `pnpm run db:check` — fail if the schema has drifted from the committed migrations (CI-safe; also runs in CI)

When changing persisted data shape, include the schema change and generated migration unless the user explicitly asks for a dev-only push. Run `pnpm run db:check` to confirm there is no drift.

### Nix Tasks

If updating Nix packaging, the flake, NixOS module, or service behavior, run appropriate Nix checks. Builds should only be issued when actually warranted.

### Other Tasks

If your task does not fit coding, database, or Nix work, propose verification steps and let the user decide how much validation is needed.

## Project Areas

- `src/routes` - TanStack Router routes, route loaders, and public page boundaries.
- `src/components` - Feature UI and shared UI primitives. `src/components/ui` contains reusable primitives.
- `src/hooks` - Client hooks and store helpers.
- `src/lib` - Shared client/server-safe utilities, schemas, i18n, ORPC client helpers, page-access functions, and route data helpers.
- `src/server` - Server services, ORPC router/procedures, auth/session handling, external integrations, logging, rate limits, and startup behavior.
- `src/server/db` - Drizzle schema and database exports.
- `src/server/jellyfin` - Jellyfin API client, schemas, admin/user operations, and password reset integration.
- `src/server/seerr` - Seerr API client, schemas, users, and permissions integration.
- `src/server/email` - Email delivery and templates.
- `drizzle` - Generated database migrations.
- `flake.nix` - Nix package, app, dev shell, and NixOS module wiring.

## Project Snapshot

Jellything is a self-hosted user management and invitation app for Jellyfin, with optional Seerr integration. It handles onboarding, admin settings, invite creation, profile policy application, Jellyfin user lifecycle, email verification, password resets, and user expiry.

This is a hobby project tailored to a specific self-hosted workflow. Sweeping changes are acceptable when they improve long-term maintainability, security, or user experience, but avoid broad churn that is unrelated to the task.

## Core Priorities

1. Performance first: avoid waterfalls, keep navigation fast, and use optimistic updates where safe.
2. Security first: check auth/admin status carefully and keep public endpoints tight.
3. Convenience: make common admin and invite flows low-friction.
4. Good defaults, high customizability: self-hosters should be able to tailor behavior without patching code.
5. Reliability: keep behavior predictable during Jellyfin, Seerr, email, database, and network failures.

If a tradeoff is required, choose correctness, robustness, and security over short-term convenience.

## Maintainability

Long-term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Do not be afraid to change existing code when it makes the result cleaner, but do not take shortcuts by adding isolated local logic that will become hard to maintain.

## Pull Requests

When opening pull requests, follow the user's instructions. If they are unclear, act on the user's behalf. When writing summaries, check `.github/pull-request-template.md` and follow its sections:

- What Changed
- Why
- How to Test
- Additional Notes
