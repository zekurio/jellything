import crypto from "node:crypto"

import { and, eq, gt } from "drizzle-orm"

import { db, ensureMigrated } from "@/server/db.server"
import { emailVerificationTokens, users, type User } from "@/server/db/schema"

const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export async function createEmailVerificationToken(
  userId: string,
  pendingEmail: string | null = null,
): Promise<string> {
  await ensureMigrated()
  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId))

  const rawToken = generateSecureToken()
  const hashedToken = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS)

  await db.insert(emailVerificationTokens).values({
    id: crypto.randomUUID(),
    userId,
    token: hashedToken,
    pendingEmail,
    expiresAt,
    createdAt: new Date(),
  })

  return rawToken
}

export interface ValidEmailVerificationToken {
  user: User
  pendingEmail: string | null
}

export async function validateEmailVerificationToken(
  rawToken: string,
): Promise<ValidEmailVerificationToken | null> {
  await ensureMigrated()
  const hashedToken = hashToken(rawToken)
  const now = new Date()

  const [result] = await db
    .select({
      token: emailVerificationTokens,
      user: users,
    })
    .from(emailVerificationTokens)
    .innerJoin(users, eq(emailVerificationTokens.userId, users.userId))
    .where(
      and(
        eq(emailVerificationTokens.token, hashedToken),
        gt(emailVerificationTokens.expiresAt, now),
      ),
    )

  if (!result) {
    return null
  }

  return {
    user: result.user,
    pendingEmail: result.token.pendingEmail,
  }
}

export async function deleteEmailVerificationToken(
  userId: string,
): Promise<void> {
  await ensureMigrated()
  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId))
}
