import "@tanstack/react-start/server-only"
import { resolveLocale } from "@/lib/i18n"
import { configManager } from "@/lib/server/config.server"
import { isEmailConfigured } from "@/server/email"
import { sendConfiguredEmail } from "@/server/email/messages"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "email-notifications" })

// Best-effort lifecycle notifications: they never throw, so account
// state transitions (disable, delete, renew) succeed even when email is
// down or the user has no verified address.
interface NotifiableUser {
  userId: string
  username: string
  email: string | null
  emailVerified: boolean
  locale: string | null
}

export function formatExpiryEmailDate(expiresAt: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(expiresAt)
}

function getNotifiableEmail(user: NotifiableUser): string | null {
  return user.email && user.emailVerified && isEmailConfigured()
    ? user.email
    : null
}

export async function sendAccountDisabledNotification(
  user: NotifiableUser,
): Promise<void> {
  const email = getNotifiableEmail(user)
  if (!email) {
    return
  }

  const locale = resolveLocale(user.locale, configManager.defaultLocale)
  try {
    await sendConfiguredEmail(email, {
      type: "accountDisabled",
      payload: { username: user.username, locale },
    })
  } catch (err) {
    log.warn(
      { err, userId: user.userId },
      "Failed to send account disabled email",
    )
  }
}

export async function sendAccountDeletedNotification(
  user: NotifiableUser,
): Promise<void> {
  const email = getNotifiableEmail(user)
  if (!email) {
    return
  }

  const locale = resolveLocale(user.locale, configManager.defaultLocale)
  try {
    await sendConfiguredEmail(email, {
      type: "accountDeleted",
      payload: { username: user.username, locale },
    })
  } catch (err) {
    log.warn(
      { err, userId: user.userId },
      "Failed to send account deleted email",
    )
  }
}

export async function sendAccountRenewedNotification(
  user: NotifiableUser,
  expiresAt: Date,
): Promise<void> {
  const email = getNotifiableEmail(user)
  const appUrl = configManager.appUrl
  if (!email || !appUrl) {
    return
  }

  const locale = resolveLocale(user.locale, configManager.defaultLocale)
  try {
    await sendConfiguredEmail(email, {
      type: "accountRenewed",
      payload: {
        username: user.username,
        expiryDate: formatExpiryEmailDate(expiresAt, locale),
        manageUrl: new URL("/profile/general", appUrl).toString(),
        locale,
      },
    })
  } catch (err) {
    log.warn(
      { err, userId: user.userId },
      "Failed to send account renewed email",
    )
  }
}
