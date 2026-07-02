import { updateUserPolicy } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"
import { revokeAllUserSessions } from "@/server/session"
import { isUserExpired } from "@/server/user-expiry"

const log = createChildLogger({ module: "user-access" })

type EnforceExpiredUserAccessInput = {
  userId: string
  userName?: string | null
  expiresAt: Date | null
  isAdmin: boolean
  isDisabled: boolean
}

export async function enforceExpiredUserAccess(
  input: EnforceExpiredUserAccessInput,
  now = new Date(),
): Promise<boolean> {
  if (!isUserExpired({ expiresAt: input.expiresAt }, input.isAdmin, now)) {
    return false
  }

  let disableError: unknown = null
  if (!input.isDisabled) {
    try {
      await updateUserPolicy(input.userId, { isDisabled: true })
      log.info(
        {
          userId: input.userId,
          userName: input.userName ?? null,
          expiresAt: input.expiresAt,
        },
        "Disabled expired Jellyfin user",
      )
    } catch (err) {
      disableError = err
      log.warn(
        {
          err,
          userId: input.userId,
          userName: input.userName ?? null,
          expiresAt: input.expiresAt,
        },
        "Failed to disable expired Jellyfin user before revoking sessions",
      )
    }
  }

  await revokeAllUserSessions(input.userId)

  if (disableError) {
    throw disableError
  }

  return true
}
