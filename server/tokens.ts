import crypto from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { emailVerificationTokens, users, type User } from "@/server/db/schema";

const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function generateSecureToken(): string {
	return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
	return crypto.createHash("sha256").update(token).digest("hex");
}

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

export async function validateEmailVerificationToken(rawToken: string): Promise<User | null> {
	const hashedToken = hashToken(rawToken);
	const now = new Date();

	const [result] = await db
		.select({
			token: emailVerificationTokens,
			user: users,
		})
		.from(emailVerificationTokens)
		.innerJoin(users, eq(emailVerificationTokens.userId, users.jellyfinUserId))
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

export async function deleteEmailVerificationToken(userId: string): Promise<void> {
	await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
}

export async function cleanupExpiredTokens(): Promise<void> {
	const now = new Date();
	await db.delete(emailVerificationTokens).where(lt(emailVerificationTokens.expiresAt, now));
}
