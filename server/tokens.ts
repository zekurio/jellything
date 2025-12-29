import crypto from "node:crypto";
import { and, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/server/db";
import {
  emailVerificationTokens,
  passwordResetTokens,
  users,
  type User,
  type PasswordResetToken,
} from "@/server/db/schema";

// Token expiration times
const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a cryptographically secure random token.
 * Returns a 64-character hex string (32 bytes).
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash a token using SHA-256.
 * Used to store tokens securely in the database.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Create an email verification token for a user.
 * Deletes any existing tokens for the user first.
 * Returns the raw (unhashed) token to be sent in the email.
 */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));

  const rawToken = generateSecureToken();
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

  await db.insert(emailVerificationTokens).values({
    userId,
    token: hashedToken,
    expiresAt,
  });

  return rawToken;
}

/**
 * Validate an email verification token.
 * Returns the user if the token is valid, null otherwise.
 * Does NOT delete the token - caller should do that after verification.
 */
export async function validateEmailVerificationToken(rawToken: string): Promise<User | null> {
  const hashedToken = hashToken(rawToken);
  const now = new Date();

  const [result] = await db
    .select({
      token: emailVerificationTokens,
      user: users,
    })
    .from(emailVerificationTokens)
    .innerJoin(users, eq(emailVerificationTokens.userId, users.id))
    .where(
      and(
        eq(emailVerificationTokens.token, hashedToken),
        gt(emailVerificationTokens.expiresAt, now),
        isNull(emailVerificationTokens.pendingEmail),
      ),
    );

  if (!result) {
    return null;
  }

  return result.user;
}

/**
 * Delete an email verification token after successful verification.
 */
export async function deleteEmailVerificationToken(userId: string): Promise<void> {
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
}

/**
 * Create a password reset token for a user.
 * Deletes any existing unused tokens for the user first.
 * Returns the raw (unhashed) token to be sent in the email.
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  // Delete any existing unused tokens for this user
  await db
    .delete(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

  const rawToken = generateSecureToken();
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

  await db.insert(passwordResetTokens).values({
    userId,
    token: hashedToken,
    expiresAt,
  });

  return rawToken;
}

/**
 * Validate a password reset token.
 * Returns the user and token record if valid, null otherwise.
 * Does NOT mark the token as used - caller should do that after reset.
 */
export async function validatePasswordResetToken(
  rawToken: string,
): Promise<{ user: User; token: PasswordResetToken } | null> {
  const hashedToken = hashToken(rawToken);
  const now = new Date();

  const [result] = await db
    .select({
      token: passwordResetTokens,
      user: users,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(passwordResetTokens.userId, users.id))
    .where(
      and(
        eq(passwordResetTokens.token, hashedToken),
        gt(passwordResetTokens.expiresAt, now),
        isNull(passwordResetTokens.usedAt),
      ),
    );

  if (!result) {
    return null;
  }

  return { user: result.user, token: result.token };
}

/**
 * Mark a password reset token as used.
 */
export async function markPasswordResetTokenUsed(tokenId: string): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenId));
}

/**
 * Clean up expired tokens (can be run periodically).
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const now = new Date();

  await db.delete(emailVerificationTokens).where(lt(emailVerificationTokens.expiresAt, now));

  await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now));
}
