import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

let testDatabase: TestDatabase | null = null

async function loadProfilesServiceModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const profilesService = await import("@/server/admin/profiles")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const errors = await import("@/lib/api/contracts/errors")

  await database.ensureMigrated()

  return { profilesService, database, schema, errors }
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
  vi.clearAllMocks()
})

describe("bulkManageProfilesService", () => {
  it("deletes profiles while skipping the default and reporting missing ones", async () => {
    const setup = await loadProfilesServiceModules()

    const defaultProfileId = crypto.randomUUID()
    const extraProfileId = crypto.randomUUID()
    const missingProfileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values([
      {
        id: defaultProfileId,
        name: "Default",
        isDefault: true,
        policy: setup.schema.DEFAULT_PROFILE_POLICY,
      },
      {
        id: extraProfileId,
        name: "Extra",
        isDefault: false,
        policy: setup.schema.DEFAULT_PROFILE_POLICY,
      },
    ])

    const result = await setup.profilesService.bulkManageProfilesService({
      operation: "delete",
      profileIds: [extraProfileId, defaultProfileId, missingProfileId],
    })

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk delete to return a success envelope")
    }

    expect(result.data.results).toEqual([
      { profileId: extraProfileId, ok: true, operation: "delete" },
      {
        profileId: defaultProfileId,
        ok: true,
        operation: "delete",
        skipped: true,
        reason: "default_profile",
      },
      expect.objectContaining({
        profileId: missingProfileId,
        ok: false,
        operation: "delete",
        code: setup.errors.ErrorCode.NOT_FOUND,
      }),
    ])

    const remainingProfiles = await setup.database.db.query.profiles.findMany()
    expect(remainingProfiles.map((profile) => profile.id)).toEqual([
      defaultProfileId,
    ])
  })

  it("refuses to delete the last remaining profile", async () => {
    const setup = await loadProfilesServiceModules()

    const onlyProfileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: onlyProfileId,
      name: "Only",
      isDefault: false,
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })

    const result = await setup.profilesService.bulkManageProfilesService({
      operation: "delete",
      profileIds: [onlyProfileId],
    })

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk delete to return a success envelope")
    }

    expect(result.data.results).toEqual([
      expect.objectContaining({
        profileId: onlyProfileId,
        ok: false,
        operation: "delete",
        code: setup.errors.ErrorCode.CONFLICT,
      }),
    ])
    expect(await setup.database.db.query.profiles.findMany()).toHaveLength(1)
  })

  it("refuses to delete a profile that is still used by invites", async () => {
    const setup = await loadProfilesServiceModules()

    const defaultProfileId = crypto.randomUUID()
    const usedProfileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values([
      {
        id: defaultProfileId,
        name: "Default",
        isDefault: true,
        policy: setup.schema.DEFAULT_PROFILE_POLICY,
      },
      {
        id: usedProfileId,
        name: "Used",
        isDefault: false,
        policy: setup.schema.DEFAULT_PROFILE_POLICY,
      },
    ])
    await setup.database.db.insert(setup.schema.invites).values({
      id: crypto.randomUUID(),
      code: "USESPROF",
      profileId: usedProfileId,
    })

    const result = await setup.profilesService.bulkManageProfilesService({
      operation: "delete",
      profileIds: [usedProfileId],
    })

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk delete to return a success envelope")
    }

    expect(result.data.results).toEqual([
      expect.objectContaining({
        profileId: usedProfileId,
        ok: false,
        operation: "delete",
        code: setup.errors.ErrorCode.CONFLICT,
        message: "Cannot delete a profile that is still used by invites",
      }),
    ])
    expect(await setup.database.db.query.profiles.findMany()).toHaveLength(2)
  })
})
