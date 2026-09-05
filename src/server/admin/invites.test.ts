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

describe("invite management", () => {
  it("rejects invalid invite creation before persisting and normalizes the corrected code", async () => {
    const setup = await loadInvitesServiceModules()
    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Members",
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })

    expect(
      await setup.invitesService.createInviteService(undefined, {
        profileId,
        code: "bad!",
      }),
    ).toMatchObject({
      success: false,
      code: setup.errors.ErrorCode.VALIDATION_FAILED,
    })
    expect(await setup.database.db.query.invites.findMany()).toEqual([])

    const result = await setup.invitesService.createInviteService(undefined, {
      profileId,
      code: "  family-2026  ",
    })
    expect(result).toMatchObject({
      success: true,
      data: {
        code: "FAMILY-2026",
        profileName: "Members",
        useLimit: null,
        useCount: 0,
        isDisabled: false,
      },
    })
    expect(await setup.database.db.query.invites.findMany()).toMatchObject([
      { code: "FAMILY-2026", profileId, useLimit: null, useCount: 0 },
    ])
  })

  it("paginates matching invites using URL search values and rejects invalid pages", async () => {
    const setup = await loadInvitesServiceModules()
    const profileId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Members",
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })
    await setup.database.db.insert(setup.schema.invites).values([
      { id: crypto.randomUUID(), profileId, code: "FAMILY-01" },
      { id: crypto.randomUUID(), profileId, code: "FAMILY-02" },
      { id: crypto.randomUUID(), profileId, code: "FRIENDS-01" },
    ])
    expect(await setup.invitesService.listInvitesPageService({})).toMatchObject(
      { success: true, data: { page: 1, pageSize: 50, total: 3 } },
    )
    const result = await setup.invitesService.listInvitesPageService({
      page: "2",
      pageSize: "1",
      query: "  FAMILY  ",
      sort: "code",
      direction: "asc",
    })
    expect(result).toMatchObject({
      success: true,
      data: {
        items: [{ code: "FAMILY-02" }],
        page: 2,
        pageSize: 1,
        total: 2,
        pageCount: 2,
      },
    })
    expect(
      await setup.invitesService.listInvitesPageService({ page: "invalid" }),
    ).toMatchObject({
      success: false,
      code: setup.errors.ErrorCode.VALIDATION_FAILED,
    })
  })

  it("allows disabling an invite without letting submitted fields reset its usage counter", async () => {
    const setup = await loadInvitesServiceModules()
    const profileId = crypto.randomUUID()
    const inviteId = crypto.randomUUID()
    await setup.database.db.insert(setup.schema.profiles).values({
      id: profileId,
      name: "Members",
      policy: setup.schema.DEFAULT_PROFILE_POLICY,
    })
    await setup.database.db.insert(setup.schema.invites).values({
      id: inviteId,
      profileId,
      code: "FAMILY-01",
      useLimit: 2,
      useCount: 1,
    })
    expect(
      await setup.invitesService.updateInviteService(inviteId, {}),
    ).toMatchObject({
      success: false,
      code: setup.errors.ErrorCode.VALIDATION_FAILED,
    })
    const updates = { isDisabled: true, useCount: 0 }
    expect(
      await setup.invitesService.updateInviteService(inviteId, updates),
    ).toMatchObject({ success: true, data: { isDisabled: true, useCount: 1 } })
    expect(await setup.database.db.query.invites.findMany()).toMatchObject([
      { id: inviteId, isDisabled: true, useCount: 1 },
    ])
  })
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
