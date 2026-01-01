"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { authenticateUser, getUserById } from "@/server/jellyfin";
import {
  createSession,
  destroySession,
  getAdminStatus,
  sessionCookieConfig,
} from "@/server/session";
import { getSession } from "@/lib/auth";
import { success, error, type ActionResult } from "@/app/actions/types";
import { loginSchema } from "@/lib/schemas";
import type { JellyfinUser } from "@/server/jellyfin/admin";

export async function login(input: {
  username: string;
  password: string;
}): Promise<ActionResult<{ id: string; name: string; isAdmin: boolean }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message || "Validation failed");
  }

  try {
    const authResult = await authenticateUser(parsed.data.username, parsed.data.password);
    const sessionId = await createSession(
      authResult.id,
      authResult.isAdmin,
      authResult.accessToken,
    );

    const cookieStore = await cookies();
    cookieStore.set("session", sessionId, sessionCookieConfig);

    return success({
      id: authResult.id,
      name: authResult.name,
      isAdmin: authResult.isAdmin,
    });
  } catch {
    return error("Invalid username or password");
  }
}

export async function logout(): Promise<ActionResult<null>> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;

  if (sessionId) {
    await destroySession(sessionId);
  }

  cookieStore.set("session", "", { ...sessionCookieConfig, maxAge: 0 });
  revalidatePath("/");

  return success(null);
}

export async function getCurrentUser(): Promise<
  ActionResult<{
    id: string;
    jellyfinUserId: string;
    name: string;
    isAdmin: boolean;
  } | null>
> {
  const session = await getSession();
  if (!session) {
    return success(null);
  }

  const [isAdmin, jellyfinUser] = await Promise.all([
    getAdminStatus(session),
    getUserById(session.user.jellyfinUserId),
  ]);

  return success({
    id: session.user.jellyfinUserId,
    jellyfinUserId: session.user.jellyfinUserId,
    name: jellyfinUser.name,
    isAdmin,
  });
}

export async function getCurrentUserFull(): Promise<
  ActionResult<{
    user: JellyfinUser;
    isAdmin: boolean;
  } | null>
> {
  const session = await getSession();
  if (!session) {
    return success(null);
  }

  const [isAdmin, jellyfinUser] = await Promise.all([
    getAdminStatus(session),
    getUserById(session.user.jellyfinUserId),
  ]);

  return success({
    user: jellyfinUser,
    isAdmin,
  });
}
