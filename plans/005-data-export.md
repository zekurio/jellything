# Plan 005: Admin data export (CSV + JSON downloads)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 871bd4b..HEAD -- src/server/admin/users.ts src/server/admin/invites.ts src/routes/rpc.$.ts src/server/orpc/context.ts src/server/session-resolver.ts src/lib/session.ts src/server/db/schema.ts src/components/settings src/lib/i18n/messages`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `871bd4b`, 2026-07-04

## Why this matters

Jellything persists all admin-relevant state in SQLite (`DB_PATH`) plus a JSON
config, but there is no way to get that data out of the app. Admins who want to
audit their user roster, keep an offline backup of invites, or analyze invite
redemption history in a spreadsheet have to open Drizzle Studio or query the DB
file by hand. This plan adds admin-gated export actions that serialize the
**existing service query results** — user roster, invites, invite redemption
history — as CSV and JSON downloads. It is read-only, reuses services that
already exist, and touches no persisted data, so the risk is low. The one thing
that must be gotten right is safety: no secrets in the output, CSV escaped
correctly (including spreadsheet formula-injection neutralization), and the
endpoint gated to admins exactly like the rest of the app.

## Current state

### Data sources (services already exist — reuse them)

- `src/server/admin/invites.ts`
  - `listInvitesService(): Promise<ActionResult<InviteListItem[]>>` (lines
    94–120) — **unbounded**, returns ALL invites, no pagination. Each
    `InviteListItem` (type at lines 25–36): `{ id, code, profileId,
profileName, isDisabled, useLimit, useCount, expiresAt, createdAt, status }`.
    `expiresAt`/`createdAt` are ISO strings or null; `status` is an
    `InviteStatus`.
  - `getInviteHistoryService(): Promise<ActionResult<InviteHistoryItem[]>>`
    (lines 355–359, delegates to the private unbounded
    `getUnboundedInviteHistoryService` at lines 458–508) — **unbounded**,
    returns ALL invite usages. Each `InviteHistoryItem` (type at lines 38–46):
    `{ id, inviteId, inviteCode, userId, userName, avatarUrl, usedAt }`.
    `usedAt` is an ISO string.
- `src/server/admin/users.ts`
  - `listUsersWithProfilesService(...)` (line 232) is **paginated** and its
    input schema caps `pageSize` at 100
    (`src/server/api/schemas/admin-schemas.ts:42` — `pageSize: ...max(100)`),
    so it is NOT suitable for a full export.
  - The full, unbounded roster is built by the **private** function
    `listAllUsersWithProfiles(): Promise<ActionResult<UnpagedUsersWithProfilesResult>>`
    (lines 268–311). `UnpagedUsersWithProfilesResult` (lines 94–98) is
    `{ users: ManagedUserListItem[], profiles: UserProfileOption[],
seerrConfigured: boolean }`. `ManagedUserListItem` (lines 64–80):
    `{ userId, name, email, emailVerified, existsInJellyfin, missingInJellyfin,
isAdmin, isDisabled, lastActivityDate, avatarUrl, assignedProfileId,
effectiveProfileId, effectiveProfileName, seerrSyncedAt, expiresAt }`.
    This function is currently **not exported** — step 2 exports a thin wrapper.

  All three services call `ensureMigrated()` internally, so callers do not need
  to. Both user and invite-history services call Jellyfin (`getAllUsers()`); if
  Jellyfin is unreachable the user roster throws and invite history degrades to
  `userName: "Unknown"` (it swallows the error — see lines 480–490). This is
  acceptable for export; see Maintenance notes.

### Schema — what must be EXCLUDED from exports

`src/server/db/schema.ts` is the authority. Export ONLY the DTO fields listed in
step 4. The following are secret/credential or internal and MUST NOT appear in
any export:

- `sessions` table (whole table excluded): `secret_hash`
  (`schema.ts:107`, session credential hash), `jellyfin_access_token`
  (`schema.ts:107`, upstream access token), `jellyfin_device_id`
  (`schema.ts:108`). Never serialize this table.
- `email_verification_tokens` table (whole table excluded): `token`
  (`schema.ts:169`, single-use verification credential), `pending_email`.
- `users.expiry_warning_sent_at` / `users.expiry_warning_sent_for`
  (`schema.ts:90–95`) — internal bookkeeping, not exported.
- `invites.created_by_id` (`schema.ts:140`) — internal reference; the
  `InviteListItem` DTO already omits it, so it will not appear. Keep it that way.
- `profiles.policy` JSON (`schema.ts:60`) — out of scope; not exported.

There are **no password hashes** anywhere in this schema — Jellyfin owns
authentication. Note this in the PR so a reviewer does not go looking.

The `invites.code` value IS exported: it is the shareable invite code by
design, not a secret. `avatarUrl` fields are Jellyfin image URLs (not secret)
but are excluded from exports as noise (see step 4 column lists).

### Delivery mechanism — why a dedicated route, not ORPC

ORPC procedures return JSON envelopes (`ActionResult` unwrapped by the RPC
handler), which is wrong for a file download with `Content-Disposition`. There
is currently **no binary/file response route** in the repo (avatars are served
directly from Jellyfin URLs, not proxied). The idiomatic pattern for a raw
`Response` is a TanStack Start server-route file with `server.handlers`, exactly
like `src/routes/rpc.$.ts` (a `.ts` route, no component, only
`createFileRoute(...)({ server: { handlers: { GET, ... } } })`). This plan adds
one such route.

### Admin gating — reuse existing session resolution

`src/routes/rpc.$.ts` and `src/server/orpc/context.ts` show the pattern for
resolving a session inside a raw route handler without ORPC middleware:

- Parse the session cookie value from `request.headers.get("cookie")`. The
  cookie name is `SESSION_COOKIE_NAME` (= `"jellything-session"`), exported from
  `@/server/session` (`src/server/session.ts:19`). `createSessionResolver` in
  `context.ts:28–54` does exactly this split/find/slice.
- `resolveSession(cookieValue, options)` is exported from
  `@/server/session-resolver` (line 226). `ResolveSessionOptions` (lines 43–47):
  `{ validationMode?: "never" | "if-stale" | "force", allowStaleOnJellyfinFailure?,
touch? }`. It returns `{ status, session, ... }` where `session` is
  `SessionData | null`.
- Admin check: `canActAsAdmin(session)` from `@/lib/session`
  (`src/lib/session.ts:19`) — the single source of truth the ORPC
  `requireAdminMiddleware` (`src/server/orpc/middleware.ts:97–104`) also uses.
  `SessionData` (`src/lib/session.ts:3–13`) has `isAdmin: boolean`.

Note: `resolveSessionFromCookies` (session-resolver.ts:306) reads the cookie via
`getRequestCookie`, which depends on the async request-context store. The
request handler does NOT run inside that store automatically (rpc.$.ts sets it
up manually with `runWithRequestContext`). To avoid that dependency, parse the
cookie from `request.headers` and call `resolveSession(cookieValue, ...)`
directly, mirroring `createSessionResolver`.

### UI — lowest-churn placement

Settings tabs are registered in three places (a new tab would touch all of
them): `src/lib/dashboard-tabs.ts` (`DASHBOARD_SETTINGS_TABS`),
`src/components/settings/dashboard-settings-tabs.tsx` (labels + `TabsContent`),
and the bootstrap data types. To avoid that churn, DO NOT add a new settings
tab. Instead add a single "Data Export" card rendered inside the existing **App**
settings tab. The App tab component is
`src/components/settings/app-settings-tab.tsx`; it uses the `FormShell` layout
component (`src/components/shared/form-shell.tsx`, props `title`, `description`,
`children`, `actions`). The export card is a sibling block rendered after the
existing `<form>` in `AppSettingsTab`'s returned JSX.

Downloads are plain `GET` navigations, so the buttons are anchors — use
`Button` with `asChild` wrapping an `<a href={...} download>` (the `Button`
component supports `asChild` via Radix `Slot`:
`src/components/ui/button.tsx:43,49,62`; `buttonVariants` is also exported).

### i18n — three files must stay in parity

New user-facing strings go in `settings.*`. All three files must be updated
together or `pnpm typecheck` fails:

- `src/lib/i18n/messages/types.ts` — the `Messages` interface; `settings` object
  starts at line 91. Add the new keys as `string`.
- `src/lib/i18n/messages/en.ts` — `settings:` object starts at line 106 (App
  settings keys around lines 128–137).
- `src/lib/i18n/messages/de.ts` — `settings:` object starts at line 105.

`en.ts` and `de.ts` are typed `: Messages`, so a missing key in either, or in
`types.ts`, is a compile error — that is the parity guarantee.

## Commands you will need

| Purpose      | Command                                | Expected on success |
| ------------ | -------------------------------------- | ------------------- |
| Install      | `pnpm install`                         | exit 0              |
| Format check | `pnpm run format:check`                | exit 0              |
| Format apply | `pnpm run format`                      | rewrites files      |
| Lint         | `pnpm run lint`                        | exit 0              |
| Typecheck    | `pnpm run typecheck`                   | exit 0, no errors   |
| Test (all)   | `pnpm run test`                        | all pass            |
| Test (one)   | `pnpm run test -- src/lib/csv.test.ts` | new tests pass      |

Do NOT run `pnpm run build` (per AGENTS.md it can disrupt the dev server). The
TanStack route tree (`src/routeTree.gen.ts`) is regenerated automatically by the
Vite plugin during dev/typecheck — do NOT hand-edit it, but expect it to change;
include it in your commit if it does.

## Scope

**In scope** (create unless marked modify):

- `src/lib/csv.ts` (create) — CSV escaping + row serialization helper.
- `src/lib/csv.test.ts` (create) — tests for the escaping rules.
- `src/server/admin/data-export.ts` (create) — dataset serialization: turns
  service results into `{ body, contentType, filename }` for CSV and JSON.
- `src/server/admin/users.ts` (modify) — export a thin unbounded wrapper for the
  full roster.
- `src/routes/export.$dataset.ts` (create) — admin-gated GET download route.
- `src/components/settings/data-export-card.tsx` (create) — the UI card.
- `src/components/settings/app-settings-tab.tsx` (modify) — render the card.
- `src/lib/i18n/messages/types.ts` (modify) — new `settings.*` keys.
- `src/lib/i18n/messages/en.ts` (modify) — English strings.
- `src/lib/i18n/messages/de.ts` (modify) — German strings.
- `src/routeTree.gen.ts` (generated — commit if changed, do not hand-edit).

**Out of scope** (do NOT touch):

- `src/server/admin/invites.ts` — its unbounded services are already exported
  and used as-is. No change needed.
- ORPC procedures/router (`src/server/orpc/*`) — the download is a dedicated
  route, not an ORPC procedure. Do not add a procedure.
- The paginated `listUsersWithProfilesService` and the users page schema — leave
  pagination behavior untouched.
- `sessions` and `email_verification_tokens` — never read or export these.
- Any new settings tab or changes to `src/lib/dashboard-tabs.ts` /
  `dashboard-settings-tabs.tsx`.

## Git workflow

- Branch: `data-export` (short, no type prefix, per AGENTS.md).
- Conventional commits, e.g. `feat(admin): add CSV/JSON data export`. Commit per
  logical unit is fine. End commit messages with the repo's AI trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: CSV helper (`src/lib/csv.ts`) + tests

Create a small, dependency-free helper. Do NOT add any CSV library.

Escaping rules (implement all):

1. Coerce each field to a string. `null`/`undefined` → empty string `""`.
   Booleans → `"true"` / `"false"`.
2. **Formula-injection neutralization (do this BEFORE quote-wrapping)**: if the
   string's first character is one of `=`, `+`, `-`, `@`, TAB (`\t`), or CR
   (`\r`), prefix the whole value with a single apostrophe `'` so spreadsheets
   treat it as text, not a formula.
3. **Quote-wrapping**: if the (possibly prefixed) value contains a double quote
   `"`, comma `,`, newline `\n`, or carriage return `\r`, wrap it in double
   quotes and escape every internal `"` by doubling it (`"` → `""`).
4. Join fields in a row with `,`; join rows with `\r\n` (CRLF, the RFC 4180
   line ending). Emit a header row first.

Suggested shape:

```ts
export function escapeCsvField(value: unknown): string {
  /* rules 1–3 */
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: ReadonlyArray<{ key: keyof T; header: string }>,
): string {
  /* header + rows, rule 4 */
}
```

Keep it synchronous and pure. Follow AGENTS.md style: prefer `const`, early
returns, no `any` (use `unknown` for field input), no single-use helper
extraction beyond the two functions above.

Create `src/lib/csv.test.ts` (Vitest — see any `src/**/*.test.ts` for the
`import { describe, expect, it } from "vitest"` pattern) covering:

- Plain values pass through unquoted.
- A value with a comma is quoted.
- A value with an embedded `"` is quoted and the quote doubled.
- A value with `\n` is quoted.
- Each of `=`, `+`, `-`, `@` at the start is prefixed with `'`.
- A value that both starts with `=` AND contains a comma is both prefixed and
  quoted (e.g. `=1,2` → `"'=1,2"`).
- `null`/`undefined` → empty; `true`/`false` → `"true"`/`"false"`.
- `toCsv` emits a CRLF-joined header + rows in column order.

**Verify**: `pnpm run test -- src/lib/csv.test.ts` → all new tests pass.

### Step 2: Export the unbounded user roster

In `src/server/admin/users.ts`, add an exported wrapper so the download route
can fetch ALL users (the private `listAllUsersWithProfiles` already returns the
full list — do not duplicate its logic). Add near `listUsersWithProfilesService`:

```ts
export async function listAllUsersForExportService(): Promise<
  ActionResult<ManagedUserListItem[]>
> {
  const result = await listAllUsersWithProfiles()
  if (!result.success) {
    return result
  }
  return success(result.data.users)
}
```

`success` and `ActionResult` are already imported at the top of the file;
`ManagedUserListItem` is a local type in the same file.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 3: Dataset serialization module (`src/server/admin/data-export.ts`)

Create a module that maps a dataset id + format to a downloadable payload. Types:

```ts
type ExportFormat = "csv" | "json"
type ExportDataset = "users" | "invites" | "invite-history"
type ExportPayload = { body: string; contentType: string; filename: string }
```

For each dataset, call the corresponding service (step 2 result +
`listInvitesService` / `getInviteHistoryService` from
`@/server/admin/invites`), and on `ActionResult` failure return the failure so
the route can emit a 500. On success:

- **JSON**: `body = JSON.stringify(items, null, 2)`,
  `contentType = "application/json; charset=utf-8"`.
- **CSV**: `body = toCsv(items, columns)` using the column lists in step 4,
  `contentType = "text/csv; charset=utf-8"`.
- `filename = `jellything-${dataset}-${timestamp}.${ext}``, where `timestamp`is
  a UTC compact stamp`YYYYMMDD-HHmmss`derived from`new Date()`
  (`new Date().toISOString()`→ strip`-`, `:`, drop milliseconds/`Z`, replace
  the `T`with`-`). `ext`is`csv`or`json`. Example:
  `jellything-users-20260704-153000.csv`.

Return the payload wrapped in the repo's `ActionResult` (`success(payload)` /
propagate `error`). The route unwraps it.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 4: Column definitions (exact fields — enforces the exclusions)

Define these column lists in `data-export.ts` (header text is the CSV column
name; keys must exist on the DTOs). These lists ARE the field-exclusion policy:
avatar URLs and all secret/internal fields from "Current state" are absent.

- **users** (from `ManagedUserListItem`, `avatarUrl` intentionally excluded):
  `userId`, `name`, `email`, `emailVerified`, `isAdmin`, `isDisabled`,
  `existsInJellyfin`, `missingInJellyfin`, `lastActivityDate`,
  `assignedProfileId`, `effectiveProfileId`, `effectiveProfileName`,
  `seerrSyncedAt`, `expiresAt`.
- **invites** (from `InviteListItem`): `id`, `code`, `profileId`, `profileName`,
  `isDisabled`, `useLimit`, `useCount`, `expiresAt`, `createdAt`, `status`.
- **invite-history** (from `InviteHistoryItem`, `avatarUrl` excluded): `id`,
  `inviteId`, `inviteCode`, `userId`, `userName`, `usedAt`.

For JSON, serialize the same projected shape (pick exactly the columns above),
so JSON and CSV expose an identical field set — do not dump extra DTO fields
like `avatarUrl` into JSON.

**Verify**: `grep -n "avatarUrl" src/server/admin/data-export.ts` → no matches.

### Step 5: The download route (`src/routes/export.$dataset.ts`)

Create a server-only route (a `.ts` route with no component), modeled on the
structure of `src/routes/rpc.$.ts` but much smaller:

```ts
import { createFileRoute } from "@tanstack/react-router"

// keep server imports dynamic/SSR-only if needed to match rpc.$.ts lazy style,
// or import statically from server modules — a .ts route is server-only.

const DATASETS = new Set(["users", "invites", "invite-history"])

async function handleExport({
  request,
  params,
}: {
  request: Request
  params: { dataset: string }
}) {
  // 1. admin gate
  const cookieValue = /* parse SESSION_COOKIE_NAME from request cookie header,
       mirroring createSessionResolver in src/server/orpc/context.ts */
  const resolved = await resolveSession(cookieValue, {
    validationMode: "if-stale",
    touch: false,
  })
  if (!resolved.session || !canActAsAdmin(resolved.session)) {
    return new Response("Forbidden", { status: 403 })
  }

  // 2. validate params
  if (!DATASETS.has(params.dataset)) {
    return new Response("Not found", { status: 404 })
  }
  const format = new URL(request.url).searchParams.get("format") ?? "csv"
  if (format !== "csv" && format !== "json") {
    return new Response("Bad request", { status: 400 })
  }

  // 3. build payload via data-export.ts
  const result = await buildDataExport(params.dataset, format)
  if (!result.success) {
    return new Response("Export failed", { status: 500 })
  }

  return new Response(result.data.body, {
    status: 200,
    headers: {
      "content-type": result.data.contentType,
      "content-disposition": `attachment; filename="${result.data.filename}"`,
      "cache-control": "no-store",
    },
  })
}

export const Route = createFileRoute("/export/$dataset")({
  server: { handlers: { GET: handleExport } },
})
```

Imports needed: `resolveSession` from `@/server/session-resolver`,
`canActAsAdmin` from `@/lib/session`, `SESSION_COOKIE_NAME` from
`@/server/session`, and `buildDataExport` from `@/server/admin/data-export`.
Follow AGENTS.md: no aliased imports, no star imports, early returns, no `else`,
avoid `try`/`catch` (the services already translate errors into `ActionResult`).

Cookie parsing must mirror `createSessionResolver`
(`src/server/orpc/context.ts:30–36`): split the `cookie` header on `;`, trim,
find the part starting with `${SESSION_COOKIE_NAME}=`, slice off the prefix;
`undefined` if absent.

**Verify**: `pnpm run typecheck` → exit 0. After the route file exists,
`grep -n '/export/\$dataset' src/routeTree.gen.ts` → the generated tree includes
the route (run `pnpm run typecheck` first to trigger regeneration).

### Step 6: i18n strings (all three files, in parity)

Add these keys to `settings` in `types.ts` (as `string`), `en.ts`, and `de.ts`.
Suggested English values; translate German idiomatically:

| key                       | en                                                                 | de (suggested)                                                                     |
| ------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `dataExportTitle`         | `Data Export`                                                      | `Datenexport`                                                                      |
| `dataExportDescription`   | `Download your users, invites, and invite history as CSV or JSON.` | `Lade Benutzer, Einladungen und den Einladungsverlauf als CSV oder JSON herunter.` |
| `dataExportUsers`         | `User roster`                                                      | `Benutzerliste`                                                                    |
| `dataExportInvites`       | `Invites`                                                          | `Einladungen`                                                                      |
| `dataExportInviteHistory` | `Invite history`                                                   | `Einladungsverlauf`                                                                |
| `dataExportDownloadCsv`   | `Download CSV`                                                     | `CSV herunterladen`                                                                |
| `dataExportDownloadJson`  | `Download JSON`                                                    | `JSON herunterladen`                                                               |

Add the keys in the same relative position in all three files (e.g. right after
the App settings keys) so diffs stay readable.

**Verify**: `pnpm run typecheck` → exit 0 (a missing key in any of the three
files is a compile error).

### Step 7: Export card UI (`data-export-card.tsx`) + wire into App tab

Create `src/components/settings/data-export-card.tsx`, a `"use client"`
component using `FormShell` (title = `t("settings.dataExportTitle")`,
description = `t("settings.dataExportDescription")`) and `useTranslations` from
`@/lib/i18n`. Inside, render three rows (users, invites, invite-history), each
with a label and two download buttons. Each button is a `Button` with `asChild`
wrapping an anchor:

```tsx
<Button asChild variant="outline" size="sm">
  <a href="/export/users?format=csv" download>
    {t("settings.dataExportDownloadCsv")}
  </a>
</Button>
```

Hrefs: `/export/users`, `/export/invites`, `/export/invite-history`, each with
`?format=csv` or `?format=json`. The `download` attribute plus the route's
`Content-Disposition` triggers a file download. No ORPC client, no data
fetching, no form state — these are static links.

Then edit `src/components/settings/app-settings-tab.tsx`: import
`DataExportCard` and render it after the existing `<form>...</form>` inside
`AppSettingsTab`'s return. Wrap the form and the card in a fragment or a
`div className="space-y-8"` so they stack. Do not alter the form logic.

**Verify**: `pnpm run typecheck` → exit 0; `pnpm run lint` → exit 0.

### Step 8: Format, then run the full completion gate

Run `pnpm run format` to apply formatting, then the four gates below.

## Test plan

- New unit tests: `src/lib/csv.test.ts` covering every escaping rule enumerated
  in step 1 (plain, comma, embedded quote, newline, each formula prefix
  `=`/`+`/`-`/`@`, combined prefix+quote, null/undefined/boolean, CRLF header
  output). Model the file structure after any existing `src/**/*.test.ts`
  (e.g. `src/server/tokens.test.ts` for the `describe`/`it`/`expect` pattern).
- No DB-backed test is required for this plan: the export services are already
  covered by their own call sites, and adding integration coverage for the route
  would need the temp-SQLite + Jellyfin harness which is disproportionate for a
  read-only serializer. If you want extra confidence, add a `data-export.test.ts`
  that feeds hand-built DTO arrays through the column projection + `toCsv` and
  asserts the header/row output and that excluded fields (`avatarUrl`) are
  absent — but keep it pure (no DB, no mocks), per AGENTS.md "avoid mocks".
- Verification: `pnpm run test` → all pass, including the new CSV tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run format:check` exits 0
- [ ] `pnpm run lint` exits 0
- [ ] `pnpm run typecheck` exits 0
- [ ] `pnpm run test` exits 0; new `src/lib/csv.test.ts` tests exist and pass
- [ ] `grep -n "avatarUrl" src/server/admin/data-export.ts` returns no matches
- [ ] `grep -rn "secretHash\|jellyfinAccessToken\|secret_hash\|email_verification\|expiryWarning" src/server/admin/data-export.ts src/routes/export.\$dataset.ts` returns no matches (no secret/internal fields referenced)
- [ ] `grep -n '/export/\$dataset' src/routeTree.gen.ts` shows the route is registered
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (if the index exists)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `871bd4b` and the
  "Current state" excerpts no longer match the live code (line numbers or the
  DTO field lists differ materially).
- `listAllUsersWithProfiles` no longer exists or no longer returns the full
  `{ users }` list in `src/server/admin/users.ts` — the export needs an
  unbounded roster source and this plan assumes that function provides it.
- `listInvitesService` or `getInviteHistoryService` is no longer unbounded (a
  pagination requirement was added) — export must cover ALL rows; do not ship a
  partial (single-page) export.
- The session/admin helpers (`resolveSession`, `canActAsAdmin`,
  `SESSION_COOKIE_NAME`) are no longer exported from the stated modules.
- A step's verification fails twice after a reasonable fix attempt.
- Implementing the download requires touching an out-of-scope file (e.g. an
  ORPC procedure or a new settings tab).

## Maintenance notes

For the human/agent who owns this after it lands:

- **Reviewer focus**: confirm the exported column lists (step 4) contain no
  secret or internal fields; confirm the CSV formula-injection prefix covers
  `= + - @` (and tab/CR); confirm the route rejects non-admins with 403 before
  doing any work.
- **Jellyfin dependency**: the users export and invite-history export call
  `getAllUsers()` transitively. If Jellyfin is down, the users export returns a
  500 and invite-history falls back to `"Unknown"` user names. If a future
  change makes exports usable offline, revisit these services.
- **New DTO fields**: if `ManagedUserListItem`, `InviteListItem`, or
  `InviteHistoryItem` gain fields, they are NOT auto-added to exports (the column
  lists are explicit allow-lists — by design, so a new secret-ish field is never
  leaked accidentally). Add new fields to the column lists deliberately.
- **CSRF**: the route is `GET` and read-only, so it is intentionally exempt from
  the CSRF protection the ORPC mutation path uses; a cross-site trigger can only
  cause the admin's own browser to download their own data (no cross-origin
  read). Do not convert it to a mutation.
- **Deferred**: no rate limiting is applied to the export route (admin-only,
  low frequency). Add one if it is ever abused.
  </content>
  </invoke>
