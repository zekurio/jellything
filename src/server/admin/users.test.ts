import { afterEach, describe, expect, it, vi } from "vitest"

import type { revokeAllUserSessions } from "@/server/session"
import type {
  deleteAppUserData,
  deleteLinkedSeerrUser,
  ensureUserRecord,
  syncUsersWithJellyfin,
} from "@/server/user-lifecycle"
import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    get seerr() {
      return undefined
    },
  },
}))

vi.mock("@/server/jellyfin", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/jellyfin")>()

  return {
    ...original,
    getAllUsers: vi.fn<typeof original.getAllUsers>(),
    deleteUser: vi.fn<() => Promise<void>>(),
  }
})

vi.mock("@/server/jellyfin/admin", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/jellyfin/admin")>()

  return {
    ...original,
    updateUserPolicy: vi.fn<() => Promise<void>>(),
  }
})

vi.mock("@/server/session", () => ({
  revokeAllUserSessions: vi.fn<typeof revokeAllUserSessions>(),
}))

vi.mock("@/server/user-lifecycle", async (importOriginal) => {
  const original = await importOriginal<{
    deleteAppUserData: typeof deleteAppUserData
    deleteLinkedSeerrUser: typeof deleteLinkedSeerrUser
    ensureUserRecord: typeof ensureUserRecord
    syncUsersWithJellyfin: typeof syncUsersWithJellyfin
  }>()

  return {
    deleteAppUserData: vi.fn<typeof deleteAppUserData>(),
    deleteLinkedSeerrUser: vi.fn<typeof deleteLinkedSeerrUser>(),
    ensureUserRecord: original.ensureUserRecord,
    syncUsersWithJellyfin: original.syncUsersWithJellyfin,
  }
})

let testDatabase: TestDatabase | null = null

const managedDbUser = {
  userId: "managed-user",
  email: "managed@example.com",
}

const managedSession = {
  id: "managed-session",
  userId: managedDbUser.userId,
  secretHash: "secret-hash",
  jellyfinAccessToken: "access-token",
  jellyfinDeviceId: "device-id",
  displayNameSnapshot: "Managed User",
  expiresAt: new Date("2100-01-01T00:00:00.000Z"),
}

const managedJellyfinUser = {
  id: managedDbUser.userId,
  name: "Managed User",
  isAdmin: false,
  isDisabled: false,
  lastActivityDate: null,
  hasPassword: true,
  avatarUrl: "",
}

async function loadUsersServiceModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const actualSession = await vi.importActual<{
    revokeAllUserSessions: typeof revokeAllUserSessions
  }>("@/server/session")
  const actualUserLifecycle = await vi.importActual<{
    deleteAppUserData: typeof deleteAppUserData
    deleteLinkedSeerrUser: typeof deleteLinkedSeerrUser
  }>("@/server/user-lifecycle")

  const usersService = await import("@/server/admin/users")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const errors = await import("@/lib/api/contracts/errors")
  const jellyfin = await import("@/server/jellyfin")
  const jellyfinAdmin = await import("@/server/jellyfin/admin")
  const session = await import("@/server/session")
  const userLifecycle = await import("@/server/user-lifecycle")
  vi.mocked(session.revokeAllUserSessions).mockImplementation(
    actualSession.revokeAllUserSessions,
  )
  vi.mocked(userLifecycle.deleteAppUserData).mockImplementation(
    actualUserLifecycle.deleteAppUserData,
  )
  vi.mocked(userLifecycle.deleteLinkedSeerrUser).mockImplementation(
    actualUserLifecycle.deleteLinkedSeerrUser,
  )

  await database.ensureMigrated()

  return {
    usersService,
    database,
    schema,
    errors,
    jellyfin,
    jellyfinAdmin,
    session,
    userLifecycle,
  }
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
  vi.clearAllMocks()
})

describe("bulkManageUsersService", () => {
  it("aggregates per-user results and preserves the last-admin disable guard", async () => {
    const setup = await loadUsersServiceModules()

    await setup.database.db.insert(setup.schema.users).values([
      { userId: "admin-1", email: "admin1@example.com" },
      { userId: "admin-2", email: "admin2@example.com" },
      { userId: "disabled-user", email: "disabled@example.com" },
    ])

    vi.mocked(setup.jellyfin.getAllUsers).mockResolvedValue([
      {
        id: "admin-1",
        name: "Admin One",
        isAdmin: true,
        isDisabled: false,
        lastActivityDate: null,
        hasPassword: true,
        avatarUrl: "",
      },
      {
        id: "admin-2",
        name: "Admin Two",
        isAdmin: true,
        isDisabled: false,
        lastActivityDate: null,
        hasPassword: true,
        avatarUrl: "",
      },
      {
        id: "disabled-user",
        name: "Disabled User",
        isAdmin: false,
        isDisabled: true,
        lastActivityDate: null,
        hasPassword: true,
        avatarUrl: "",
      },
    ])
    vi.mocked(setup.jellyfinAdmin.updateUserPolicy).mockResolvedValue()

    const result = await setup.usersService.bulkManageUsersService({
      operation: "disable",
      userIds: ["admin-1", "admin-2", "disabled-user"],
    })

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk disable to return a success envelope")
    }

    expect(result.data.results).toEqual([
      expect.objectContaining({
        userId: "admin-1",
        ok: true,
        operation: "disable",
        result: expect.objectContaining({ isDisabled: true }),
      }),
      expect.objectContaining({
        userId: "admin-2",
        ok: false,
        operation: "disable",
        code: setup.errors.ErrorCode.LAST_ADMIN_REQUIRED,
      }),
      {
        userId: "disabled-user",
        ok: true,
        operation: "disable",
        skipped: true,
        reason: "already_disabled",
      },
    ])
    expect(setup.jellyfin.getAllUsers).toHaveBeenCalledTimes(1)
    expect(setup.jellyfinAdmin.updateUserPolicy).toHaveBeenCalledTimes(1)
    expect(setup.jellyfinAdmin.updateUserPolicy).toHaveBeenCalledWith(
      "admin-1",
      { isDisabled: true },
    )
  })
})

describe("deleteManagedUserService", () => {
  it("deletes in a stable order and leaves no valid sessions on success", async () => {
    const setup = await loadUsersServiceModules()
    await setup.database.db.insert(setup.schema.users).values(managedDbUser)
    await setup.database.db.insert(setup.schema.sessions).values(managedSession)

    vi.mocked(setup.jellyfin.getAllUsers).mockResolvedValue([
      managedJellyfinUser,
    ])
    vi.mocked(setup.jellyfin.deleteUser).mockResolvedValue()
    vi.mocked(setup.userLifecycle.deleteLinkedSeerrUser).mockResolvedValue(true)

    const result = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(result).toEqual({
      success: true,
      data: {
        userId: managedDbUser.userId,
        deletedFromJellyfin: true,
        deletedFromSeerr: true,
      },
    })
    expect(await setup.database.db.query.users.findFirst()).toBeUndefined()
    expect(await setup.database.db.query.sessions.findFirst()).toBeUndefined()

    const sessionOrder = vi.mocked(setup.session.revokeAllUserSessions).mock
      .invocationCallOrder[0]
    const jellyfinOrder = vi.mocked(setup.jellyfin.deleteUser).mock
      .invocationCallOrder[0]
    const seerrOrder = vi.mocked(setup.userLifecycle.deleteLinkedSeerrUser).mock
      .invocationCallOrder[0]
    const localOrder = vi.mocked(setup.userLifecycle.deleteAppUserData).mock
      .invocationCallOrder[0]

    expect(sessionOrder).toBeTypeOf("number")
    expect(jellyfinOrder).toBeGreaterThan(sessionOrder ?? 0)
    expect(seerrOrder).toBeGreaterThan(jellyfinOrder ?? 0)
    expect(localOrder).toBeGreaterThan(seerrOrder ?? 0)
  })

  it("stops before external deletion when session revocation fails and succeeds on retry", async () => {
    const setup = await loadUsersServiceModules()
    await setup.database.db.insert(setup.schema.users).values(managedDbUser)
    await setup.database.db.insert(setup.schema.sessions).values(managedSession)

    vi.mocked(setup.jellyfin.getAllUsers).mockResolvedValue([
      managedJellyfinUser,
    ])
    vi.mocked(setup.session.revokeAllUserSessions).mockRejectedValueOnce(
      new Error("session database unavailable"),
    )

    const failed = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(failed).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.OPERATION_FAILED,
        error: "Failed to delete user",
      }),
    )
    expect(setup.jellyfin.deleteUser).not.toHaveBeenCalled()
    expect(setup.userLifecycle.deleteLinkedSeerrUser).not.toHaveBeenCalled()
    expect(setup.userLifecycle.deleteAppUserData).not.toHaveBeenCalled()
    expect(await setup.database.db.query.users.findFirst()).toBeDefined()
    expect(
      (await setup.database.db.query.sessions.findFirst())?.revokedAt,
    ).toBeNull()

    const retried = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(retried.success).toBe(true)
    expect(await setup.database.db.query.users.findFirst()).toBeUndefined()
    expect(await setup.database.db.query.sessions.findFirst()).toBeUndefined()
  })

  it("retains recoverable local state when Jellyfin deletion fails", async () => {
    const setup = await loadUsersServiceModules()
    await setup.database.db.insert(setup.schema.users).values(managedDbUser)
    await setup.database.db.insert(setup.schema.sessions).values(managedSession)

    vi.mocked(setup.jellyfin.getAllUsers).mockResolvedValue([
      managedJellyfinUser,
    ])
    vi.mocked(setup.jellyfin.deleteUser).mockRejectedValueOnce(
      new Error("Jellyfin unavailable"),
    )

    const failed = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(failed).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.OPERATION_FAILED,
        error: "Failed to delete user",
      }),
    )
    expect(setup.userLifecycle.deleteLinkedSeerrUser).not.toHaveBeenCalled()
    expect(setup.userLifecycle.deleteAppUserData).not.toHaveBeenCalled()
    expect(await setup.database.db.query.users.findFirst()).toBeDefined()
    expect(
      (await setup.database.db.query.sessions.findFirst())?.revokedAt,
    ).toBeInstanceOf(Date)

    const retried = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(retried.success).toBe(true)
    expect(await setup.database.db.query.users.findFirst()).toBeUndefined()
  })

  it("reports Seerr failure after Jellyfin deletion and resumes from local state", async () => {
    const setup = await loadUsersServiceModules()
    await setup.database.db.insert(setup.schema.users).values(managedDbUser)
    await setup.database.db.insert(setup.schema.sessions).values(managedSession)

    vi.mocked(setup.jellyfin.getAllUsers)
      .mockResolvedValueOnce([managedJellyfinUser])
      .mockResolvedValueOnce([])
    vi.mocked(setup.jellyfin.deleteUser).mockResolvedValue()
    vi.mocked(setup.userLifecycle.deleteLinkedSeerrUser)
      .mockRejectedValueOnce(new Error("Seerr unavailable"))
      .mockResolvedValue(false)

    const failed = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(failed).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.OPERATION_FAILED,
        error: "Failed to delete user",
      }),
    )
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledTimes(1)
    expect(setup.userLifecycle.deleteAppUserData).not.toHaveBeenCalled()
    expect(await setup.database.db.query.users.findFirst()).toBeDefined()
    expect(
      (await setup.database.db.query.sessions.findFirst())?.revokedAt,
    ).toBeInstanceOf(Date)

    const retried = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(retried).toEqual({
      success: true,
      data: {
        userId: managedDbUser.userId,
        deletedFromJellyfin: false,
        deletedFromSeerr: false,
      },
    })
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledTimes(1)
    expect(await setup.database.db.query.users.findFirst()).toBeUndefined()
    expect(await setup.database.db.query.sessions.findFirst()).toBeUndefined()
  })

  it("reports local deletion failure after external deletion and completes on retry", async () => {
    const setup = await loadUsersServiceModules()
    await setup.database.db.insert(setup.schema.users).values(managedDbUser)
    await setup.database.db.insert(setup.schema.sessions).values(managedSession)

    vi.mocked(setup.jellyfin.getAllUsers)
      .mockResolvedValueOnce([managedJellyfinUser])
      .mockResolvedValueOnce([])
    vi.mocked(setup.jellyfin.deleteUser).mockResolvedValue()
    vi.mocked(setup.userLifecycle.deleteLinkedSeerrUser)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false)
    vi.mocked(setup.userLifecycle.deleteAppUserData).mockRejectedValueOnce(
      new Error("local database unavailable"),
    )

    const failed = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(failed).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.OPERATION_FAILED,
        error: "Failed to delete user",
      }),
    )
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledTimes(1)
    expect(setup.userLifecycle.deleteLinkedSeerrUser).toHaveBeenCalledTimes(1)
    expect(await setup.database.db.query.users.findFirst()).toBeDefined()
    expect(
      (await setup.database.db.query.sessions.findFirst())?.revokedAt,
    ).toBeInstanceOf(Date)

    const retried = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(retried.success).toBe(true)
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledTimes(1)
    expect(await setup.database.db.query.users.findFirst()).toBeUndefined()
    expect(await setup.database.db.query.sessions.findFirst()).toBeUndefined()
  })

  it("preserves the last-admin guard before revoking sessions", async () => {
    const setup = await loadUsersServiceModules()
    await setup.database.db.insert(setup.schema.users).values(managedDbUser)
    await setup.database.db.insert(setup.schema.sessions).values(managedSession)

    vi.mocked(setup.jellyfin.getAllUsers).mockResolvedValue([
      {
        ...managedJellyfinUser,
        isAdmin: true,
      },
    ])

    const result = await setup.usersService.deleteManagedUserService(
      managedDbUser.userId,
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.LAST_ADMIN_REQUIRED,
      }),
    )
    expect(setup.session.revokeAllUserSessions).not.toHaveBeenCalled()
    expect(setup.jellyfin.deleteUser).not.toHaveBeenCalled()
    expect(
      (await setup.database.db.query.sessions.findFirst())?.revokedAt,
    ).toBeNull()
  })
})
