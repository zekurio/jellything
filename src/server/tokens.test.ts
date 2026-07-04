import { createHash } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

let testDatabase: TestDatabase | null = null

async function loadTokenModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const tokens = await import("@/server/tokens")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")

  await database.ensureMigrated()

  return { tokens, database, schema }
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
})

describe("email verification tokens", () => {
  it("generates secure random hex tokens", async () => {
    const { tokens } = await loadTokenModules()

    const first = tokens.generateSecureToken()
    const second = tokens.generateSecureToken()

    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(second).toMatch(/^[a-f0-9]{64}$/)
    expect(first).not.toBe(second)
  })

  it("hashes tokens with SHA-256 hex", async () => {
    const { tokens } = await loadTokenModules()
    const expected = createHash("sha256").update("known-token").digest("hex")

    expect(tokens.hashToken("known-token")).toBe(expected)
    expect(tokens.hashToken("known-token")).not.toBe("known-token")
  })

  it("stores only the hashed token, replaces existing user tokens, and expires in the future", async () => {
    const { tokens, database, schema } = await loadTokenModules()
    await database.db.insert(schema.users).values({
      userId: "user-1",
      email: "user@example.com",
    })

    const firstRawToken = await tokens.createEmailVerificationToken(
      "user-1",
      "first@example.com",
    )
    const secondRawToken = await tokens.createEmailVerificationToken(
      "user-1",
      "second@example.com",
    )

    const storedTokens = await database.db
      .select()
      .from(schema.emailVerificationTokens)

    expect(storedTokens).toHaveLength(1)
    expect(storedTokens[0]?.token).toBe(tokens.hashToken(secondRawToken))
    expect(storedTokens[0]?.token).not.toBe(secondRawToken)
    expect(storedTokens[0]?.token).not.toBe(firstRawToken)
    expect(storedTokens[0]?.pendingEmail).toBe("second@example.com")
    expect(storedTokens[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it("validates unexpired tokens and rejects unknown tokens", async () => {
    const { tokens, database, schema } = await loadTokenModules()
    await database.db.insert(schema.users).values({
      userId: "user-1",
      email: "user@example.com",
    })

    const rawToken = await tokens.createEmailVerificationToken(
      "user-1",
      "pending@example.com",
    )

    const result = await tokens.validateEmailVerificationToken(rawToken)

    expect(result?.user.userId).toBe("user-1")
    expect(result?.pendingEmail).toBe("pending@example.com")
    expect(
      await tokens.validateEmailVerificationToken("unknown-token"),
    ).toBeNull()
  })

  it("rejects expired token rows", async () => {
    const { tokens, database, schema } = await loadTokenModules()
    await database.db.insert(schema.users).values({
      userId: "user-1",
      email: "user@example.com",
    })

    await database.db.insert(schema.emailVerificationTokens).values({
      id: crypto.randomUUID(),
      userId: "user-1",
      token: tokens.hashToken("expired-token"),
      pendingEmail: "pending@example.com",
      expiresAt: new Date(Date.now() - 1_000),
      createdAt: new Date(Date.now() - 2_000),
    })

    expect(
      await tokens.validateEmailVerificationToken("expired-token"),
    ).toBeNull()
  })

  it("deletes tokens for a user", async () => {
    const { tokens, database, schema } = await loadTokenModules()
    await database.db.insert(schema.users).values({
      userId: "user-1",
      email: "user@example.com",
    })

    const rawToken = await tokens.createEmailVerificationToken("user-1")
    await tokens.deleteEmailVerificationToken("user-1")

    expect(await tokens.validateEmailVerificationToken(rawToken)).toBeNull()
  })
})
