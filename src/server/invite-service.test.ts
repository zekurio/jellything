import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    get memberOnboarding() {
      return { enabled: false, pages: [] }
    },
    get seerr() {
      return undefined
    },
    get appUrl() {
      return "http://localhost:5173"
    },
    get defaultLocale() {
      return "en"
    },
  },
}))

vi.mock("@/server/auth-service", () => ({
  establishAuthenticatedSession: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/server/email", () => ({
  isEmailConfigured: vi.fn<() => boolean>(() => false),
  sendEmail: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/server/email/templates/verify-email", () => ({
  getVerifyEmailSubject: vi.fn<() => string>(() => "Verify email"),
  renderVerifyEmail: vi.fn<() => string>(() => "<p>Verify email</p>"),
}))

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
  isUsernameTaken: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
  uploadUserAvatar: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/server/seerr", () => ({
  deleteSeerrUser: vi.fn<() => Promise<void>>(),
  resolveSeerrUser: vi.fn<() => Promise<unknown>>(),
}))

vi.mock("@/server/session-data", () => ({
  getSessionDataForUser: vi.fn<() => Promise<undefined>>(() =>
    Promise.resolve(undefined),
  ),
}))

let testDatabase: TestDatabase | null = null

async function loadInviteModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const inviteService = await import("@/server/invite-service")
  const database = await import("@/server/db.server")
  const schema = await import("@/server/db/schema")
  const errors = await import("@/lib/api/contracts/errors")
  const jellyfin = await import("@/server/jellyfin")

  await database.ensureMigrated()

  return { inviteService, database, schema, errors, jellyfin }
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
  result: Awaited<
    ReturnType<typeof import("@/server/invite-service").validateInvite>
  >,
) {
  if (!result.success) {
    throw new Error("Expected validateInvite to return a successful result")
  }

  return result.data
}

afterEach(async () => {
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

describe("redeemInvite reservation", () => {
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
})
