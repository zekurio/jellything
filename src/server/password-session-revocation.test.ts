import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionData } from "@/lib/session"
import type { JellyfinClient } from "@/server/jellyfin/client"
import type { PasswordResetPin } from "@/server/jellyfin/password-reset"
import type { createAuthSession } from "@/server/session"
import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

const mocks = vi.hoisted(() => ({
  adminResetUserPassword:
    vi.fn<(jellyfinUserId: string, newPassword: string) => Promise<void>>(),
  authenticateUser: vi.fn<
    (
      username: string,
      password: string,
      deviceId?: string,
    ) => Promise<{
      id: string
      name: string
      isAdmin: boolean
      avatarUrl: string
      accessToken: string
    }>
  >(),
  changePassword:
    vi.fn<
      (
        api: JellyfinClient,
        userId: string,
        currentPassword: string,
        newPassword: string,
      ) => Promise<void>
    >(),
  createApiWithToken: vi.fn<
    (token?: string, deviceId?: string) => JellyfinClient
  >(() => ({ token: "reset-token" })),
  findPasswordResetPinByCode:
    vi.fn<(pinCode: string) => Promise<PasswordResetPin | null>>(),
  forgotPasswordPin: vi.fn<(pin: string) => Promise<void>>(),
  getUserById:
    vi.fn<(userId: string) => Promise<{ id: string; name: string }>>(),
}))

const requestCookies = vi.hoisted(() => new Map<string, string>())

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    auth: {
      sessionSecret: "test-session-secret",
      encryptionKey: "test-encryption-key-with-32-bytes!",
    },
    jellyfinConfigPath: "/tmp/jellyfin",
    jellyfinExternalUrl: "http://jellyfin.example.test",
  },
}))

vi.mock("@/server/request-context", () => ({
  deleteRequestCookie: (name: string) => requestCookies.delete(name),
  getRequestCookie: (name: string) => requestCookies.get(name),
  setRequestCookie: (name: string, value: string) => {
    requestCookies.set(name, value)
  },
}))

vi.mock("@/server/jellyfin", () => {
  class JellyfinApiError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
      public readonly responseBody: string,
    ) {
      super(message)
    }
  }

  return {
    JellyfinApiError,
    adminResetUserPassword: mocks.adminResetUserPassword,
    authenticateUser: mocks.authenticateUser,
    deleteUser: vi.fn<(userId: string) => Promise<void>>(),
    deleteUserAvatar: vi.fn<(userId: string) => Promise<void>>(),
    getUserById: mocks.getUserById,
    updateUserName: vi.fn<(userId: string, name: string) => Promise<void>>(),
    uploadUserAvatar:
      vi.fn<
        (
          userId: string,
          imageBuffer: Buffer,
          mimeType?: string,
        ) => Promise<void>
      >(),
  }
})

vi.mock("@/server/jellyfin/admin", () => ({
  authenticateUser: mocks.authenticateUser,
  forgotPassword: vi.fn<(username: string) => Promise<unknown>>(),
  forgotPasswordPin: mocks.forgotPasswordPin,
  getAllUsers: vi.fn<() => Promise<unknown[]>>(),
}))

vi.mock("@/server/jellyfin/client", () => ({
  createApiWithToken: mocks.createApiWithToken,
}))

vi.mock("@/server/jellyfin/password-reset", () => ({
  findPasswordResetPinByCode: mocks.findPasswordResetPinByCode,
  waitForPasswordResetPin:
    vi.fn<
      (username: string, timeoutMs?: number) => Promise<PasswordResetPin | null>
    >(),
}))

vi.mock("@/server/jellyfin/user", () => ({
  changePassword: mocks.changePassword,
}))

let testDatabase: TestDatabase | null = null

const sessionData: SessionData = {
  userId: "user-1",
  name: "User One",
  avatarUrl: "http://jellyfin.example.test/Users/user-1/Images/Primary",
  isAdmin: false,
  email: "user@example.com",
  emailVerified: true,
  locale: null,
  createdAt: new Date(0).toISOString(),
}

async function loadModules() {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  vi.resetModules()

  // These modules read the per-test DB path during module initialization.
  const session = await import("@/server/session")
  const me = await import("@/server/me")
  const passwordReset = await import("@/server/password-reset")
  const database = await import("@/server/db")
  const schema = await import("@/server/db/schema")

  await database.ensureMigrated()
  await database.db.insert(schema.users).values({
    userId: "user-1",
    email: "user@example.com",
    emailVerified: true,
  })

  return { session, me, passwordReset }
}

async function createActiveSessions(session: {
  createAuthSession: typeof createAuthSession
}) {
  const first = await session.createAuthSession({
    userId: "user-1",
    displayName: "User One",
    isAdmin: false,
    jellyfinAccessToken: "access-token-1",
    jellyfinDeviceId: "device-1",
  })
  const second = await session.createAuthSession({
    userId: "user-1",
    displayName: "User One",
    isAdmin: false,
    jellyfinAccessToken: "access-token-2",
    jellyfinDeviceId: "device-2",
  })

  return { first, second }
}

afterEach(async () => {
  await testDatabase?.cleanup()
  testDatabase = null
  requestCookies.clear()
  vi.clearAllMocks()
  vi.resetModules()
})

describe("password session revocation", () => {
  it("revokes every active session after a password reset", async () => {
    const { session, passwordReset } = await loadModules()
    const { first, second } = await createActiveSessions(session)

    mocks.findPasswordResetPinByCode.mockResolvedValue({
      pin: "1234",
      userName: "User One",
      pinFile: "passwordreset-user.json",
      expirationDate: new Date(Date.now() + 60_000),
    })
    mocks.authenticateUser.mockResolvedValue({
      id: "user-1",
      name: "User One",
      isAdmin: false,
      accessToken: "reset-access-token",
      avatarUrl: "",
    })

    const result = await passwordReset.resetPassword({
      pin: "1234",
      newPassword: "NewPassword",
    })

    expect(result).toEqual({ success: true, data: null })
    expect(await session.validateSession(first.cookieValue)).toBe(false)
    expect(await session.validateSession(second.cookieValue)).toBe(false)
    expect(mocks.changePassword).toHaveBeenCalledOnce()
  })

  it("keeps every session valid when the reset password mutation fails", async () => {
    const { session, passwordReset } = await loadModules()
    const { first, second } = await createActiveSessions(session)

    const mutationError = new Error("Jellyfin reset mutation failed")
    mocks.findPasswordResetPinByCode.mockResolvedValue({
      pin: "1234",
      userName: "User One",
      pinFile: "passwordreset-user.json",
      expirationDate: new Date(Date.now() + 60_000),
    })
    mocks.authenticateUser.mockResolvedValue({
      id: "user-1",
      name: "User One",
      isAdmin: false,
      accessToken: "reset-access-token",
      avatarUrl: "",
    })
    mocks.changePassword.mockRejectedValueOnce(mutationError)

    await expect(
      passwordReset.resetPassword({
        pin: "1234",
        newPassword: "NewPassword",
      }),
    ).rejects.toBe(mutationError)

    expect(await session.validateSession(first.cookieValue)).toBe(true)
    expect(await session.validateSession(second.cookieValue)).toBe(true)
  })

  it("replaces the current session and revokes every old session after a self-service change", async () => {
    const { session, me } = await loadModules()
    const { first, second } = await createActiveSessions(session)
    requestCookies.set(session.SESSION_COOKIE_NAME, first.cookieValue)

    mocks.getUserById.mockResolvedValue({ id: "user-1", name: "User One" })
    mocks.authenticateUser.mockResolvedValue({
      id: "user-1",
      name: "User One",
      isAdmin: false,
      accessToken: "replacement-access-token",
      avatarUrl: "",
    })

    const result = await me.changeMyPassword(
      {
        currentPassword: "CurrentPassword",
        newPassword: "NewPassword",
      },
      sessionData,
    )

    const replacementCookie = requestCookies.get(session.SESSION_COOKIE_NAME)
    expect(result).toEqual({ success: true, data: null })
    expect(await session.validateSession(first.cookieValue)).toBe(false)
    expect(await session.validateSession(second.cookieValue)).toBe(false)
    expect(replacementCookie).toBeDefined()
    expect(replacementCookie).not.toBe(first.cookieValue)
    expect(await session.validateSession(replacementCookie)).toBe(true)
  })

  it("keeps every session valid when the Jellyfin password mutation fails", async () => {
    const { session, me } = await loadModules()
    const { first, second } = await createActiveSessions(session)
    requestCookies.set(session.SESSION_COOKIE_NAME, first.cookieValue)

    const mutationError = new Error("Jellyfin password mutation failed")
    mocks.getUserById.mockResolvedValue({ id: "user-1", name: "User One" })
    mocks.authenticateUser.mockResolvedValue({
      id: "user-1",
      name: "User One",
      isAdmin: false,
      accessToken: "current-access-token",
      avatarUrl: "",
    })
    mocks.adminResetUserPassword.mockRejectedValueOnce(mutationError)

    await expect(
      me.changeMyPassword(
        {
          currentPassword: "CurrentPassword",
          newPassword: "NewPassword",
        },
        sessionData,
      ),
    ).rejects.toBe(mutationError)

    expect(await session.validateSession(first.cookieValue)).toBe(true)
    expect(await session.validateSession(second.cookieValue)).toBe(true)
    expect(requestCookies.get(session.SESSION_COOKIE_NAME)).toBe(
      first.cookieValue,
    )
  })
})
