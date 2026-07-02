import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

let testDatabase: TestDatabase | null = null

const DAY_MS = 24 * 60 * 60 * 1000

async function loadOverviewModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const overview = await import("@/server/admin/overview-service")
  const database = await import("@/server/db.server")
  const schema = await import("@/server/db/schema")

  await database.ensureMigrated()

  return { overview, database, schema }
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
})

describe("getOverviewService", () => {
  it("returns zeroed counts with no data and degrades when Jellyfin is unreachable", async () => {
    const { overview } = await loadOverviewModules()

    const result = await overview.getOverviewService()

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.totalInvites).toBe(0)
    expect(result.data.inactiveInvites).toBe(0)
    expect(result.data.expiringSoon).toBe(0)
    expect(result.data.redemptions).toBe(0)
    expect(result.data.lastRedemptionAt).toBeNull()
    // Jellyfin is not configured in tests, so active-user stats degrade.
    expect(result.data.usersAvailable).toBe(false)
    expect(result.data.activeUsers).toBe(0)
    // The by-day series is always the full window, zero-filled.
    expect(result.data.redemptionsByDay).toHaveLength(
      result.data.redemptionWindowDays,
    )
  })

  it("counts invites by derived status and excludes redemptions outside the window", async () => {
    const { overview, database, schema } = await loadOverviewModules()
    const now = Date.now()

    await database.db.insert(schema.profiles).values({
      id: "profile-1",
      name: "Default",
      isDefault: true,
      policy: schema.DEFAULT_PROFILE_POLICY,
    })

    await database.db.insert(schema.invites).values([
      // active: not disabled, no limit, no expiry
      { id: "invite-active", code: "ACTIVEAAA", profileId: "profile-1" },
      // disabled -> inactive
      {
        id: "invite-disabled",
        code: "DISABLEDA",
        profileId: "profile-1",
        isDisabled: true,
      },
      // exhausted -> inactive
      {
        id: "invite-exhausted",
        code: "EXHAUSTAA",
        profileId: "profile-1",
        useLimit: 1,
        useCount: 1,
      },
      // expired -> inactive
      {
        id: "invite-expired",
        code: "EXPIREDAA",
        profileId: "profile-1",
        expiresAt: new Date(now - DAY_MS),
      },
    ])

    await database.db.insert(schema.users).values({
      userId: "user-1",
      email: "user@example.com",
    })

    await database.db.insert(schema.inviteUsages).values([
      {
        id: "usage-1",
        inviteId: "invite-active",
        userId: "user-1",
        usedAt: new Date(now),
      },
      {
        id: "usage-2",
        inviteId: "invite-active",
        userId: "user-1",
        usedAt: new Date(now - DAY_MS),
      },
      {
        id: "usage-3",
        inviteId: "invite-active",
        userId: "user-1",
        usedAt: new Date(now - 2 * DAY_MS),
      },
      // Just outside the 7-day window; must be excluded from the count.
      {
        id: "usage-old",
        inviteId: "invite-active",
        userId: "user-1",
        usedAt: new Date(now - 10 * DAY_MS),
      },
    ])

    const result = await overview.getOverviewService()

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.totalInvites).toBe(4)
    expect(result.data.inactiveInvites).toBe(3)
    expect(result.data.redemptions).toBe(3)
    expect(result.data.lastRedemptionAt).toBe(new Date(now).toISOString())
    expect(result.data.redemptionsByDay).toHaveLength(
      result.data.redemptionWindowDays,
    )
  })

  it("counts only users expiring within the window", async () => {
    const { overview, database, schema } = await loadOverviewModules()
    const now = Date.now()

    await database.db.insert(schema.users).values([
      // within the 72h window -> counted
      { userId: "expiring-soon", expiresAt: new Date(now + DAY_MS) },
      // beyond the window -> not counted
      { userId: "expiring-later", expiresAt: new Date(now + 10 * DAY_MS) },
      // already expired -> not counted
      { userId: "already-expired", expiresAt: new Date(now - DAY_MS) },
      // no expiry -> not counted
      { userId: "no-expiry" },
    ])

    const result = await overview.getOverviewService()

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.expiringSoon).toBe(1)
    expect(result.data.expiringSoonWindowHours).toBe(72)
  })
})
