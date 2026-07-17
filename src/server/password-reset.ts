import { eq } from "drizzle-orm"
import { z } from "zod"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { resolveLocale } from "@/lib/i18n"
import { passwordSchema } from "@/lib/schemas"
import { configManager } from "@/lib/server/config.server"
import { db, ensureMigrated } from "@/server/db"
import { users } from "@/server/db/schema"
import { isEmailConfigured, sendEmail } from "@/server/email"
import {
  getPasswordResetEmailSubject,
  renderPasswordResetEmail,
} from "@/server/email/templates/password-reset"
import {
  authenticateUser,
  forgotPassword,
  forgotPasswordPin,
  getAllUsers,
  type JellyfinUserListItem,
} from "@/server/jellyfin/admin"
import { createApiWithToken } from "@/server/jellyfin/client"
import {
  findPasswordResetPinByCode,
  waitForPasswordResetPin,
  type PasswordResetPin,
} from "@/server/jellyfin/password-reset"
import { changePassword } from "@/server/jellyfin/user"
import { logger } from "@/server/logger"
import { revokeAllUserSessions } from "@/server/session"

const requestPasswordResetSchema = z.object({
  username: z.string().min(1, "validation.usernameRequired"),
})

async function findJellyfinUser(
  username: string,
): Promise<JellyfinUserListItem | null> {
  const jellyfinUsers = await getAllUsers()
  const normalized = username.toLowerCase()
  return (
    jellyfinUsers.find((user) => user.name.toLowerCase() === normalized) ?? null
  )
}

export async function requestPasswordReset(
  input: z.infer<typeof requestPasswordResetSchema>,
): Promise<ActionResult<null>> {
  const parsed = requestPasswordResetSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const { username } = parsed.data

  if (!configManager.jellyfinConfigPath) {
    logger.warn("Password reset requested but configPath not set")
    return error(ErrorCode.PASSWORD_RESET_NOT_CONFIGURED)
  }

  if (!isEmailConfigured()) {
    logger.warn("Password reset requested but email not configured")
    return error(ErrorCode.EMAIL_NOT_CONFIGURED)
  }

  // Account existence and verification checks, the Jellyfin forgot-password
  // call, the up-to-10s PIN wait, and email rendering/sending all run in the
  // background so request latency stays constant regardless of whether the
  // account exists or has a verified email. Failures are logged internally and
  // never change the uniform response the client already received.
  void processPasswordResetRequest(username).catch((err) => {
    logger.error({ error: err }, "Password reset background task failed")
  })

  return success(null)
}

// Runs the account-specific reset work off the request path. Expected outcomes
// (missing account, unverified email, unavailable Jellyfin reset) are logged
// and returned quietly; unexpected external failures reject and are caught by
// the fire-and-forget caller above.
async function processPasswordResetRequest(username: string): Promise<void> {
  const jellyfinUser = await findJellyfinUser(username)

  if (!jellyfinUser) {
    logger.debug(
      { username },
      "Password reset requested for non-existent Jellyfin user",
    )
    return
  }

  await ensureMigrated()
  const dbUser = await db.query.users.findFirst({
    where: eq(users.userId, jellyfinUser.id),
  })

  if (!dbUser || !dbUser.email || !dbUser.emailVerified) {
    logger.debug(
      {
        username,
        hasDbUser: Boolean(dbUser),
        hasEmail: Boolean(dbUser?.email),
        verified: Boolean(dbUser?.emailVerified),
      },
      "Password reset requested for user without verified email",
    )
    return
  }

  const forgotResult = await forgotPassword(username)
  logger.debug(
    { username, action: forgotResult.action },
    "Jellyfin forgot password result",
  )

  if (forgotResult.action !== "PinCode") {
    logger.warn(
      { username, action: forgotResult.action },
      "Jellyfin password reset not available for user",
    )
    return
  }

  const pin = await waitForPasswordResetPin(username, 10000)
  if (!pin) {
    logger.error({ username }, "Failed to retrieve password reset PIN")
    return
  }

  const appUrl = configManager.appUrl
  if (!appUrl) {
    logger.warn("Password reset requested but app URL is not configured")
    return
  }

  const resetUrl = `${appUrl}/reset-password?pin=${encodeURIComponent(pin.pin)}`

  const expiresInMinutes = Math.round(
    (pin.expirationDate.getTime() - Date.now()) / 1000 / 60,
  )
  const locale = resolveLocale(dbUser.locale, configManager.defaultLocale)

  const html = await renderPasswordResetEmail({
    username: jellyfinUser.name,
    pin: pin.pin,
    resetUrl,
    expiresInMinutes,
    serverName: configManager.app.title,
    baseUrl: appUrl,
    locale,
  })

  await sendEmail({
    to: dbUser.email,
    subject: getPasswordResetEmailSubject({
      locale,
      serverName: configManager.app.title,
    }),
    html,
  })

  logger.info({ username, email: dbUser.email }, "Password reset email sent")
}

const resetPasswordSchema = z.object({
  pin: z.string().min(1, "validation.pinRequired"),
  newPassword: passwordSchema,
})

// Resolves a reset PIN to its account so the confirm limiter can throttle by
// stable account identity instead of the guessed PIN. Returns null for
// unresolved PINs; callers must not expose the resolved userName to clients.
export async function findPasswordResetPinForCode(
  pin: string,
): Promise<PasswordResetPin | null> {
  return findPasswordResetPinByCode(pin)
}

export async function resetPassword(
  input: z.infer<typeof resetPasswordSchema>,
): Promise<ActionResult<null>> {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  if (!configManager.jellyfinConfigPath) {
    return error(ErrorCode.PASSWORD_RESET_NOT_CONFIGURED)
  }

  const { pin, newPassword } = parsed.data
  const pinInfo = await findPasswordResetPinByCode(pin)
  if (!pinInfo) {
    return error(ErrorCode.PASSWORD_RESET_PIN_INVALID)
  }

  try {
    await forgotPasswordPin(pin)
  } catch (err) {
    logger.warn({ error: err }, "Invalid password reset PIN")
    return error(ErrorCode.PASSWORD_RESET_PIN_INVALID)
  }

  let authResult: Awaited<ReturnType<typeof authenticateUser>>
  try {
    authResult = await authenticateUser(pinInfo.userName, pin)
  } catch (err) {
    logger.warn({ error: err }, "Failed to authenticate with PIN")
    return error(ErrorCode.PASSWORD_RESET_PIN_INVALID)
  }

  const userApi = createApiWithToken(authResult.accessToken)
  await changePassword(userApi, authResult.id, pin, newPassword)

  try {
    await revokeAllUserSessions(authResult.id)
  } catch (err) {
    logger.error(
      { error: err, userId: authResult.id },
      "Password reset succeeded but session revocation failed",
    )
    throw err
  }

  logger.info(
    { username: pinInfo.userName },
    "Password reset completed successfully",
  )
  return success(null)
}
