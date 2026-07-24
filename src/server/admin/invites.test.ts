import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

let testDatabase: TestDatabase | null = null

async function loadInvitesServiceModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const invitesService = await import("@/server/admin/invites")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const errors = await import("@/lib/api/contracts/errors")

  await database.ensureMigrated()

  return { invitesService, database, schema, errors }
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
  vi.clearAllMocks()
})

describe("bulkManageInvitesService", () => {
  it("disables invites, skips already-disabled ones, and reports missing invites", async () => {
    const setup = await loadInvitesServiceModules()

    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Standard",
      isDefault: true,
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })

    const enabledInviteId = crypto.randomUUID()
    const disabledInviteId = crypto.randomUUID()
    const missingInviteId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.invites).values([
      { id: enabledInviteId, code: "ENABLED", profileId, isDisabled: false },
      { id: disabledInviteId, code: "DISABLED", profileId, isDisabled: true },
    ])

    const result = await setup.invitesService.bulkManageInvitesService({
      operation: "disable",
      inviteIds: [enabledInviteId, disabledInviteId, missingInviteId],
    })

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk disable to return a success envelope")
    }

    expect(result.data.results).toEqual([
      expect.objectContaining({
        inviteId: enabledInviteId,
        ok: true,
        operation: "disable",
        result: expect.objectContaining({
          isDisabled: true,
          status: "disabled",
          profileName: "Standard",
        }),
      }),
      {
        inviteId: disabledInviteId,
        ok: true,
        operation: "disable",
        skipped: true,
        reason: "already_disabled",
      },
      expect.objectContaining({
        inviteId: missingInviteId,
        ok: false,
        operation: "disable",
        code: setup.errors.ErrorCode.NOT_FOUND,
      }),
    ])

    const storedInvites = await setup.database.db.query.invites.findMany()
    expect(
      storedInvites.map((invite) => [invite.id, invite.isDisabled]),
    ).toEqual(
      expect.arrayContaining([
        [enabledInviteId, true],
        [disabledInviteId, true],
      ]),
    )
  })

  it("re-enables disabled invites and skips already-enabled ones", async () => {
    const setup = await loadInvitesServiceModules()

    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Standard",
      isDefault: true,
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })

    const disabledInviteId = crypto.randomUUID()
    const enabledInviteId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.invites).values([
      { id: disabledInviteId, code: "DISABLED", profileId, isDisabled: true },
      { id: enabledInviteId, code: "ENABLED", profileId, isDisabled: false },
    ])

    const result = await setup.invitesService.bulkManageInvitesService({
      operation: "enable",
      inviteIds: [disabledInviteId, enabledInviteId],
    })

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk enable to return a success envelope")
    }

    expect(result.data.results).toEqual([
      expect.objectContaining({
        inviteId: disabledInviteId,
        ok: true,
        operation: "enable",
        result: expect.objectContaining({ isDisabled: false }),
      }),
      {
        inviteId: enabledInviteId,
        ok: true,
        operation: "enable",
        skipped: true,
        reason: "already_enabled",
      },
    ])
  })

  it("deletes invites together with their usage records", async () => {
    const setup = await loadInvitesServiceModules()

    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Standard",
      isDefault: true,
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })

    const usedInviteId = crypto.randomUUID()
    const untouchedInviteId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.invites).values([
      { id: usedInviteId, code: "USED", profileId, useCount: 1 },
      { id: untouchedInviteId, code: "KEPT", profileId },
    ])
    await setup.database.db
      .insert(setup.schema.users)
      .values({ userId: "invited-user", inviteId: usedInviteId })
    await setup.database.db
      .insert(setup.schema.inviteUsages)
      .values({ inviteId: usedInviteId, userId: "invited-user" })

    const result = await setup.invitesService.bulkManageInvitesService({
      operation: "delete",
      inviteIds: [usedInviteId],
    })

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected bulk delete to return a success envelope")
    }

    expect(result.data.results).toEqual([
      { inviteId: usedInviteId, ok: true, operation: "delete" },
    ])

    const remainingInvites = await setup.database.db.query.invites.findMany()
    expect(remainingInvites.map((invite) => invite.id)).toEqual([
      untouchedInviteId,
    ])
    expect(await setup.database.db.query.inviteUsages.findMany()).toEqual([])
  })

  it("rejects invalid input with a validation error", async () => {
    const setup = await loadInvitesServiceModules()

    const result = await setup.invitesService.bulkManageInvitesService({
      operation: "disable",
      inviteIds: [],
    })

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.VALIDATION_FAILED,
      }),
    )
  })
})
