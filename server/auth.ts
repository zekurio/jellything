import { cookies } from "next/headers";
import { getUserAvatarUrl, getUserById } from "@/server/jellyfin/admin";
import { getSession } from "@/server/session";

export interface CurrentUser {
  id: string;
  jellyfinUserId: string;
  name: string;
  isAdmin: boolean;
  avatarUrl: string;
}

/**
 * Get the current user from the session cookie.
 * Returns null if not authenticated.
 * This should only be called from Server Components or Server Actions.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");

  if (!sessionCookie?.value) {
    return null;
  }

  const session = await getSession(sessionCookie.value);
  if (!session) {
    return null;
  }

  const jellyfinUser = await getUserById(session.user.jellyfinUserId);

  return {
    id: session.user.id,
    jellyfinUserId: session.user.jellyfinUserId,
    name: jellyfinUser.name,
    isAdmin: session.isAdmin,
    avatarUrl: getUserAvatarUrl(session.user.jellyfinUserId),
  };
}
