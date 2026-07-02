import { eq } from "drizzle-orm"

import type { SessionData } from "@/lib/session"
import { db } from "@/server/db.server"
import { users } from "@/server/db/schema"
import { validateUserAccessToken } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"
import {
  getSessionRecordFromCookie,
  isSessionValidationBackedOff,
  isSessionValidationStale,
  isWithinUnavailableGracePeriod,
  revokeAuthSession,
  SESSION_VALIDATION_BACKOFF_MS,
  touchAuthSession,
  updateAuthSession,
  type SessionRecord,
} from "@/server/session"
import { getSessionDataForUser } from "@/server/session-data"
import { enforceExpiredUserAccess } from "@/server/user-access"
import { isUserExpired } from "@/server/user-expiry"
import { ensureUserRecord } from "@/server/users"

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
