import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm"

import { resolveLocale } from "@/lib/i18n"
import { configManager } from "@/lib/server/config.server"
import { db, ensureMigrated } from "@/server/db.server"
import {
  emailVerificationTokens,
  inviteUsages,
  invites,
  users,
  type User,
} from "@/server/db/schema"
import { isEmailConfigured, sendEmail } from "@/server/email"
import {
  getExpiryWarningEmailSubject,
  renderExpiryWarningEmail,
} from "@/server/email/templates/expiry-warning"
import { getAllUsers, type JellyfinUserListItem } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"
import {
  deleteSeerrUser,
  getAllSeerrUsers,
  resolveSeerrUser,
} from "@/server/seerr"
import { enforceExpiredUserAccess } from "@/server/user-access"
import { isUserExpired } from "@/server/user-expiry"

const log = createChildLogger({ module: "users" })

const USER_EXPIRY_WARNING_WINDOW_MS = 72 * 60 * 60 * 1000
const USER_EXPIRY_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000
const MAX_CONCURRENT_EXPIRY_EMAILS = 5

let seerrBackfillPromise: Promise<void> | null = null
let expiredUserSweepPromise: Promise<void> | null = null
let inviteUsageReconcilePromise: Promise<void> | null = null
let userExpiryMaintenanceInterval: ReturnType<typeof setInterval> | null = null
let lastExpiredUserSweepStartedAt = 0

function hasSentExpiryWarningForCurrentExpiry(
  user: Pick<User, "expiryWarningSentFor">,
  expiresAt: Date,
): boolean {
  return user.expiryWarningSentFor?.getTime() === expiresAt.getTime()
}

function formatExpiryWarningDate(expiresAt: Date, locale: string): string {
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

export function backfillSeerrSyncedAt(): void {
  if (seerrBackfillPromise !== null || !configManager.seerr) {
    return
  }

  seerrBackfillPromise = (async () => {
    await ensureMigrated()

    const unsyncedUsers = await db
      .select({ userId: users.userId })
      .from(users)
      .where(isNull(users.seerrSyncedAt))

    if (unsyncedUsers.length === 0) {
      return
    }

    log.info(
      { count: unsyncedUsers.length },
      "Backfilling Seerr sync status for existing users",
    )

    const seerrUsers = await getAllSeerrUsers()
    const seerrByJellyfinId = new Map(
      seerrUsers
        .filter((u) => u.jellyfinUserId)
        .map((u) => [u.jellyfinUserId, u]),
    )

    const syncedUserIds: string[] = []
    for (const { userId } of unsyncedUsers) {
      if (seerrByJellyfinId.has(userId)) {
        syncedUserIds.push(userId)
      }
    }

    if (syncedUserIds.length > 0) {
      await db
        .update(users)
        .set({ seerrSyncedAt: new Date() })
        .where(inArray(users.userId, syncedUserIds))
    }

    log.info(
      { found: syncedUserIds.length, total: unsyncedUsers.length },
      "Seerr sync backfill complete",
    )
  })().catch((err) => {
    log.warn({ err }, "Seerr sync backfill failed")
    seerrBackfillPromise = null
  })
}

export function reconcileInviteUseCounts(): Promise<void> {
  if (inviteUsageReconcilePromise !== null) {
    return inviteUsageReconcilePromise
  }

  inviteUsageReconcilePromise = (async () => {
    await ensureMigrated()

    const inviteRows = await db
      .select({
        id: invites.id,
        useCount: invites.useCount,
        usageCount: sql<number>`(
          select count(*)
          from ${inviteUsages}
          where ${inviteUsages.inviteId} = ${invites.id}
        )`,
      })
      .from(invites)

    const staleInvites = inviteRows.filter(
      (invite) => invite.useCount !== invite.usageCount,
    )

    if (staleInvites.length === 0) {
      return
    }

    for (const invite of staleInvites) {
      await db
        .update(invites)
        .set({ useCount: invite.usageCount })
        .where(eq(invites.id, invite.id))
    }

    log.info(
      { count: staleInvites.length },
      "Reconciled invite usage counts from invite history",
    )
  })().finally(() => {
    inviteUsageReconcilePromise = null
  })

  return inviteUsageReconcilePromise
}

type SyncUsersWithJellyfinOptions = {
  removeOrphanedUsers?: boolean
}

export type SyncedAppUser = User & {
  jellyfinUser: JellyfinUserListItem | null
}

export type SyncUsersWithJellyfinResult = {
  jellyfinUsers: JellyfinUserListItem[]
  matchedUsers: SyncedAppUser[]
  orphanedUsers: User[]
}

export async function ensureUserRecord(userId: string): Promise<User> {
  await ensureMigrated()
  await db
    .insert(users)
    .values({
      userId,
      email: null,
      emailVerified: false,
      locale: null,
      profileId: null,
      inviteId: null,
      seerrSyncedAt: null,
      expiresAt: null,
      expiryWarningSentAt: null,
      expiryWarningSentFor: null,
      createdAt: new Date(),
    })
    .onConflictDoNothing()

  const user = await db.query.users.findFirst({
    where: eq(users.userId, userId),
  })

  if (!user) {
    throw new Error("Failed to ensure user record")
  }

  return user
}

function startExpiredUserSweep(task: () => Promise<void>): Promise<void> {
  if (expiredUserSweepPromise !== null) {
    return expiredUserSweepPromise
  }

  const startedAt = Date.now()
  lastExpiredUserSweepStartedAt = startedAt

  const sweepPromise = (async () => {
    await task()
  })()
    .catch((err) => {
      if (lastExpiredUserSweepStartedAt === startedAt) {
        lastExpiredUserSweepStartedAt = 0
      }
      throw err
    })
    .finally(() => {
      expiredUserSweepPromise = null
    })

  expiredUserSweepPromise = sweepPromise
  return sweepPromise
}

export async function runUserStartupMaintenance(): Promise<void> {
  await startExpiredUserSweep(async () => {
    const { jellyfinUsers, matchedUsers } = await syncUsersWithJellyfin()

    const matchedIds = new Set(matchedUsers.map((user) => user.userId))
    const unseededUsers = jellyfinUsers.filter(
      (user) => !matchedIds.has(user.id),
    )

    if (unseededUsers.length > 0) {
      log.info(
        { count: unseededUsers.length },
        "Seeding DB records for unseen Jellyfin users",
      )
      for (const user of unseededUsers) {
        await ensureUserRecord(user.id)
      }
    }

    await notifyExpiringMatchedUsers(matchedUsers)
  })

  await reconcileInviteUseCounts()
  backfillSeerrSyncedAt()
}

async function deleteInviteUsagesForUser(
  tx: Pick<typeof db, "select" | "delete" | "update">,
  userId: string,
): Promise<void> {
  const usageRows = await tx
    .select({ inviteId: inviteUsages.inviteId })
    .from(inviteUsages)
    .where(eq(inviteUsages.userId, userId))

  if (usageRows.length === 0) {
    return
  }

  const inviteIds = Array.from(
    new Set(usageRows.map((usage) => usage.inviteId)),
  )

  await tx.delete(inviteUsages).where(eq(inviteUsages.userId, userId))

  for (const inviteId of inviteIds) {
    await tx
      .update(invites)
      .set({
        useCount: sql`(
          select count(*)
          from ${inviteUsages}
          where ${inviteUsages.inviteId} = ${inviteId}
        )`,
      })
      .where(eq(invites.id, inviteId))
  }
}

export async function deleteAppUserData(userId: string): Promise<void> {
  await ensureMigrated()

  await db.transaction(async (tx) => {
    await tx
      .update(invites)
      .set({ createdById: null })
      .where(eq(invites.createdById, userId))
    await deleteInviteUsagesForUser(tx, userId)
    await tx
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
    await tx.delete(users).where(eq(users.userId, userId))
  })
}

export async function deleteLinkedSeerrUser(
  jellyfinUserId: string,
  options: {
    userName?: string | null
    email?: string | null
  } = {},
): Promise<boolean> {
  if (!configManager.seerr) {
    return false
  }

  const seerrUser = await resolveSeerrUser({
    jellyfinUserId,
    userName: options.userName ?? jellyfinUserId,
    email: options.email,
    attemptImport: false,
  })

  if (!seerrUser) {
    return false
  }

  await deleteSeerrUser(seerrUser.id)
  return true
}

export async function syncUsersWithJellyfin(
  options: SyncUsersWithJellyfinOptions = {},
): Promise<SyncUsersWithJellyfinResult> {
  await ensureMigrated()

  const [dbUsers, jellyfinUsers] = await Promise.all([
    db.select().from(users),
    getAllUsers(),
  ])
  const adminUserIdsWithProfiles = dbUsers
    .filter((dbUser) => {
      if (dbUser.profileId === null) {
        return false
      }
      return jellyfinUsers.some(
        (jellyfinUser) =>
          jellyfinUser.id === dbUser.userId && jellyfinUser.isAdmin,
      )
    })
    .map((dbUser) => dbUser.userId)

  if (adminUserIdsWithProfiles.length > 0) {
    await db
      .update(users)
      .set({ profileId: null })
      .where(inArray(users.userId, adminUserIdsWithProfiles))
  }

  const jellyfinUsersById = new Map(
    jellyfinUsers.map((user) => [user.id, user]),
  )
  const matchedUsers: SyncedAppUser[] = []
  const orphanedUsers: User[] = []

  for (const dbUser of dbUsers) {
    const jellyfinUser = jellyfinUsersById.get(dbUser.userId) ?? null
    if (jellyfinUser) {
      matchedUsers.push({
        ...dbUser,
        profileId: jellyfinUser.isAdmin ? null : dbUser.profileId,
        jellyfinUser,
      })
      continue
    }

    orphanedUsers.push(dbUser)
  }

  if (orphanedUsers.length > 0) {
    const orphanedUserIds = orphanedUsers.map((user) => user.userId)

    await db
      .delete(emailVerificationTokens)
      .where(inArray(emailVerificationTokens.userId, orphanedUserIds))

    if (options.removeOrphanedUsers) {
      await db.transaction(async (tx) => {
        for (const orphanedUserId of orphanedUserIds) {
          await tx
            .update(invites)
            .set({ createdById: null })
            .where(eq(invites.createdById, orphanedUserId))
          await deleteInviteUsagesForUser(tx, orphanedUserId)
          await tx.delete(users).where(eq(users.userId, orphanedUserId))
        }
      })
    }
  }

  await enforceExpiredMatchedUsers(matchedUsers)

  return {
    jellyfinUsers,
    matchedUsers,
    orphanedUsers,
  }
}

async function enforceExpiredMatchedUsers(
  matchedUsers: SyncedAppUser[],
  now = new Date(),
): Promise<void> {
  await Promise.all(
    matchedUsers.map(async (matchedUser) => {
      const jellyfinUser = matchedUser.jellyfinUser
      if (
        jellyfinUser === null ||
        !isUserExpired(matchedUser, jellyfinUser.isAdmin, now)
      ) {
        return
      }

      try {
        await enforceExpiredUserAccess(
          {
            userId: matchedUser.userId,
            userName: jellyfinUser.name,
            expiresAt: matchedUser.expiresAt,
            isAdmin: jellyfinUser.isAdmin,
            isDisabled: jellyfinUser.isDisabled,
          },
          now,
        )
        jellyfinUser.isDisabled = true
      } catch (err) {
        log.error(
          { err, userId: matchedUser.userId },
          "Failed to enforce disablement for expired user",
        )
      }
    }),
  )
}

async function claimExpiryWarningDelivery(
  matchedUser: SyncedAppUser,
  expiresAt: Date,
  now: Date,
): Promise<boolean> {
  const [claimedUser] = await db
    .update(users)
    .set({
      expiryWarningSentAt: now,
      expiryWarningSentFor: expiresAt,
    })
    .where(
      and(
        eq(users.userId, matchedUser.userId),
        eq(users.expiresAt, expiresAt),
        eq(users.email, matchedUser.email!),
        eq(users.emailVerified, true),
        or(
          isNull(users.expiryWarningSentFor),
          ne(users.expiryWarningSentFor, expiresAt),
        ),
      ),
    )
    .returning({ userId: users.userId })

  return claimedUser !== undefined
}

async function resetExpiryWarningDeliveryClaim(
  matchedUser: SyncedAppUser,
  expiresAt: Date,
  now: Date,
  previousExpiryWarningSentAt: Date | null,
  previousExpiryWarningSentFor: Date | null,
): Promise<void> {
  await db
    .update(users)
    .set({
      expiryWarningSentAt: previousExpiryWarningSentAt,
      expiryWarningSentFor: previousExpiryWarningSentFor,
    })
    .where(
      and(
        eq(users.userId, matchedUser.userId),
        eq(users.expiryWarningSentAt, now),
        eq(users.expiryWarningSentFor, expiresAt),
      ),
    )
}

async function notifyExpiringMatchedUser(
  matchedUser: SyncedAppUser,
  options: {
    appUrl: string
    manageUrl: string
    now: Date
    serverName: string
  },
): Promise<boolean> {
  const { appUrl, manageUrl, now, serverName } = options
  const jellyfinUser = matchedUser.jellyfinUser
  const expiresAt = matchedUser.expiresAt

  if (
    jellyfinUser === null ||
    jellyfinUser.isAdmin ||
    jellyfinUser.isDisabled ||
    expiresAt === null ||
    !matchedUser.email ||
    !matchedUser.emailVerified ||
    isUserExpired(matchedUser, jellyfinUser.isAdmin, now)
  ) {
    return false
  }

  const millisecondsUntilExpiry = expiresAt.getTime() - now.getTime()
  if (millisecondsUntilExpiry > USER_EXPIRY_WARNING_WINDOW_MS) {
    return false
  }

  if (hasSentExpiryWarningForCurrentExpiry(matchedUser, expiresAt)) {
    return false
  }

  const previousExpiryWarningSentAt = matchedUser.expiryWarningSentAt
  const previousExpiryWarningSentFor = matchedUser.expiryWarningSentFor
  const claimed = await claimExpiryWarningDelivery(matchedUser, expiresAt, now)
  if (!claimed) {
    return false
  }

  matchedUser.expiryWarningSentAt = now
  matchedUser.expiryWarningSentFor = expiresAt

  const locale = resolveLocale(matchedUser.locale, configManager.defaultLocale)
  const expiryDate = formatExpiryWarningDate(expiresAt, locale)

  try {
    const html = await renderExpiryWarningEmail({
      username: jellyfinUser.name,
      expiryDate,
      manageUrl,
      serverName,
      baseUrl: appUrl,
      locale,
    })

    await sendEmail({
      to: matchedUser.email,
      subject: getExpiryWarningEmailSubject({
        locale,
        serverName,
      }),
      html,
    })

    return true
  } catch (err) {
    matchedUser.expiryWarningSentAt = previousExpiryWarningSentAt
    matchedUser.expiryWarningSentFor = previousExpiryWarningSentFor

    try {
      await resetExpiryWarningDeliveryClaim(
        matchedUser,
        expiresAt,
        now,
        previousExpiryWarningSentAt,
        previousExpiryWarningSentFor,
      )
    } catch (resetErr) {
      log.warn(
        {
          err: resetErr,
          userId: matchedUser.userId,
          email: matchedUser.email,
          expiresAt,
        },
        "Failed to reset expiry warning delivery claim",
      )
    }

    log.warn(
      {
        err,
        userId: matchedUser.userId,
        email: matchedUser.email,
        expiresAt,
      },
      "Failed to send upcoming expiry warning email",
    )
    return false
  }
}

async function notifyExpiringMatchedUsers(
  matchedUsers: SyncedAppUser[],
  now = new Date(),
): Promise<void> {
  if (!configManager.isConfigured() || !isEmailConfigured()) {
    return
  }

  const appUrl = configManager.appUrl
  if (!appUrl) {
    return
  }

  const serverName = configManager.app.title
  // Land on the general profile tab, which now hosts the account-access card
  // (expiry + self-service renewal control) instead of a dead /profile route.
  const manageUrl = new URL("/profile/general", appUrl).toString()
  let taskIndex = 0
  const workerCount = Math.min(
    MAX_CONCURRENT_EXPIRY_EMAILS,
    matchedUsers.length,
  )
  const workerCounts = await Promise.all(
    Array.from({ length: workerCount }, async () => {
      let workerNotifiedCount = 0

      for (;;) {
        const matchedUser = matchedUsers[taskIndex]
        taskIndex++

        if (!matchedUser) {
          return workerNotifiedCount
        }

        const notifiedUser = await notifyExpiringMatchedUser(matchedUser, {
          appUrl,
          manageUrl,
          now,
          serverName,
        })

        if (notifiedUser) {
          workerNotifiedCount++
        }
      }
    }),
  )
  const notifiedCount = workerCounts.reduce((sum, count) => sum + count, 0)

  if (notifiedCount > 0) {
    log.info({ notifiedCount }, "Sent upcoming expiry warning emails")
  }
}

async function loadMatchedUsersForExpiryMaintenance(): Promise<
  SyncedAppUser[]
> {
  await ensureMigrated()

  const [dbUsers, jellyfinUsers] = await Promise.all([
    db.select().from(users),
    getAllUsers(),
  ])
  const jellyfinUsersById = new Map(
    jellyfinUsers.map((user) => [user.id, user]),
  )

  return dbUsers.map((dbUser) => ({
    ...dbUser,
    profileId: jellyfinUsersById.get(dbUser.userId)?.isAdmin
      ? null
      : dbUser.profileId,
    jellyfinUser: jellyfinUsersById.get(dbUser.userId) ?? null,
  }))
}

export function sweepExpiredUsers(): Promise<void> {
  return startExpiredUserSweep(async () => {
    const matchedUsers = await loadMatchedUsersForExpiryMaintenance()

    await enforceExpiredMatchedUsers(matchedUsers)
    await notifyExpiringMatchedUsers(matchedUsers)
  })
}

export function kickOffUserExpiryMaintenance(): void {
  if (!configManager.isConfigured()) {
    return
  }

  const now = Date.now()
  if (
    expiredUserSweepPromise !== null ||
    now - lastExpiredUserSweepStartedAt < USER_EXPIRY_MAINTENANCE_INTERVAL_MS
  ) {
    return
  }

  void sweepExpiredUsers().catch((err) => {
    log.warn({ err }, "User expiry maintenance failed")
  })
}

export function startUserExpiryMaintenanceScheduler(): void {
  if (userExpiryMaintenanceInterval !== null) {
    return
  }

  userExpiryMaintenanceInterval = setInterval(() => {
    kickOffUserExpiryMaintenance()
  }, USER_EXPIRY_MAINTENANCE_INTERVAL_MS)
  userExpiryMaintenanceInterval.unref?.()
}
