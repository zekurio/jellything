import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TestDatabase } from "@/test/db"
import { configureTestEnvironment, createTestDatabase } from "@/test/db"

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    get seerr() {
      return undefined
    },
  },
}))

let testDatabase: TestDatabase | null = null

async function loadEmailVerificationModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  // The database URL is captured at module initialization after the temp
  // path exists.
  const emailVerification = await import("@/server/email-verification")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")
  const tokens = await import("@/server/tokens")
  const errors = await import("@/lib/api/contracts/errors")

  await database.ensureMigrated()

  return { emailVerification, database, schema, tokens, errors }
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
})

describe("email verification redemption", () => {
  it("allows exactly one concurrent redemption and rejects reuse", async () => {
    const setup = await loadEmailVerificationModules()
    await setup.database.db.insert(setup.schema.users).values({
      userId: "concurrent-user",
      email: "old@example.com",
      emailVerified: false,
    })
    const token = await setup.tokens.createEmailVerificationToken(
      "concurrent-user",
      "verified@example.com",
    )

    const results = await Promise.all([
      setup.emailVerification.verifyEmail({ token }),
      setup.emailVerification.verifyEmail({ token }),
    ])

    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.filter((result) => !result.success)).toEqual([
      expect.objectContaining({
        code: setup.errors.ErrorCode.VALIDATION_FAILED,
        error: "Invalid or expired verification token",
      }),
    ])

    const reused = await setup.emailVerification.verifyEmail({ token })
    expect(reused).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.VALIDATION_FAILED,
        error: "Invalid or expired verification token",
      }),
    )

    const user = await setup.database.db.query.users.findFirst({
      where: eq(setup.schema.users.userId, "concurrent-user"),
    })
    expect(user).toMatchObject({
      email: "verified@example.com",
      emailVerified: true,
    })
    expect(await setup.tokens.validateEmailVerificationToken(token)).toBeNull()
  })

  it("preserves the invalid response for an expired token", async () => {
    const setup = await loadEmailVerificationModules()
    await setup.database.db.insert(setup.schema.users).values({
      userId: "expired-token-user",
      email: "old@example.com",
      emailVerified: false,
    })
    const token =
      await setup.tokens.createEmailVerificationToken("expired-token-user")
    await setup.database.db
      .update(setup.schema.emailVerificationTokens)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(
        eq(setup.schema.emailVerificationTokens.userId, "expired-token-user"),
      )

    expect(await setup.emailVerification.verifyEmail({ token })).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.VALIDATION_FAILED,
        error: "Invalid or expired verification token",
      }),
    )
    expect(
      await setup.database.db.query.users.findFirst({
        where: eq(setup.schema.users.userId, "expired-token-user"),
      }),
    ).toMatchObject({ email: "old@example.com", emailVerified: false })
    expect(
      await setup.database.db.query.emailVerificationTokens.findFirst({
        where: eq(
          setup.schema.emailVerificationTokens.userId,
          "expired-token-user",
        ),
      }),
    ).toBeDefined()
  })

  it("rolls back token consumption when the user update fails", async () => {
    const setup = await loadEmailVerificationModules()
    await setup.database.db.insert(setup.schema.users).values([
      {
        userId: "target-user",
        email: "old@example.com",
        emailVerified: false,
      },
      {
        userId: "email-owner",
        email: "occupied@example.com",
        emailVerified: true,
      },
    ])
    const token = await setup.tokens.createEmailVerificationToken(
      "target-user",
      "occupied@example.com",
    )

    const failed = await setup.emailVerification.verifyEmail({ token })

    expect(failed).toEqual(
      expect.objectContaining({
        success: false,
        code: setup.errors.ErrorCode.INTERNAL_ERROR,
      }),
    )
    expect(
      await setup.database.db.query.users.findFirst({
        where: eq(setup.schema.users.userId, "target-user"),
      }),
    ).toMatchObject({ email: "old@example.com", emailVerified: false })
    expect(
      await setup.tokens.validateEmailVerificationToken(token),
    ).not.toBeNull()

    await setup.database.db
      .delete(setup.schema.users)
      .where(eq(setup.schema.users.userId, "email-owner"))
    expect(await setup.emailVerification.verifyEmail({ token })).toEqual({
      success: true,
      data: null,
    })
  })
})
