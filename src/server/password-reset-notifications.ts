import "@tanstack/react-start/server-only"
import { createHmac } from "node:crypto"
import type { FSWatcher } from "node:fs"

import { and, eq, inArray, isNull, lt, or } from "drizzle-orm"

import { resolveLocale } from "@/lib/i18n"
import { configManager } from "@/lib/server/config.server"
import { db, ensureMigrated } from "@/server/db"
import { password_reset_notifications, users } from "@/server/db/schema"
import { isEmailConfigured } from "@/server/email"
import { sendConfiguredEmail } from "@/server/email/messages"
import { getAllUsers, type JellyfinUserListItem } from "@/server/jellyfin/admin"
import {
  getPasswordResetPinDirectory,
  listPasswordResetPins,
  watchPasswordResetPinDirectory,
  type PasswordResetPin,
} from "@/server/jellyfin/password-reset"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "password-reset-notifications" })
const PASSWORD_RESET_SCAN_INTERVAL_MS = 30_000
const PASSWORD_RESET_EVENT_DEBOUNCE_MS = 250
const PASSWORD_RESET_PROCESSING_LEASE_MS = 5 * 60 * 1000
const PASSWORD_RESET_NOTIFICATION_QUERY_BATCH_SIZE = 500

let passwordResetWatcher: FSWatcher | null = null
let watchedPasswordResetDirectory: string | null = null
let passwordResetScanInterval: ReturnType<typeof setInterval> | null = null
let passwordResetScanTimeout: ReturnType<typeof setTimeout> | null = null
let passwordResetScanPromise: Promise<void> | null = null
let passwordResetRescanRequested = false
const inFlightPasswordResetNotifications = new Set<string>()

function getPasswordResetNotificationId(pin: PasswordResetPin): string {
  return createHmac("sha256", configManager.auth.encryptionKey)
    .update(pin.pinFile)
    .update("\0")
    .update(pin.pin)
    .update("\0")
    .update(pin.userName)
    .update("\0")
    .update(pin.expirationDate.toISOString())
    .digest("hex")
}

async function releasePasswordResetNotification(
  notificationId: string,
  processingToken: string,
  jellyfinUserId: string | null,
): Promise<void> {
  await db
    .update(password_reset_notifications)
    .set({
      jellyfin_user_id: jellyfinUserId,
      processing_at: null,
      processing_token: null,
    })
    .where(
      and(
        eq(password_reset_notifications.id, notificationId),
        eq(password_reset_notifications.processing_token, processingToken),
        isNull(password_reset_notifications.completed_at),
      ),
    )
}

async function completePasswordResetNotification(
  notificationId: string,
  processingToken: string,
  jellyfinUserId: string | null,
  emailSent: boolean,
): Promise<void> {
  const completedAt = new Date()
  const completed = await db
    .update(password_reset_notifications)
    .set({
      jellyfin_user_id: jellyfinUserId,
      processing_at: null,
      processing_token: null,
      completed_at: completedAt,
      email_sent_at: emailSent ? completedAt : null,
    })
    .where(
      and(
        eq(password_reset_notifications.id, notificationId),
        eq(password_reset_notifications.processing_token, processingToken),
      ),
    )
    .returning({ id: password_reset_notifications.id })

  if (completed.length === 0) {
    log.warn(
      { notificationId },
      "Password reset notification claim changed before completion",
    )
  }
}

async function processPasswordResetPin(
  pin: PasswordResetPin,
  jellyfinUsersByName: Map<string, JellyfinUserListItem>,
): Promise<void> {
  const notificationId = getPasswordResetNotificationId(pin)
  const processingToken = crypto.randomUUID()
  if (inFlightPasswordResetNotifications.has(notificationId)) {
    return
  }

  inFlightPasswordResetNotifications.add(notificationId)
  try {
    await db
      .insert(password_reset_notifications)
      .values({
        id: notificationId,
        expires_at: pin.expirationDate,
      })
      .onConflictDoNothing()

    const now = new Date()
    const staleProcessingTime = new Date(
      now.getTime() - PASSWORD_RESET_PROCESSING_LEASE_MS,
    )
    const claimed = await db
      .update(password_reset_notifications)
      .set({
        processing_at: now,
        processing_token: processingToken,
      })
      .where(
        and(
          eq(password_reset_notifications.id, notificationId),
          isNull(password_reset_notifications.completed_at),
          or(
            isNull(password_reset_notifications.processing_at),
            lt(password_reset_notifications.processing_at, staleProcessingTime),
          ),
        ),
      )
      .returning({ id: password_reset_notifications.id })

    if (claimed.length === 0) {
      return
    }

    const jellyfinUser = jellyfinUsersByName.get(pin.userName.toLowerCase())
    if (!jellyfinUser) {
      await completePasswordResetNotification(
        notificationId,
        processingToken,
        null,
        false,
      )
      log.debug("Ignored Jellyfin password reset for an unknown Jellyfin user")
      return
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.userId, jellyfinUser.id),
    })

    if (!dbUser?.email || !dbUser.emailVerified) {
      await releasePasswordResetNotification(
        notificationId,
        processingToken,
        jellyfinUser.id,
      )
      log.debug(
        { userId: jellyfinUser.id },
        "Deferred Jellyfin password reset without a verified email",
      )
      return
    }

    if (!isEmailConfigured() || !configManager.appUrl) {
      await releasePasswordResetNotification(
        notificationId,
        processingToken,
        jellyfinUser.id,
      )
      return
    }

    if (pin.expirationDate <= new Date()) {
      await completePasswordResetNotification(
        notificationId,
        processingToken,
        jellyfinUser.id,
        false,
      )
      return
    }

    const resetUrl = new URL("/reset-password", configManager.appUrl)
    resetUrl.searchParams.set("pin", pin.pin)
    const expiresInMinutes = Math.max(
      1,
      Math.ceil((pin.expirationDate.getTime() - Date.now()) / 1000 / 60),
    )
    const locale = resolveLocale(dbUser.locale, configManager.defaultLocale)

    await sendConfiguredEmail(dbUser.email, {
      type: "passwordReset",
      payload: {
        username: jellyfinUser.name,
        pin: pin.pin,
        resetUrl: resetUrl.toString(),
        expiresInMinutes,
        locale,
      },
    })

    await completePasswordResetNotification(
      notificationId,
      processingToken,
      jellyfinUser.id,
      true,
    )
    log.info({ userId: jellyfinUser.id }, "Jellyfin password reset email sent")
  } catch (err) {
    try {
      await releasePasswordResetNotification(
        notificationId,
        processingToken,
        null,
      )
    } catch (releaseError) {
      log.error(
        { err: releaseError },
        "Failed to release password reset notification claim",
      )
    }
    throw err
  } finally {
    inFlightPasswordResetNotifications.delete(notificationId)
  }
}

async function runPasswordResetNotificationScan(): Promise<void> {
  const pins = await listPasswordResetPins()
  await ensureMigrated()
  await db
    .delete(password_reset_notifications)
    .where(lt(password_reset_notifications.expires_at, new Date()))

  if (pins.length === 0 || !isEmailConfigured() || !configManager.appUrl) {
    return
  }

  const notificationIds = pins.map(getPasswordResetNotificationId)
  const completedIds = new Set<string>()
  for (
    let index = 0;
    index < notificationIds.length;
    index += PASSWORD_RESET_NOTIFICATION_QUERY_BATCH_SIZE
  ) {
    const batch = notificationIds.slice(
      index,
      index + PASSWORD_RESET_NOTIFICATION_QUERY_BATCH_SIZE,
    )
    const notifications = await db
      .select({
        id: password_reset_notifications.id,
        completed_at: password_reset_notifications.completed_at,
      })
      .from(password_reset_notifications)
      .where(inArray(password_reset_notifications.id, batch))

    for (const notification of notifications) {
      if (notification.completed_at !== null) {
        completedIds.add(notification.id)
      }
    }
  }
  const pendingPins = pins.filter(
    (pin) => !completedIds.has(getPasswordResetNotificationId(pin)),
  )

  if (pendingPins.length === 0) {
    return
  }

  const jellyfinUsers = await getAllUsers()
  const jellyfinUsersByName = new Map(
    jellyfinUsers.map((user) => [user.name.toLowerCase(), user]),
  )

  for (const pin of pendingPins) {
    try {
      await processPasswordResetPin(pin, jellyfinUsersByName)
    } catch (err) {
      log.warn({ err }, "Failed to process Jellyfin password reset PIN")
    }
  }
}

export function scanPasswordResetNotifications(): Promise<void> {
  passwordResetRescanRequested = true
  if (passwordResetScanPromise) {
    return passwordResetScanPromise
  }

  passwordResetScanPromise = (async () => {
    while (passwordResetRescanRequested) {
      passwordResetRescanRequested = false
      await runPasswordResetNotificationScan()
    }
  })().finally(() => {
    passwordResetScanPromise = null
    if (passwordResetRescanRequested) {
      kickOffPasswordResetNotificationScan()
    }
  })

  return passwordResetScanPromise
}

function kickOffPasswordResetNotificationScan(): void {
  void scanPasswordResetNotifications().catch((err) => {
    log.warn({ err }, "Jellyfin password reset PIN scan failed")
  })
}

function schedulePasswordResetNotificationScan(): void {
  if (passwordResetScanTimeout) {
    clearTimeout(passwordResetScanTimeout)
  }

  passwordResetScanTimeout = setTimeout(() => {
    passwordResetScanTimeout = null
    kickOffPasswordResetNotificationScan()
  }, PASSWORD_RESET_EVENT_DEBOUNCE_MS)
  passwordResetScanTimeout.unref?.()
}

function closePasswordResetWatcher(): void {
  passwordResetWatcher?.close()
  passwordResetWatcher = null
}

function refreshPasswordResetWatcher(): void {
  const nextDirectory = getPasswordResetPinDirectory()
  if (nextDirectory !== watchedPasswordResetDirectory) {
    closePasswordResetWatcher()
    watchedPasswordResetDirectory = nextDirectory
  }

  if (!nextDirectory || passwordResetWatcher) {
    return
  }

  try {
    const watcher = watchPasswordResetPinDirectory(
      nextDirectory,
      schedulePasswordResetNotificationScan,
    )
    watcher.on("error", (err) => {
      log.warn(
        { err, configPath: nextDirectory },
        "Jellyfin password reset watcher failed",
      )
      if (passwordResetWatcher === watcher) {
        closePasswordResetWatcher()
      }
    })
    passwordResetWatcher = watcher
    log.info(
      { configPath: nextDirectory },
      "Watching for Jellyfin password reset PINs",
    )
  } catch (err) {
    log.warn(
      { err, configPath: nextDirectory },
      "Failed to watch for Jellyfin password reset PINs",
    )
  }
}

function maintainPasswordResetWatcher(): void {
  refreshPasswordResetWatcher()
  if (getPasswordResetPinDirectory()) {
    kickOffPasswordResetNotificationScan()
  }
}

export function startPasswordResetNotificationWatcher(): void {
  maintainPasswordResetWatcher()
  if (passwordResetScanInterval) {
    return
  }

  passwordResetScanInterval = setInterval(
    maintainPasswordResetWatcher,
    PASSWORD_RESET_SCAN_INTERVAL_MS,
  )
  passwordResetScanInterval.unref?.()
}

export function stopPasswordResetNotificationWatcher(): void {
  closePasswordResetWatcher()
  watchedPasswordResetDirectory = null

  if (passwordResetScanInterval) {
    clearInterval(passwordResetScanInterval)
    passwordResetScanInterval = null
  }
  if (passwordResetScanTimeout) {
    clearTimeout(passwordResetScanTimeout)
    passwordResetScanTimeout = null
  }
}
