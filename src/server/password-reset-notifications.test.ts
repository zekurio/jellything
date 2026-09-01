import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { eq } from "drizzle-orm"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import {
  configureTestEnvironment,
  createTestDatabase,
  type TestDatabase,
} from "@/test/db"

const mocks = vi.hoisted(() => ({
  getAllUsers: vi.fn<typeof import("@/server/jellyfin/admin").getAllUsers>(),
  sendConfiguredEmail:
    vi.fn<typeof import("@/server/email/messages").sendConfiguredEmail>(),
}))

vi.mock("@/server/jellyfin/admin", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/jellyfin/admin")>()
  return {
    ...original,
    getAllUsers: mocks.getAllUsers,
  }
})

vi.mock("@/server/email/messages", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/email/messages")>()
  return {
    ...original,
    sendConfiguredEmail: mocks.sendConfiguredEmail,
  }
})

let testDatabase: TestDatabase | null = null
let pinDirectory = ""
let database: typeof import("@/server/db")
let schema: typeof import("@/server/db/schema")
let passwordReset: typeof import("@/server/password-reset-notifications")

const jellyfinUser = {
  id: "jellyfin-user-1",
  name: "Alice",
  isAdmin: false,
  isDisabled: false,
  lastActivityDate: null,
  hasPassword: true,
  avatarUrl: "http://jellyfin:8096/avatar",
}

async function writePinFile(
  pin: string,
  options: {
    fileName?: string
    userName?: string
    expirationDate?: Date
  } = {},
): Promise<void> {
  const fileName = options.fileName ?? "passwordreset_alice.json"
  await writeFile(
    path.join(pinDirectory, fileName),
    JSON.stringify({
      Pin: pin,
      UserName: options.userName ?? jellyfinUser.name,
      PinFile: path.join(pinDirectory, fileName),
      ExpirationDate: (
        options.expirationDate ?? new Date(Date.now() + 15 * 60 * 1000)
      ).toISOString(),
    }),
  )
}

beforeAll(async () => {
  testDatabase = await createTestDatabase()
  configureTestEnvironment(testDatabase)
  pinDirectory = path.join(path.dirname(testDatabase.configPath), "jellyfin")
  await mkdir(pinDirectory, { recursive: true })
  await writeFile(
    testDatabase.configPath,
    JSON.stringify({
      app: {
        url: "https://inviterr.example.com",
      },
      jellyfin: {
        internalUrl: "http://jellyfin:8096",
        apiKey: "test-api-key",
        configPath: pinDirectory,
      },
      email: {
        from: "Inviterr <noreply@example.com>",
        smtp: {
          host: "smtp.example.com",
          port: 587,
        },
      },
    }),
  )

  database = await import("@/server/db")
  schema = await import("@/server/db/schema")
  passwordReset = await import("@/server/password-reset-notifications")
  await database.ensureMigrated()
})

beforeEach(async () => {
  passwordReset.stopPasswordResetNotificationWatcher()
  await rm(pinDirectory, { recursive: true, force: true })
  await mkdir(pinDirectory, { recursive: true })
  await database.db.delete(schema.password_reset_notifications)
  await database.db.delete(schema.users)
  await database.db.insert(schema.users).values({
    userId: jellyfinUser.id,
    email: "alice@example.com",
    emailVerified: true,
  })

  mocks.getAllUsers.mockReset()
  mocks.getAllUsers.mockResolvedValue([jellyfinUser])
  mocks.sendConfiguredEmail.mockReset()
  mocks.sendConfiguredEmail.mockResolvedValue(undefined)
})

afterAll(async () => {
  passwordReset.stopPasswordResetNotificationWatcher()
  await testDatabase?.cleanup()
  testDatabase = null
  vi.resetModules()
})

describe("Jellyfin password reset notifications", () => {
  it("emails a verified local user for a PIN created outside Inviterr", async () => {
    await writePinFile("123456", { userName: "aLiCe" })

    await passwordReset.scanPasswordResetNotifications()

    expect(mocks.sendConfiguredEmail).toHaveBeenCalledOnce()
    expect(mocks.sendConfiguredEmail).toHaveBeenCalledWith(
      "alice@example.com",
      {
        type: "passwordReset",
        payload: {
          username: "Alice",
          pin: "123456",
          resetUrl: "https://inviterr.example.com/reset-password?pin=123456",
          expiresInMinutes: 15,
          locale: "en",
        },
      },
    )

    const notifications = await database.db
      .select()
      .from(schema.password_reset_notifications)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      jellyfin_user_id: jellyfinUser.id,
      processing_at: null,
      processing_token: null,
    })
    expect(notifications[0]?.completed_at).toBeInstanceOf(Date)
    expect(notifications[0]?.email_sent_at).toBeInstanceOf(Date)
    expect(notifications[0]).not.toHaveProperty("pin")
  })

  it("does not resend a notification after later scans", async () => {
    await writePinFile("123456")

    await passwordReset.scanPasswordResetNotifications()
    await passwordReset.scanPasswordResetNotifications()

    expect(mocks.sendConfiguredEmail).toHaveBeenCalledOnce()
    const notifications = await database.db
      .select()
      .from(schema.password_reset_notifications)
    expect(notifications).toHaveLength(1)
  })

  it("ignores expired PIN files", async () => {
    await writePinFile("123456", {
      expirationDate: new Date(Date.now() - 60 * 1000),
    })

    await passwordReset.scanPasswordResetNotifications()

    expect(mocks.getAllUsers).not.toHaveBeenCalled()
    expect(mocks.sendConfiguredEmail).not.toHaveBeenCalled()
    const notifications = await database.db
      .select()
      .from(schema.password_reset_notifications)
    expect(notifications).toHaveLength(0)
  })

  it("treats a new PIN in the same file as a new reset", async () => {
    await writePinFile("123456")
    await passwordReset.scanPasswordResetNotifications()

    await writePinFile("654321", {
      expirationDate: new Date(Date.now() + 20 * 60 * 1000),
    })
    await passwordReset.scanPasswordResetNotifications()

    expect(mocks.sendConfiguredEmail).toHaveBeenCalledTimes(2)
    const notifications = await database.db
      .select()
      .from(schema.password_reset_notifications)
    expect(notifications).toHaveLength(2)
  })

  it("retries a notification after email delivery fails", async () => {
    mocks.sendConfiguredEmail
      .mockRejectedValueOnce(new Error("SMTP unavailable"))
      .mockResolvedValueOnce(undefined)
    await writePinFile("123456")

    await passwordReset.scanPasswordResetNotifications()

    const pendingNotifications = await database.db
      .select()
      .from(schema.password_reset_notifications)
    expect(pendingNotifications).toHaveLength(1)
    expect(pendingNotifications[0]).toMatchObject({
      processing_at: null,
      processing_token: null,
      completed_at: null,
      email_sent_at: null,
    })

    await passwordReset.scanPasswordResetNotifications()

    expect(mocks.sendConfiguredEmail).toHaveBeenCalledTimes(2)
    const sentNotifications = await database.db
      .select()
      .from(schema.password_reset_notifications)
    expect(sentNotifications[0]?.completed_at).toBeInstanceOf(Date)
    expect(sentNotifications[0]?.email_sent_at).toBeInstanceOf(Date)
  })

  it("recovers an abandoned processing claim", async () => {
    mocks.sendConfiguredEmail.mockRejectedValueOnce(
      new Error("SMTP unavailable"),
    )
    await writePinFile("123456")
    await passwordReset.scanPasswordResetNotifications()
    await database.db.update(schema.password_reset_notifications).set({
      processing_at: new Date(),
      processing_token: "abandoned-claim",
    })

    await passwordReset.scanPasswordResetNotifications()
    expect(mocks.sendConfiguredEmail).toHaveBeenCalledOnce()

    await database.db.update(schema.password_reset_notifications).set({
      processing_at: new Date(Date.now() - 10 * 60 * 1000),
    })
    await passwordReset.scanPasswordResetNotifications()

    expect(mocks.sendConfiguredEmail).toHaveBeenCalledTimes(2)
    const notifications = await database.db
      .select()
      .from(schema.password_reset_notifications)
    expect(notifications[0]?.processing_token).toBeNull()
    expect(notifications[0]?.email_sent_at).toBeInstanceOf(Date)
  })

  it("defers delivery until the user has a verified address", async () => {
    await database.db
      .update(schema.users)
      .set({ emailVerified: false })
      .where(eq(schema.users.userId, jellyfinUser.id))
    await writePinFile("123456")

    await passwordReset.scanPasswordResetNotifications()

    expect(mocks.sendConfiguredEmail).not.toHaveBeenCalled()
    const pendingNotifications = await database.db
      .select()
      .from(schema.password_reset_notifications)
    expect(pendingNotifications).toHaveLength(1)
    expect(pendingNotifications[0]).toMatchObject({
      processing_at: null,
      processing_token: null,
      completed_at: null,
      email_sent_at: null,
    })

    await database.db
      .update(schema.users)
      .set({ emailVerified: true })
      .where(eq(schema.users.userId, jellyfinUser.id))
    await passwordReset.scanPasswordResetNotifications()

    expect(mocks.sendConfiguredEmail).toHaveBeenCalledOnce()
  })

  it("detects a PIN file created after the watcher starts", async () => {
    passwordReset.startPasswordResetNotificationWatcher()

    await writePinFile("123456")

    await vi.waitFor(
      () => {
        expect(mocks.sendConfiguredEmail).toHaveBeenCalledOnce()
      },
      { timeout: 3000 },
    )
    await passwordReset.scanPasswordResetNotifications()
    passwordReset.stopPasswordResetNotificationWatcher()
  })
})
