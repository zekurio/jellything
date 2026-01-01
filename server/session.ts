import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/server/crypto";
import { db } from "@/server/db";
import { type Session, sessions, type User, users } from "@/server/db/schema";
import { isUserAdmin } from "@/server/jellyfin";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ADMIN_CHECK_TTL_MS = 60 * 1000; // 60 seconds

export interface SessionWithUser extends Session {
  user: User;
  decryptedAccessToken: string;
}

/**
 * Generate a cryptographically secure session ID.
 */
function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a new session for a user.
 * Creates the user record if it doesn't exist.
 */
export async function createSession(
  jellyfinUserId: string,
  isAdmin: boolean,
  accessToken: string,
): Promise<string> {
  // Find or create user
  let user = await db.query.users.findFirst({
    where: eq(users.jellyfinUserId, jellyfinUserId),
  });

  if (!user) {
    const [newUser] = await db.insert(users).values({ jellyfinUserId }).returning();
    user = newUser;
  }

  // Create session
  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  // Encrypt the access token before storing
  const encryptedToken = encrypt(accessToken);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.jellyfinUserId,
    accessToken: encryptedToken,
    isAdmin,
    adminCheckedAt: now,
    expiresAt,
  });

  return sessionId;
}

/**
 * Get a session by ID if it exists and hasn't expired.
 * Uses a single query with join to avoid N+1.
 */
export async function getSession(sessionId: string | undefined): Promise<SessionWithUser | null> {
  if (!sessionId) return null;

  const result = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    with: {
      user: true,
    },
  });

  if (!result) return null;

  // Check expiry
  if (new Date() > result.expiresAt) {
    await destroySession(sessionId);
    return null;
  }

  // Decrypt the access token
  const decryptedAccessToken = decrypt(result.accessToken);

  return {
    ...result,
    decryptedAccessToken,
  };
}

/**
 * Destroy a session.
 */
export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Check if admin status needs to be refreshed (older than TTL).
 */
export function isAdminStatusStale(session: Session): boolean {
  const elapsed = Date.now() - session.adminCheckedAt.getTime();
  return elapsed > ADMIN_CHECK_TTL_MS;
}

/**
 * Refresh admin status from Jellyfin and update session.
 * Returns the updated admin status.
 */
export async function refreshAdminStatus(session: SessionWithUser): Promise<boolean> {
  const isAdmin = await isUserAdmin(session.user.jellyfinUserId);

  await db
    .update(sessions)
    .set({
      isAdmin,
      adminCheckedAt: new Date(),
    })
    .where(eq(sessions.id, session.id));

  return isAdmin;
}

/**
 * Get current admin status, refreshing from Jellyfin if stale.
 */
export async function getAdminStatus(session: SessionWithUser): Promise<boolean> {
  if (isAdminStatusStale(session)) {
    return await refreshAdminStatus(session);
  }
  return session.isAdmin;
}

/**
 * Cookie configuration for sessions.
 */
export const sessionCookieConfig = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DURATION_MS / 1000,
};
