# Plan 003: Persist an admin action audit log

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 871bd4b..HEAD -- src/server/db/schema.ts src/server/db.ts src/server/admin/ src/server/orpc/procedures.ts src/server/orpc/service-adapters.ts src/server/api/schemas/admin-schemas.ts src/lib/api/contracts/admin.ts src/server/dashboard-page-data.ts src/components/dashboard/dashboard-tabs-view.tsx src/components/dashboard/dashboard-page-shell.tsx src/lib/i18n/messages/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. This codebase was heavily
> refactored on 2026-07-04 — verify every path and line before editing.

## Status

- **Priority**: P2
- **Effort**: L (M–L)
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `871bd4b`, 2026-07-04

## Why this matters

Today the only persisted history in Jellything is invite redemptions
(`invite_usages` table, surfaced on the History tab). Every other admin
mutation — editing/disabling/deleting users, bulk user operations, creating/
editing/deleting invites, changing profile policies, and changing Jellyfin/
Seerr/email/app/onboarding config — is written only to the pino log stream and
is lost the moment logs rotate. There is no durable, queryable record of _who_
changed _what_ and _when_. For a multi-admin self-hosted deployment that
manages real user accounts and external-service credentials, that is a real
security and accountability gap: a compromised or careless admin leaves no
trace, and there is no in-app way to answer "who disabled this user?" This
plan adds a persisted `audit_log` table, a fail-safe service-layer write
helper called from every admin mutation service, and a UI surface on the
existing History tab so admins can review the action history in-app.

## Current state

### The gap: mutations are log-only

All admin mutation services live under `src/server/admin/` and today emit
**only** pino logs (or nothing) for their side effects. The functions that
must gain audit entries:

- `src/server/admin/users.ts`
  - `updateManagedUserService(userId, input)` — line 1050
  - `bulkManageUsersService(input)` — line 484 (applies one of:
    `assignProfile | disable | enable | delete | syncSeerr`, defined in the
    `bulkManagedUserOperationSchema` enum; see `applyBulkManagedUserOperation`
    at line 522)
  - `syncUserToSeerrService(userId)` — line 1306
  - `deleteManagedUserService(userId)` — line 1407
- `src/server/admin/invites.ts`
  - `createInviteService(createdById, input)` — line 193 (note: **already**
    receives an actor id `createdById` and writes `invites.createdById`)
  - `updateInviteService(inviteId, input)` — line 264
  - `deleteInviteService(inviteId)` — line 336
- `src/server/admin/profiles.ts`
  - `createProfileService(input)` — line 289
  - `updateProfileService(profileId, input)` — line 327
  - `deleteProfileService(profileId)` — line 435
- `src/server/admin/config.ts`
  - `updateJellyfinConfigService(data)` — line 35
  - `updateSeerrConfigService(data)` — line 99 (a falsy `data` **removes** the
    Seerr config; see line 107)
  - `updateEmailConfigService(data)` — line 164 (a falsy `data` **removes** the
    email config; see line 172)
  - `updateMemberOnboardingConfigService(data)` — line 211
- `src/server/orpc/service-adapters.ts`
  - `updateAppConfig(payload)` — line 12 (app title/description/locale/url)

### How mutations are invoked, and where the actor comes from

All admin mutations are exposed through ORPC procedures in
`src/server/orpc/procedures.ts` under `adminProcedures` (line 396). They use
`configuredAdminProcedure`, whose middleware attaches `context.session` (an
authenticated admin). `SessionData` (`src/lib/session.ts:3`) has:

```ts
export interface SessionData {
  userId: string
  name: string
  // avatarUrl: string
  isAdmin: boolean
  // ...
}
```

The actor for the audit log is `context.session` from the procedure. Precedent
already exists: `admin.invites.create` passes it through today —

```ts
// src/server/orpc/procedures.ts:416-422
create: configuredAdminProcedure
  .input(createInviteSchema)
  .handler(async ({ input, context }) =>
    unwrapActionResultOrThrow(
      await createInviteService(context.session?.userId, input),
    ),
  ),
```

**Design constraint (AGENTS.md, "Server, API, and Security"): the write helper
lives in the service layer, NOT in routes/procedures.** The procedure's only
new job is to pass the actor (`context.session`) into the service; the service
calls the audit helper. You will thread an `actor` argument into each mutation
service (mirroring how `createInviteService` already takes `createdById`).

### Config secret locations — NEVER persist these in metadata

Config values are validated/stored in `src/lib/server/config.server.ts` and
persisted to disk as JSON by `persistLoadedConfig` (line 125). The secret
fields an audit entry must **never** contain:

- `jellyfin.apiKey` — `config.server.ts:90`
- `seerr.apiKey` — `config.server.ts:50`
- `email.smtp.password` — `config.server.ts:103`
- `auth.sessionSecret` — `config.server.ts:75` (never touched by these services)
- `auth.encryptionKey` — `config.server.ts:76` (never touched by these services)

In the config services, a secret is being changed when the corresponding input
field is present, e.g. `updateJellyfinConfigService` sets `updates.apiKey`
only when `data.apiKey !== undefined` (`config.ts:47-49`);
`updateSeerrConfigService` reads `data.apiKey` (`config.ts:114`);
`updateEmailConfigService` reads `data.smtp.password` (`config.ts:186`). The
audit metadata may record **that** a secret changed (a boolean flag) but must
never record its value.

### Existing persisted-history pattern to mirror (schema + service + UI)

The `invite_usages` feature is the structural template for both the DB read
path and the UI:

- Schema: `inviteUsages` table — `src/server/db/schema.ts:148-159` (note: it
  uses the **older** camelCase-field style; your new table must use the
  snake_case bare-column style — see "Schema style" below).
- Paged read service: `getInviteHistoryPageService(input)` —
  `src/server/admin/invites.ts:361-441` (pagination via `page`/`pageSize`,
  optional `query`, `direction`, returns `{ items, page, pageSize, total,
pageCount }`).
- Input schema: `inviteHistoryPageInputSchema` —
  `src/server/api/schemas/admin-schemas.ts:47-51`:
  ```ts
  export const inviteHistoryPageInputSchema = pageInputSchema.extend({
    query: exactOptional(z.string().trim().max(100)),
    sort: z.enum(["usedAt"]).default("usedAt"),
    direction: sortDirectionSchema.default("desc"),
  })
  ```
  `pageInputSchema` is at lines 40-43; `sortDirectionSchema` at line 45.
- Item schema/DTO: `inviteHistoryItemSchema` (line 150),
  `pagedInviteHistoryResponseSchema` (line 213); DTO types re-exported from
  `src/lib/api/contracts/admin.ts` (which re-exports from
  `@/server/api/schemas/admin-schemas`).
- ORPC procedure: `admin.invites.history` — `procedures.ts:411-415`.
- Route loader: `src/routes/dashboard.history.tsx` calls
  `getDashboardPageDataFn({ data: { activeTab: "history", history: search } })`.
- Loader impl: `loadDashboardPageData` in `src/server/dashboard-page-data.ts`
  (line 190) loads `getInviteHistoryPageService(history)` only when
  `activeTab === "history"` (line 218-221), unwraps it into `historyData`
  (line 347-351), and passes it through `DashboardPageShell` (page-shell.tsx)
  → `DashboardTabsView` → `<InviteHistoryTable>` (rendered in the `history`
  `TabsContent`, `dashboard-tabs-view.tsx:189-200`).
- UI table component: `src/components/invites/invite-history-table.tsx` —
  TanStack Table + `DataTable` + `DataTablePagination` + `DashboardTabSearch`
  - a per-tab store; it fetches subsequent pages via
    `getBrowserORPCClient().admin.invites.history`. This is the template for the
    new audit-log table.

### Schema style (AGENTS.md "Schema Definitions")

New tables use **snake_case bare-column** style (column name inferred from the
TS field key), NOT the older `text("id")` style. Follow the AGENTS example:

```ts
const table = sqliteTable("session", {
  id: text().primaryKey(),
  user_id: text().notNull(),
  created_at: integer().notNull(),
})
```

Existing helpers in `schema.ts` you will reuse: `createId()` (line 15,
`crypto.randomUUID()`), `DEFAULT_TIMESTAMP_MS` (line 13,
`sql`(unixepoch() \* 1000)``).

### Migrations mechanism

- Drizzle config: `drizzle.config.ts` → schema `./src/server/db/schema.ts`,
  out `./drizzle`, dialect sqlite.
- Only migration today: `drizzle/0000_baseline.sql` (journal
  `drizzle/meta/_journal.json` has one entry, tag `0000_baseline`).
- Migrations are applied at runtime and in tests by `ensureMigrated()` in
  `src/server/db.ts:68` (runs `migrate()` against the `drizzle/` folder). Tests
  call `await database.ensureMigrated()` after `configureTestEnvironment(...)`.
- Generate a migration with `pnpm run db:generate`; verify no drift with
  `pnpm run db:check` (regenerates and fails if new SQL appears).

### Failure-handling precedent (audit writes must never break the mutation)

Non-critical side effects in these services are wrapped in `try/catch`, logged
with `logger.warn`/`log.warn`, and execution continues. Examples:
`users.ts:810-816` ("Failed to resolve Seerr user after managed user update"),
`invites.ts:417-419` ("Failed to fetch Jellyfin users for invite history"),
`profiles.ts:151-173`. The audit write must follow this exact shape: catch
everything, `log.warn`, return, never throw.

## Commands you will need

| Purpose            | Command                 | Expected on success           |
| ------------------ | ----------------------- | ----------------------------- |
| Install            | `pnpm install`          | exit 0                        |
| Generate migration | `pnpm run db:generate`  | new file `drizzle/0001_*.sql` |
| Migration drift    | `pnpm run db:check`     | exit 0, "no drift"            |
| Format (apply)     | `pnpm run format`       | exit 0                        |
| Format (check)     | `pnpm run format:check` | exit 0                        |
| Lint               | `pnpm run lint`         | exit 0                        |
| Typecheck          | `pnpm run typecheck`    | exit 0, no errors             |
| Tests              | `pnpm run test`         | all pass                      |
| Targeted test      | `pnpm run test audit`   | new audit suite passes        |

Do NOT run `pnpm run build` (AGENTS.md: it can disrupt the dev server).

## Suggested executor toolkit

- Use `tanstack-query-best-practices` / `vercel-react-best-practices` only if
  you touch client fetching in the new table component; keep the existing
  `invite-history-table.tsx` store pattern rather than introducing new data
  layers.

## Scope

**In scope** (modify or create only these):

- `src/server/db/schema.ts` — add `auditLog` table, relation, types, `schema` export
- `drizzle/` — new generated migration + updated `meta/` (via `pnpm run db:generate`)
- `src/server/admin/audit.ts` (create) — write helper + paged read service + metadata redaction
- `src/server/admin/users.ts` — accept `actor`, emit entries
- `src/server/admin/invites.ts` — accept `actor`, emit entries
- `src/server/admin/profiles.ts` — accept `actor`, emit entries
- `src/server/admin/config.ts` — accept `actor`, emit entries
- `src/server/orpc/service-adapters.ts` — thread `actor` into `updateAppConfig`
- `src/server/orpc/procedures.ts` — pass `context.session` actor into services; add `admin.audit.page` procedure
- `src/server/api/schemas/admin-schemas.ts` — audit input/item/response schemas + DTO types
- `src/lib/api/contracts/admin.ts` — re-export new DTO types
- `src/server/dashboard-page-data.ts` — load audit page for the history tab
- `src/components/dashboard/dashboard-tabs-view.tsx` — render the audit sub-view in the history tab
- `src/components/dashboard/dashboard-page-shell.tsx` — pass new data prop through (only if you add a new top-level data field; avoid if you nest under `historyData`)
- `src/components/audit/audit-log-table.tsx` (create) — the audit table UI
- `src/lib/i18n/messages/en.ts`, `de.ts`, `types.ts` — new i18n keys (all three must stay in parity)
- `src/server/admin/audit.test.ts` (create) — tests

**Out of scope** (do NOT touch):

- `src/server/db/schema.ts` existing tables/fields — do not restyle the
  camelCase columns; only ADD the new table (AGENTS.md: no churn).
- Retention/pruning of audit rows — v1 is intentionally unbounded (see
  Maintenance notes). Do not add a prune job or row cap.
- Any change that puts audit reads/writes behind non-admin procedures.
- The `invite_usages` feature — the existing invite-history table stays as-is;
  you are adding a sibling view, not replacing it.
- `auth.sessionSecret` / `auth.encryptionKey` handling — never referenced.

## Git workflow

- Branch: `admin-audit-log` (short, no slash/type prefix — AGENTS.md).
- Conventional commits, e.g.:
  - `feat(db): add audit_log table and migration`
  - `feat(audit): record admin mutations in service layer`
  - `feat(ui): surface admin actions on history tab`
- One commit per logical unit is fine. Do NOT push or open a PR unless the
  operator asks.

## Steps

### Step 1: Add the `auditLog` schema, relation, types, and export

In `src/server/db/schema.ts`, add a new table using the **snake_case
bare-column** style. Place it after `inviteUsages` (line 159). Import `index`
from `drizzle-orm/sqlite-core` (add to the existing import block at lines 2-8).

Define a metadata type and the table:

```ts
// Redacted, admin-safe metadata for an audit entry. NEVER contains secrets
// (API keys, SMTP passwords, session/encryption secrets). See src/server/admin/audit.ts.
export type AuditLogMetadata = Record<string, string | number | boolean | null>

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text().primaryKey().$defaultFn(createId),
    // Actor is stored as a plain snapshot (no FK) so entries survive user
    // deletion and remain an immutable historical record.
    actor_user_id: text(),
    actor_name: text(),
    action: text().notNull(),
    target_type: text().notNull(),
    target_id: text(),
    metadata: text({ mode: "json" }).$type<AuditLogMetadata>(),
    created_at: integer({ mode: "timestamp_ms" })
      .notNull()
      .default(DEFAULT_TIMESTAMP_MS),
  },
  (table) => [index("audit_log_created_at_idx").on(table.created_at)],
)
```

Notes:

- **No foreign key** on `actor_user_id` — the audit log is an immutable record
  and must outlive `deleteAppUserData` (which removes users). Store the actor
  name snapshot alongside the id so the UI can render deleted actors.
- Add `auditLog` to the `schema` object (line 236-249) so `db.query`/migrations
  pick it up. It has no relations you need, so a relations export is optional;
  do NOT add one unless typecheck requires it.
- Add exported inferred types next to the others (line 251+):
  ```ts
  export type AuditLog = typeof auditLog.$inferSelect
  export type NewAuditLog = typeof auditLog.$inferInsert
  ```

**Verify**: `pnpm run typecheck` → exit 0.

### Step 2: Generate and verify the migration

Run `pnpm run db:generate`. Confirm a new `drizzle/0001_*.sql` file is created
containing `CREATE TABLE \`audit_log\``and`CREATE INDEX \`audit_log_created_at_idx\``, and that
`drizzle/meta/\_journal.json` gained a second entry.

**Verify**:

- `ls drizzle/` → shows `0000_baseline.sql` and a new `0001_*.sql`.
- `pnpm run db:check` → exit 0 (no drift; the generated migration matches the
  schema).

### Step 3: Create the audit service module (write helper + redaction + read)

Create `src/server/admin/audit.ts`. It contains three things:

1. **The actor type** shared by all callers:

   ```ts
   export type AuditActor = { userId: string | null; name: string | null }
   ```

   Add a helper to derive it from a session so procedures stay terse:

   ```ts
   export function auditActorFromSession(
     session: { userId: string; name: string } | null | undefined,
   ): AuditActor {
     return { userId: session?.userId ?? null, name: session?.name ?? null }
   }
   ```

2. **The fail-safe write helper**. It must never throw and never fail the
   caller (mirror `users.ts:810-816`). Call it only on the success path, after
   the mutation's DB write, before returning `success(...)`.

   ```ts
   import { db, ensureMigrated } from "@/server/db"
   import { auditLog, type AuditLogMetadata } from "@/server/db/schema"
   import { createChildLogger } from "@/server/logger"

   const log = createChildLogger({ module: "admin-audit" })

   export const AUDIT_TARGET_TYPES = [
     "user",
     "invite",
     "profile",
     "config",
   ] as const
   export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number]

   // v1 action catalog — one verb per mutation entry point. See plan step 4.
   export const AUDIT_ACTIONS = [
     "user.update",
     "user.delete",
     "user.disable",
     "user.enable",
     "user.assign_profile",
     "user.sync_seerr",
     "invite.create",
     "invite.update",
     "invite.delete",
     "profile.create",
     "profile.update",
     "profile.delete",
     "config.update.jellyfin",
     "config.update.seerr",
     "config.remove.seerr",
     "config.update.email",
     "config.remove.email",
     "config.update.member_onboarding",
     "config.update.app",
   ] as const
   export type AuditAction = (typeof AUDIT_ACTIONS)[number]

   export async function recordAuditEntry(entry: {
     actor: AuditActor
     action: AuditAction
     targetType: AuditTargetType
     targetId: string | null
     metadata?: AuditLogMetadata | null
   }): Promise<void> {
     try {
       await ensureMigrated()
       await db.insert(auditLog).values({
         actor_user_id: entry.actor.userId,
         actor_name: entry.actor.name,
         action: entry.action,
         target_type: entry.targetType,
         target_id: entry.targetId,
         metadata: entry.metadata ?? null,
         created_at: new Date(),
       })
     } catch (err) {
       // Auditing is a non-critical side effect: never fail the admin action.
       log.warn({ err, action: entry.action }, "Failed to record audit entry")
     }
   }
   ```

3. **The paged read service** `getAuditLogPageService(input)`, modeled on
   `getInviteHistoryService` (`invites.ts:361-441`) but reading `auditLog`.
   It parses `auditLogPageInputSchema` (Step 6), paginates with
   `page`/`pageSize`, optional `query` (LIKE over `action`, `actor_name`,
   `target_id`), orders by `created_at` (`direction`), and returns
   `{ items, page, pageSize, total, pageCount }`. Each item:

   ```ts
   {
     id: string
     actorUserId: string | null
     actorName: string | null
     action: string
     targetType: string
     targetId: string | null
     metadata: AuditLogMetadata | null
     createdAt: string // ISO
   }
   ```

   Use `ActionResult` / `success` / `error` from `@/lib/api/contracts/errors`
   exactly as `getInviteHistoryPageService` does. Unlike invite history, do NOT
   call Jellyfin — the actor name is already stored as a snapshot.

4. **Metadata redaction helpers** for config (used in Step 8). Add small
   builders that return only allowlisted, non-secret fields:
   ```ts
   // Records THAT a secret changed, never its value.
   export function jellyfinConfigAuditMetadata(data: {
     internalUrl?: string
     externalUrl?: string | null
     configPath?: string | null
     apiKey?: string
   }): AuditLogMetadata {
     return {
       internalUrlChanged: data.internalUrl !== undefined,
       externalUrlChanged: Object.hasOwn(data, "externalUrl"),
       configPathChanged: Object.hasOwn(data, "configPath"),
       apiKeyChanged: data.apiKey !== undefined, // value NEVER stored
     }
   }
   ```
   Provide analogous builders for seerr (`internalUrlChanged`,
   `externalUrlChanged`, `apiKeyChanged`), email (`fromChanged`,
   `smtpHostChanged`, `smtpPortChanged`, `smtpSecureChanged`,
   `smtpUsernameChanged`, `passwordChanged`), app (`titleChanged`,
   `descriptionChanged`, `defaultLocaleChanged`, `urlChanged`), and member
   onboarding (`enabled`, `pageCount`). **Never** include `apiKey`,
   `password`, or any raw secret value.

**Redaction rule for user/invite/profile metadata**: record only non-secret
identifiers and changed field names / new values that an admin already sees in
the UI — e.g. for user updates: `{ profileId, isDisabled, expiresAt, emailChanged }`
(store the boolean `emailChanged`, not the email address, to avoid PII drift
into a second store; profileId/isDisabled/expiresAt are admin-visible and
safe). For invites: `{ code, profileId, isDisabled, useLimit }`. For profiles:
`{ name, isDefault }` (do NOT store the full policy JSON blob; a `policyChanged`
boolean is enough). Never store Jellyfin access tokens, passwords, or API keys.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 4: Confirm the v1 action catalog is complete

Cross-check `AUDIT_ACTIONS` against the actual mutation entry points listed in
"Current state → The gap". The mapping you will wire in Steps 5–8:

| Service function                                 | Action                                                                                     | targetType | targetId              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------- | --------------------- |
| `createInviteService`                            | `invite.create`                                                                            | `invite`   | invite id             |
| `updateInviteService`                            | `invite.update`                                                                            | `invite`   | invite id             |
| `deleteInviteService`                            | `invite.delete`                                                                            | `invite`   | invite id             |
| `updateManagedUserService`                       | `user.update`                                                                              | `user`     | userId                |
| `deleteManagedUserService`                       | `user.delete`                                                                              | `user`     | userId                |
| `syncUserToSeerrService`                         | `user.sync_seerr`                                                                          | `user`     | userId                |
| `bulkManageUsersService` (per successful result) | `user.assign_profile` / `user.disable` / `user.enable` / `user.delete` / `user.sync_seerr` | `user`     | userId                |
| `createProfileService`                           | `profile.create`                                                                           | `profile`  | profile id            |
| `updateProfileService`                           | `profile.update`                                                                           | `profile`  | profile id            |
| `deleteProfileService`                           | `profile.delete`                                                                           | `profile`  | profile id            |
| `updateJellyfinConfigService`                    | `config.update.jellyfin`                                                                   | `config`   | `"jellyfin"`          |
| `updateSeerrConfigService` (set)                 | `config.update.seerr`                                                                      | `config`   | `"seerr"`             |
| `updateSeerrConfigService` (falsy data → remove) | `config.remove.seerr`                                                                      | `config`   | `"seerr"`             |
| `updateEmailConfigService` (set)                 | `config.update.email`                                                                      | `config`   | `"email"`             |
| `updateEmailConfigService` (falsy data → remove) | `config.remove.email`                                                                      | `config`   | `"email"`             |
| `updateMemberOnboardingConfigService`            | `config.update.member_onboarding`                                                          | `config`   | `"member_onboarding"` |
| `updateAppConfig`                                | `config.update.app`                                                                        | `config`   | `"app"`               |

For `bulkManageUsersService`: map the operation to an action —
`assignProfile → user.assign_profile`, `disable → user.disable`,
`enable → user.enable`, `delete → user.delete`, `syncSeerr → user.sync_seerr`.
Emit one entry per **successful, non-skipped** result (i.e. where the result
`ok === true && !("skipped" in result)`), inside `bulkManageUsersService` after
`runWithConcurrency` returns, iterating `results`.

No verify command; this is a design confirmation used by the next steps.

### Step 5: Thread `actor` into invite services and emit entries

In `src/server/admin/invites.ts`:

- `createInviteService` already takes `createdById`. Add an `actor: AuditActor`
  parameter (or reuse — simplest: add `actor` and keep `createdById`; the
  procedure passes both from the same session). After the successful insert
  (before `return success(...)` at line 261), call `recordAuditEntry` with
  `action: "invite.create"`, `targetType: "invite"`, `targetId: invite.id`,
  metadata `{ code: invite.code, profileId: parsed.data.profileId, useLimit: parsed.data.useLimit ?? null }`.
- `updateInviteService(inviteId, input)` → add `actor` param; emit
  `invite.update` after line 326 (`.returning()`), metadata from
  `updateValues` (changed fields only).
- `deleteInviteService(inviteId)` → add `actor` param; emit `invite.delete`
  after line 351 (the `db.delete`), metadata `{ code: existing.code }`.

Import `recordAuditEntry`, `type AuditActor` from `@/server/admin/audit`.

**Verify**: `pnpm run typecheck` → exit 0 (callers in `procedures.ts` will fail
to typecheck until Step 9; that is expected — do Steps 5-9 before running the
full gate. Typecheck of `invites.ts` in isolation is not available, so proceed
and expect procedure-call errors until Step 9).

### Step 6: Add audit input/item/response schemas + DTO types

In `src/server/api/schemas/admin-schemas.ts`, following the invite-history
block (lines 47-51, 150-159, 213-219):

```ts
export const auditLogPageInputSchema = pageInputSchema.extend({
  query: exactOptional(z.string().trim().max(100)),
  sort: z.enum(["createdAt"]).default("createdAt"),
  direction: sortDirectionSchema.default("desc"),
})

export const auditLogItemSchema = z.object({
  id: AnyStringSchema,
  actorUserId: NullableStringSchema,
  actorName: NullableStringSchema,
  action: AnyStringSchema,
  targetType: AnyStringSchema,
  targetId: NullableStringSchema,
  metadata: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .nullable(),
  createdAt: DateTimeStringSchema,
})

export const pagedAuditLogResponseSchema = z.object({
  items: z.array(auditLogItemSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  pageCount: z.number(),
})
```

Use the same helper schemas the file already uses (`AnyStringSchema`,
`NullableStringSchema`, `DateTimeStringSchema`, `exactOptional`,
`pageInputSchema`, `sortDirectionSchema`) — grep the file to confirm their
exact names/imports before referencing. Export the DTO types the same way the
file exports `InviteHistoryPageInputDto` / `PagedInviteHistoryDto` /
`InviteHistoryItemDto` (search for those to copy the export style):
`AuditLogPageInputDto`, `AuditLogItemDto`, `PagedAuditLogDto`.

Then add those three type names to the re-export list in
`src/lib/api/contracts/admin.ts` (alphabetical, matching the existing block).

Wire `getAuditLogPageService` in `audit.ts` (Step 3) to parse
`auditLogPageInputSchema`.

**Verify**: `pnpm run typecheck` → exit 0 for this file (schema-only; no caller
churn yet).

### Step 7: Thread `actor` into user and profile services and emit entries

`src/server/admin/users.ts`:

- Add `actor: AuditActor` param to `updateManagedUserService`,
  `deleteManagedUserService`, `syncUserToSeerrService`, and
  `bulkManageUsersService`.
- Emit on success paths only:
  - `updateManagedUserService`: before `return success(...)` (line 1295), emit
    `user.update`, targetId `parsedUserId.data`, metadata
    `{ profileId, isDisabled, expiresAt, emailChanged }` derived from the
    computed values.
  - `deleteManagedUserService`: before `return success(...)` (line 1472), emit
    `user.delete`, targetId `parsedUserId.data`, metadata
    `{ deletedFromJellyfin, deletedFromSeerr }`.
  - `syncUserToSeerrService`: before `return success(...)` (line 1404), emit
    `user.sync_seerr`, targetId `parsedUserId.data`.
  - `bulkManageUsersService`: after `runWithConcurrency` (line 506-518),
    iterate `results`; for each entry with `ok === true` and not `skipped`,
    emit the operation-mapped action (Step 4 table), targetId `result.userId`.
    Do the emits with `await Promise.all(results.filter(...).map(...))` or a
    simple loop; since `recordAuditEntry` swallows errors this cannot break the
    response.

`src/server/admin/profiles.ts`:

- Add `actor: AuditActor` param to `createProfileService`,
  `updateProfileService`, `deleteProfileService`.
- Emit `profile.create` after the insert `.returning()` (line 309), targetId
  `profile.id`, metadata `{ name: profile.name, isDefault: profile.isDefault }`.
- Emit `profile.update` after the transaction/sync (before `return success` at
  line 393-396), targetId `profileId`, metadata
  `{ name: updated.name, isDefault: updated.isDefault, policyChanged: parsed.data.policy !== undefined }`.
- Emit `profile.delete` before `return success(null)` (line 532), targetId
  `profileId`, metadata `{ name: existing.name }`.

Note `createProfileService`/`updateProfileService` currently take `input:
unknown`; add `actor` as a **new leading or trailing** parameter consistently
(recommend trailing to minimize call-site churn, but be consistent across all
three). Import `recordAuditEntry`, `type AuditActor` from `@/server/admin/audit`.

**Verify**: `pnpm run typecheck` → run after Step 9 (callers not yet updated).

### Step 8: Thread `actor` into config services and emit redacted entries

`src/server/admin/config.ts`: add `actor: AuditActor` param to
`updateJellyfinConfigService`, `updateSeerrConfigService`,
`updateEmailConfigService`, `updateMemberOnboardingConfigService`. Emit on the
success paths using the redaction builders from Step 3:

- `updateJellyfinConfigService`: before `return success(undefined)` (line 67),
  emit `config.update.jellyfin`, targetId `"jellyfin"`, metadata
  `jellyfinConfigAuditMetadata(data)`.
- `updateSeerrConfigService`: the falsy-`data` branch (line 107-110) emits
  `config.remove.seerr`; the normal branch (line 132-133) emits
  `config.update.seerr` with the seerr redaction builder.
- `updateEmailConfigService`: the falsy-`data` branch (line 172-176) emits
  `config.remove.email`; the normal branch (line 200-202) emits
  `config.update.email` with the email redaction builder.
- `updateMemberOnboardingConfigService`: before `return success(undefined)`
  (line 220), emit `config.update.member_onboarding`, metadata
  `{ enabled: data.enabled, pageCount: data.pages.length }`.

`src/server/orpc/service-adapters.ts`: add `actor: AuditActor` param to
`updateAppConfig(payload, actor)`; before `return configManager.app` (line 32),
emit `config.update.app`, targetId `"app"`, metadata using the app redaction
builder over `payload`.

**Verify (secrets)**: `grep -rn "apiKey\|password\|smtp.*password" src/server/admin/audit.ts` — confirm the only occurrences are _field-name_ references / `*Changed` booleans, never a value being written into `metadata`. `grep -n "metadata" src/server/admin/config.ts` should show only calls to the redaction builders.

### Step 9: Pass the actor from procedures and add the read procedure

`src/server/orpc/procedures.ts`:

- For every admin mutation procedure listed in Step 4, pass
  `auditActorFromSession(context.session)` (import from `@/server/admin/audit`)
  as the new `actor` argument to its service call. Handlers already destructure
  `{ input, context }` or add `context` where missing (see the existing
  `create` invite handler at line 416-422 for the pattern; `context.session` is
  available on all `configuredAdminProcedure` handlers).
- Update `settings.updateApp` (line 516-518) to call
  `updateAppConfig(input, auditActorFromSession(context.session))`.
- Add the read procedure under `adminProcedures`, next to `invites.history`:
  ```ts
  audit: {
    page: configuredAdminProcedure
      .input(auditLogPageInputSchema)
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(await getAuditLogPageService(input)),
      ),
  },
  ```
  Import `getAuditLogPageService` from `@/server/admin/audit` and
  `auditLogPageInputSchema` from the admin-schemas import block.

**Verify**: `pnpm run typecheck` → exit 0 (all service signatures and callers
now agree). `pnpm run lint` → exit 0.

### Step 10: Load the audit page in the history-tab loader

`src/server/dashboard-page-data.ts`:

- Import `getAuditLogPageService` from `@/server/admin/audit`.
- In `DashboardPageLoaderInput` (line 27-33) add an optional
  `audit?: Parameters<typeof getAuditLogPageService>[0]`.
- In `DashboardPageData` (line 46-104) extend `historyData` with an `audit`
  field (the unwrapped paged audit result + its own `query`/`error`), OR add a
  sibling `auditData` field. **Recommended: nest under `historyData`** to avoid
  changing `DashboardPageShell`'s prop list — e.g. `historyData: { page, query,
error, audit: { page, query, error } }`.
- In `loadDashboardPageData` (line 190+), when `activeTab === "history"`, also
  call `getAuditLogPageService(audit ?? {})` in the `Promise.all` (line
  218-235), unwrap it with `unwrapActionResult` (line 106) using the same empty
  page fallback shape as invite history (line 282-293), and populate the new
  field. Use an error translation key (Step 12), e.g.
  `t("history.auditLoadFailed")`.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 11: Build the audit table UI and mount it on the History tab

Create `src/components/audit/audit-log-table.tsx` modeled on
`src/components/invites/invite-history-table.tsx`:

- Props: `{ initialPage: PagedAuditLogDto; initialQuery: string; initialError?: string | null }`.
- Reuse `DataTable`, `DataTablePagination`, `DashboardTabSearch`,
  `DashboardTabToolbar`, `RelativeTime`, the `createAppStore`/`useScopedStore`
  pattern, and `getBrowserORPCClient().admin.audit.page` for subsequent pages.
- Columns: Actor (`actorName` with a muted fallback like "System"/deleted when
  null), Action (translate via a key map — see Step 12), Target
  (`targetType` + `targetId`), When (`<RelativeTime>` over `createdAt`). Render
  `metadata` as a compact secondary line or a details popover — keep v1 simple;
  a JSON-ish summary string is acceptable, but never surface a raw secret
  (there are none in the data by construction).

Mount it on the History tab. In
`src/components/dashboard/dashboard-tabs-view.tsx`:

- The `history` `TabsContent` (lines 189-200) currently renders only
  `<InviteHistoryTable>`. Wrap the two views in a nested segmented control
  using the existing `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` primitives
  (already imported, line 18): an inner tab set with "Invites" (existing table)
  and "Admin actions" (new `<AuditLogTable>`). Keep it client-only state (no
  route change needed for the inner switch in v1).
- Extend the `historyData` prop type in `DashboardTabsViewProps` (lines 90-94)
  to include the nested `audit` field you added in Step 10, and pass it to
  `<AuditLogTable>`.

**Verify**: `pnpm run typecheck` → exit 0. `pnpm run lint` → exit 0.

### Step 12: Add i18n keys in en/de/types (parity required)

Add matching keys to all three of `src/lib/i18n/messages/types.ts`,
`en.ts`, `de.ts` (they must stay in structural parity — typecheck enforces
`types.ts` against usage). Add under a `history` section (or extend it) and a
new `audit` section:

- Tab/section labels: inner tabs "Invites" / "Admin actions".
- `history.auditLoadFailed` (loader error).
- Column headers: actor, action, target, when.
- An action-label map: a human-readable string per `AuditAction` value from
  Step 3 (e.g. `audit.action.user.update` → "Updated user" / German
  equivalent). Provide all 19 actions in both locales.
- Actor fallback label (e.g. "System").

Look at the existing `nav`/`invites` history strings (`en.ts:277,305-306,322`;
`de.ts` counterparts; `types.ts:272,657-662`) for the established key style.

**Verify**: `pnpm run typecheck` → exit 0 (missing/extra keys fail here).

### Step 13: Tests

Create `src/server/admin/audit.test.ts`, following the DB-backed pattern in
`src/server/tokens.test.ts` (temp SQLite via `@/test/db`,
`configureTestEnvironment`, `vi.resetModules()`, dynamic
`import("@/server/admin/audit")` + `import("@/server/db")` +
`import("@/server/db/schema")`, then `await database.ensureMigrated()`).

Cover:

1. `recordAuditEntry` inserts a row with actor snapshot, action, target,
   metadata, and a timestamp; `getAuditLogPageService` returns it.
2. `recordAuditEntry` **never throws** and does not insert when given input
   that would violate a constraint — assert the promise resolves and the caller
   is unaffected (e.g. force a failure by closing/pointing at a bad db is hard;
   instead assert the happy path plus that a second call with the same shape
   succeeds, and that passing a `null` actor is accepted and stored as null).
3. Redaction: call `jellyfinConfigAuditMetadata({ apiKey: "SECRET", internalUrl: "http://x" })`
   and assert the returned object contains `apiKeyChanged: true` and does NOT
   contain the string `"SECRET"` anywhere (`JSON.stringify(meta)` must not
   include the secret). Repeat for the seerr and email builders
   (password → `passwordChanged`, never the value).
4. `getAuditLogPageService` pagination + `direction` ordering + `query` filter
   over `action`/`actor_name`.

**Verify**: `pnpm run test audit` → new suite passes.

### Step 14: Full completion gate

Run all four AGENTS.md gates. Apply formatting first if needed
(`pnpm run format`).

**Verify**:

- `pnpm run format:check` → exit 0
- `pnpm run lint` → exit 0
- `pnpm run typecheck` → exit 0
- `pnpm run test` → all pass (including new audit suite)
- `pnpm run db:check` → exit 0 (no migration drift)

## Test plan

- New file `src/server/admin/audit.test.ts` — cases enumerated in Step 13
  (insert+read, fail-safe/null actor, secret redaction, pagination/ordering/
  filter). Structural model: `src/server/tokens.test.ts`.
- No mocks of the DB — use the real temp SQLite helper (`src/test/db.ts`),
  per AGENTS.md "avoid mocks".
- Verification: `pnpm run test` → all pass, including the ≥4 new audit tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run format:check` exits 0
- [ ] `pnpm run lint` exits 0
- [ ] `pnpm run typecheck` exits 0
- [ ] `pnpm run test` exits 0; `src/server/admin/audit.test.ts` exists and passes
- [ ] `pnpm run db:check` exits 0 (a single new `drizzle/0001_*.sql` is committed)
- [ ] `grep -rn "audit_log" drizzle/` shows the CREATE TABLE in the new migration
- [ ] `grep -rn "recordAuditEntry" src/server/admin/` shows calls in `users.ts`, `invites.ts`, `profiles.ts`, `config.ts` (and the definition in `audit.ts`)
- [ ] No secret value is ever written to metadata: `grep -rn "metadata" src/server/admin/config.ts` shows only redaction-builder calls; the audit builders emit `*Changed` booleans, not values
- [ ] `admin.audit.page` procedure exists in `src/server/orpc/procedures.ts` and is admin-gated (`configuredAdminProcedure`)
- [ ] Only files in the Scope "In scope" list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `871bd4b` and the
  "Current state" excerpts no longer match (line numbers or function
  signatures differ) — the 2026-07-04 refactor may have moved things.
- `pnpm run db:generate` produces changes to `drizzle/0000_baseline.sql` or to
  existing tables (it must only ADD `audit_log`); or `pnpm run db:check`
  reports drift you cannot resolve by regenerating.
- Threading `actor` into a service reveals a caller you did not expect (grep
  each service name across `src/` before editing; there may be callers beyond
  `procedures.ts`/`service-adapters.ts`/`dashboard-page-data.ts`).
- Any redaction builder or the read path would require surfacing a secret to
  satisfy typing — it must not; stop and rethink.
- A verification fails twice after a reasonable fix attempt.
- You find the assumption "all admin mutations flow through
  `configuredAdminProcedure` with `context.session`" is false for some entry
  point.

## Maintenance notes

For the human/agent who owns this after it lands:

- **Retention is intentionally unbounded in v1.** The table will grow without
  limit. Follow-up (deferred, separate plan): a pruning strategy — either a
  scheduled job that deletes rows older than N days or a max-row cap enforced
  on write. Do not add it here; it needs its own config surface and a decision
  on default retention. The `audit_log_created_at_idx` index is in place so a
  future `DELETE WHERE created_at < ?` prune is cheap.
- **Actor has no FK by design.** `actor_user_id` is a snapshot, not a
  reference; entries survive `deleteAppUserData`. If someone later "cleans up"
  the schema by adding an FK, it will break user deletion and destroy audit
  history — reject that change.
- **Overlap with the invite/notify work (plan 001).** Plan 001 introduces
  `notify()` side-effect sites in the same admin mutation services. If plan 001
  also lands, those `notify()` call sites overlap 1:1 with the audit emit sites
  in this plan (same success paths, same functions in `users.ts`/`invites.ts`/
  `profiles.ts`/`config.ts`). When both are present, the notify sites should
  **also** emit audit entries (or the two should share the same post-mutation
  hook) so the audit log and notifications stay consistent — do not let one
  path record an action the other misses. Reconcile the ordering: audit-write
  and notify are both fail-safe, non-critical, and run after the DB mutation
  succeeds.
- **What a reviewer should scrutinize**: (1) that `recordAuditEntry` is only
  ever called on success paths (a failed mutation must not leave a misleading
  entry); (2) that no config metadata builder leaks a secret — re-grep for
  `apiKey`/`password` values; (3) that the new read procedure is admin-gated;
  (4) that the bulk path emits exactly one entry per successful, non-skipped
  result (no duplicates, no entries for skips/failures); (5) i18n en/de/types
  parity for the action-label map.
- **Extending the action catalog**: adding a new admin mutation means adding a
  new value to `AUDIT_ACTIONS`, an emit call, and an i18n action label in
  en/de. Keep `AUDIT_ACTIONS` and the i18n `audit.action.*` map in sync.
