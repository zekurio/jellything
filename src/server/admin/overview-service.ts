import { and, count, desc, gte, lte, sql } from "drizzle-orm"

import { success, type ActionResult } from "@/lib/api/contracts/errors"
import { classifyInviteStatus, deriveInviteStatus } from "@/lib/invite-status"
import { db, ensureMigrated } from "@/server/db.server"
import { inviteUsages, invites, users } from "@/server/db/schema"
import { getAllUsers } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "admin-overview-service" })

const DAY_MS = 24 * 60 * 60 * 1000
// Mirrors USER_EXPIRY_WARNING_WINDOW_MS in src/server/users.ts (72h) so the
// "expiring soon" tile matches the window that actually triggers warning mail.
const EXPIRING_SOON_WINDOW_MS = 72 * 60 * 60 * 1000
const REDEMPTION_WINDOW_DAYS = 7

export interface OverviewSummary {
  // Enabled, non-admin Jellyfin members. Requires a live Jellyfin call, so it
  // degrades to 0 with `usersAvailable: false` when Jellyfin is unreachable.
  activeUsers: number
  usersAvailable: boolean
  expiringSoon: number
  expiringSoonWindowHours: number
  totalInvites: number
  // Invites whose derived status is disabled, expired, or exhausted.
  inactiveInvites: number
  redemptions: number
  redemptionWindowDays: number
  // One entry per day across the redemption window (oldest first, zero-filled).
  redemptionsByDay: Array<{ day: string; count: number }>
  lastRedemptionAt: string | null
}

export const EMPTY_OVERVIEW_SUMMARY: OverviewSummary = {
  activeUsers: 0,
  usersAvailable: false,
  expiringSoon: 0,
  expiringSoonWindowHours: EXPIRING_SOON_WINDOW_MS / (60 * 60 * 1000),
  totalInvites: 0,
  inactiveInvites: 0,
  redemptions: 0,
  redemptionWindowDays: REDEMPTION_WINDOW_DAYS,
  redemptionsByDay: [],
  lastRedemptionAt: null,
}

export async function getOverviewService(): Promise<
  ActionResult<OverviewSummary>
> {
  await ensureMigrated()

  const now = new Date()
  const expiringWindowEnd = new Date(now.getTime() + EXPIRING_SOON_WINDOW_MS)
  // Start at the beginning of the oldest day in the window so the day buckets
  // line up with the zero-filled series below.
  const redemptionWindowStart = startOfUtcDay(
    new Date(now.getTime() - (REDEMPTION_WINDOW_DAYS - 1) * DAY_MS),
  )
  const dayBucket = sql<string>`strftime('%Y-%m-%d', ${inviteUsages.usedAt} / 1000, 'unixepoch')`

  const [expiringRows, inviteRows, redemptionRows, lastRedemptionRows] =
    await Promise.all([
      db
        .select({ total: count() })
        .from(users)
        .where(
          and(
            gte(users.expiresAt, now),
            lte(users.expiresAt, expiringWindowEnd),
          ),
        ),
      // The invites table is small and its status (disabled/expired/exhausted)
      // depends on the shared deriveInviteStatus thresholds, so read the four
      // status-relevant columns once and classify in JS rather than duplicate
      // that logic in SQL. Redemptions — the unbounded table — stay pure SQL.
      db
        .select({
          isDisabled: invites.isDisabled,
          useLimit: invites.useLimit,
          useCount: invites.useCount,
          expiresAt: invites.expiresAt,
        })
        .from(invites),
      db
        .select({ day: dayBucket, total: count() })
        .from(inviteUsages)
        .where(gte(inviteUsages.usedAt, redemptionWindowStart))
        .groupBy(dayBucket),
      db
        .select({ usedAt: inviteUsages.usedAt })
        .from(inviteUsages)
        .orderBy(desc(inviteUsages.usedAt))
        .limit(1),
    ])

  const inactiveInvites = inviteRows.filter(
    (invite) => classifyInviteStatus(deriveInviteStatus(invite)) === "inactive",
  ).length

  const redemptionsByDayCounts = new Map(
    redemptionRows.map((row) => [row.day, row.total]),
  )
  const redemptionsByDay = Array.from(
    { length: REDEMPTION_WINDOW_DAYS },
    (_, index) => {
      const day = toUtcDayKey(
        new Date(redemptionWindowStart.getTime() + index * DAY_MS),
      )
      return { day, count: redemptionsByDayCounts.get(day) ?? 0 }
    },
  )
  const redemptions = redemptionsByDay.reduce(
    (total, point) => total + point.count,
    0,
  )

  return success({
    ...(await resolveActiveUsers()),
    expiringSoon: expiringRows[0]?.total ?? 0,
    expiringSoonWindowHours: EXPIRING_SOON_WINDOW_MS / (60 * 60 * 1000),
    totalInvites: inviteRows.length,
    inactiveInvites,
    redemptions,
    redemptionWindowDays: REDEMPTION_WINDOW_DAYS,
    redemptionsByDay,
    lastRedemptionAt: lastRedemptionRows[0]?.usedAt.toISOString() ?? null,
  })
}

// Active-user counts live on the Jellyfin side, so a Jellyfin outage must not
// fail the whole overview — degrade to a zero count flagged as unavailable.
async function resolveActiveUsers(): Promise<{
  activeUsers: number
  usersAvailable: boolean
}> {
  try {
    const jellyfinUsers = await getAllUsers()
    return {
      activeUsers: jellyfinUsers.filter(
        (user) => !user.isAdmin && !user.isDisabled,
      ).length,
      usersAvailable: true,
    }
  } catch (err) {
    log.warn({ err }, "Failed to fetch Jellyfin users for overview")
    return { activeUsers: 0, usersAvailable: false }
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}
