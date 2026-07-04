import { afterEach, describe, expect, it, vi } from "vitest"

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

let testDatabase: TestDatabase | null = null

async function loadUsersServiceModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const usersService = await import("@/server/admin/users")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const errors = await import("@/lib/api/contracts/errors")
  const jellyfin = await import("@/server/jellyfin")
  const jellyfinAdmin = await import("@/server/jellyfin/admin")

  await database.ensureMigrated()

  return { usersService, database, schema, errors, jellyfin, jellyfinAdmin }
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
