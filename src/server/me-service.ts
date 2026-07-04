import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { resolveLocale } from "@/lib/i18n"
import type { MyExpiryInfo } from "@/lib/renewal-types"
import {
  changePasswordSchema,
  MAX_AVATAR_BYTES,
  normalizeEmail,
  removeAvatarSchema,
  updateMyAccountSchema,
  uploadAvatarSchema,
} from "@/lib/schemas"
import { getSession } from "@/lib/server/auth"
import { configManager } from "@/lib/server/config.server"
import type { SessionData } from "@/lib/session"
import {
  clearAuthenticatedSession,
  updateCurrentSessionIdentity,
} from "@/server/auth-service"
import { db, ensureMigrated } from "@/server/db.server"
import { users } from "@/server/db/schema"
import { EmailApiError, sendEmail, isEmailConfigured } from "@/server/email"
import {
  getVerifyEmailSubject,
  renderVerifyEmail,
} from "@/server/email/templates/verify-email"
import {
  JellyfinApiError,
  adminResetUserPassword,
  authenticateUser,
  deleteUser,
  deleteUserAvatar,
  getUserById,
  updateUserName,
  uploadUserAvatar,
} from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"
import { evaluateRenewal, type RenewalEvaluation } from "@/server/renewal"
import { revokeAllUserSessions } from "@/server/session"
import { getSessionDataForUser } from "@/server/session-data"
import {
  createEmailVerificationToken,
  deleteEmailVerificationToken,
} from "@/server/tokens"
import { deleteAppUserData, deleteLinkedSeerrUser } from "@/server/users"

const log = createChildLogger({ module: "me-service" })

function resolveWorkflowSession(
  session: SessionData | undefined,
): Promise<SessionData | null> {
  return session ? Promise.resolve(session) : getSession()
}

export async function updateMyAccount(
  input: z.infer<typeof updateMyAccountSchema>,
  sessionOverride?: SessionData,
): Promise<ActionResult<SessionData>> {
  const session = await resolveWorkflowSession(sessionOverride)
  if (!session) {
    return error(ErrorCode.UNAUTHORIZED)
  }

  const parsed = updateMyAccountSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  await ensureMigrated()

  const nextName = parsed.data.name ?? session.name
  const nextLocale =
    parsed.data.locale !== undefined ? parsed.data.locale : session.locale
  const requestedEmail =
    parsed.data.email === undefined
      ? undefined
      : parsed.data.email === null
        ? null
        : normalizeEmail(parsed.data.email)
  const appUrl = configManager.appUrl

  // Validate all email-change prerequisites before any durable Jellyfin or
  // database mutation, so a predictable failure cannot leave the username or
  // locale already changed while the account update reports failure.
  if (
    requestedEmail !== undefined &&
    requestedEmail !== null &&
    requestedEmail !== (session.email ?? null)
  ) {
    const [existingUser] = await db
      .select({ userId: users.userId })
      .from(users)
      .where(
        and(eq(users.email, requestedEmail), ne(users.userId, session.userId)),
      )

    if (existingUser) {
      return error(ErrorCode.EMAIL_TAKEN)
    }

    if (!isEmailConfigured()) {
      return error(ErrorCode.EMAIL_NOT_CONFIGURED)
    }

    if (!appUrl) {
      return error(
        ErrorCode.OPERATION_FAILED,
        "Application URL is not configured",
        "errors.applicationUrlNotConfigured",
      )
    }
  }

  if (parsed.data.name !== undefined) {
    await updateUserName(session.userId, parsed.data.name)
    await updateCurrentSessionIdentity({ displayName: parsed.data.name })
  }

  if (parsed.data.locale !== undefined) {
    await db
      .update(users)
      .set({ locale: parsed.data.locale })
      .where(eq(users.userId, session.userId))
  }

  if (requestedEmail !== undefined) {
    if (requestedEmail === (session.email ?? null)) {
      // No database/token change needed.
    } else if (requestedEmail === null) {
      await db
        .update(users)
        .set({
          email: null,
          emailVerified: false,
          expiryWarningSentAt: null,
          expiryWarningSentFor: null,
        })
        .where(eq(users.userId, session.userId))
      await deleteEmailVerificationToken(session.userId)
    } else {
      // Email configuration and app URL were validated in the preflight above;
      // this narrows the reused appUrl before creating the verification token.
      if (!appUrl) {
        return error(
          ErrorCode.OPERATION_FAILED,
          "Application URL is not configured",
          "errors.applicationUrlNotConfigured",
        )
      }

      const verifyToken = await createEmailVerificationToken(
        session.userId,
        requestedEmail,
      )

      const verifyUrl = `${appUrl}/verify-email/${verifyToken}`
      const locale = resolveLocale(nextLocale, configManager.defaultLocale)

      const html = await renderVerifyEmail({
        username: nextName,
        verifyUrl,
        baseUrl: appUrl,
        locale,
      })

      try {
        await sendEmail({
          to: requestedEmail,
          subject: getVerifyEmailSubject({ locale }),
          html,
        })
      } catch (sendError) {
        await deleteEmailVerificationToken(session.userId)
        if (sendError instanceof EmailApiError) {
          return error(ErrorCode.EMAIL_SERVICE_ERROR)
        }
        throw sendError
      }
    }
  }

  return success(
    await getSessionDataForUser({
      userId: session.userId,
      name: nextName,
      isAdmin: session.isAdmin,
    }),
  )
}

export async function changeMyPassword(
  input: z.infer<typeof changePasswordSchema>,
  sessionOverride?: SessionData,
): Promise<ActionResult<null>> {
  const session = await resolveWorkflowSession(sessionOverride)
  if (!session) {
    return error(ErrorCode.UNAUTHORIZED)
  }

  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const jellyfinUser = await getUserById(session.userId)

  try {
    await authenticateUser(jellyfinUser.name, parsed.data.currentPassword)
  } catch (err) {
    if (err instanceof JellyfinApiError && err.statusCode === 401) {
      return error(
        ErrorCode.INVALID_CREDENTIALS,
        "Current password is incorrect",
        "profile.currentPasswordIncorrect",
      )
    }

    throw err
  }

  await adminResetUserPassword(session.userId, parsed.data.newPassword)

  return success(null)
}

export async function uploadMyAvatar(
  input: z.infer<typeof uploadAvatarSchema>,
  sessionOverride?: SessionData,
): Promise<ActionResult<SessionData>> {
  const session = await resolveWorkflowSession(sessionOverride)
  if (!session) {
    return error(ErrorCode.UNAUTHORIZED)
  }

  const parsed = uploadAvatarSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const { imageBase64, mimeType } = parsed.data
  const imageBuffer = Buffer.from(imageBase64, "base64")
  if (imageBuffer.length > MAX_AVATAR_BYTES) {
    return error(
      ErrorCode.VALIDATION_FAILED,
      "Image must be less than 5MB",
      "profile.avatarSizeError",
    )
  }

  const validMimeTypes = ["image/jpeg", "image/png", "image/webp"]
  if (!validMimeTypes.includes(mimeType)) {
    return error(
      ErrorCode.VALIDATION_FAILED,
      "Invalid image type. Only JPEG, PNG, and WebP are allowed.",
      "profile.avatarTypeError",
    )
  }

  await uploadUserAvatar(session.userId, imageBuffer, mimeType)

  return success(
    await getSessionDataForUser({
      userId: session.userId,
      name: session.name,
      isAdmin: session.isAdmin,
    }),
  )
}

export async function removeMyAvatar(
  input: z.infer<typeof removeAvatarSchema>,
  sessionOverride?: SessionData,
): Promise<ActionResult<SessionData>> {
  const session = await resolveWorkflowSession(sessionOverride)
  if (!session) {
    return error(ErrorCode.UNAUTHORIZED)
  }

  const parsed = removeAvatarSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  await deleteUserAvatar(session.userId)

  return success(
    await getSessionDataForUser({
      userId: session.userId,
      name: session.name,
      isAdmin: session.isAdmin,
    }),
  )
}

const ADMIN_EXPIRY_INFO = (createdAt: string): MyExpiryInfo => ({
  expiresAt: null,
  createdAt,
  renewalMode: "disabled",
  canRenew: false,
  reason: "no-expiry",
  nextExpiresAt: null,
  maxExpiresAt: null,
  earliestRenewAt: null,
})

function toMyExpiryInfo(
  createdAt: Date,
  evaluation: RenewalEvaluation,
): MyExpiryInfo {
  return {
    expiresAt: evaluation.expiresAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    renewalMode: evaluation.mode,
    canRenew: evaluation.canRenew,
    reason: evaluation.canRenew ? null : evaluation.reason,
    nextExpiresAt: evaluation.canRenew
      ? evaluation.nextExpiresAt.toISOString()
      : null,
    maxExpiresAt: evaluation.maxExpiresAt?.toISOString() ?? null,
    earliestRenewAt: evaluation.earliestRenewAt?.toISOString() ?? null,
  }
}

export async function getMyExpiry(
  sessionOverride?: SessionData,
): Promise<ActionResult<MyExpiryInfo>> {
  const session = await resolveWorkflowSession(sessionOverride)
  if (!session) {
    return error(ErrorCode.UNAUTHORIZED)
  }

  // Admins are exempt from expiry and never see a renewal control.
  if (session.isAdmin) {
    return success(ADMIN_EXPIRY_INFO(session.createdAt))
  }

  await ensureMigrated()

  const user = await db.query.users.findFirst({
    where: eq(users.userId, session.userId),
    with: { profile: true },
  })
  if (!user) {
    return error(ErrorCode.NOT_FOUND)
  }

  const evaluation = evaluateRenewal({
    renewal: user.profile?.policy.renewal,
    createdAt: user.createdAt,
    expiresAt: user.expiresAt,
  })

  return success(toMyExpiryInfo(user.createdAt, evaluation))
}

export async function renewMyAccess(
  sessionOverride?: SessionData,
): Promise<ActionResult<MyExpiryInfo>> {
  const session = await resolveWorkflowSession(sessionOverride)
  if (!session) {
    return error(ErrorCode.UNAUTHORIZED)
  }

  if (session.isAdmin) {
    return error(
      ErrorCode.FORBIDDEN,
      "Renewal is not available for this account",
    )
  }

  await ensureMigrated()

  const now = new Date()
  const user = await db.query.users.findFirst({
    where: eq(users.userId, session.userId),
    with: { profile: true },
  })
  if (!user) {
    return error(ErrorCode.NOT_FOUND)
  }

  // The next expiry is derived entirely from policy + createdAt here; the
  // client never supplies a delta, so a member cannot extend past the cap.
  const evaluation = evaluateRenewal({
    renewal: user.profile?.policy.renewal,
    createdAt: user.createdAt,
    expiresAt: user.expiresAt,
    now,
  })
  if (!evaluation.canRenew) {
    return error(ErrorCode.FORBIDDEN, "Renewal is not available right now")
  }

  // Repoint the warning bookkeeping so the next sweep re-warns for the new
  // expiry (mirrors the reset in updateManagedUserService). A live authed
  // session implies the account is still active and pre-expiry, so no
  // Jellyfin re-enable is needed here — the expiry sweep only ever disables.
  await db
    .update(users)
    .set({
      expiresAt: evaluation.nextExpiresAt,
      expiryWarningSentAt: null,
      expiryWarningSentFor: null,
    })
    .where(eq(users.userId, session.userId))

  log.info(
    {
      userId: session.userId,
      previousExpiresAt: evaluation.expiresAt,
      nextExpiresAt: evaluation.nextExpiresAt,
    },
    "Member self-renewed account access",
  )

  const refreshed = evaluateRenewal({
    renewal: user.profile?.policy.renewal,
    createdAt: user.createdAt,
    expiresAt: evaluation.nextExpiresAt,
    now,
  })

  return success(toMyExpiryInfo(user.createdAt, refreshed))
}

export async function deleteMyAccount(
  sessionOverride?: SessionData,
): Promise<ActionResult<null>> {
  const session = await resolveWorkflowSession(sessionOverride)
  if (!session) {
    return error(ErrorCode.UNAUTHORIZED)
  }

  log.info({ userId: session.userId }, "User initiated account deletion")

  await deleteLinkedSeerrUser(session.userId, {
    userName: session.name,
    email: session.email,
  })
  await deleteUser(session.userId)
  await ensureMigrated()
  await deleteAppUserData(session.userId)
  await revokeAllUserSessions(session.userId)
  await clearAuthenticatedSession()

  return success(null)
}
