import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { loginSchema } from "@/lib/schemas"
import type { SessionData } from "@/lib/session"
import { safeParse } from "@/lib/validation"
import { authenticateUser } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"
import {
  deleteRequestCookie,
  getRequestCookie,
  setRequestCookie,
} from "@/server/request-context"
import {
  createAuthSession,
  getSessionRecordFromCookie,
  replaceAllUserSessions,
  revokeAuthSessionByCookie,
  sessionCookieConfig,
  SESSION_COOKIE_NAME,
  updateAuthSession,
} from "@/server/session"
import { getSessionDataForUser } from "@/server/session-resolver"
import { enforceExpiredUserAccess } from "@/server/user-access"
import { isUserExpired } from "@/server/user-expiry"
import { ensureUserRecord } from "@/server/user-lifecycle"

const log = createChildLogger({ module: "auth" })

export async function establishAuthenticatedSession(input: {
  userId: string
  displayName: string
  isAdmin: boolean
  jellyfinAccessToken: string
  jellyfinDeviceId: string
}): Promise<void> {
  const currentCookieValue = getRequestCookie(SESSION_COOKIE_NAME)

  if (currentCookieValue) {
    await revokeAuthSessionByCookie(currentCookieValue)
  }

  const session = await createAuthSession({
    userId: input.userId,
    displayName: input.displayName,
    isAdmin: input.isAdmin,
    jellyfinAccessToken: input.jellyfinAccessToken,
    jellyfinDeviceId: input.jellyfinDeviceId,
  })

  setRequestCookie(
    SESSION_COOKIE_NAME,
    session.cookieValue,
    sessionCookieConfig,
  )
}

export async function replaceAuthenticatedSession(input: {
  userId: string
  displayName: string
  isAdmin: boolean
  jellyfinAccessToken: string
  jellyfinDeviceId: string
}): Promise<void> {
  const session = await replaceAllUserSessions(input)

  setRequestCookie(
    SESSION_COOKIE_NAME,
    session.cookieValue,
    sessionCookieConfig,
  )
}

export function clearAuthCookies(): void {
  deleteRequestCookie(SESSION_COOKIE_NAME, { path: sessionCookieConfig.path })
  deleteRequestCookie("session", { path: sessionCookieConfig.path })
}

export async function clearAuthenticatedSession(): Promise<void> {
  const currentCookieValue = getRequestCookie(SESSION_COOKIE_NAME)

  if (currentCookieValue) {
    await revokeAuthSessionByCookie(currentCookieValue)
  }

  clearAuthCookies()
}

export async function updateCurrentSessionIdentity(updates: {
  displayName?: string
  isAdmin?: boolean
}): Promise<void> {
  const currentCookieValue = getRequestCookie(SESSION_COOKIE_NAME)
  const sessionRecord = await getSessionRecordFromCookie(currentCookieValue)

  if (!sessionRecord) {
    return
  }

  await updateAuthSession(sessionRecord.id, {
    displayNameSnapshot: updates.displayName,
    isAdminSnapshot: updates.isAdmin,
  })
}

export async function login(input: {
  username: string
  password: string
}): Promise<ActionResult<SessionData>> {
  const parsed = safeParse(loginSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  try {
    const jellyfinDeviceId = crypto.randomUUID()
    const authResult = await authenticateUser(
      parsed.data.username,
      parsed.data.password,
      jellyfinDeviceId,
    )
    const user = await ensureUserRecord(authResult.id)

    if (isUserExpired(user, authResult.isAdmin)) {
      try {
        await enforceExpiredUserAccess({
          userId: authResult.id,
          userName: authResult.name,
          expiresAt: user.expiresAt,
          isAdmin: authResult.isAdmin,
          isDisabled: false,
        })
      } catch (err) {
        log.warn(
          { err, userId: authResult.id, username: authResult.name },
          "Failed to disable expired user in Jellyfin during login rejection",
        )
      }
      log.info(
        { userId: authResult.id, username: authResult.name },
        "Rejected login for expired user",
      )
      return error(ErrorCode.ACCOUNT_EXPIRED)
    }

    await establishAuthenticatedSession({
      userId: authResult.id,
      displayName: authResult.name,
      isAdmin: authResult.isAdmin,
      jellyfinAccessToken: authResult.accessToken,
      jellyfinDeviceId,
    })
    log.info(
      {
        userId: authResult.id,
        username: authResult.name,
        isAdmin: authResult.isAdmin,
      },
      "User logged in successfully",
    )

    return success(
      await getSessionDataForUser({
        userId: authResult.id,
        name: authResult.name,
        isAdmin: authResult.isAdmin,
      }),
    )
  } catch (err) {
    log.warn({ username: parsed.data.username, err }, "Login failed for user")
    return error(ErrorCode.INVALID_CREDENTIALS)
  }
}

export async function logout(): Promise<ActionResult<null>> {
  await clearAuthenticatedSession()

  log.info("User logged out")

  return success(null)
}
