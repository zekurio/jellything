import "@tanstack/react-start/server-only"
import { and, eq, gt, isNotNull } from "drizzle-orm"

import { isValidLocale } from "@/lib/i18n"
import type { SessionData } from "@/lib/session"
import { db } from "@/server/db"
import { emailVerificationTokens, users } from "@/server/db/schema"
import { getUserAvatarUrl, validateUserAccessToken } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"
import { getRequestCookie } from "@/server/request-context"
import {
  getSessionRecordFromCookie,
  isSessionValidationBackedOff,
  isSessionValidationStale,
  isWithinUnavailableGracePeriod,
  revokeAuthSession,
  SESSION_COOKIE_NAME,
  SESSION_VALIDATION_BACKOFF_MS,
  touchAuthSession,
  updateAuthSession,
  type SessionRecord,
} from "@/server/session"
import { enforceExpiredUserAccess } from "@/server/user-access"
import { isUserExpired } from "@/server/user-expiry"
import { ensureUserRecord } from "@/server/user-lifecycle"

const log = createChildLogger({ module: "session-resolver" })

export type ResolvedSessionData = SessionData

export type SessionResolutionStatus =
  | "authenticated"
  | "reauth-required"
  | "unauthenticated"
  | "upstream-unreachable"

export interface ResolveSessionResult {
  status: SessionResolutionStatus
  session: ResolvedSessionData | null
  sessionRecord: SessionRecord | null
}

export interface ResolveSessionOptions {
  validationMode?: "never" | "if-stale" | "force"
  allowStaleOnJellyfinFailure?: boolean
  touch?: boolean
}

export interface SessionFromCookiesResult {
  status: SessionResolutionStatus
  session: ResolvedSessionData | null
  hasCookie: boolean
  shouldClearCookie: boolean
}

/**
 * Hydrate the full, client-safe session payload for a user from persisted state
 * (current email/verification, locale, avatar). Used both when resolving an
 * active session and when a service needs a fresh session snapshot after a
 * profile change.
 */
export async function getSessionDataForUser(input: {
  userId: string
  name: string
  isAdmin: boolean
}): Promise<SessionData> {
  let user = await db.query.users.findFirst({
    where: eq(users.userId, input.userId),
  })

  if (!user) {
    user = await ensureUserRecord(input.userId)
  }

  const [pendingVerification] = await db
    .select({
      pendingEmail: emailVerificationTokens.pendingEmail,
    })
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, input.userId),
        gt(emailVerificationTokens.expiresAt, new Date()),
        isNotNull(emailVerificationTokens.pendingEmail),
      ),
    )
    .limit(1)

  const locale = user.locale && isValidLocale(user.locale) ? user.locale : null
  const email = pendingVerification?.pendingEmail ?? user.email
  const emailVerified = pendingVerification ? false : user.emailVerified

  return {
    userId: input.userId,
    name: input.name,
    avatarUrl: getUserAvatarUrl(input.userId),
    isAdmin: input.isAdmin,
    email,
    emailVerified,
    locale,
    createdAt: user.createdAt.toISOString(),
  }
}

async function hydrateSession(
  record: SessionRecord,
): Promise<ResolvedSessionData> {
  return getSessionDataForUser({
    userId: record.userId,
    name: record.displayNameSnapshot,
    isAdmin: record.isAdminSnapshot,
  })
}

async function rejectExpiredUserSession(
  record: SessionRecord,
): Promise<boolean> {
  let user = await db.query.users.findFirst({
    where: eq(users.userId, record.userId),
  })
  if (!user) {
    user = await ensureUserRecord(record.userId)
  }

  if (!isUserExpired(user, record.isAdminSnapshot)) {
    return false
  }

  try {
    await enforceExpiredUserAccess({
      userId: record.userId,
      userName: record.displayNameSnapshot,
      expiresAt: user.expiresAt,
      isAdmin: record.isAdminSnapshot,
      isDisabled: false,
    })
  } catch (err) {
    log.warn(
      { err, sessionId: record.id, userId: record.userId },
      "Failed to disable expired user in Jellyfin; revoking local session anyway",
    )
  }
  await revokeAuthSession(record.id)
  log.info(
    { sessionId: record.id, userId: record.userId },
    "Revoked auth session for expired user",
  )
  return true
}

async function refreshExternalSession(
  record: SessionRecord,
  options: ResolveSessionOptions,
): Promise<
  | { type: "ok"; record: SessionRecord }
  | { type: "reauth-required" }
  | { type: "upstream-unreachable"; allowStale: boolean }
> {
  const validation = await validateUserAccessToken(
    record.jellyfinAccessToken,
    record.jellyfinDeviceId,
  )

  if (validation.status === "invalid") {
    await revokeAuthSession(record.id)
    log.info(
      { sessionId: record.id, userId: record.userId },
      "Revoked auth session after Jellyfin rejected token",
    )
    return { type: "reauth-required" }
  }

  if (validation.status === "unreachable") {
    const allowStale =
      options.allowStaleOnJellyfinFailure === true &&
      isWithinUnavailableGracePeriod(record)

    log.warn(
      {
        sessionId: record.id,
        userId: record.userId,
        error: validation.error,
        allowStale,
      },
      "Failed to refresh Jellyfin-backed auth session",
    )

    await updateAuthSession(record.id, {
      validationBlockedUntil: Date.now() + SESSION_VALIDATION_BACKOFF_MS,
    })

    return { type: "upstream-unreachable", allowStale }
  }

  if (validation.user.id !== record.userId || validation.user.isDisabled) {
    await revokeAuthSession(record.id)
    log.warn(
      {
        sessionId: record.id,
        userId: record.userId,
        validatedUserId: validation.user.id,
        disabled: validation.user.isDisabled,
      },
      "Revoked auth session after Jellyfin identity mismatch or disablement",
    )
    return { type: "reauth-required" }
  }

  const refreshedRecord: SessionRecord = {
    ...record,
    displayNameSnapshot: validation.user.name,
    isAdminSnapshot: validation.user.isAdmin,
    lastValidatedAt: Date.now(),
  }

  await updateAuthSession(record.id, {
    displayNameSnapshot: refreshedRecord.displayNameSnapshot,
    isAdminSnapshot: refreshedRecord.isAdminSnapshot,
    lastValidatedAt: refreshedRecord.lastValidatedAt,
    validationBlockedUntil: null,
  })

  return { type: "ok", record: refreshedRecord }
}

export async function resolveSession(
  sessionCookieValue: string | undefined,
  options: ResolveSessionOptions = {},
): Promise<ResolveSessionResult> {
  const validationMode = options.validationMode ?? "if-stale"
  let record = await getSessionRecordFromCookie(sessionCookieValue)

  if (!record) {
    return {
      status: "unauthenticated",
      session: null,
      sessionRecord: null,
    }
  }

  let status: SessionResolutionStatus = "authenticated"
  const shouldValidate =
    validationMode === "force" ||
    (validationMode === "if-stale" &&
      isSessionValidationStale(record) &&
      !isSessionValidationBackedOff(record))

  if (shouldValidate) {
    const refreshed = await refreshExternalSession(record, options)

    if (refreshed.type === "reauth-required") {
      return {
        status: "reauth-required",
        session: null,
        sessionRecord: null,
      }
    }

    if (refreshed.type === "upstream-unreachable") {
      if (!refreshed.allowStale) {
        return {
          status: "upstream-unreachable",
          session: null,
          sessionRecord: record,
        }
      }

      status = "upstream-unreachable"
      record = {
        ...record,
        validationBlockedUntil: Date.now() + SESSION_VALIDATION_BACKOFF_MS,
      }
    } else {
      record = refreshed.record
    }
  }

  if (await rejectExpiredUserSession(record)) {
    return {
      status: "reauth-required",
      session: null,
      sessionRecord: null,
    }
  }

  if (options.touch !== false) {
    await touchAuthSession(record.id)
    record = {
      ...record,
      lastSeenAt: Date.now(),
    }
  }

  return {
    status,
    session: await hydrateSession(record),
    sessionRecord: record,
  }
}

/**
 * Request-facing entry point: read the session cookie from the current request
 * context and resolve it. Returns `null` when there is no usable session, along
 * with whether a stale cookie should be cleared from the browser.
 */
export async function resolveSessionFromCookies(
  options: ResolveSessionOptions = {},
): Promise<SessionFromCookiesResult | null> {
  const sessionCookieValue = getRequestCookie(SESSION_COOKIE_NAME)
  const hasCookie = Boolean(sessionCookieValue)

  const resolved = await resolveSession(sessionCookieValue, {
    validationMode: options.validationMode ?? "if-stale",
    allowStaleOnJellyfinFailure: options.allowStaleOnJellyfinFailure ?? false,
    touch: options.touch,
  })

  if (resolved.status === "unauthenticated") {
    return null
  }

  return {
    status: resolved.status,
    session: resolved.session,
    hasCookie,
    shouldClearCookie:
      hasCookie &&
      resolved.status !== "upstream-unreachable" &&
      !resolved.session,
  }
}
