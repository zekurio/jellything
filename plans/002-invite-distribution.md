# Plan 002: Distribute invites by email and QR code, not just clipboard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 871bd4b..HEAD -- src/server/email src/server/admin/invites.ts src/lib/schemas.ts src/server/rate-limit.ts src/server/orpc/procedures.ts src/lib/i18n/messages src/components/invites`
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

Today an admin can only hand out an invite by copying its link to the
clipboard (`copyInviteLink` in `src/components/invites/invites-grid.tsx`).
Meanwhile a complete SMTP stack already exists
(`src/server/email/` with react-email templates for verify-email,
password-reset, and expiry-warning) and is used for every other
transactional email — but never to deliver an invite. This plan closes that
gap with two low-friction distribution methods: (1) **Email this invite** —
send the invite link straight to a recipient's inbox using the existing email
infrastructure, and (2) **Show QR code** — render the invite URL as a
scannable QR client-side for in-person or screen-to-phone sharing. This makes
the most common admin flow (getting an invite into someone's hands) faster and
removes the manual copy-paste-and-message dance.

## Current state

### Files and their roles

- `src/components/invites/invites-grid.tsx` — the invites dashboard. Contains
  `InviteCard` (the per-invite card with a row of icon `Button`s), the
  `InviteSection` list, and the `InvitesGrid` container that owns dialog state
  and mutation callbacks. The only current distribution action is
  `copyInviteLink` (lines 357–369) which builds
  `` `${window.location.origin}/invite/${code}` `` and writes it to the
  clipboard, toasting `t("invites.inviteLinkCopied")`.
- `src/components/invites/invite-form-dialog.tsx` — create/edit dialog for an
  invite; uses `react-hook-form` + `zodResolver(inviteFormSchema)` and calls
  `client.admin.invites.create` / `.update`. **Not** the home for the new
  actions (see Scope note) but shown here as the form/dialog pattern to copy.
- `src/server/email/index.ts` — SMTP transport. Exports `sendEmail(options)`,
  `isEmailConfigured()`, and the stable boundary error class `EmailApiError`.
  `sendEmail` throws `EmailApiError` on any misconfiguration or send failure.
- `src/server/email/templates/verify-email.tsx` — the closest structural
  template to copy. Exports a component `VerifyEmailTemplate`, a
  `getVerifyEmailSubject({ locale })` helper, and
  `renderVerifyEmail(props): Promise<string>`. All copy comes from
  `createTranslator(locale ?? DEFAULT_LOCALE)` keyed under
  `emailTemplates.verifyEmail.*`. Uses `EmailLayout` from
  `src/server/email/templates/layout.tsx`.
- `src/server/admin/invites.ts` — admin invite services
  (`createInviteService`, `updateInviteService`, `deleteInviteService`, …),
  each returning `ActionResult<T>` from `@/lib/api/contracts/errors`
  (`success(...)` / `error(ErrorCode.X, msg)`). This is where the new
  `sendInviteEmailService` belongs.
- `src/server/orpc/procedures.ts` — ORPC router. `adminProcedures.invites`
  (lines 400–436) holds `page`/`history`/`create`/`update`/`delete`, each a
  `configuredAdminProcedure`. The client type for a new procedure is inferred
  automatically from the router — no separate contract file edit is needed.
- `src/server/orpc/middleware.ts` — exports `configuredAdminProcedure`,
  `rateLimitMiddleware(limiter)`, `enforceRateLimit(limiter, key)`,
  `getClientIpRateLimitKey(context, ...parts)`.
- `src/server/rate-limit.ts` — limiter definitions. Follows a two-limiter
  pattern for sensitive actions: an IP-keyed transport limiter applied via
  `rateLimitMiddleware`, plus a per-identity limiter enforced in the handler
  (see `renewalLimiter` / `renewalIdentifierLimiter`, lines 130–145).
- `src/lib/schemas.ts` — shared zod schemas. Email fields use
  `z.email(validation.invalidEmail)` (e.g. line 299, 315). `validation` is a
  const map of i18n keys; `invalidEmail: "validation.invalidEmail"` already
  exists (line 19).
- `src/lib/api/contracts/errors.ts` — `ErrorCode.EMAIL_SERVICE_ERROR` exists
  (line 31). It maps to HTTP 502 in `src/server/orpc/errors.ts:34` and to the
  i18n key `errors.emailServiceError` in
  `src/lib/i18n/error-messages.ts:30`.
- `src/lib/i18n/messages/{en,de}.ts` and `src/lib/i18n/messages/types.ts` —
  message catalogs and their shared type. `Messages` in `types.ts` is the
  source of truth; **every key added to `en.ts` must also be added to `de.ts`
  and typed in `types.ts`**, or `pnpm run typecheck` fails.

### The established email-send pattern to mirror

From `src/server/invites.ts:478-501` (verification email inside redemption):

```ts
if (isEmailConfigured()) {
  const appUrl = configManager.appUrl
  if (!appUrl) {
    throw new Error("Application URL is not configured")
  }
  const verifyUrl = `${appUrl}/verify-email/${token}`
  const html = await renderVerifyEmail({
    username: parsed.data.username,
    verifyUrl,
    baseUrl: appUrl,
    locale: configManager.defaultLocale,
  })
  await sendEmail({
    to: normalizedEmail,
    subject: getVerifyEmailSubject({ locale: configManager.defaultLocale }),
    html,
  })
}
```

The `EmailApiError → EMAIL_SERVICE_ERROR` translation to copy is from
`src/server/me.ts:176-188`:

```ts
try {
  await sendEmail({ to: requestedEmail, subject: ..., html })
} catch (sendError) {
  // cleanup ...
  if (sendError instanceof EmailApiError) {
    return error(ErrorCode.EMAIL_SERVICE_ERROR)
  }
  throw sendError
}
```

`configManager` getters that exist and are safe to use server-side:
`configManager.appUrl` (`string | undefined`), `configManager.app.title`
(server name), `configManager.defaultLocale` (`Locale`). The invite recipient
has no account yet, so there is **no recipient locale** — use
`configManager.defaultLocale` like the redemption flow does.

### The ORPC admin invite procedure pattern to mirror

From `src/server/orpc/procedures.ts:430-435` (`delete`):

```ts
delete: configuredAdminProcedure
  .input(z.object({ inviteId: z.uuid() }))
  .handler(async ({ input }) => {
    unwrapActionResultOrThrow(await deleteInviteService(input.inviteId))
    return null
  }),
```

Rate-limited mutation pattern (transport limiter via middleware + identity
limiter in handler), from `me.renew`
(`src/server/orpc/procedures.ts:382-393`):

```ts
renew: authedProcedure
  .use(rateLimitMiddleware(renewalLimiter))
  .input(noInputSchema)
  .handler(async ({ context }) => {
    await enforceRateLimit(
      renewalIdentifierLimiter,
      buildRateLimitKey("renewal", context.session?.userId),
    )
    return unwrapActionResultOrThrow(await renewMyAccess(...))
  }),
```

### Repo conventions that apply (from AGENTS.md)

- Avoid `try`/`catch` except at external boundaries (SMTP send is exactly such
  a boundary — the one place it is expected).
- Avoid the `any` type; rely on inference; prefer `const`; avoid `else` /
  prefer early returns; avoid unnecessary destructuring (use `session.userId`,
  not `const { userId } = session`).
- Never alias or star-import; prefer dynamic imports for heavy client modules.
- Reuse `src/components/ui` primitives and existing `src/components/invites`
  patterns before adding new local primitives.
- Conventional commits; branch names ≤ 3 hyphenated words, no type prefix.

## Commands you will need

| Purpose        | Command                                             | Expected on success             |
| -------------- | --------------------------------------------------- | ------------------------------- |
| Install        | `pnpm install`                                      | exit 0                          |
| Add QR dep     | `pnpm add qrcode.react`                             | added to `package.json`, exit 0 |
| Format apply   | `pnpm run format`                                   | rewrites files, exit 0          |
| Format check   | `pnpm run format:check`                             | exit 0                          |
| Lint           | `pnpm run lint`                                     | exit 0                          |
| Typecheck      | `pnpm run typecheck`                                | exit 0, no errors               |
| Tests (all)    | `pnpm run test`                                     | all pass                        |
| Tests (filter) | `pnpm run test -- src/server/admin/invites.test.ts` | new tests pass                  |

Do **not** run `pnpm run build` — AGENTS.md forbids it during normal work.
No database schema change is involved, so `db:*` scripts are not needed.

## Suggested executor toolkit

- Use the `vercel-react-best-practices` skill when writing the two new client
  dialog components (keep them lazy where sensible; the QR renderer is a good
  candidate for a dynamic import so `qrcode.react` is not in the main bundle).
- Reference `src/server/email/templates/verify-email.tsx` as the template
  skeleton and `src/components/invites/invite-form-dialog.tsx` as the
  form-dialog skeleton — copy their structure rather than inventing new shapes.

## Scope

**In scope** (the only files you should modify or create):

- `src/server/email/templates/invite.tsx` (create) — new email template.
- `src/server/admin/invites.ts` (edit) — add `sendInviteEmailService`.
- `src/lib/schemas.ts` (edit) — add `sendInviteEmailSchema`.
- `src/server/rate-limit.ts` (edit) — add two limiters.
- `src/server/orpc/procedures.ts` (edit) — add `admin.invites.sendEmail`.
- `src/lib/i18n/messages/en.ts` (edit) — new strings.
- `src/lib/i18n/messages/de.ts` (edit) — new strings (German).
- `src/lib/i18n/messages/types.ts` (edit) — type the new strings.
- `src/components/invites/invite-email-dialog.tsx` (create) — email dialog.
- `src/components/invites/invite-qr-dialog.tsx` (create) — QR dialog.
- `src/components/invites/invites-grid.tsx` (edit) — wire the two actions.
- `package.json` + `pnpm-lock.yaml` (edit) — add `qrcode.react`.
- `src/server/admin/invites.test.ts` (create) — service tests.
- `plans/README.md` (create/update) — status row.

**Out of scope** (do NOT touch, even though they look related):

- `src/components/invites/invite-form-dialog.tsx` — the task brief floats
  "probably the invite form dialog" as a home for the email action, but
  emailing requires a **persisted** invite (you need a saved `code` and `id`),
  whereas the form dialog operates on unsaved create/edit form state. Putting
  the action there would mean emailing only works after save and duplicates
  the card's send affordance. Keep the email/QR actions on the **card**
  (`InviteCard`), where every invite already has an id and code. Do not modify
  the form dialog.
- `src/server/email/index.ts` — the transport is complete; reuse `sendEmail` /
  `isEmailConfigured` / `EmailApiError` as-is.
- Any Drizzle schema or migration — no persisted data shape changes.
- The public `/invite/[code]` redemption route — unchanged.

## Git workflow

- Branch: `invite-distribution` (≤ 3 words, no slash, no type prefix — per
  AGENTS.md).
- Commit style: conventional commits, e.g.
  `feat(invites): email invite to recipient` and
  `feat(invites): show invite QR code`. Scope `invites`.
- Commit per logical unit (template+service+procedure as the server unit; UI
  as the client unit; i18n can ride along or be its own commit). Order steps so
  the tree typechecks between commits.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Add the recipient-email schema

In `src/lib/schemas.ts`, add near the other invite schemas (after
`updateInviteSchema`, ~line 290):

```ts
/**
 * Send-invite-by-email input — validates the admin-supplied recipient address.
 */
export const sendInviteEmailSchema = z.object({
  inviteId: z.uuid(validation.invalidProfileId),
  email: z.email(validation.invalidEmail),
})
```

Also add a client-form variant used by the dialog (recipient only):

```ts
export const inviteEmailFormSchema = z.object({
  email: z.email(validation.invalidEmail),
})

export type InviteEmailFormValues = z.infer<typeof inviteEmailFormSchema>
```

Note: `z.uuid(...)` and `z.email(...)` are the top-level zod v4 forms already
used in this file (see lines 228, 299). Reuse the existing
`validation.invalidEmail` key — do not add a new validation key.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 2: Create the invite email template

Create `src/server/email/templates/invite.tsx`, copying the structure of
`verify-email.tsx` exactly (same imports, same style-const layout, same
`EmailLayout` usage). Props:

```ts
interface InviteEmailProps {
  inviteUrl: string
  code: string
  serverName?: string
  baseUrl?: string
  locale?: Locale
}
```

The body should render:

- `<Heading>` → `t("emailTemplates.invite.heading", { serverName })`
- intro `<Text>` → `t("emailTemplates.invite.intro", { serverName })`
- a `<Section><Button href={inviteUrl}>` →
  `t("emailTemplates.invite.action")`
- a manual-code label `<Text>` → `t("emailTemplates.invite.manualCode")`
  followed by a `<Text>` showing `{code}` (reuse the monospaced/centered code
  style from `password-reset.tsx`'s `pinCode`/`codeLabel` consts, adapted)
- a muted footer `<Text>` → `t("emailTemplates.invite.footer")`

Export exactly three symbols, mirroring `verify-email.tsx`:

```ts
export function InviteEmailTemplate(props: InviteEmailProps) { ... }
export function getInviteEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.invite.subject", {
    serverName: input.serverName ?? "Jellything",
  })
}
export async function renderInviteEmail(props: InviteEmailProps): Promise<string> {
  return await render(<InviteEmailTemplate {...props} />)
}
```

**Verify**: `pnpm run typecheck` → will still error until Step 5 adds the i18n
keys; that is expected. Re-run typecheck after Step 5.

### Step 3: Add the send service

In `src/server/admin/invites.ts`:

1. Add imports (top of file, matching existing import style — no aliases):

   ```ts
   import { configManager } from "@/lib/server/config.server"
   import { EmailApiError, isEmailConfigured, sendEmail } from "@/server/email"
   import {
     getInviteEmailSubject,
     renderInviteEmail,
   } from "@/server/email/templates/invite"
   ```

   (`db`, `invites`, `profiles`, `eq`, `ErrorCode`, `error`, `success`,
   `ActionResult`, `ensureMigrated`, `createChildLogger` `log` are already
   imported.)

2. Add the service (place it after `deleteInviteService`, ~line 353). It is a
   normal async service returning `ActionResult<null>`. The SMTP send is the
   one legitimate `try`/`catch` boundary:

   ```ts
   export async function sendInviteEmailService(
     inviteId: string,
     recipientEmail: string,
   ): Promise<ActionResult<null>> {
     await ensureMigrated()

     if (!isEmailConfigured()) {
       return error(ErrorCode.EMAIL_SERVICE_ERROR)
     }

     const [invite] = await db
       .select({ id: invites.id, code: invites.code })
       .from(invites)
       .where(eq(invites.id, inviteId))
     if (!invite) {
       return error(ErrorCode.NOT_FOUND, "Invite not found")
     }

     const appUrl = configManager.appUrl
     if (!appUrl) {
       return error(
         ErrorCode.OPERATION_FAILED,
         "Application URL is not configured",
         "errors.applicationUrlNotConfigured",
       )
     }

     const inviteUrl = `${appUrl}/invite/${invite.code}`
     const locale = configManager.defaultLocale
     const serverName = configManager.app.title

     const html = await renderInviteEmail({
       inviteUrl,
       code: invite.code,
       serverName,
       baseUrl: appUrl,
       locale,
     })

     try {
       await sendEmail({
         to: recipientEmail,
         subject: getInviteEmailSubject({ serverName, locale }),
         html,
       })
     } catch (sendError) {
       if (sendError instanceof EmailApiError) {
         return error(ErrorCode.EMAIL_SERVICE_ERROR)
       }
       throw sendError
     }

     log.info({ inviteId, email: recipientEmail }, "Sent invite email")
     return success(null)
   }
   ```

   Confirm the i18n key `errors.applicationUrlNotConfigured` exists (it is used
   the same way in `src/server/me.ts:157`). If it does not exist in this tree,
   drop the third argument and pass only the message string.

**Verify**: `pnpm run typecheck` → exit 0 after Step 5 (depends on template +
i18n). Proceed; typecheck is re-run at the end of Step 5.

### Step 4: Add rate limiters

In `src/server/rate-limit.ts`, after the renewal limiters (~line 145), add a
two-limiter pair mirroring that pattern. Admin is trusted, but the recipient
address is attacker-influenceable (an admin could be tricked, or a compromised
session could spam a target), so keep a modest budget:

```ts
// Admin action, but the recipient address is externally influenced, so keep a
// modest budget. IP-keyed transport limiter plus a per-recipient limiter
// enforced in the handler to stop mail-bombing a single address.
export const sendInviteEmailLimiter = createLimiter({
  keyPrefix: "send_invite_email",
  points: 20,
  duration: 60 * 60,
  blockDuration: 30 * 60,
})

export const sendInviteEmailIdentifierLimiter = createLimiter({
  keyPrefix: "send_invite_email_identifier",
  points: 5,
  duration: 60 * 60,
  blockDuration: 60 * 60,
})
```

**Verify**: `pnpm run typecheck` → exit 0 (these are standalone exports).

### Step 5: Add all i18n strings (en, de, types) — do all three together

Add a new `emailTemplates.invite` block and new `invites.*` UI keys. The three
files must stay in lockstep or typecheck fails.

**`src/lib/i18n/messages/types.ts`** — in the `emailTemplates` interface
(after the `expiryWarning` block, ~line 588) add:

```ts
invite: {
  subject: string
  preview: string
  heading: string
  intro: string
  action: string
  manualCode: string
  footer: string
}
```

In the `invites` interface (near the other invite keys, ~line 242+) add:

```ts
emailInvite: string
showQrCode: string
emailInviteTitle: string
emailInviteDescription: string
recipientEmailLabel: string
recipientEmailPlaceholder: string
inviteEmailSent: string
inviteEmailSendFailed: string
qrCodeTitle: string
qrCodeDescription: string
```

**`src/lib/i18n/messages/en.ts`** — in `emailTemplates` (after
`expiryWarning`, ~line 670) add:

```ts
    invite: {
      subject: "You're invited to {serverName}",
      preview: "Your invite to {serverName}",
      heading: "You're invited to {serverName}",
      intro:
        "You've been invited to create an account on {serverName}. Click the button below to get started:",
      action: "Accept Invite",
      manualCode: "Or enter this invite code on the join page:",
      footer:
        "If you weren't expecting this invite, you can safely ignore this email.",
    },
```

In `invites` (alongside `copyInviteLink`, ~line 307) add:

```ts
    emailInvite: "Email invite",
    showQrCode: "Show QR code",
    emailInviteTitle: "Email invite",
    emailInviteDescription:
      "Send the invite link straight to someone's inbox.",
    recipientEmailLabel: "Recipient email",
    recipientEmailPlaceholder: "name@example.com",
    inviteEmailSent: "Invite email sent",
    inviteEmailSendFailed: "Failed to send invite email",
    qrCodeTitle: "Invite QR code",
    qrCodeDescription: "Scan this code to open the invite link.",
```

**`src/lib/i18n/messages/de.ts`** — in `emailTemplates` (after
`expiryWarning`, ~line 685) add:

```ts
    invite: {
      subject: "Du wurdest zu {serverName} eingeladen",
      preview: "Deine Einladung zu {serverName}",
      heading: "Du wurdest zu {serverName} eingeladen",
      intro:
        "Du wurdest eingeladen, ein Konto bei {serverName} zu erstellen. Klicke auf die Schaltfläche unten, um zu starten:",
      action: "Einladung annehmen",
      manualCode: "Oder gib diesen Einladungscode auf der Beitrittsseite ein:",
      footer:
        "Wenn du diese Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.",
    },
```

In `invites` (alongside `copyInviteLink`, ~line 312) add:

```ts
    emailInvite: "Einladung per E-Mail",
    showQrCode: "QR-Code anzeigen",
    emailInviteTitle: "Einladung per E-Mail",
    emailInviteDescription:
      "Sende den Einladungslink direkt in das Postfach einer Person.",
    recipientEmailLabel: "E-Mail des Empfängers",
    recipientEmailPlaceholder: "name@beispiel.de",
    inviteEmailSent: "Einladungs-E-Mail gesendet",
    inviteEmailSendFailed: "Einladungs-E-Mail konnte nicht gesendet werden",
    qrCodeTitle: "Einladungs-QR-Code",
    qrCodeDescription: "Scanne diesen Code, um den Einladungslink zu öffnen.",
```

**Verify**: `pnpm run typecheck` → exit 0 (Steps 2–3 templates/services now
resolve their keys). If typecheck complains about a missing key, a name is
mismatched across the three files — fix and rerun.

### Step 6: Add the ORPC `admin.invites.sendEmail` procedure

In `src/server/orpc/procedures.ts`:

1. Add to the import from `@/server/admin/invites` (lines 21–26):
   `sendInviteEmailService`.
2. Add to the import from `@/lib/schemas` (lines 6–19): `sendInviteEmailSchema`.
3. Add to the import from `@/server/rate-limit` (lines 97–117):
   `sendInviteEmailLimiter`, `sendInviteEmailIdentifierLimiter`.
4. In `adminProcedures.invites` (after `delete`, ~line 435) add:

   ```ts
   sendEmail: configuredAdminProcedure
     .use(rateLimitMiddleware(sendInviteEmailLimiter))
     .input(sendInviteEmailSchema)
     .handler(async ({ input, context }) => {
       await enforceRateLimit(
         sendInviteEmailIdentifierLimiter,
         buildRateLimitKey("send_invite_email", input.email),
       )
       unwrapActionResultOrThrow(
         await sendInviteEmailService(input.inviteId, input.email),
       )
       return null
     }),
   ```

   `rateLimitMiddleware`, `enforceRateLimit`, and `buildRateLimitKey` are
   already imported in this file. Note `configuredAdminProcedure` already
   composes the same-origin, admin, and configured guards.

**Verify**: `pnpm run typecheck` → exit 0. The browser client type
`client.admin.invites.sendEmail` is now inferred automatically (no contract
file edit needed).

### Step 7: Add the QR dependency and QR dialog

1. `pnpm add qrcode.react` — this is the recommended approach over inline SVG
   generation. **Rationale**: QR encoding is genuinely non-trivial (Reed–Solomon
   error correction, mask selection); hand-rolling ~600 lines of encoding math
   inline would violate the repo's maintainability priority and AGENTS.md's
   "don't add isolated local logic that will become hard to maintain". The
   `qrcode` npm package is server/canvas-oriented and heavier; `qrcode.react`
   renders a pure client-side `<QRCodeSVG>` with no canvas/node dependency, is
   React 19 compatible (v4+), and adds a single small transitive dep
   (`qrcode-generator`). This is the leanest option that clears the bar. If the
   install reports a React 19 peer-dependency conflict, STOP and report (see
   STOP conditions) rather than forcing it.

2. Create `src/components/invites/invite-qr-dialog.tsx` (client component).
   Lazy-load the QR renderer so it stays out of the main bundle. Shape:

   ```tsx
   "use client"

   import { lazy, Suspense } from "react"

   import {
     Dialog,
     DialogContent,
     DialogDescription,
     DialogHeader,
     DialogTitle,
   } from "@/components/ui/dialog"
   import { Spinner } from "@/components/ui/spinner"
   import { useTranslations } from "@/lib/i18n"

   const QRCodeSVG = lazy(async () => ({
     default: (await import("qrcode.react")).QRCodeSVG,
   }))

   interface InviteQrDialogProps {
     open: boolean
     onOpenChange: (open: boolean) => void
     code: string | null
   }

   export function InviteQrDialog({
     open,
     onOpenChange,
     code,
   }: InviteQrDialogProps) {
     const t = useTranslations()
     const url = code ? `${window.location.origin}/invite/${code}` : ""

     return (
       <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-sm">
           <DialogHeader>
             <DialogTitle>{t("invites.qrCodeTitle")}</DialogTitle>
             <DialogDescription>
               {t("invites.qrCodeDescription")}
             </DialogDescription>
           </DialogHeader>
           <div className="flex flex-col items-center gap-3 py-4">
             {code && (
               <Suspense fallback={<Spinner />}>
                 <div className="rounded-lg bg-white p-4">
                   <QRCodeSVG value={url} size={224} />
                 </div>
               </Suspense>
             )}
             <p className="text-muted-foreground font-mono text-xs break-all">
               {url}
             </p>
           </div>
         </DialogContent>
       </Dialog>
     )
   }
   ```

   Note: the `bg-white p-4` wrapper keeps the QR scannable in dark mode
   (QR needs a light quiet-zone). `DialogClose` / overlay come from the shared
   dialog primitive automatically.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 8: Add the email dialog

Create `src/components/invites/invite-email-dialog.tsx` (client component),
copying the form-dialog pattern from `invite-form-dialog.tsx`
(`react-hook-form` + `zodResolver`, `getBrowserORPCClient` + `runApiEffect`,
`toast`, `reportClientError`). Shape:

```tsx
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { reportClientError } from "@/lib/client-error"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import {
  inviteEmailFormSchema,
  type InviteEmailFormValues,
} from "@/lib/schemas"

interface InviteEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inviteId: string | null
}

export function InviteEmailDialog({
  open,
  onOpenChange,
  inviteId,
}: InviteEmailDialogProps) {
  const t = useTranslations()
  const form = useForm<InviteEmailFormValues>({
    resolver: zodResolver(inviteEmailFormSchema),
    defaultValues: { email: "" },
  })

  async function onSubmit(data: InviteEmailFormValues): Promise<void> {
    if (!inviteId) return
    try {
      const result = await runApiEffect(
        getBrowserORPCClient().admin.invites.sendEmail({
          inviteId,
          email: data.email,
        }),
      )
      if (result.error === null) {
        toast.success(t("invites.inviteEmailSent"))
        onOpenChange(false)
        form.reset({ email: "" })
        return
      }
      toast.error(t("invites.inviteEmailSendFailed"))
    } catch (err) {
      reportClientError(err)
      toast.error(t("invites.inviteEmailSendFailed"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("invites.emailInviteTitle")}</DialogTitle>
          <DialogDescription>
            {t("invites.emailInviteDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>{t("invites.recipientEmailLabel")}</FieldLabel>
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  placeholder={t("invites.recipientEmailPlaceholder")}
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={form.formState.isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? t("common.sending")
                : t("invites.emailInvite")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

Confirm the shared `Field`, `FieldLabel`, `FieldError` exports and
`common.sending` i18n key exist (they are used in `invite-form-dialog.tsx` and
`types.ts` `common.sending` respectively). If `runApiEffect` returns a shape
where a failed call still resolves with `result.error !== null`, the code above
already handles it; the `catch` covers thrown transport errors.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 9: Wire the two actions into the invites grid

In `src/components/invites/invites-grid.tsx`:

1. Import the two new dialogs and add `Mail` and `QrCode` to the existing
   `lucide-react` import (line 5):

   ```ts
   import {
     Ban,
     Clock,
     Copy,
     Edit,
     Mail,
     Plus,
     QrCode,
     Trash,
     Tv,
     Users,
   } from "lucide-react"
   ```

   ```ts
   import { InviteEmailDialog } from "@/components/invites/invite-email-dialog"
   import { InviteQrDialog } from "@/components/invites/invite-qr-dialog"
   ```

2. Extend `InviteCard`'s props with `onEmail: (invite: InviteDto) => void` and
   `onShowQr: (code: string) => void`, and add two icon `Button`s in the action
   row (between Copy and Edit, matching the existing button shape — `variant`
   `ghost`, `size` `icon`, `className="h-7 w-7"`, `aria-label`/`title` from
   `t("invites.emailInvite")` / `t("invites.showQrCode")`, icons `Mail` /
   `QrCode` at `h-3.5 w-3.5`). Thread the same two props through `InviteSection`
   (which already forwards card handlers).

3. In `InvitesGrid`, add dialog state using the existing `useSimpleDialog`
   pattern already imported, plus a piece of state for the selected invite.
   Simplest approach mirroring the existing `createDialog`:

   ```ts
   const emailDialog = useSimpleDialog()
   const qrDialog = useSimpleDialog()
   const [emailInviteId, setEmailInviteId] = useState<string | null>(null)
   const [qrInviteCode, setQrInviteCode] = useState<string | null>(null)
   ```

   Add `useState` to the `react` import (line 6). Add handlers:

   ```ts
   const handleEmailInvite = useCallback(
     (invite: InviteDto) => {
       setEmailInviteId(invite.id)
       emailDialog.open()
     },
     [emailDialog],
   )

   const handleShowQr = useCallback(
     (code: string) => {
       setQrInviteCode(code)
       qrDialog.open()
     },
     [qrDialog],
   )
   ```

4. Add `onEmail: handleEmailInvite` and `onShowQr: handleShowQr` to the
   `sharedCardProps` object (line 484).

5. Render the two dialogs near the other dialogs at the bottom of the returned
   JSX:

   ```tsx
   <InviteEmailDialog
     open={emailDialog.isOpen}
     onOpenChange={(open) => {
       if (!open) emailDialog.close()
     }}
     inviteId={emailInviteId}
   />
   <InviteQrDialog
     open={qrDialog.isOpen}
     onOpenChange={(open) => {
       if (!open) qrDialog.close()
     }}
     code={qrInviteCode}
   />
   ```

   Confirm `useSimpleDialog()` exposes `isOpen` / `open()` / `close()` — it is
   already used for `createDialog` in this file, so match that exact usage. If
   its API differs, adapt to the shape observed at `createDialog`.

**Verify**:

- `pnpm run typecheck` → exit 0
- `pnpm run lint` → exit 0
- `pnpm run format:check` → exit 0 (run `pnpm run format` first if it fails)

### Step 10: Tests

Create `src/server/admin/invites.test.ts`. Model the mock/DB setup after
`src/server/invites.test.ts` (which mocks `@/lib/server/config.server`,
`@/server/email`, and the email template modules) and use the temp-SQLite
helper from `src/test/db.ts` as in `src/server/tokens.test.ts`.

AGENTS.md says "avoid mocks", but the email boundary is the established
exception — `src/server/invites.test.ts` already mocks `@/server/email`
because actually opening an SMTP connection in a unit test is not feasible.
Follow that existing pattern; do not invent an SMTP integration.

Cover these cases for `sendInviteEmailService`:

1. **Email not configured** → returns
   `error(ErrorCode.EMAIL_SERVICE_ERROR)` (mock `isEmailConfigured` → `false`);
   `sendEmail` is never called.
2. **Unknown invite id** → with email configured, an id not in the DB returns
   `error(ErrorCode.NOT_FOUND)`.
3. **Happy path** → seed a profile + invite via the test db, mock
   `isEmailConfigured` → `true` and `renderInviteEmail`/`getInviteEmailSubject`,
   assert `sendEmail` was called once with `to` = recipient and a subject
   string, and the service returns `success(null)`.
4. **SMTP failure** → make the mocked `sendEmail` reject with
   `new EmailApiError("boom")`; assert the service returns
   `error(ErrorCode.EMAIL_SERVICE_ERROR)` (not a throw). Note: to construct an
   `EmailApiError` in the test while `@/server/email` is mocked, export the real
   class from the mock factory (re-export the actual class) or assert on the
   returned `ErrorCode` after having the mock throw an instance created from a
   locally-imported real `EmailApiError` — mirror however `invites.test.ts`
   handles email-module mocking.

**Verify**: `pnpm run test -- src/server/admin/invites.test.ts` → all new tests
pass; then `pnpm run test` → whole suite green.

## Test plan

- New file `src/server/admin/invites.test.ts` with the four cases above
  (email-not-configured, unknown-invite, happy-path, smtp-failure).
- Structural pattern: mock setup from `src/server/invites.test.ts`; DB seeding
  from `src/test/db.ts` as used in `src/server/tokens.test.ts`.
- No new client-component tests (the repo has no React component test harness;
  UI is covered by typecheck + lint + manual smoke).
- Verification: `pnpm run test` → all pass, including the 4 new tests.
- Manual smoke (optional, if a dev server is already running — do NOT start a
  production build): open the invites dashboard, click the mail icon on a card,
  send to a test address, confirm the toast and (with SMTP configured) the
  received email; click the QR icon and confirm a scannable code renders in
  both light and dark themes.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run format:check` exits 0
- [ ] `pnpm run lint` exits 0
- [ ] `pnpm run typecheck` exits 0
- [ ] `pnpm run test` exits 0; the 4 new tests in
      `src/server/admin/invites.test.ts` exist and pass
- [ ] `grep -rn "sendInviteEmailService" src/server` returns the service
      definition and its procedure call site
- [ ] `grep -n "emailTemplates.invite\|invite:" src/lib/i18n/messages/types.ts`
      shows the new `emailTemplates.invite` type block, and the same keys exist
      in both `en.ts` and `de.ts` (typecheck enforces this)
- [ ] `qrcode.react` appears in `package.json` dependencies
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for plan 002 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the
  codebase drifted since commit `871bd4b` — the drift-check diff is non-empty
  for an in-scope file and the excerpt no longer matches).
- `pnpm add qrcode.react` fails or reports an unresolved React 19 peer-dep
  conflict. (Fallback to specify, but do not implement without approval:
  `qrcode-generator` + a small custom `<svg>` renderer.)
- `configManager.appUrl`, `configManager.app.title`, or
  `configManager.defaultLocale` no longer exist with those shapes, or
  `EmailApiError` / `isEmailConfigured` / `sendEmail` are no longer exported
  from `@/server/email`.
- The i18n key `errors.applicationUrlNotConfigured` does not exist and you
  cannot confirm the correct key for the "app URL not configured" case.
- `useSimpleDialog()` or `runApiEffect`/`getBrowserORPCClient` no longer match
  the usage observed in `invites-grid.tsx` / `invite-form-dialog.tsx`.
- Any verification command fails twice after a reasonable fix attempt.
- The work appears to require touching an out-of-scope file (especially
  `invite-form-dialog.tsx` or `src/server/email/index.ts`).

## Maintenance notes

For the human/agent who owns this after it lands:

- **Recipient locale**: invite emails are sent in `configManager.defaultLocale`
  because the recipient has no account yet. If per-recipient locale selection is
  ever desired, add a locale field to the email dialog and thread it through
  `sendInviteEmailService` → `renderInviteEmail`/`getInviteEmailSubject`.
- **Rate-limit budgets**: `sendInviteEmailLimiter` (20/hr per IP) and
  `sendInviteEmailIdentifierLimiter` (5/hr per recipient) are starting values.
  Without `TRUST_PROXY=true` all traffic shares the "unknown" IP bucket
  (see AGENTS.md), so the per-recipient limiter is the real backstop against
  mail-bombing a single address — tune it, not the IP one, if abuse appears.
- **QR bundle cost**: `qrcode.react` is lazy-loaded in `invite-qr-dialog.tsx`;
  keep it lazy so it never enters the main dashboard bundle.
- **What a reviewer should scrutinize**: (1) that `sendInviteEmailService`
  returns `EMAIL_SERVICE_ERROR` rather than throwing on SMTP failure; (2) that
  the email/QR actions live on the card, not the form dialog (deliberate — see
  Scope); (3) that the QR quiet-zone stays light in dark mode.
- **Deferred out of scope**: a bulk "email invite to N recipients" flow, and
  copy-with-QR-in-one-dialog; both are follow-ups, not part of this plan.
