# Plan 001: Add admin notifications (webhook + Apprise) for key admin events

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. (`plans/README.md` may not exist yet; if it does not,
> create it using the "Index file" section at the end of this plan.)
>
> **Drift check (run first)**:
> `git diff --stat 871bd4b..HEAD -- src/lib/server/config.server.ts src/server/invites.ts src/server/user-lifecycle.ts src/server/profile-sync.ts src/server/bootstrap-data.ts src/server/orpc/procedures.ts src/server/admin/config.ts src/server/api/schemas/common-schemas.ts src/server/api/schemas/admin-schemas.ts src/lib/bootstrap-data.ts src/lib/dashboard-tabs.ts src/lib/schemas.ts src/components/settings/dashboard-settings-tabs.tsx src/lib/i18n/messages/en.ts src/lib/i18n/messages/de.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `871bd4b`, 2026-07-04

## Why this matters

Today the only outbound notification channel in Jellything is member-facing
SMTP email (`src/server/email/index.ts`). Admin-relevant events — a member
redeeming an invite, a user being auto-disabled at expiry, and a Seerr profile
sync failing — are **log-only**: the operator only learns about them by tailing
logs. Self-hosters running this unattended have no way to be pinged when
something meaningful (or broken) happens. This plan adds a `notifications`
config section (generic JSON webhook and/or an Apprise API server), a
failure-isolated `notify(event)` server helper wired into the ~3 existing
event sites, and an admin **Notifications** settings tab. After this lands, an
operator can point Jellything at a Discord/Slack webhook or an Apprise server
and receive a message on each shipped event, with per-event toggles, without
patching code. Delivery is fire-and-forget: an unreachable webhook must never
break invite redemption, expiry sweeps, or profile sync.

## Current state

### Config plumbing

- `src/lib/server/config.server.ts` — the entire config shape lives here as a
  Zod schema plus a `ConfigManager` class with typed getters/setters. This is
  the **only** place config shape is defined (there is no separate config-shape
  module; `src/server/config-validation.ts` only holds connection-test
  helpers). Relevant excerpts:
  - The schema (lines 62–108) has optional `seerr` and `email` blocks:
    ```ts
    const configSchema = z.object({
      app: z.object({ ... }).default(DEFAULT_APP_CONFIG),
      auth: z.object({ ... }).default(DEFAULT_AUTH_CONFIG),
      memberOnboarding: z.object({ ... }).default(DEFAULT_MEMBER_ONBOARDING_CONFIG),
      jellyfin: z.object({ ... }),
      seerr: seerrConfigSchema.optional(),
      email: z.object({ from: ..., smtp: z.object({...}).optional() }).optional(),
    })
    ```
  - Exported types follow the schema (lines 110–116):
    `export type EmailConfig = NonNullable<Config["email"]>` etc.
  - Getters mirror each block (lines 321–323 for email):
    ```ts
    get email(): EmailConfig | undefined {
      return this.get().email
    }
    ```
  - Setters persist the merged config (lines 419–426 for email):
    ```ts
    async setEmail(values: EmailConfig | undefined): Promise<void> {
      const current = this.get()
      this.config = { ...current, email: values }
      await this.save()
    }
    ```
  - `initialize(...)` (lines 359–390) builds the first-run config from onboarding.
    **Do not** add notifications to onboarding — it is configured post-setup only.

### Secret masking pattern (mirror this exactly)

Secrets are **never** sent to the browser. Instead a boolean `…Set` flag is
sent. Two references:

- `src/server/bootstrap-data.ts` `getDashboardSettingsBootstrap()` (lines 33–73)
  returns the masked settings object the admin settings page loads. It sends
  `apiKeySet: Boolean(configManager.jellyfin.apiKey)` and
  `smtpPasswordSet: Boolean(configManager.email.smtp?.password)` — the raw
  key/password never leave the server.
- `src/server/api/schemas/common-schemas.ts` defines the DTO schemas. The masked
  read DTO uses booleans (`apiKeySet`, `smtpPasswordSet`), while the **update
  body** schema carries the raw secret as an optional field (`apiKey`,
  `smtp.password`). Excerpts:
  ```ts
  export const jellyfinConfigSchema = z.object({
    internalUrl: UriStringSchema,
    externalUrl: exactOptional(UriStringSchema),
    apiKeySet: BooleanSchema,
    configPath: exactOptional(AnyStringSchema),
  })
  export const emailConfigSchema = z.object({
    from: exactOptional(AnyStringSchema),
    smtp: exactOptional(z.object({ host, port, secure, username })),
    smtpPasswordSet: BooleanSchema,
  })
  export const updateEmailConfigBodySchema = z.union([
    updateEmailConfigDefinedSchema,
    z.undefined(),
  ])
  ```
- "Keep current secret" semantics: `src/server/admin/config.ts`
  `updateEmailConfigService` (lines ~170–214) merges the incoming password with
  the existing one — `smtpPassword = smtpUsername ? (data.smtp.password ?? existing?.smtp?.password) : undefined`.
  The UI (`src/components/settings/email-settings-tab.tsx`) sends the password
  field blank unless the admin types a new one, and shows a masked placeholder
  (`smtpPasswordPlaceholderSet: "••••…"`) when `smtpPasswordSet` is true.

### The event sites (where `notify` gets called)

1. **Invite redeemed** — `src/server/invites.ts`, `redeemInvite(...)`. The
   success path ends at lines 565–573:

   ```ts
   return success({
     success: true,
     user: { userId: jellyfinUser.id, name: jellyfinUser.name },
     session,
     onboardingPages,
   })
   ```

   `logger` is imported at line 40 (`import { logger } from "@/server/logger"`).
   `configManager`, `normalizedEmail`, and `parsed` are in scope here.
   **NOTE (contradiction to the feature brief):** the brief lists both "invite
   redeemed" and "new user completed onboarding" as separate first-ship events.
   There is **no distinct server-side onboarding-completion step** — member
   onboarding pages are informational pages returned by `redeemInvite` and shown
   client-side; nothing calls back to the server when the user finishes them.
   Treat the successful `redeemInvite` return as the single "member joined"
   event (`invite.redeemed`). Do **not** invent an onboarding-completion
   endpoint.

2. **User auto-disabled at expiry** — `src/server/user-lifecycle.ts`,
   `enforceExpiredMatchedUsers(...)`, lines 406–440. The background sweep
   disables expired users:

   ```ts
   try {
     await enforceExpiredUserAccess(
       {
         userId: matchedUser.userId,
         userName: jellyfinUser.name,
         expiresAt: matchedUser.expiresAt,
         isAdmin: jellyfinUser.isAdmin,
         isDisabled: jellyfinUser.isDisabled,
       },
       now,
     )
     jellyfinUser.isDisabled = true
   } catch (err) {
     log.error(
       { err, userId: matchedUser.userId },
       "Failed to enforce disablement for expired user",
     )
   }
   ```

   `log` is `createChildLogger({ module: "users" })` (line 28). Only notify on a
   real transition: capture `jellyfinUser.isDisabled` **before** the call and
   fire only when it was previously `false`.
   **Out of scope:** the other `enforceExpiredUserAccess` call sites
   (`src/server/session-resolver.ts:130`, `src/server/auth.ts:111`,
   `src/server/admin/users.ts:823` and `:1280`). Wiring those would double-fire
   and is deferred (see Maintenance notes).

3. **Seerr sync failed** — `src/server/profile-sync.ts`, `applyProfileToUser(...)`,
   the Seerr catch block at lines 119–125:
   ```ts
   } catch (err) {
     log.error({ userId, err }, "Failed to sync Seerr profile settings")
     throw new SeerrProfileSyncError("Failed to sync Seerr profile settings", err)
   }
   ```
   `log` is `createChildLogger({ module: "profile-sync" })` (line 13). `userId`
   and `userName` are function params in scope.

### Settings tab wiring (mirror the email tab end-to-end)

- `src/lib/dashboard-tabs.ts` — the tab registry. `DASHBOARD_SETTINGS_TABS` is a
  `const` tuple driving the `DashboardSettingsTab` type, the route param
  validation (`isDashboardSettingsTab`), and the URL. Currently:
  ```ts
  export const DASHBOARD_SETTINGS_TABS = [
    "jellyfin",
    "seerr",
    "memberOnboarding",
    "app",
    "email",
  ] as const
  ```
- `src/routes/dashboard.settings.$settingsTab.tsx` — validates the param via
  `isDashboardSettingsTab`; **no change needed** once the tab is added to the
  tuple above (it redirects unknown tabs to `jellyfin`).
- `src/components/settings/dashboard-settings-tabs.tsx` — renders the tab list
  (`DASHBOARD_SETTINGS_TABS` local array of `{ value, labelKey }`, lines 29–43)
  and one `<TabsContent>` per tab (lines 168–209), each passing
  `initialData.<block>` to its tab component.
- `src/components/settings/email-settings-tab.tsx` — the reference tab
  implementation: a `"use client"` component taking `initialConfig`, using
  `useScopedStore`/`createAppStore`, `react-hook-form` + `zodResolver`,
  `useDashboardSettingsTabDirty("email", isDirty)`, `FormShell`, `Field`,
  `getBrowserORPCClient()` + `runApiEffect(client.admin.settings.updateEmail(...))`,
  and `toast`. **Model the new tab on this file.**
- The masked settings blob is typed by `DashboardSettingsBootstrap` in
  `src/lib/bootstrap-data.ts`:
  ```ts
  export interface DashboardSettingsBootstrap {
    app: AppSettingsDto
    email: EmailConfigDto
    jellyfin: JellyfinConfigDto
    seerr: SeerrConfigDto
    memberOnboarding: MemberOnboardingConfigDto
  }
  ```
  The DTO types come from `src/lib/api/contracts/admin.ts`, which re-exports them
  from `src/server/api/schemas/admin-schemas.ts` (e.g.
  `export type EmailConfigDto = z.output<typeof emailConfigSchema>`, line 402).
- ORPC procedures live in `src/server/orpc/procedures.ts`. The admin settings
  procedures are under `adminProcedures.settings` (lines 506–550). `updateEmail`
  (lines 536–541) is the pattern:
  ```ts
  updateEmail: configuredAdminProcedure
    .input(updateEmailConfigBodySchema)
    .handler(async ({ input }) => {
      unwrapActionResultOrThrow(await updateEmailConfigService(input))
      return null
    }),
  ```
  The service adapter re-exports live in `src/server/orpc/service-adapters.ts`
  (which re-exports from `src/server/admin/config.ts`). The client is inferred
  from the router (`src/server/orpc/router.ts` = `procedures`); there is **no**
  separate output-contract file to update — adding the procedure is enough for
  `client.admin.settings.updateNotifications(...)` to be typed.
- Client form schemas live in `src/lib/schemas.ts` (e.g. `emailSettingsFormSchema`
  at lines 516–564, `EmailSettingsFormValues` type at line 564). Validation
  message keys resolve through a `validation` object referencing i18n keys
  (e.g. `validation.smtpHostRequired`, line 39).
- i18n: `src/lib/i18n/messages/en.ts` and `.../de.ts` each have a `settings: {`
  block (en starts line 106) with tab labels and field strings (e.g.
  `emailTab`, `smtpPasswordPlaceholderSet`, lines 114–197). Both locale files
  must stay in structural sync (the same keys in both).

### Repo conventions to honor (from `AGENTS.md`)

- `const` over `let`; early returns over `else`; avoid unnecessary destructuring
  (use `configManager.notifications` not `const { webhook } = ...`); no aliased
  or star imports; keep the happy path in the main function with small helpers
  below it; add `try`/`catch` only at the external boundary (the fetch).
- Avoid `any`; narrow untrusted data with schemas/`unknown`.
- Avoid mocks in tests; test the real implementation. DB-backed tests use the
  temp-SQLite helper in `src/test/db.ts` (this feature needs **no** DB).
- New schema is snake_case, but this feature touches **no Drizzle schema** and
  **no migration** — config is a JSON file, not a DB table.

## Commands you will need

| Purpose        | Command                                     | Expected on success |
| -------------- | ------------------------------------------- | ------------------- |
| Install        | `pnpm install`                              | exit 0              |
| Typecheck      | `pnpm run typecheck`                        | exit 0, no errors   |
| Lint           | `pnpm run lint`                             | exit 0              |
| Format (check) | `pnpm run format:check`                     | exit 0              |
| Format (fix)   | `pnpm run format`                           | rewrites files      |
| Test (all)     | `pnpm run test`                             | all pass            |
| Test (one)     | `pnpm run test -- src/server/notifications` | new suite passes    |

Do **not** run `pnpm run build` — it can disrupt a running dev server and is not
required for this task.

## Scope

**In scope** (the only files you should create/modify):

- `src/lib/server/config.server.ts` — add `notifications` schema block, types, getter, setter.
- `src/server/notifications/index.ts` — **create** — `notify()` helper, event types, delivery.
- `src/server/notifications/index.test.ts` — **create** — tests.
- `src/server/invites.ts` — call `notify` on redeem success.
- `src/server/user-lifecycle.ts` — call `notify` on auto-disable transition.
- `src/server/profile-sync.ts` — call `notify` on Seerr sync failure.
- `src/server/api/schemas/common-schemas.ts` — masked DTO schema + update body schema + types.
- `src/server/api/schemas/admin-schemas.ts` — import masked schema, export `NotificationsConfigDto`.
- `src/lib/api/contracts/admin.ts` — add `NotificationsConfigDto` to the re-export.
- `src/lib/bootstrap-data.ts` — add `notifications` to `DashboardSettingsBootstrap`.
- `src/server/bootstrap-data.ts` — populate masked `notifications` in `getDashboardSettingsBootstrap`.
- `src/server/admin/config.ts` — `updateNotificationsConfigService`.
- `src/server/orpc/service-adapters.ts` — re-export `updateNotificationsConfigService`.
- `src/server/orpc/procedures.ts` — add `settings.updateNotifications` procedure + input schema import.
- `src/lib/dashboard-tabs.ts` — add `"notifications"` to `DASHBOARD_SETTINGS_TABS`.
- `src/lib/schemas.ts` — `notificationsSettingsFormSchema` + type + validation key refs.
- `src/components/settings/notifications-settings-tab.tsx` — **create** — the tab UI.
- `src/components/settings/dashboard-settings-tabs.tsx` — register the tab (list entry + `<TabsContent>`).
- `src/lib/i18n/messages/en.ts` and `src/lib/i18n/messages/de.ts` — add tab/field/validation strings.
- `plans/README.md` — create/update the status row (see Index file section).

**Out of scope** (do NOT touch, even though they look related):

- Onboarding wizard / `configManager.initialize` — notifications are configured post-setup only.
- Any Drizzle schema file or `drizzle/` migration — config is JSON, not a DB table.
- `src/server/email/*` — the email channel is unchanged.
- The other `enforceExpiredUserAccess` call sites (`session-resolver.ts`,
  `auth.ts`, `admin/users.ts`) — only the `user-lifecycle.ts` expiry sweep fires
  the `user.auto_disabled` event in this plan; wiring the others would
  double-notify.
- Any retry/queue/backoff infrastructure — delivery is fire-and-forget (see design decisions).

## Design decisions (fixed — implement exactly these)

1. **Channels.** Two optional channels, both off by default:
   - `webhook`: HTTP `POST` of the JSON event envelope to `webhook.url`.
   - `apprise`: HTTP `POST` to an Apprise **API server** stateless notify
     endpoint (`apprise.serverUrl`, e.g. `https://apprise.example/notify`) with
     body `{ urls, title, body }`, where `apprise.urls` is a comma-separated
     Apprise URL string (e.g. `discord://…,mailto://…`). We do **not** shell out
     to the Apprise CLI; only an HTTP server is contacted.
2. **Event payload envelope** (sent verbatim as the webhook body):
   ```json
   {
     "event": "invite.redeemed",
     "occurredAt": "2026-07-04T12:00:00.000Z",
     "title": "New member joined",
     "message": "alice redeemed an invite.",
     "data": { "userId": "…", "username": "alice" }
   }
   ```
   For Apprise, send `{ urls: apprise.urls, title, body: message }`.
3. **Events shipped first** (3 concrete server events; per-event enable toggles,
   all default `true`):
   - `invite.redeemed` → `data: { userId, username }`
   - `user.auto_disabled` → `data: { userId, username, expiresAt }`
   - `seerr.sync_failed` → `data: { userId, userName, error }` (`error` = the
     failure message string; never a stack or upstream payload)
     ("New user completed onboarding" is the same moment as `invite.redeemed` — see
     the contradiction note in Current state.)
4. **Retry / reliability.** Fire-and-forget, **no retry**. `notify()` returns
   `void` synchronously and never throws; delivery runs detached and any failure
   is logged at `warn` and swallowed. Each channel is delivered independently
   (one failing must not block the other). Use `AbortSignal.timeout(8000)` on
   every fetch (matches `CONNECTION_TEST_TIMEOUT_MS` used elsewhere).
5. **Secrets.** `webhook.url`, `apprise.serverUrl`, and `apprise.urls` are
   secrets — they are **never** returned to the browser. The masked read DTO
   exposes only booleans: `webhookUrlSet`, `appriseConfigured` (true when both
   `serverUrl` and `urls` are set), plus the non-secret `events` toggles. The
   update body carries the raw values; the service uses "keep current" semantics
   (omitted/blank field ⇒ keep existing; explicit `null` ⇒ clear that channel).

## Git workflow

- Branch: `admin-notifications` (short, no slashes, no type prefix — per `AGENTS.md`).
- Commit per logical step; conventional-commit style, e.g.
  `feat(notifications): add notify helper and webhook delivery`,
  `feat(settings): add notifications settings tab`.
  End commit messages with the repo's AI co-author trailer only if the repo
  already uses one (check `git log`); otherwise a plain conventional message.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `notifications` config block, types, getter, and setter

In `src/lib/server/config.server.ts`:

- Add a schema near the other block schemas (below `seerrConfigSchema`, ~line 51):

  ```ts
  const notificationEventsSchema = z.object({
    inviteRedeemed: z.boolean().default(true),
    userAutoDisabled: z.boolean().default(true),
    seerrSyncFailed: z.boolean().default(true),
  })

  const notificationsConfigSchema = z.object({
    webhook: z.object({ url: z.url() }).optional(),
    apprise: z
      .object({ serverUrl: z.url(), urls: z.string().min(1) })
      .optional(),
    events: notificationEventsSchema.default({
      inviteRedeemed: true,
      userAutoDisabled: true,
      seerrSyncFailed: true,
    }),
  })
  ```

- Add `notifications: notificationsConfigSchema.optional(),` to `configSchema`
  (after the `email` block, ~line 107).
- Add the exported type after `EmailConfig` (~line 115):
  `export type NotificationsConfig = NonNullable<Config["notifications"]>`
- Add a getter after the `email` getter (~line 323):
  ```ts
  get notifications(): NotificationsConfig | undefined {
    return this.get().notifications
  }
  ```
- Add a setter after `setEmail` (~line 426), mirroring it:
  ```ts
  async setNotifications(values: NotificationsConfig | undefined): Promise<void> {
    const current = this.get()
    this.config = { ...current, notifications: values }
    await this.save()
  }
  ```
- Do **not** touch `initialize(...)`.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 2: Create the `notify` helper and delivery module

Create `src/server/notifications/index.ts`. Requirements:

- A discriminated-union event type:
  ```ts
  export type NotificationEvent =
    | { type: "invite.redeemed"; data: { userId: string; username: string } }
    | {
        type: "user.auto_disabled"
        data: { userId: string; username: string; expiresAt: string }
      }
    | {
        type: "seerr.sync_failed"
        data: { userId: string; userName: string; error: string }
      }
  ```
- A `createChildLogger({ module: "notifications" })` logger (import from
  `@/server/logger`).
- An event→toggle map and an event→`{ title, message }` describer (small helpers
  below the exports), e.g. `describeEvent(event)` returning human strings, and a
  function mapping each event type to the matching `events` toggle key
  (`inviteRedeemed` / `userAutoDisabled` / `seerrSyncFailed`).
- An **exported, awaitable** `deliverNotification(event, config)` that takes the
  `NotificationsConfig` explicitly (so tests need no config file and no mocks):
  ```ts
  export async function deliverNotification(
    event: NotificationEvent,
    config: NotificationsConfig,
  ): Promise<void>
  ```
  It must: check the per-event toggle (skip silently if disabled); build the
  envelope (`event`, `occurredAt: new Date().toISOString()`, `title`, `message`,
  `data`); and deliver to whichever channels are configured, **independently**
  (use `await Promise.allSettled([...])` over the enabled channels so one
  failure never blocks the other). Each channel delivery is its own `async`
  function with a single `try`/`catch` around the `fetch` that logs at `warn`
  and swallows. Use `AbortSignal.timeout(8000)`, `method: "POST"`,
  `headers: { "Content-Type": "application/json" }`, and treat a non-`ok`
  response as a failure (log status, do not throw out of `deliverNotification`).
  - Webhook body: the full envelope JSON.
  - Apprise body: `JSON.stringify({ urls: config.apprise.urls, title, body: message })`
    POSTed to `config.apprise.serverUrl`.
- The public fire-and-forget entrypoint:
  ```ts
  export function notify(event: NotificationEvent): void {
    if (!configManager.isConfigured()) return
    const config = configManager.notifications
    if (!config) return
    void deliverNotification(event, config).catch((err) =>
      log.warn({ err, type: event.type }, "Notification delivery failed"),
    )
  }
  ```
- Also export `export function isNotificationsConfigured(): boolean` mirroring
  `isEmailConfigured` in `src/server/email/index.ts` (true when configured and at
  least one channel is set).

**Verify**: `pnpm run typecheck` → exit 0.

### Step 3: Test the delivery module (no mocks)

Create `src/server/notifications/index.test.ts`. Use a **real** local HTTP
server (`node:http` `createServer`) bound to `127.0.0.1:0`, read the assigned
port, and point the config at `http://127.0.0.1:<port>/…`. Call the exported
`deliverNotification(event, config)` and `await` it, then assert on what the
server received. Cover:

- **Webhook happy path**: a webhook-only config delivers a POST whose parsed
  JSON body has `event === "invite.redeemed"`, an ISO `occurredAt`, and
  `data.username`.
- **Apprise happy path**: an apprise-only config POSTs to `serverUrl` with body
  containing `urls` (equal to the configured string) and a non-empty `title`.
- **Both channels**: a config with webhook + apprise hits both servers.
- **Disabled event toggle**: with `events.inviteRedeemed = false`, no request is
  made (assert the server's request count stays 0).
- **Failure isolation**: point the webhook at a closed port / a server that
  returns 500 and assert `deliverNotification` still **resolves** (does not
  reject). Optionally assert `notify()` returns synchronously without throwing.

Close every test server in `afterEach`/`finally`. Model structure loosely on an
existing server test (e.g. `src/server/tokens.test.ts`) for the Vitest layout,
but this suite needs **no** DB helper.

**Verify**: `pnpm run test -- src/server/notifications` → the new suite passes.

### Step 4: Wire the three event call sites

- `src/server/invites.ts`: immediately before `return success({ ... })` at
  ~line 565, add (import `notify` from `@/server/notifications` at the top):
  ```ts
  notify({
    type: "invite.redeemed",
    data: { userId: jellyfinUser.id, username: jellyfinUser.name },
  })
  ```
- `src/server/user-lifecycle.ts`, in `enforceExpiredMatchedUsers` (~line 420):
  capture prior state before the enforcement call and notify only on transition:
  ```ts
  const wasDisabled = jellyfinUser.isDisabled
  try {
    await enforceExpiredUserAccess({ ... }, now)
    jellyfinUser.isDisabled = true
    if (!wasDisabled) {
      notify({
        type: "user.auto_disabled",
        data: {
          userId: matchedUser.userId,
          username: jellyfinUser.name,
          expiresAt: matchedUser.expiresAt.toISOString(),
        },
      })
    }
  } catch (err) { ... }
  ```
  (Add the `notify` import. `matchedUser.expiresAt` is a `Date`; if it can be
  null in this type, coerce to `expiresAt?.toISOString() ?? ""` — check the type
  and keep it a string.)
- `src/server/profile-sync.ts`, in the Seerr catch block (~line 119), before the
  `throw`, add (import `notify`):
  ```ts
  notify({
    type: "seerr.sync_failed",
    data: {
      userId,
      userName,
      error: err instanceof Error ? err.message : "Unknown Seerr sync error",
    },
  })
  ```
  Keep the existing `log.error` and `throw` — `notify` is additive and must not
  change control flow.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 5: Add the masked DTO + update body schema + contract types

- `src/server/api/schemas/common-schemas.ts`: add, mirroring the email schemas
  (use `UriStringSchema`, `NonEmptyStringSchema`, `BooleanSchema`,
  `exactOptional` already imported at the top):

  ```ts
  export const notificationEventsDtoSchema = z.object({
    inviteRedeemed: BooleanSchema,
    userAutoDisabled: BooleanSchema,
    seerrSyncFailed: BooleanSchema,
  })

  // Masked read DTO — secrets exposed only as booleans.
  export const notificationsConfigSchema = z.object({
    webhookUrlSet: BooleanSchema,
    appriseConfigured: BooleanSchema,
    events: notificationEventsDtoSchema,
  })

  const updateNotificationsConfigDefinedSchema = z.object({
    webhookUrl: exactOptional(UriStringSchema.nullable()),
    appriseServerUrl: exactOptional(UriStringSchema.nullable()),
    appriseUrls: exactOptional(NonEmptyStringSchema.nullable()),
    events: exactOptional(notificationEventsDtoSchema),
  })

  export const updateNotificationsConfigBodySchema = z.union([
    updateNotificationsConfigDefinedSchema,
    z.undefined(),
  ])

  export type UpdateNotificationsConfigInput = z.output<
    typeof updateNotificationsConfigBodySchema
  >
  ```

- `src/server/api/schemas/admin-schemas.ts`: import `notificationsConfigSchema`
  from `common-schemas` (add to the existing import list at the top) and add the
  DTO export near the other config DTOs (~line 402):
  ```ts
  export type NotificationsConfigDto = z.output<
    typeof notificationsConfigSchema
  >
  ```
- `src/lib/api/contracts/admin.ts`: add `NotificationsConfigDto,` to the
  `export type { … } from "@/server/api/schemas/admin-schemas"` list.
- `src/lib/bootstrap-data.ts`: add `NotificationsConfigDto` to the import from
  `@/lib/api/contracts/admin` and add `notifications: NotificationsConfigDto` to
  the `DashboardSettingsBootstrap` interface.

**Verify**: `pnpm run typecheck` → will fail only in `src/server/bootstrap-data.ts`
(missing `notifications` field) — that is expected and fixed in Step 6. If it
fails anywhere else, STOP and reconcile.

### Step 6: Populate masked notifications + add the service + procedure

- `src/server/bootstrap-data.ts`, inside the object returned by
  `getDashboardSettingsBootstrap` (~line 39), add a `notifications` block that
  masks secrets exactly like the seerr/email blocks:
  ```ts
  notifications: {
    webhookUrlSet: Boolean(configManager.notifications?.webhook?.url),
    appriseConfigured: Boolean(
      configManager.notifications?.apprise?.serverUrl &&
        configManager.notifications?.apprise?.urls,
    ),
    events: configManager.notifications?.events ?? {
      inviteRedeemed: true,
      userAutoDisabled: true,
      seerrSyncFailed: true,
    },
  },
  ```
- `src/server/admin/config.ts`: add `updateNotificationsConfigService`, modeled on
  `updateEmailConfigService` (keep-current secret semantics; explicit `null`
  clears a channel; `undefined` input clears the whole block). Import the
  `NotificationsConfig` type from `@/lib/server/config.server` and
  `UpdateNotificationsConfigInput` from `@/server/api/schemas/common-schemas`.
  Sketch:

  ```ts
  export async function updateNotificationsConfigService(
    data: UpdateNotificationsConfigInput,
  ): Promise<ActionResult<void>> {
    if (!configManager.isConfigured())
      return error(ErrorCode.CONFIG_NOT_INITIALIZED)
    if (!data) {
      await configManager.setNotifications(undefined)
      return success(undefined)
    }
    const existing = configManager.notifications

    // webhook: null clears, undefined keeps, value sets
    const nextWebhookUrl = Object.hasOwn(data, "webhookUrl")
      ? (data.webhookUrl ?? undefined)
      : existing?.webhook?.url

    // apprise needs both serverUrl and urls to be active
    const nextServerUrl = Object.hasOwn(data, "appriseServerUrl")
      ? (data.appriseServerUrl ?? undefined)
      : existing?.apprise?.serverUrl
    const nextUrls = Object.hasOwn(data, "appriseUrls")
      ? (data.appriseUrls ?? undefined)
      : existing?.apprise?.urls

    const next: NotificationsConfig = {
      webhook: nextWebhookUrl ? { url: nextWebhookUrl } : undefined,
      apprise:
        nextServerUrl && nextUrls
          ? { serverUrl: nextServerUrl, urls: nextUrls }
          : undefined,
      events: data.events ??
        existing?.events ?? {
          inviteRedeemed: true,
          userAutoDisabled: true,
          seerrSyncFailed: true,
        },
    }
    await configManager.setNotifications(next)
    return success(undefined)
  }
  ```

  (No external connection assertion is required; a "test" button is out of scope
  for first ship. Wrap only if you add a fetch. Follow the file's existing
  error-translation style.)

- `src/server/orpc/service-adapters.ts`: add `updateNotificationsConfigService`
  to the re-export block from `@/server/admin/config`.
- `src/server/orpc/procedures.ts`: import `updateNotificationsConfigBodySchema`
  (add to the `common-schemas` import group, ~line 46) and
  `updateNotificationsConfigService` (from `service-adapters`, ~line 84). Add to
  `adminProcedures.settings` (after `updateMemberOnboarding`, ~line 549):
  ```ts
  updateNotifications: configuredAdminProcedure
    .input(updateNotificationsConfigBodySchema)
    .handler(async ({ input }) => {
      unwrapActionResultOrThrow(await updateNotificationsConfigService(input))
      return null
    }),
  ```

**Verify**: `pnpm run typecheck` → exit 0.

### Step 7: Add the settings tab (registry, client schema, UI, wiring, i18n)

- `src/lib/dashboard-tabs.ts`: add `"notifications"` to the
  `DASHBOARD_SETTINGS_TABS` tuple (place it after `"email"`). No other change in
  this file (the type, the `Set`, and `isDashboardSettingsTab` all derive from it).
- `src/lib/schemas.ts`: add a `notificationsSettingsFormSchema` (all string/bool
  fields, like `emailSettingsFormSchema`) and `NotificationsSettingsFormValues`
  type. Fields: `webhookUrl: string`, `appriseServerUrl: string`,
  `appriseUrls: string`, and three booleans `eventInviteRedeemed`,
  `eventUserAutoDisabled`, `eventSeerrSyncFailed`. Add a `superRefine` that, when
  a URL field is non-empty, validates it parses as a URL (reuse an existing
  URL-validation message key if one exists, e.g. `validation.*Url*`; otherwise
  add a new `validation` key and the matching i18n strings). Apprise requires
  **both** `appriseServerUrl` and `appriseUrls` or neither — add a refine that
  flags the missing one.
- `src/components/settings/notifications-settings-tab.tsx`: **create**, modeled
  closely on `email-settings-tab.tsx`:
  - `"use client"`; prop `initialConfig: NotificationsConfigDto`.
  - `useScopedStore`/`createAppStore` holding `configState: NotificationsConfigDto`.
  - `react-hook-form` + `zodResolver(notificationsSettingsFormSchema)`.
  - `useDashboardSettingsTabDirty("notifications", isDirty)`.
  - Secret inputs use `PasswordInput` with a masked placeholder when
    `configState.webhookUrlSet` / `configState.appriseConfigured` is true (mirror
    the SMTP password field: blank submission keeps the current secret).
  - Three `Checkbox` fields for the event toggles bound to
    `configState.events.*`.
  - On submit: build the update payload (only include a URL field when the user
    typed a new value; include `events`), call
    `runApiEffect(getBrowserORPCClient().admin.settings.updateNotifications(payload))`,
    toast success/error, and update the store's masked `configState`
    (`webhookUrlSet`, `appriseConfigured`, `events`) from the submitted values.
    Provide a "clear all" path that submits `undefined` when every field is empty
    (mirror the email tab's `hasEmailSettingsInput` branch).
  - Use `FormShell`, `Field`, `FieldLabel`, `FieldError`, `Button`, `Checkbox`,
    `useTranslations`, `toast` — all already used by the email tab.
- `src/components/settings/dashboard-settings-tabs.tsx`:
  - Import `NotificationsSettingsTab`.
  - Add `{ value: "notifications", labelKey: "settings.notificationsTab" }` to the
    `DASHBOARD_SETTINGS_TABS` array and add `"settings.notificationsTab"` to the
    `labelKey` union type (lines 29–43).
  - Add a `<TabsContent value="notifications" …>` block (mirror the email one)
    rendering `<NotificationsSettingsTab initialConfig={initialData.notifications} />`.
- `src/lib/i18n/messages/en.ts` **and** `src/lib/i18n/messages/de.ts`: add, inside
  the `settings` block, at minimum: `notificationsTab`, `notificationsTitle`,
  `notificationsDescription`, `webhookUrl` (+ placeholder/description/keep-current/
  masked-placeholder), `appriseServerUrl` (+ placeholder/description),
  `appriseUrls` (+ placeholder/description), the three event-toggle labels
  (`notifyInviteRedeemed`, `notifyUserAutoDisabled`, `notifySeerrSyncFailed`) with
  descriptions, and `notificationsSaved` / `notificationsCleared` toast strings.
  Add any new `validation.*` keys referenced by the form schema to **both** files.
  Keep the two locale files structurally identical (same keys); German values may
  be reasonable translations.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 8: Full completion gates + manual smoke

Run the full gate set:

**Verify**:

- `pnpm run format` then `pnpm run format:check` → exit 0
- `pnpm run lint` → exit 0
- `pnpm run typecheck` → exit 0
- `pnpm run test` → all pass, including the new `src/server/notifications` suite

Then update `plans/README.md` status row for plan 001 to DONE.

## Test plan

- New suite `src/server/notifications/index.test.ts` (Step 3), all mock-free
  against real local HTTP servers, covering: webhook happy path, apprise happy
  path, both channels, disabled-toggle skip, and failure isolation (a failing
  channel resolves without throwing).
- Structural pattern: Vitest layout as in `src/server/tokens.test.ts`; no DB
  helper needed.
- Verification: `pnpm run test` → all pass, including ≥5 new notification cases.
- Manual smoke (optional but recommended): run a tiny local listener
  (`python3 -m http.server` or a one-line node server), point
  `notifications.webhook.url` at it via the new settings tab, redeem a test
  invite, and confirm a POST arrives — confirming the end-to-end wiring the unit
  tests don't cover (config file → `notify` → fetch).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run format:check` exits 0
- [ ] `pnpm run lint` exits 0
- [ ] `pnpm run typecheck` exits 0
- [ ] `pnpm run test` exits 0; the new `src/server/notifications` suite exists and passes
- [ ] `grep -rn "notifications" src/lib/dashboard-tabs.ts` shows `"notifications"` in the tuple
- [ ] `grep -rn "updateNotifications" src/server/orpc/procedures.ts` returns the new procedure
- [ ] `grep -rn "notify(" src/server/invites.ts src/server/user-lifecycle.ts src/server/profile-sync.ts` returns 3 call sites
- [ ] No secret value (webhook URL, apprise URL) is ever returned in `getDashboardSettingsBootstrap` — only `…Set`/`…Configured` booleans and the `events` toggles
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `871bd4b` and the
  "Current state" excerpt no longer matches the live code (the tree was heavily
  refactored on 2026-07-04; module names/line numbers may have moved).
- `redeemInvite` in `src/server/invites.ts` no longer returns a `success({...})`
  object at the location described, or `jellyfinUser.id`/`jellyfinUser.name` are
  not in scope there.
- `enforceExpiredMatchedUsers` in `src/server/user-lifecycle.ts` no longer has
  the `jellyfinUser.isDisabled = true` transition point.
- The masking pattern (`apiKeySet`/`smtpPasswordSet` booleans in
  `getDashboardSettingsBootstrap`) is gone or changed shape — do not invent a new
  secret-exposure pattern; STOP and report.
- You discover a **server-side** onboarding-completion hook exists and the
  operator wants it as a separate event (this plan folds it into
  `invite.redeemed`).
- A verification fails twice after a reasonable fix attempt.
- The change appears to require touching an out-of-scope file (especially any
  `drizzle/` migration or the onboarding wizard).

## Maintenance notes

For the human/agent who owns this after it lands:

- **Adding events**: extend the `NotificationEvent` union in
  `src/server/notifications/index.ts`, add a toggle to
  `notificationEventsSchema` (config) and `notificationEventsDtoSchema` (DTO),
  the form fields, and the i18n strings. Keep the three lists (config schema,
  DTO schema, form) in sync.
- **Seerr-sync spam risk**: `applyProfileToUser` is also called in bulk paths
  (`src/server/admin/profiles.ts`, `src/server/admin/users.ts`). A bulk profile
  re-apply that fails for many users will emit one `seerr.sync_failed` per user.
  First ship accepts this (log parity). If it becomes noisy, add coalescing at
  the bulk caller rather than in the central catch.
- **Other auto-disable sites deferred**: `enforceExpiredUserAccess` also runs in
  `session-resolver.ts`, `auth.ts`, and `admin/users.ts`. If you later want
  those to notify, factor a shared "disable + notify on transition" helper so
  the event fires exactly once per real transition and never double-fires with
  the expiry sweep.
- **Reviewer focus**: confirm no secret ever reaches the browser (inspect the
  `settings.page` payload and the tab component), confirm `notify()` cannot throw
  into a caller (fire-and-forget), and confirm every outbound fetch has a
  timeout.
- **Deferred**: a "Send test notification" button and an Apprise **stateful**
  (`/notify/{key}`) mode were intentionally left out of first ship.
