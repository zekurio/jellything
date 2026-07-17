import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionData } from "@/lib/session"
import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

const configMocks = vi.hoisted(() => ({
  seerr: undefined as { hostname: string } | undefined,
}))

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    get memberOnboarding() {
      return { enabled: false, pages: [] }
    },
    get seerr() {
      return configMocks.seerr
    },
    get appUrl() {
      return "http://localhost:5173"
    },
    get defaultLocale() {
      return "en"
    },
  },
}))

vi.mock("@/server/auth", () => ({
  clearAuthCookies: vi.fn<() => void>(),
  establishAuthenticatedSession: vi.fn<() => Promise<void>>(() =>
    Promise.resolve(),
  ),
}))

vi.mock("@/server/email", () => ({
  isEmailConfigured: vi.fn<() => boolean>(() => false),
  sendEmail: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/server/email/templates/verify-email", () => ({
  getVerifyEmailSubject: vi.fn<() => string>(() => "Verify email"),
  renderVerifyEmail: vi.fn<() => string>(() => "<p>Verify email</p>"),
}))

vi.mock("@/server/profile-sync", () => {
  class SeerrProfileSyncError extends Error {}

  return {
    applyProfileToUser: vi.fn<() => Promise<{ seerrUserId: number | null }>>(
      () => Promise.resolve({ seerrUserId: null }),
    ),
    SeerrProfileSyncError,
  }
})

vi.mock("@/server/jellyfin", () => ({
  authenticateUser: vi.fn<
    () => Promise<{
      accessToken: string
      isAdmin: boolean
      name: string
    }>
  >(() =>
    Promise.resolve({
      accessToken: "access-token",
      isAdmin: false,
      name: "test-user",
    }),
  ),
  createUser: vi.fn<
    () => Promise<{
      id: string
      isAdmin: boolean
      name: string
    }>
  >(() =>
    Promise.resolve({
      id: "jellyfin-user-1",
      isAdmin: false,
      name: "test-user",
    }),
  ),
  deleteUser: vi.fn<() => Promise<void>>(),
  getAllUsers: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  isUsernameTaken: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
  uploadUserAvatar: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/server/seerr", () => ({
  deleteSeerrUser: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  getAllSeerrUsers: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  resolveSeerrUser: vi.fn<
    () => Promise<{ id: number; jellyfinUserId: string }>
  >(() =>
    Promise.resolve({
      id: 42,
      jellyfinUserId: "jellyfin-user-1",
    }),
  ),
}))

vi.mock("@/server/session", () => ({
  revokeAllUserSessions: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}))

vi.mock("@/server/session-resolver", () => ({
  getSessionDataForUser: vi.fn<
    (input: {
      userId: string
      name: string
      isAdmin: boolean
    }) => Promise<SessionData>
  >(() =>
    Promise.resolve({
      userId: "jellyfin-user-1",
      name: "test-user",
      avatarUrl: "/api/avatar/jellyfin-user-1",
      isAdmin: false,
      email: "user@example.com",
      emailVerified: false,
      locale: null,
      createdAt: new Date(0).toISOString(),
    }),
  ),
}))

let testDatabase: TestDatabase | null = null

async function loadInviteModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const inviteService = await import("@/server/invites")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const errors = await import("@/lib/api/contracts/errors")
  const jellyfin = await import("@/server/jellyfin")
  const auth = await import("@/server/auth")
  const profileSync = await import("@/server/profile-sync")
  const seerr = await import("@/server/seerr")
  const session = await import("@/server/session")
  const userLifecycle = await import("@/server/user-lifecycle")

  await database.ensureMigrated()

  return {
    inviteService,
    database,
    schema,
    errors,
    auth,
    jellyfin,
    profileSync,
    seerr,
    session,
    userLifecycle,
  }
}

async function seedProfile(
  database: Awaited<ReturnType<typeof loadInviteModules>>["database"],
  schema: Awaited<ReturnType<typeof loadInviteModules>>["schema"],
) {
  const profile = {
    id: crypto.randomUUID(),
    name: "Managed Users",
    policy: schema.DEFAULT_PROFILE_POLICY,
  }
  await database.db.insert(schema.profiles).values(profile)
  return profile
}

async function seedInvite(
  setup: Awaited<ReturnType<typeof loadInviteModules>>,
  values: {
    code: string
    profileId: string
    isDisabled?: boolean
    useLimit?: number | null
    useCount?: number
    expiresAt?: Date | null
  },
) {
  const invite = {
    id: crypto.randomUUID(),
    code: values.code,
    profileId: values.profileId,
    isDisabled: values.isDisabled ?? false,
    useLimit: values.useLimit ?? null,
    useCount: values.useCount ?? 0,
    expiresAt: values.expiresAt ?? null,
  }
  await setup.database.db.insert(setup.schema.invites).values(invite)
  return invite
}

async function getInviteUseCount(
  setup: Awaited<ReturnType<typeof loadInviteModules>>,
  inviteId: string,
) {
  const [invite] = await setup.database.db
    .select({ useCount: setup.schema.invites.useCount })
    .from(setup.schema.invites)
    .where(eq(setup.schema.invites.id, inviteId))

  return invite?.useCount
}

function expectSuccessfulInviteValidation(
  result: Awaited<ReturnType<typeof import("@/server/invites").validateInvite>>,
) {
  if (!result.success) {
    throw new Error("Expected validateInvite to return a successful result")
  }

  return result.data
}

afterEach(async () => {
  configMocks.seerr = undefined
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
  vi.clearAllMocks()
})

describe("validateInvite", () => {
  it("returns valid for an enabled unexpired invite below its use limit", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    await seedInvite(setup, {
      code: "VALID123",
      profileId: profile.id,
      useLimit: 2,
      useCount: 1,
    })

    const result = await setup.inviteService.validateInvite(" valid123 ")
    const data = expectSuccessfulInviteValidation(result)

    expect(data).toMatchObject({
      valid: true,
      profileName: "Managed Users",
    })
  })

  it("returns invalid for disabled, expired, exhausted, and missing invites", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    await seedInvite(setup, {
      code: "DISABLED1",
      profileId: profile.id,
      isDisabled: true,
    })
    await seedInvite(setup, {
      code: "EXPIRED1",
      profileId: profile.id,
      expiresAt: new Date(Date.now() - 1_000),
    })
    await seedInvite(setup, {
      code: "EXHAUST1",
      profileId: profile.id,
      useLimit: 1,
      useCount: 1,
    })

    const cases = [
      ["DISABLED1", setup.errors.ErrorCode.INVITE_DISABLED],
      ["EXPIRED1", setup.errors.ErrorCode.INVITE_EXPIRED],
      ["EXHAUST1", setup.errors.ErrorCode.INVITE_EXHAUSTED],
      ["MISSING1", setup.errors.ErrorCode.INVITE_INVALID],
    ] as const

    for (const [code, expectedError] of cases) {
      const result = await setup.inviteService.validateInvite(code)
      const data = expectSuccessfulInviteValidation(result)

      expect(data).toMatchObject({
        error: expectedError,
        profileName: "",
        valid: false,
      })
    }
  })
})

describe("redeemInvite", () => {
  const redeemInput = {
    code: "LIMIT123",
    username: "test-user",
    password: "Password1",
    email: "user@example.com",
  }

  it("does not increment an invite that is already at its use limit", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
      useCount: 1,
    })

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.INVITE_EXHAUSTED,
      success: false,
    })
    expect(await getInviteUseCount(setup, invite.id)).toBe(1)
  })

  it("releases a reserved invite slot when Jellyfin user creation fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
      useCount: 0,
    })

    vi.mocked(setup.jellyfin.createUser).mockRejectedValueOnce(
      new Error("Jellyfin unavailable"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.JELLYFIN_ERROR,
      success: false,
    })
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("compensates when applying the invite profile fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.profileSync.applyProfileToUser).mockRejectedValueOnce(
      new Error("Jellyfin policy update failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.JELLYFIN_ERROR,
      success: false,
    })
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledWith("jellyfin-user-1")
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("preserves Jellyfin when Seerr creation is uncertain", async () => {
    configMocks.seerr = { hostname: "http://seerr.test" }
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.seerr.resolveSeerrUser).mockRejectedValueOnce(
      new Error("Seerr unavailable"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.SEERR_ERROR,
      success: false,
    })
    expect(setup.jellyfin.deleteUser).not.toHaveBeenCalled()
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("does not return success when authenticating the created user fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.jellyfin.authenticateUser).mockRejectedValueOnce(
      new Error("Jellyfin authentication failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.JELLYFIN_ERROR,
      success: false,
    })
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledWith("jellyfin-user-1")
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("preserves the Jellyfin user when Seerr cleanup fails", async () => {
    configMocks.seerr = { hostname: "http://seerr.test" }
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.profileSync.applyProfileToUser).mockRejectedValueOnce(
      new setup.profileSync.SeerrProfileSyncError(
        "Seerr profile update failed",
        new Error("Seerr unavailable"),
      ),
    )
    vi.mocked(setup.seerr.deleteSeerrUser).mockRejectedValueOnce(
      new Error("Seerr cleanup failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.SEERR_ERROR,
      success: false,
    })
    expect(setup.seerr.deleteSeerrUser).toHaveBeenCalledWith(42)
    expect(setup.jellyfin.deleteUser).not.toHaveBeenCalled()
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("compensates when the local redemption transaction fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.spyOn(setup.database.db, "transaction").mockRejectedValueOnce(
      new Error("SQLite write failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.INTERNAL_ERROR,
      success: false,
    })
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledWith("jellyfin-user-1")
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("removes committed redemption state when session creation fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.auth.establishAuthenticatedSession).mockRejectedValueOnce(
      new Error("Session storage unavailable"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)
    const localUser = await setup.database.db.query.users.findFirst({
      where: eq(setup.schema.users.userId, "jellyfin-user-1"),
    })
    const usages = await setup.database.db
      .select()
      .from(setup.schema.inviteUsages)
      .where(eq(setup.schema.inviteUsages.inviteId, invite.id))

    expect(result).toMatchObject({
      code: setup.errors.ErrorCode.INTERNAL_ERROR,
      success: false,
    })
    expect(setup.auth.clearAuthCookies).toHaveBeenCalledOnce()
    expect(setup.session.revokeAllUserSessions).toHaveBeenCalledWith(
      "jellyfin-user-1",
    )
    expect(setup.jellyfin.deleteUser).toHaveBeenCalledWith("jellyfin-user-1")
    expect(localUser).toBeUndefined()
    expect(usages).toHaveLength(0)
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("keeps invite capacity recoverable when external cleanup fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    vi.mocked(setup.profileSync.applyProfileToUser).mockRejectedValueOnce(
      new Error("Jellyfin policy update failed"),
    )
    vi.mocked(setup.jellyfin.deleteUser).mockRejectedValueOnce(
      new Error("Jellyfin cleanup failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)
    const validation = expectSuccessfulInviteValidation(
      await setup.inviteService.validateInvite(redeemInput.code),
    )

    expect(result.success).toBe(false)
    expect(validation.valid).toBe(true)
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
  })

  it("reconciles capacity when releasing a reservation fails", async () => {
    const setup = await loadInviteModules()
    const profile = await seedProfile(setup.database, setup.schema)
    const invite = await seedInvite(setup, {
      code: "LIMIT123",
      profileId: profile.id,
      useLimit: 1,
    })
    await setup.database.sqlClient.execute(`
      CREATE TRIGGER fail_invite_release
      BEFORE UPDATE OF use_count ON invites
      WHEN OLD.use_count = 1 AND NEW.use_count = 0
      BEGIN
        SELECT RAISE(FAIL, 'injected invite release failure');
      END
    `)
    vi.mocked(setup.profileSync.applyProfileToUser).mockRejectedValueOnce(
      new Error("Jellyfin policy update failed"),
    )

    const result = await setup.inviteService.redeemInvite(redeemInput)

    expect(result.success).toBe(false)
    expect(await getInviteUseCount(setup, invite.id)).toBe(1)

    await setup.database.sqlClient.execute("DROP TRIGGER fail_invite_release")
    await setup.userLifecycle.reconcileInviteUseCounts()

    const validation = expectSuccessfulInviteValidation(
      await setup.inviteService.validateInvite(redeemInput.code),
    )
    expect(await getInviteUseCount(setup, invite.id)).toBe(0)
    expect(validation.valid).toBe(true)
  })
})
