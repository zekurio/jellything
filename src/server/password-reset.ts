import { eq } from "drizzle-orm"
import { Type, type StaticDecode } from "typebox"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { passwordSchema } from "@/lib/schemas"
import { configManager } from "@/lib/server/config.server"
import { safeParse, stringSchema } from "@/lib/validation"
import { db, ensureMigrated } from "@/server/db"
import { users } from "@/server/db/schema"
import { isEmailConfigured } from "@/server/email"
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
  type PasswordResetPin,
} from "@/server/jellyfin/password-reset"
import { changePassword } from "@/server/jellyfin/user"
import { logger } from "@/server/logger"
import { scanPasswordResetNotifications } from "@/server/password-reset-notifications"
import { revokeAllUserSessions } from "@/server/session"

const requestPasswordResetSchema = Type.Object({
  username: stringSchema({
    minLength: 1,
    errorMessage: "validation.usernameRequired",
  }),
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
  input: StaticDecode<typeof requestPasswordResetSchema>,
): Promise<ActionResult<null>> {
  const parsed = safeParse(requestPasswordResetSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const username = parsed.data.username

  if (!configManager.jellyfinConfigPath) {
    logger.warn("Password reset requested but configPath not set")
    return error(ErrorCode.PASSWORD_RESET_NOT_CONFIGURED)
  }

  if (!isEmailConfigured()) {
    logger.warn("Password reset requested but email not configured")
    return error(ErrorCode.EMAIL_NOT_CONFIGURED)
  }

  // Account existence and verification checks plus the Jellyfin and email work
  // stay off the request path. The public response remains uniform regardless
  // of whether the account exists or has a verified email.
  void processPasswordResetRequest(username).catch((err) => {
    logger.error({ error: err }, "Password reset background task failed")
  })

  return success(null)
}

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

  if (!dbUser?.email || !dbUser.emailVerified) {
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

  await scanPasswordResetNotifications()
}

const resetPasswordSchema = Type.Object({
  pin: stringSchema({ minLength: 1, errorMessage: "validation.pinRequired" }),
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
  input: StaticDecode<typeof resetPasswordSchema>,
): Promise<ActionResult<null>> {
  const parsed = safeParse(resetPasswordSchema, input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  if (!configManager.jellyfinConfigPath) {
    return error(ErrorCode.PASSWORD_RESET_NOT_CONFIGURED)
  }

  const pin = parsed.data.pin
  const newPassword = parsed.data.newPassword
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
