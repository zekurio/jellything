import crypto from "node:crypto"

import { and, eq, gt } from "drizzle-orm"

import { db, ensureMigrated, sqlClient } from "@/server/db"
import type { User } from "@/server/db/schema"
import { emailVerificationTokens, users } from "@/server/db/schema"

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

export interface ConsumedEmailVerificationToken {
  userId: string
  email: string | null
  pendingEmail: string | null
}

export async function consumeEmailVerificationToken(
  rawToken: string,
): Promise<ConsumedEmailVerificationToken | null> {
  await ensureMigrated()
  const hashedToken = hashToken(rawToken)
  const now = Date.now()

  // A non-interactive write batch keeps the conditional update and deletion
  // atomic without yielding between statements on embedded SQLite.
  const [updatedUsers, consumedTokens] = await sqlClient.batch(
    [
      {
        sql: `UPDATE users
          SET email = COALESCE(token.pending_email, users.email),
            email_verified = 1,
            expiry_warning_sent_at = CASE
              WHEN token.pending_email IS NOT NULL
                AND token.pending_email <> users.email THEN NULL
              ELSE users.expiry_warning_sent_at
            END,
            expiry_warning_sent_for = CASE
              WHEN token.pending_email IS NOT NULL
                AND token.pending_email <> users.email THEN NULL
              ELSE users.expiry_warning_sent_for
            END
          FROM email_verification_tokens AS token
          WHERE users.user_id = token.user_id
            AND token.token = ?
            AND token.expires_at > ?
          RETURNING user_id, email`,
        args: [hashedToken, now],
      },
      {
        sql: `DELETE FROM email_verification_tokens
          WHERE token = ?
            AND expires_at > ?
            AND EXISTS (
              SELECT 1 FROM users
              WHERE users.user_id = email_verification_tokens.user_id
            )
          RETURNING pending_email`,
        args: [hashedToken, now],
      },
    ],
    "write",
  )
  const updatedUser = updatedUsers.rows[0]
  const consumedToken = consumedTokens.rows[0]

  if (!updatedUser && !consumedToken) {
    return null
  }

  if (!updatedUser || !consumedToken) {
    throw new Error("Email verification redemption was not atomic")
  }

  return {
    userId: String(updatedUser.user_id),
    email: updatedUser.email === null ? null : String(updatedUser.email),
    pendingEmail:
      consumedToken.pending_email === null
        ? null
        : String(consumedToken.pending_email),
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
