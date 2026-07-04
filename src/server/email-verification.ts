import { eq } from "drizzle-orm"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { resolveLocale } from "@/lib/i18n"
import { emailVerificationSchema } from "@/lib/schemas"
import { getSession } from "@/lib/server/auth"
import { configManager } from "@/lib/server/config.server"
import type { SessionData } from "@/lib/session"
import { db, ensureMigrated } from "@/server/db"
import { users } from "@/server/db/schema"
import { EmailApiError, sendEmail, isEmailConfigured } from "@/server/email"
import {
  getVerifyEmailSubject,
  renderVerifyEmail,
} from "@/server/email/templates/verify-email"
import { createChildLogger } from "@/server/logger"
import { resolveSeerrUser } from "@/server/seerr"
import { getSessionDataForUser } from "@/server/session-resolver"
import {
  createEmailVerificationToken,
  validateEmailVerificationToken,
  deleteEmailVerificationToken,
} from "@/server/tokens"

const log = createChildLogger({ module: "email-service" })

export async function verifyEmail(
  input: { token: string },
  sessionOverride?: SessionData | null,
): Promise<ActionResult<SessionData | null>> {
  const parsed = emailVerificationSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  await ensureMigrated()
  const verified = await validateEmailVerificationToken(parsed.data.token)

  if (!verified) {
    log.warn("Email verification attempted with invalid or expired token")
    return error(
      ErrorCode.VALIDATION_FAILED,
      "Invalid or expired verification token",
      "errors.invalidVerificationToken",
    )
  }

  await db
    .update(users)
    .set({
      email: verified.pendingEmail ?? verified.user.email,
      emailVerified: true,
      ...(verified.pendingEmail && verified.pendingEmail !== verified.user.email
        ? {
            expiryWarningSentAt: null,
            expiryWarningSentFor: null,
          }
        : {}),
    })
    .where(eq(users.userId, verified.user.userId))
  await deleteEmailVerificationToken(verified.user.userId)

  const verifiedEmail = verified.pendingEmail ?? verified.user.email
  if (configManager.seerr && verifiedEmail) {
    try {
      const syncedSeerrUser = await resolveSeerrUser({
        jellyfinUserId: verified.user.userId,
        userName: verified.user.userId,
        email: verifiedEmail,
      })

      if (syncedSeerrUser) {
        await db
          .update(users)
          .set({ seerrSyncedAt: new Date() })
          .where(eq(users.userId, verified.user.userId))
      }
    } catch (err) {
      log.warn(
        { err, userId: verified.user.userId },
        "Failed to resolve Seerr user after email verification",
      )
    }
  }

  log.info({ userId: verified.user.userId }, "Email verified successfully")
  if (sessionOverride?.userId === verified.user.userId) {
    return success(
      await getSessionDataForUser({
        userId: sessionOverride.userId,
        name: sessionOverride.name,
        isAdmin: sessionOverride.isAdmin,
      }),
    )
  }

  return success(null)
}

export async function resendVerification(
  sessionOverride?: SessionData,
): Promise<ActionResult<null>> {
  const session = sessionOverride ?? (await getSession())
  if (!session) {
    return error(ErrorCode.UNAUTHORIZED)
  }

  if (!isEmailConfigured()) {
    return error(ErrorCode.EMAIL_NOT_CONFIGURED)
  }

  if (session.emailVerified) {
    return error(ErrorCode.EMAIL_ALREADY_VERIFIED)
  }

  if (!session.email) {
    return error(
      ErrorCode.NOT_FOUND,
      "No email address on file",
      "errors.noEmailOnFile",
    )
  }

  await ensureMigrated()
  const user = await db.query.users.findFirst({
    where: eq(users.userId, session.userId),
  })
  const pendingEmail = user?.email === session.email ? null : session.email
  const token = await createEmailVerificationToken(session.userId, pendingEmail)
  const appUrl = configManager.appUrl
  if (!appUrl) {
    return error(
      ErrorCode.OPERATION_FAILED,
      "Application URL is not configured",
      "errors.applicationUrlNotConfigured",
    )
  }

  const verifyUrl = `${appUrl}/verify-email/${token}`
  const locale = resolveLocale(session.locale, configManager.defaultLocale)

  const html = await renderVerifyEmail({
    username: session.name,
    verifyUrl,
    baseUrl: appUrl,
    locale,
  })

  try {
    await sendEmail({
      to: session.email,
      subject: getVerifyEmailSubject({ locale }),
      html,
    })
  } catch (err) {
    if (err instanceof EmailApiError) {
      return error(ErrorCode.EMAIL_SERVICE_ERROR)
    }
    throw err
  }

  log.info(
    { userId: session.userId, email: session.email },
    "Verification email resent",
  )
  return success(null)
}
