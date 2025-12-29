"use server";

import { cookies } from "next/headers";
import { getSession as getDbSession, getAdminStatus, type SessionWithUser } from "@/server/session";

export async function getSession(): Promise<SessionWithUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  return getDbSession(sessionId);
}

export async function requireSession(): Promise<SessionWithUser> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionWithUser> {
  const session = await requireSession();
  const isAdmin = await getAdminStatus(session);
  if (!isAdmin) {
    throw new Error("Forbidden: Admin access required");
  }
  return session;
}
