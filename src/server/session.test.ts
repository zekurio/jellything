import { afterEach, describe, expect, it, vi } from "vitest"

import { canActAsAdmin, type SessionData } from "@/lib/session"
import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

function makeSession(isAdmin: boolean): SessionData {
  return {
    userId: "user-1",
    name: "User One",
    avatarUrl: "http://jellyfin.test/avatar",
    isAdmin,
    email: "user@example.com",
    emailVerified: true,
    locale: null,
    createdAt: new Date().toISOString(),
  }
}

// The session store hashes/encrypts with the auth secrets and hydration builds
// avatar URLs from the Jellyfin external URL. Both come from the on-disk config
// file, so we substitute fixed values here rather than exercising config I/O.
vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    get auth() {
      return {
        sessionSecret: "test-session-secret-0000000000000000",
        encryptionKey: "test-encryption-key-0000000000000000",
      }
    },
    get jellyfinExternalUrl() {
      return "http://jellyfin.test"
    },
  },
}))

// Disabling an expired user is a Jellyfin side effect; we characterize only the
// local session-revocation decision here, so stub the external enforcement.
const enforceExpiredUserAccess = vi.fn<() => Promise<void>>(() =>
  Promise.resolve(),
)
vi.mock("@/server/user-access", () => ({
  enforceExpiredUserAccess,
}))

let testDatabase: TestDatabase | null = null

async function loadModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  const session = await import("@/server/session")
  const resolver = await import("@/server/session-resolver")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")

  await database.ensureMigrated()

  return { session, resolver, database, schema }
}

async function insertUser(
  database: Awaited<ReturnType<typeof loadModules>>["database"],
  schema: Awaited<ReturnType<typeof loadModules>>["schema"],
  overrides: Partial<typeof schema.users.$inferInsert> = {},
) {
  await database.db.insert(schema.users).values({
    userId: "user-1",
    email: "user@example.com",
    ...overrides,
  })
}

async function createSession(
  session: Awaited<ReturnType<typeof loadModules>>["session"],
  overrides: Partial<Parameters<typeof session.createAuthSession>[0]> = {},
) {
  return session.createAuthSession({
    userId: "user-1",
    displayName: "User One",
    isAdmin: false,
    jellyfinAccessToken: "jellyfin-access-token",
    jellyfinDeviceId: "device-1",
    ...overrides,
  })
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  enforceExpiredUserAccess.mockClear()
  vi.resetModules()
})

describe("session cookie parsing", () => {
  it("splits a well-formed cookie into id and secret", async () => {
    const { session } = await loadModules()

    expect(session.parseSessionCookie("abc.def")).toEqual({
      sessionId: "abc",
      secret: "def",
    })
    // Secret may itself contain dots; only the first separator splits.
    expect(session.parseSessionCookie("abc.def.ghi")).toEqual({
      sessionId: "abc",
      secret: "def.ghi",
    })
  })

  it("rejects missing or malformed cookies", async () => {
    const { session } = await loadModules()

    expect(session.parseSessionCookie(undefined)).toBeNull()
    expect(session.parseSessionCookie("")).toBeNull()
    expect(session.parseSessionCookie("no-separator")).toBeNull()
    expect(session.parseSessionCookie(".leading")).toBeNull()
    expect(session.parseSessionCookie("trailing.")).toBeNull()
  })
})

describe("session record lifecycle", () => {
  it("creates a session and looks it up by its cookie value", async () => {
    const { session, database, schema } = await loadModules()
    await insertUser(database, schema)

    const created = await createSession(session, { isAdmin: true })
    const record = await session.getSessionRecordFromCookie(created.cookieValue)

    expect(record?.id).toBe(created.sessionId)
    expect(record?.userId).toBe("user-1")
    expect(record?.displayNameSnapshot).toBe("User One")
    expect(record?.isAdminSnapshot).toBe(true)
    // Access token is stored encrypted but returned decrypted on lookup.
    expect(record?.jellyfinAccessToken).toBe("jellyfin-access-token")
    expect(record?.jellyfinDeviceId).toBe("device-1")
  })

  it("stores the access token encrypted at rest and never stores the raw secret", async () => {
    const { session, database, schema } = await loadModules()
    await insertUser(database, schema)

    const created = await createSession(session)
    const parsed = session.parseSessionCookie(created.cookieValue)
    const row = await database.db.query.sessions.findFirst({
      where: (fields, { eq }) => eq(fields.id, created.sessionId),
    })

    expect(row?.jellyfinAccessToken).not.toBe("jellyfin-access-token")
    expect(row?.secretHash).not.toBe(parsed?.secret)
  })

  it("honors the session TTL when creating a session", async () => {
    const { session, database, schema } = await loadModules()
    await insertUser(database, schema)

    const before = Date.now()
    const created = await createSession(session)
    const record = await session.getSessionRecordFromCookie(created.cookieValue)

    const expectedExpiry = before + session.SESSION_DURATION_MS
    // Allow a small clock delta between the two Date.now() reads.
    expect(record?.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1_000)
    expect(record?.expiresAt).toBeLessThanOrEqual(
      Date.now() + session.SESSION_DURATION_MS,
    )
  })

  it("rejects a lookup with a mismatched secret", async () => {
    const { session, database, schema } = await loadModules()
    await insertUser(database, schema)

    const created = await createSession(session)

    expect(
      await session.getSessionRecordFromCookie(`${created.sessionId}.wrong`),
    ).toBeNull()
  })

  it("rejects a lookup for an unknown session id", async () => {
    const { session } = await loadModules()

    expect(
      await session.getSessionRecordFromCookie("does-not-exist.secret"),
    ).toBeNull()
  })

  it("rejects a lookup for a malformed cookie", async () => {
    const { session } = await loadModules()

    expect(await session.getSessionRecordFromCookie(undefined)).toBeNull()
    expect(await session.getSessionRecordFromCookie("garbage")).toBeNull()
  })

  it("rejects an expired session record", async () => {
    const { session, database, schema } = await loadModules()
    await insertUser(database, schema)

    const created = await createSession(session)
    await session.updateAuthSession(created.sessionId, {
      expiresAt: Date.now() - 1_000,
    })

    expect(
      await session.getSessionRecordFromCookie(created.cookieValue),
    ).toBeNull()
    // validateSession is a thin wrapper over the record lookup.
    expect(await session.validateSession(created.cookieValue)).toBe(false)
  })

  it("rejects a revoked session record", async () => {
    const { session, database, schema } = await loadModules()
    await insertUser(database, schema)

    const created = await createSession(session)
    await session.revokeAuthSession(created.sessionId)

    expect(
      await session.getSessionRecordFromCookie(created.cookieValue),
    ).toBeNull()
  })

  it("revokes all sessions for a user", async () => {
    const { session, database, schema } = await loadModules()
    await insertUser(database, schema)

    const first = await createSession(session)
    const second = await createSession(session)

    await session.revokeAllUserSessions("user-1")

    expect(
      await session.getSessionRecordFromCookie(first.cookieValue),
    ).toBeNull()
    expect(
      await session.getSessionRecordFromCookie(second.cookieValue),
    ).toBeNull()
  })
})

describe("session validation TTL helpers", () => {
  it("uses a shorter validation window for admins", async () => {
    const { session } = await loadModules()

    expect(session.getValidationTtlMs(true)).toBe(
      session.ADMIN_VALIDATION_TTL_MS,
    )
    expect(session.getValidationTtlMs(false)).toBe(
      session.SESSION_VALIDATION_TTL_MS,
    )
    expect(session.ADMIN_VALIDATION_TTL_MS).toBeLessThan(
      session.SESSION_VALIDATION_TTL_MS,
    )
  })

  it("flags a session as stale once past its validation window", async () => {
    const { session } = await loadModules()
    const now = Date.now()

    expect(
      session.isSessionValidationStale({
        isAdminSnapshot: false,
        lastValidatedAt: now,
        createdAt: now,
      }),
    ).toBe(false)
    expect(
      session.isSessionValidationStale({
        isAdminSnapshot: false,
        lastValidatedAt: now - session.SESSION_VALIDATION_TTL_MS - 1_000,
        createdAt: now,
      }),
    ).toBe(true)
  })

  it("reports an active validation backoff window", async () => {
    const { session } = await loadModules()
    const now = Date.now()

    expect(
      session.isSessionValidationBackedOff({
        validationBlockedUntil: now + 10_000,
      }),
    ).toBe(true)
    expect(
      session.isSessionValidationBackedOff({
        validationBlockedUntil: now - 10_000,
      }),
    ).toBe(false)
    expect(
      session.isSessionValidationBackedOff({ validationBlockedUntil: null }),
    ).toBe(false)
  })
})

describe("admin gate predicate", () => {
  it("admits admin sessions and rejects non-admin sessions", () => {
    expect(canActAsAdmin(makeSession(true))).toBe(true)
    expect(canActAsAdmin(makeSession(false))).toBe(false)
  })
})

describe("session resolution", () => {
  it("resolves a valid cookie into hydrated session data", async () => {
    const { session, resolver, database, schema } = await loadModules()
    await insertUser(database, schema, { emailVerified: true })

    const created = await createSession(session, { isAdmin: true })
    const result = await resolver.resolveSession(created.cookieValue, {
      validationMode: "never",
    })

    expect(result.status).toBe("authenticated")
    expect(result.session?.userId).toBe("user-1")
    expect(result.session?.name).toBe("User One")
    expect(result.session?.isAdmin).toBe(true)
    expect(result.session?.email).toBe("user@example.com")
    expect(result.sessionRecord?.id).toBe(created.sessionId)
  })

  it("returns unauthenticated for a missing cookie", async () => {
    const { resolver } = await loadModules()

    const result = await resolver.resolveSession(undefined, {
      validationMode: "never",
    })

    expect(result.status).toBe("unauthenticated")
    expect(result.session).toBeNull()
    expect(result.sessionRecord).toBeNull()
  })

  it("returns unauthenticated for a garbage cookie", async () => {
    const { resolver } = await loadModules()

    const result = await resolver.resolveSession("garbage-value", {
      validationMode: "never",
    })

    expect(result.status).toBe("unauthenticated")
    expect(result.session).toBeNull()
  })

  it("returns unauthenticated for an expired session record", async () => {
    const { session, resolver, database, schema } = await loadModules()
    await insertUser(database, schema)

    const created = await createSession(session)
    await session.updateAuthSession(created.sessionId, {
      expiresAt: Date.now() - 1_000,
    })

    const result = await resolver.resolveSession(created.cookieValue, {
      validationMode: "never",
    })

    expect(result.status).toBe("unauthenticated")
    expect(result.session).toBeNull()
  })

  it("revokes and rejects a session whose user has expired", async () => {
    const { session, resolver, database, schema } = await loadModules()
    // Non-admin user whose access expired in the past.
    await insertUser(database, schema, {
      expiresAt: new Date(Date.now() - 60_000),
    })

    const created = await createSession(session, { isAdmin: false })
    const result = await resolver.resolveSession(created.cookieValue, {
      validationMode: "never",
    })

    expect(result.status).toBe("reauth-required")
    expect(result.session).toBeNull()
    // Local session is revoked, so a subsequent lookup fails.
    expect(
      await session.getSessionRecordFromCookie(created.cookieValue),
    ).toBeNull()
  })

  it("keeps an expired admin session active because admins never expire", async () => {
    const { session, resolver, database, schema } = await loadModules()
    await insertUser(database, schema, {
      expiresAt: new Date(Date.now() - 60_000),
    })

    const created = await createSession(session, { isAdmin: true })
    const result = await resolver.resolveSession(created.cookieValue, {
      validationMode: "never",
    })

    expect(result.status).toBe("authenticated")
    expect(result.session?.isAdmin).toBe(true)
  })
})
