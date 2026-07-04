# Plan 004: Add admin API tokens for headless automation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, if `plans/README.md` exists, update the
> status row for this plan — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 871bd4b..HEAD -- src/server/orpc src/server/session.ts src/server/tokens.ts src/server/db/schema.ts src/server/rate-limit.ts src/routes/rpc.\$.ts src/lib/dashboard-tabs.ts src/components/settings src/lib/i18n/messages`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `871bd4b`, 2026-07-04

## Why this matters

Today Jellything can only be driven through the browser: every write goes
through session-cookie auth with a same-origin check, so there is no way to
script invite creation or user provisioning from a cron job, another service,
or a CLI. API tokens unlock headless automation, which is the natural next
step for a self-hosted admin tool.

**This expands the security surface.** It introduces a second, cookie-less
credential that grants full admin over the same RPC surface a browser admin
has. Before executing this plan, the maintainer must confirm they actually
want a public, bearer-authenticated API surface on this deployment — a leaked
token is equivalent to a leaked admin login and there is no interactive
re-auth to catch misuse. If that decision is not yet made, STOP and ask.
Once it lands, the payoff is that common admin/invite flows become
automatable without weakening the browser auth path.

## Current state

Auth is entirely session-cookie based. The pieces you will extend:

- `src/server/db/schema.ts` — Drizzle schema. Existing tables use the
  **legacy** explicit-column style (`text("user_id")`). New tables must use
  the **snake_case bare-column** style per `AGENTS.md`. `sessions` (lines
  101-126) is the closest analog for a credential table:

  ```ts
  export const sessions = sqliteTable("sessions", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull(),
    ...
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(DEFAULT_TIMESTAMP_MS),
  })
  ```

  `createId()` (line 15) = `crypto.randomUUID()`. `DEFAULT_TIMESTAMP_MS`
  (line 13) = `sql\`(unixepoch() \* 1000)\``. The `schema`export object
(lines 236-249) and the`$inferSelect`/`$inferInsert` type exports (lines
  251-263) must include every new table.

- `src/server/tokens.ts` — **the hashing primitive to reuse.** This is the
  established pattern for a random, hashed, stored-in-a-unique-column
  credential (email-verification tokens). Reuse these two exported functions
  verbatim; do NOT invent new crypto:

  ```ts
  export function generateSecureToken(): string {
    return crypto.randomBytes(32).toString("hex") // src/server/tokens.ts:10-12
  }
  export function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex") // :14-16
  }
  ```

  Note: unlike email tokens (which look the row up directly by
  `WHERE token = hashToken(raw)`, not app-level constant-time), API tokens
  grant full admin, so this plan uses the **session-style split format** to
  get a constant-time secret comparison (see below).

- `src/server/session.ts` — session store. It uses Node's `timingSafeEqual`
  for the constant-time secret check:

  ```ts
  function constantTimeMatch(left: string, right: string): boolean {
    // :148-157
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    if (leftBuffer.length !== rightBuffer.length) return false
    return timingSafeEqual(leftBuffer, rightBuffer)
  }
  ```

  `constantTimeMatch` is **not exported** — do not export it. Your new module
  reimplements the same two-line pattern with `timingSafeEqual` from
  `node:crypto` (already the codebase's constant-time primitive). `SessionData`
  shape you must produce for a bearer identity is defined in
  `src/lib/session.ts`:

  ```ts
  export interface SessionData {
    // src/lib/session.ts:3-12
    userId: string
    name: string
    avatarUrl: string
    isAdmin: boolean
    email: string | null
    emailVerified: boolean
    locale: Locale | null
    createdAt: string
  }
  export function canActAsAdmin(session: SessionData): boolean {
    return session.isAdmin
  } // :19-21
  ```

- `src/server/orpc/context.ts` — builds `ORPCContext` per request. Interface
  at lines 16-26 has `request`, `requestId`, `clientIp`, `userAgent`,
  `resolveSession(...)`. `createORPCContext(request)` (lines 56-66) is where a
  bearer resolver will be added. The `Authorization` header is read off
  `request.headers`.

- `src/server/orpc/middleware.ts` — the admin gate. Key excerpts:

  ```ts
  async function enforceSessionRequirement(context, requirement) {     // :40-77
    const resolved = await context.resolveSession({...})
    ...
    if (requirement === "admin" && resolved.session && !canActAsAdmin(resolved.session)) {
      throwAppError(ErrorCode.FORBIDDEN)
    }
    return resolved.session ?? null
  }
  const requireAdminMiddleware = orpc.middleware(async ({ context, next }) => {   // :97-104
    const session = await enforceSessionRequirement(context, "admin")
    return next({ context: { session } })
  })
  const sameOriginMutationMiddleware = orpc.middleware(({ context, next }) => {   // :114-122
    if (!isAllowedRequestOrigin(context.request)) {
      throwAppError(ErrorCode.FORBIDDEN, "Request origin is not allowed", { status: 403 })
    }
    return next()
  })
  export const mutationProcedure = publicProcedure.use(sameOriginMutationMiddleware)  // :156-158
  const adminProcedure = mutationProcedure.use(requireAdminMiddleware)               // :160
  export const configuredAdminProcedure = adminProcedure.use(requireConfiguredMiddleware)  // :161-163
  ```

  **Security-critical:** the same-origin (CSRF) check lives in
  `sameOriginMutationMiddleware`, which runs _before_ `requireAdminMiddleware`
  because both are baked into `configuredAdminProcedure`. You must NOT touch
  `sameOriginMutationMiddleware` and must NOT relax the origin check. Bearer
  requests from scripts carry no `Origin`/`Referer` header, and
  `isAllowedRequestOrigin` already returns `true` when the request origin is
  `null` (`src/server/request-origin.ts:77-80`), so headless bearer clients
  pass the existing check without any change. Cookie CSRF protection therefore
  stays exactly as strong as today.

- `src/server/request-origin.ts:77-80`:

  ```ts
  export function isAllowedRequestOrigin(request: Request): boolean {
    const requestOrigin = getRequestOrigin(request)
    return (
      requestOrigin === null || getAllowedOrigins(request).has(requestOrigin)
    )
  }
  ```

- `src/server/orpc/procedures.ts` — all ORPC procedures. `adminProcedures`
  (lines 396-551) is grouped by feature; the `invites` group (400-436) is your
  structural model for a new `apiTokens` group. Admin procedures use
  `configuredAdminProcedure`. Handlers call a service and pass it through
  `unwrapActionResultOrThrow`. `context.session?.userId` is passed to services
  as the actor id (e.g. `createInviteService(context.session?.userId, input)`,
  line 418) — note the optional chaining: services already tolerate an
  `undefined` actor id.

- `src/server/rate-limit.ts` — rate limiter definitions. Add a new limiter
  with the `createLimiter({...})` factory (lines 14-16), following e.g.
  `loginLimiter` (18-23). It is consumed in middleware via
  `getClientIpRateLimitKey(context, ...)` + `enforceRateLimit(...)`
  (`src/server/orpc/middleware.ts:124-152`). **TRUST_PROXY caveat — quote from
  `AGENTS.md` and honor it:** "Forwarded request metadata
  (`x-forwarded-for`/`x-real-ip`/`x-forwarded-host`) is only trusted when
  `TRUST_PROXY=true`; by default the client IP is `null` and IP rate limiters
  share one fail-closed bucket." Mirrored in code at
  `src/server/orpc/middleware.ts:132-141` (`getClientIpRateLimitKey`), which
  buckets everything under `"unknown"` when `clientIp` is null. So an IP-keyed
  limiter on the bearer path is intentionally aggressive without a trusted
  proxy — that is the accepted behavior, not a bug to "fix".

- UI settings tabs:
  - `src/lib/dashboard-tabs.ts:8-14` — `DASHBOARD_SETTINGS_TABS` const tuple
    (source of truth; `isDashboardSettingsTab` derives from it).
  - `src/components/settings/dashboard-settings-tabs.tsx` — tab list +
    `TabsContent` blocks (lines 29-43 declare `DASHBOARD_SETTINGS_TABS` with
    `labelKey`s; 168-209 render each tab's content). `email-settings-tab.tsx`
    is the structural model for a new tab component.
  - `src/lib/i18n/messages/en.ts:114-117`, `de.ts:113-116`, and
    `types.ts:99-100` — the `settings.*Tab` label keys. A new tab needs a new
    key added to **all three** (types.ts declares the type; en.ts and de.ts
    provide values) or `pnpm run typecheck` fails.

- Error codes: `src/lib/api/contracts/errors.ts:6-37` — reuse existing
  `ErrorCode.UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND`; do not add new codes.

- Test pattern: `src/server/session.test.ts` is the characterization suite for
  auth. It uses the temp-SQLite helper `src/test/db.ts`
  (`createTestDatabase` / `configureTestEnvironment`), mocks
  `@/lib/server/config.server`'s `auth` secrets (lines 26-38), and loads
  server modules dynamically after configuring the DB (lines 51-64). Your new
  `src/server/api-tokens.test.ts` follows this exact structure.

## Commands you will need

| Purpose            | Command                       | Expected on success       |
| ------------------ | ----------------------------- | ------------------------- |
| Install            | `pnpm install`                | exit 0                    |
| Generate migration | `pnpm run db:generate`        | new file under `drizzle/` |
| Check migration    | `pnpm run db:check`           | exit 0, no drift          |
| Format             | `pnpm run format`             | rewrites files            |
| Format check       | `pnpm run format:check`       | exit 0                    |
| Lint               | `pnpm run lint`               | exit 0                    |
| Typecheck          | `pnpm run typecheck`          | exit 0, no errors         |
| Tests (all)        | `pnpm run test`               | all pass                  |
| Tests (this)       | `pnpm run test -- api-tokens` | all pass                  |

Do NOT run `pnpm run build` (per `AGENTS.md`, it can disrupt the dev server).

## Suggested executor toolkit

- Reuse `generateSecureToken` / `hashToken` from `src/server/tokens.ts` and
  `timingSafeEqual` from `node:crypto` — do not add a crypto dependency or a
  new hashing scheme.
- Model the test file on `src/server/session.test.ts` and use the DB helper in
  `src/test/db.ts`.

## Scope

**In scope** (the only files you should create/modify):

- `src/server/db/schema.ts` (add `apiTokens` table + relations + type exports)
- `drizzle/` (generated migration — do not hand-edit)
- `src/server/api-tokens.ts` (create — mint/hash/lookup/list/revoke service)
- `src/server/api-tokens.test.ts` (create — auth characterization tests)
- `src/server/orpc/context.ts` (add bearer resolver to `ORPCContext`)
- `src/server/orpc/middleware.ts` (bearer-first branch in the admin gate)
- `src/server/orpc/procedures.ts` (add `admin.apiTokens.{list,create,revoke}`)
- `src/server/rate-limit.ts` (add `apiTokenAuthLimiter`)
- `src/lib/dashboard-tabs.ts` (add `"apiTokens"` to `DASHBOARD_SETTINGS_TABS`)
- `src/components/settings/api-tokens-settings-tab.tsx` (create)
- `src/components/settings/dashboard-settings-tabs.tsx` (wire the new tab)
- `src/lib/i18n/messages/en.ts`, `de.ts`, `types.ts` (label + UI strings)

**Out of scope** (do NOT touch):

- `src/server/session.ts` / `src/server/session-resolver.ts` — cookie auth is
  independent; do not export its internals or route bearer auth through it.
- `sameOriginMutationMiddleware` in `src/server/orpc/middleware.ts` — the CSRF
  gate must stay byte-for-byte unchanged. Touching it is a STOP condition.
- The OpenAPI/`SimpleCsrfProtectionHandlerPlugin` wiring in
  `src/routes/rpc.$.ts` — the RPC handler already routes bearer requests
  through the same context; no transport change is needed.
- Scoped/least-privilege tokens — v1 is full-admin only (see Maintenance).
- Non-admin (`authedProcedure`) bearer auth — bearer is admin-only in v1.

## Git workflow

- Branch: `api-tokens` (short, no type prefix, per `AGENTS.md`).
- Commit per logical unit; conventional-commit messages, e.g.
  `feat(auth): add api_tokens schema and migration`,
  `feat(auth): resolve bearer tokens in the admin gate`,
  `feat(ui): add api tokens settings tab`.
- End each commit message with the two trailer lines this repo requires
  (`Generated with AI` / `Co-Authored-By: AI <ai@example.com>`).
- Do NOT push or open a PR unless the maintainer asks.

## Steps

### Step 1: Add the `api_tokens` schema table

In `src/server/db/schema.ts`, add a new table using the **snake_case
bare-column** style (not the legacy explicit-name style the old tables use):

```ts
export const apiTokens = sqliteTable("api_tokens", {
  id: text().primaryKey().$defaultFn(createId),
  // Constant-time-verifiable split token: public id above, hashed secret here.
  secret_hash: text().notNull().unique(),
  // Human label shown in the settings UI; never a secret.
  name: text().notNull(),
  // The admin who minted the token. Used as the actor id for writes so audit
  // trails (e.g. invite.created_by_id) point at a real user. Nullable so a
  // deleted admin doesn't cascade-delete their tokens' audit linkage.
  created_by_user_id: text().references(() => users.userId, {
    onDelete: "set null",
  }),
  last_used_at: integer("last_used_at", { mode: "timestamp_ms" }),
  // Null = never expires (v1 default). Set = reject after this instant.
  expires_at: integer("expires_at", { mode: "timestamp_ms" }),
  revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(DEFAULT_TIMESTAMP_MS),
})
```

Then:

- Add `apiTokens` to the `schema` export object (lines 236-249).
- Add `export type ApiToken = typeof apiTokens.$inferSelect` and
  `export type NewApiToken = typeof apiTokens.$inferInsert` to the type-export
  block (lines 251-263).
- Add a relation (optional but consistent): `apiTokens.created_by_user_id` →
  `users.userId`, and extend `usersRelations` (lines 182-194) with
  `apiTokens: many(apiTokens)` if you add the relation.

Note: `mode: "timestamp_ms"` columns need the explicit column-name string
because Drizzle can't infer the SQL type name from the mode; that is why the
timestamp columns above pass a name. The pure `text()` / bare columns use the
inferred snake_case name.

**Verify**: `pnpm run typecheck` → exit 0 (schema compiles).

### Step 2: Generate and verify the migration

Run `pnpm run db:generate` to emit a new migration under `drizzle/`. Do not
hand-edit it. Then confirm no drift.

**Verify**:

- `pnpm run db:generate` → a new `drizzle/NNNN_*.sql` file exists that
  `CREATE TABLE`s `api_tokens`.
- `pnpm run db:check` → exit 0 (schema matches committed migrations).

### Step 3: Create the api-tokens service module

Create `src/server/api-tokens.ts`. It owns minting, hashing, lookup, listing,
and revocation. Reuse `generateSecureToken`/`hashToken` from
`@/server/tokens` and `timingSafeEqual` from `node:crypto`.

Token wire format (mirrors the session cookie's `id.secret` split so the
secret can be compared in constant time after an indexed lookup by id):

```
jth_<tokenId>.<secret>
```

- `tokenId` = the row's `id` (a UUID; public, safe to log as an identifier).
- `secret` = `generateSecureToken()` (32 random bytes, hex).
- Stored: `secret_hash = hashToken(secret)`. The raw secret is never stored.

Required exports (names are load-bearing for later steps):

```ts
export interface ApiTokenSummary {
  id: string
  name: string
  createdByUserId: string | null
  lastUsedAt: number | null
  expiresAt: number | null
  createdAt: number
}

// Mint: returns the ONE-TIME plaintext token plus the summary. The plaintext
// is returned here and NOWHERE else, ever.
export async function createApiToken(input: {
  name: string
  createdByUserId: string | null
  expiresAt: number | null
}): Promise<{ token: string; summary: ApiTokenSummary }>

// Resolve a raw bearer string to the minting admin's identity, or null.
// Rejects: malformed value, unknown id, secret mismatch (constant-time),
// revoked_at set, expires_at in the past. On success, best-effort updates
// last_used_at (do not block/reject the request if that write fails).
export async function resolveApiToken(
  raw: string | undefined,
): Promise<SessionData | null>

export async function listApiTokens(): Promise<ApiTokenSummary[]> // never returns hashes/secrets
export async function revokeApiToken(id: string): Promise<boolean> // sets revoked_at; false if not found
```

Implementation notes:

- Parse `raw`: require the `jth_` prefix, then split on the FIRST `.` into
  `tokenId` and `secret` (mirror `parseSessionCookie`,
  `src/server/session.ts:126-146`). Reject anything malformed by returning
  `null` — never throw to the caller for a bad token.
- Look up the row `WHERE id = tokenId AND revoked_at IS NULL`
  (`await ensureMigrated()` first, as `tokens.ts` and `session.ts` do).
- Constant-time compare `row.secret_hash` to `hashToken(secret)` with
  `timingSafeEqual` over equal-length buffers (copy the two-line guard from
  `constantTimeMatch`, `src/server/session.ts:148-157`). A length mismatch
  returns `false` without calling `timingSafeEqual`.
- Reject when `expires_at !== null && expires_at <= Date.now()`.
- On success build the admin `SessionData`:
  ```ts
  {
    userId: row.created_by_user_id ?? `api-token:${row.id}`,
    name: `API token: ${row.name}`,
    avatarUrl: "",
    isAdmin: true,
    email: null,
    emailVerified: true,
    locale: null,
    createdAt: new Date(row.created_at).toISOString(),
  }
  ```
  Using `created_by_user_id` as `userId` keeps `invite.created_by_id` pointing
  at a real user. The `api-token:` fallback only applies if the minting admin
  was deleted; since it is not a real `users.userId`, downstream writes that
  FK on it would fail — that is acceptable because a token whose creator was
  deleted should be re-minted, but note it in the STOP conditions.
- **Never** log the raw token, the secret, or `secret_hash`. If you log at
  all, log `tokenId` only (it is a non-secret identifier).
- Use a `createChildLogger({ module: "api-tokens" })` like the sibling
  modules; do not `console.log`.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 4: Add the bearer rate limiter

In `src/server/rate-limit.ts`, add:

```ts
// Bearer tokens are 256-bit random so brute force is infeasible, but throttle
// failed auth attempts anyway to blunt credential-stuffing and shield the DB.
export const apiTokenAuthLimiter = createLimiter({
  keyPrefix: "api_token_auth",
  points: 30,
  duration: 60,
  blockDuration: 5 * 60,
})
```

**Verify**: `pnpm run typecheck` → exit 0.

### Step 5: Expose bearer resolution on the ORPC context

In `src/server/orpc/context.ts`:

- Add to the `ORPCContext` interface a lazily-memoized resolver:
  `resolveApiToken: () => Promise<SessionData | null>`.
- In `createORPCContext`, read `request.headers.get("authorization")`, strip a
  leading `Bearer ` (case-insensitive) prefix to get the raw token, and return
  a memoized function that calls `resolveApiToken(raw)` from
  `@/server/api-tokens` (cache the promise so multiple middleware reads don't
  re-query). If there is no `Authorization` header, the resolver returns
  `null` without touching the DB.
- Do NOT read cookies in this path. Bearer and cookie auth stay independent.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 6: Add the bearer-first branch to the admin gate

In `src/server/orpc/middleware.ts`, change ONLY `requireAdminMiddleware` (and,
if cleaner, `enforceSessionRequirement` for the `"admin"` case). Do NOT touch
`sameOriginMutationMiddleware`, `requireSessionMiddleware`, or
`optionalSessionMiddleware`.

Behavior:

1. First, try the bearer token: `const bearer = await context.resolveApiToken()`.
2. If `bearer` is non-null:
   - Enforce `apiTokenAuthLimiter` keyed by client IP via
     `getClientIpRateLimitKey(context, "api_token_auth")` +
     `enforceRateLimit(...)` (honors the TRUST_PROXY fail-closed bucket).
   - Return `next({ context: { session: bearer } })` — an admin identity.
   - Because `mutationProcedure`'s `sameOriginMutationMiddleware` already ran
     and passed (bearer scripts send no Origin), CSRF protection for cookie
     requests is untouched.
3. If `bearer` is null, fall through to the EXISTING cookie path:
   `enforceSessionRequirement(context, "admin")` unchanged. A failed bearer
   attempt (present header but invalid) resolves to `null` in Step 3's parser,
   so it falls through to the cookie path and ultimately
   `throwAppError(ErrorCode.UNAUTHORIZED)` when no cookie session exists — do
   NOT leak whether the token was malformed vs. unknown vs. revoked.

Rate-limit ordering note: apply the limiter for the invalid-bearer case too
(i.e. when an `Authorization` header is present but resolves to null), so
repeated bad tokens are throttled. A clean way: if the raw header is present,
consume the limiter before deciding, regardless of validity. Keep the throttle
IP-keyed (per the TRUST_PROXY caveat).

**Verify**: `pnpm run typecheck` → exit 0; `pnpm run lint` → exit 0.

### Step 7: Add the admin ORPC procedures

In `src/server/orpc/procedures.ts`, add an `apiTokens` group inside
`adminProcedures` (model on the `invites` group, lines 400-436), all using
`configuredAdminProcedure`:

- `list`: input `noInputSchema`; returns `await listApiTokens()`.
- `create`: input `z.object({ name: z.string().trim().min(1).max(100),
expiresAt: z.number().int().positive().nullable().optional() })`; calls
  `createApiToken({ name, createdByUserId: context.session?.userId ?? null,
expiresAt: input.expiresAt ?? null })` and returns
  `{ token, summary }`. **The `token` field is the ONLY place the plaintext is
  ever returned.** Do not add it to `list` or any other read.
- `revoke`: input `z.object({ id: z.uuid() })`; calls `revokeApiToken(input.id)`;
  `throwAppError(ErrorCode.NOT_FOUND)` if it returns `false`; else return
  `null`.

Register the group under `admin` in the `procedures` export (it is nested, so
adding it to `adminProcedures` is enough).

**Verify**: `pnpm run typecheck` → exit 0.

### Step 8: Add the settings tab (UI)

- `src/lib/dashboard-tabs.ts:8-14`: append `"apiTokens"` to the
  `DASHBOARD_SETTINGS_TABS` tuple. This auto-updates `isDashboardSettingsTab`.
- `src/lib/i18n/messages/types.ts` (near line 99): add
  `apiTokensTab: string` to the settings message type. Add matching values in
  `en.ts` (`apiTokensTab: "API Tokens"`) and `de.ts`
  (`apiTokensTab: "API-Tokens"`). Add any UI strings the component needs
  (e.g. create button, "copy this token now — it won't be shown again"
  warning, revoke confirm) to the same three files under a coherent key group;
  keep keys in all three in sync or typecheck fails.
- Create `src/components/settings/api-tokens-settings-tab.tsx` modeled on
  `email-settings-tab.tsx`. It should:
  - Query `admin.apiTokens.list` and render name / created / last used /
    expires with a revoke action per row (optimistic or invalidate-on-success,
    matching how other admin tabs mutate).
  - Provide a "create token" form (name + optional expiry). On success, show
    the returned plaintext token EXACTLY ONCE in a copy-to-clipboard field with
    a clear "you will not see this again" warning; never persist it in client
    state beyond the visible dialog, and never refetch it.
  - Use `src/components/ui` primitives; do not introduce new local primitives.
- `src/components/settings/dashboard-settings-tabs.tsx`: add
  `{ value: "apiTokens", labelKey: "settings.apiTokensTab" }` to the local
  `DASHBOARD_SETTINGS_TABS` array (lines 29-43, and widen the `labelKey` union
  type there) and a corresponding `<TabsContent value="apiTokens">` block
  (lines 168-209) rendering `<ApiTokensSettingsTab />`.

**Verify**: `pnpm run typecheck` → exit 0; `pnpm run lint` → exit 0.

### Step 9: Format, lint, typecheck, test — full gate

Run the four completion gates from `AGENTS.md`.

**Verify**:

- `pnpm run format:check` → exit 0 (run `pnpm run format` first if needed)
- `pnpm run lint` → exit 0
- `pnpm run typecheck` → exit 0
- `pnpm run test` → all pass, including the new `api-tokens` suite
- `pnpm run db:check` → exit 0

## Test plan

Create `src/server/api-tokens.test.ts`, structured like
`src/server/session.test.ts` (temp SQLite via `src/test/db.ts`, dynamic module
load after DB config, mock `@/lib/server/config.server` auth secrets the same
way — the hash primitive uses plain SHA-256 so it does not need the secret, but
the module-load pattern is the same). Cover:

- **Mint + resolve happy path**: `createApiToken` returns a `jth_…` token;
  `resolveApiToken(token)` returns a `SessionData` with `isAdmin === true` and
  `userId` equal to the `createdByUserId` passed in.
- **Plaintext is one-time**: after mint, the stored row's `secret_hash` is NOT
  equal to the raw secret, and `listApiTokens()` never includes the plaintext
  or the hash (assert the returned objects have no `secret`/`token`/`hash`
  field).
- **Wrong secret rejected**: `resolveApiToken("jth_<id>.wrong")` → `null`.
- **Unknown id rejected**: `resolveApiToken("jth_does-not-exist.secret")` → `null`.
- **Malformed rejected**: `undefined`, `""`, `"nobearer"`, `"jth_only-id"`,
  `"jth_.leading"`, and a token missing the `jth_` prefix all → `null`.
- **Revoked rejected**: mint, `revokeApiToken(id)`, then `resolveApiToken` →
  `null`.
- **Expired rejected**: mint with `expiresAt` in the past → `resolveApiToken`
  → `null`; mint with future `expiresAt` → resolves.
- **last_used_at updates** on a successful resolve (non-null after resolve).
- **Constant-time compare is used**: assert a length-mismatched secret returns
  `null` without throwing (guards the `timingSafeEqual` equal-length
  precondition).

Verification: `pnpm run test -- api-tokens` → all pass (≥ the cases above).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run format:check` exits 0
- [ ] `pnpm run lint` exits 0
- [ ] `pnpm run typecheck` exits 0
- [ ] `pnpm run test` exits 0; `src/server/api-tokens.test.ts` exists and passes
- [ ] `pnpm run db:check` exits 0 (migration committed, no drift)
- [ ] `git diff 871bd4b..HEAD -- src/server/orpc/middleware.ts` shows NO change
      to `sameOriginMutationMiddleware`
- [ ] `grep -rn "console.log" src/server/api-tokens.ts` returns no matches, and
      no code path returns the plaintext token except `admin.apiTokens.create`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (only if that file exists)

## STOP conditions

Stop and report back (do not improvise) if:

- The maintainer has NOT confirmed they want a public bearer API surface on
  this deployment (see "Why this matters").
- The code at the locations in "Current state" doesn't match the excerpts
  (the codebase drifted since commit `871bd4b`).
- Implementing the bearer branch appears to require editing
  `sameOriginMutationMiddleware`, `src/server/session.ts`, or
  `src/routes/rpc.$.ts` — the design intentionally avoids all three; if you
  can't, the assumption below is wrong and you must report.
- You discover the assumption "bearer requests carry no `Origin`/`Referer`
  header and therefore already pass `isAllowedRequestOrigin`" is false for the
  RPC transport (e.g. the CSRF plugin rejects header-less POSTs before the
  middleware runs).
- A step's verification fails twice after a reasonable fix attempt.
- You find that passing an `api-token:<id>` synthetic `userId` to a write
  service violates a NOT-NULL/foreign-key constraint in a code path you cannot
  avoid — report which service so the identity model can be revised.

## Maintenance notes

For whoever owns this after it lands:

- **Scope is full-admin.** Every token is equivalent to an admin login over the
  whole RPC surface. Scoped/least-privilege tokens (e.g. invites-only) are the
  obvious v2 and were deliberately deferred; the `api_tokens` row has no scope
  column yet, so adding one is a clean additive migration.
- **Creator-admin status is not re-checked.** A token keeps working as admin
  even if the minting admin later loses admin rights or is deleted (the
  identity falls back to `api-token:<id>`). If that matters, add a resolve-time
  check that `created_by_user_id` still maps to an admin, or auto-revoke tokens
  when their creator is de-admined.
- **What a reviewer must scrutinize in the PR:** (1) the plaintext token is
  returned only from `admin.apiTokens.create` and never logged; (2)
  `sameOriginMutationMiddleware` is unchanged; (3) the secret comparison is
  constant-time and length-guarded; (4) revoked/expired tokens are rejected;
  (5) the bearer path never reads cookies and the cookie path never reads the
  Authorization header.
- **Rate limiting** is IP-keyed and shares the fail-closed `"unknown"` bucket
  without `TRUST_PROXY=true`; if operators complain about throttling on a
  trusted-proxy deployment, confirm they set `TRUST_PROXY=true` rather than
  loosening the limiter.
