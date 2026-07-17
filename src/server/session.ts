import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

import { and, eq, isNull } from "drizzle-orm"

import { env } from "@/env"
import { configManager } from "@/lib/server/config.server"
import { db, ensureMigrated } from "@/server/db"
import { sessions } from "@/server/db/schema"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "session" })

export const SESSION_COOKIE_NAME = "jellything-session"
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000
export const SESSION_DURATION_SECONDS = Math.floor(SESSION_DURATION_MS / 1000)
export const SESSION_VALIDATION_TTL_MS = 5 * 60 * 1000
export const ADMIN_VALIDATION_TTL_MS = 60 * 1000
export const SESSION_UNAVAILABLE_GRACE_MS = 15 * 60 * 1000
export const SESSION_VALIDATION_BACKOFF_MS = 60 * 1000

export const sessionCookieConfig = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DURATION_SECONDS,
}

export interface SessionCookie {
  sessionId: string
  secret: string
}

export interface SessionRecord {
  id: string
  userId: string
  displayNameSnapshot: string
  isAdminSnapshot: boolean
  jellyfinAccessToken: string
  jellyfinDeviceId: string
  lastValidatedAt: number | null
  validationBlockedUntil: number | null
  lastSeenAt: number | null
  expiresAt: number
  revokedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface CreateAuthSessionInput {
  userId: string
  displayName: string
  isAdmin: boolean
  jellyfinAccessToken: string
  jellyfinDeviceId: string
}

function getAuthSecrets(): { sessionSecret: string; encryptionKey: string } {
  return configManager.auth
}

function encodeBase64Url(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString("base64url")
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url")
}

function getEncryptionKey(): Buffer {
  const auth = getAuthSecrets()
  return createHmac("sha256", auth.sessionSecret)
    .update(auth.encryptionKey)
    .digest()
}

function hashSessionSecret(secret: string): string {
  return createHmac("sha256", getAuthSecrets().sessionSecret)
    .update(secret)
    .digest("hex")
}

function encryptAccessToken(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return `${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}.${encodeBase64Url(tag)}`
}

function decryptAccessToken(payload: string): string {
  const [ivEncoded, ciphertextEncoded, tagEncoded] = payload.split(".")
  if (!ivEncoded || !ciphertextEncoded || !tagEncoded) {
    throw new Error("Malformed encrypted access token")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    decodeBase64Url(ivEncoded),
  )
  decipher.setAuthTag(decodeBase64Url(tagEncoded))

  const plaintext = Buffer.concat([
    decipher.update(decodeBase64Url(ciphertextEncoded)),
    decipher.final(),
  ])

  return plaintext.toString("utf8")
}

function buildSessionCookieValue(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`
}

export function parseSessionCookie(
  value: string | undefined,
): SessionCookie | null {
  if (!value) {
    return null
  }

  const separatorIndex = value.indexOf(".")
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null
  }

  const sessionId = value.slice(0, separatorIndex)
  const secret = value.slice(separatorIndex + 1)

  if (!sessionId || !secret) {
    return null
  }

  return { sessionId, secret }
}

function constantTimeMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function toSessionRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    displayNameSnapshot: row.displayNameSnapshot,
    isAdminSnapshot: row.isAdminSnapshot,
    jellyfinAccessToken: decryptAccessToken(row.jellyfinAccessToken),
    jellyfinDeviceId: row.jellyfinDeviceId,
    lastValidatedAt: row.lastValidatedAt?.getTime() ?? null,
    validationBlockedUntil: row.validationBlockedUntil?.getTime() ?? null,
    lastSeenAt: row.lastSeenAt?.getTime() ?? null,
    expiresAt: row.expiresAt.getTime(),
    revokedAt: row.revokedAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export function getValidationTtlMs(isAdmin: boolean): number {
  return isAdmin ? ADMIN_VALIDATION_TTL_MS : SESSION_VALIDATION_TTL_MS
}

export function isSessionValidationStale(
  record: Pick<
    SessionRecord,
    "isAdminSnapshot" | "lastValidatedAt" | "createdAt"
  >,
): boolean {
  const baseline = record.lastValidatedAt ?? record.createdAt
  return Date.now() - baseline > getValidationTtlMs(record.isAdminSnapshot)
}

export function isSessionValidationBackedOff(
  record: Pick<SessionRecord, "validationBlockedUntil">,
): boolean {
  return (
    record.validationBlockedUntil !== null &&
    record.validationBlockedUntil > Date.now()
  )
}

export function isWithinUnavailableGracePeriod(
  record: Pick<
    SessionRecord,
    "lastValidatedAt" | "createdAt" | "isAdminSnapshot"
  >,
): boolean {
  const baseline = record.lastValidatedAt ?? record.createdAt
  const graceWindow = record.isAdminSnapshot
    ? Math.min(SESSION_UNAVAILABLE_GRACE_MS, ADMIN_VALIDATION_TTL_MS * 5)
    : SESSION_UNAVAILABLE_GRACE_MS

  return Date.now() - baseline <= graceWindow
}

function prepareAuthSession(input: CreateAuthSessionInput) {
  const secret = randomBytes(32).toString("base64url")
  const sessionId = crypto.randomUUID()
  const now = new Date()

  return {
    sessionId,
    cookieValue: buildSessionCookieValue(sessionId, secret),
    values: {
      id: sessionId,
      userId: input.userId,
      secretHash: hashSessionSecret(secret),
      jellyfinAccessToken: encryptAccessToken(input.jellyfinAccessToken),
      jellyfinDeviceId: input.jellyfinDeviceId,
      displayNameSnapshot: input.displayName,
      isAdminSnapshot: input.isAdmin,
      lastValidatedAt: now,
      validationBlockedUntil: null,
      lastSeenAt: now,
      revokedAt: null,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
      createdAt: now,
      updatedAt: now,
    },
  }
}

export async function createAuthSession(
  input: CreateAuthSessionInput,
): Promise<{
  sessionId: string
  cookieValue: string
}> {
  await ensureMigrated()

  const session = prepareAuthSession(input)
  await db.insert(sessions).values(session.values)

  log.info(
    { sessionId: session.sessionId, userId: input.userId },
    "Created auth session",
  )

  return {
    sessionId: session.sessionId,
    cookieValue: session.cookieValue,
  }
}

export async function replaceAllUserSessions(
  input: CreateAuthSessionInput,
): Promise<{
  sessionId: string
  cookieValue: string
}> {
  await ensureMigrated()

  const session = prepareAuthSession(input)
  const revokedAt = new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ revokedAt, updatedAt: revokedAt })
      .where(and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt)))
    await tx.insert(sessions).values(session.values)
  })

  log.info(
    { sessionId: session.sessionId, userId: input.userId },
    "Replaced all user sessions",
  )

  return {
    sessionId: session.sessionId,
    cookieValue: session.cookieValue,
  }
}

export async function getSessionRecordFromCookie(
  cookieValue: string | undefined,
): Promise<SessionRecord | null> {
  const parsed = parseSessionCookie(cookieValue)
  if (!parsed) {
    return null
  }

  await ensureMigrated()

  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, parsed.sessionId), isNull(sessions.revokedAt)),
  })

  if (!row) {
    return null
  }

  let secretHash: string

  try {
    secretHash = hashSessionSecret(parsed.secret)
  } catch (err) {
    log.warn(
      { err, sessionId: parsed.sessionId },
      "Rejected auth session before auth config loaded",
    )
    return null
  }

  if (!constantTimeMatch(row.secretHash, secretHash)) {
    log.warn(
      { sessionId: parsed.sessionId },
      "Rejected auth session with invalid secret",
    )
    return null
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    log.info(
      { sessionId: row.id, userId: row.userId },
      "Rejected expired auth session",
    )
    return null
  }

  try {
    return toSessionRecord(row)
  } catch (err) {
    log.error(
      { err, sessionId: row.id, userId: row.userId },
      "Failed to decrypt auth session token",
    )
    return null
  }
}

export async function updateAuthSession(
  sessionId: string,
  updates: Partial<{
    displayNameSnapshot: string
    isAdminSnapshot: boolean
    jellyfinAccessToken: string
    jellyfinDeviceId: string
    lastValidatedAt: number | null
    validationBlockedUntil: number | null
    lastSeenAt: number | null
    expiresAt: number
    revokedAt: number | null
  }>,
): Promise<void> {
  await ensureMigrated()

  const payload: Partial<typeof sessions.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (updates.displayNameSnapshot !== undefined) {
    payload.displayNameSnapshot = updates.displayNameSnapshot
  }
  if (updates.isAdminSnapshot !== undefined) {
    payload.isAdminSnapshot = updates.isAdminSnapshot
  }
  if (updates.jellyfinAccessToken !== undefined) {
    payload.jellyfinAccessToken = encryptAccessToken(
      updates.jellyfinAccessToken,
    )
  }
  if (updates.jellyfinDeviceId !== undefined) {
    payload.jellyfinDeviceId = updates.jellyfinDeviceId
  }
  if (updates.lastValidatedAt !== undefined) {
    payload.lastValidatedAt =
      updates.lastValidatedAt === null
        ? null
        : new Date(updates.lastValidatedAt)
  }
  if (updates.validationBlockedUntil !== undefined) {
    payload.validationBlockedUntil =
      updates.validationBlockedUntil === null
        ? null
        : new Date(updates.validationBlockedUntil)
  }
  if (updates.lastSeenAt !== undefined) {
    payload.lastSeenAt =
      updates.lastSeenAt === null ? null : new Date(updates.lastSeenAt)
  }
  if (updates.expiresAt !== undefined) {
    payload.expiresAt = new Date(updates.expiresAt)
  }
  if (updates.revokedAt !== undefined) {
    payload.revokedAt =
      updates.revokedAt === null ? null : new Date(updates.revokedAt)
  }

  await db.update(sessions).set(payload).where(eq(sessions.id, sessionId))
}

export async function touchAuthSession(sessionId: string): Promise<void> {
  await updateAuthSession(sessionId, { lastSeenAt: Date.now() })
}

export async function revokeAuthSession(sessionId: string): Promise<void> {
  await updateAuthSession(sessionId, { revokedAt: Date.now() })
}

export async function revokeAuthSessionByCookie(
  cookieValue: string | undefined,
): Promise<void> {
  const record = await getSessionRecordFromCookie(cookieValue)
  if (!record) {
    return
  }

  await revokeAuthSession(record.id)
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await ensureMigrated()
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
}

export async function validateSession(
  cookieValue: string | undefined,
): Promise<boolean> {
  const record = await getSessionRecordFromCookie(cookieValue)
  return record !== null
}
