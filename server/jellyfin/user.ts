import type { Api } from "@jellyfin/sdk/lib/api";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { JELLYFIN_URL } from "./client";

/**
 * Get the user's own profile information.
 * Uses the user's access token.
 */
export async function getOwnProfile(
  api: Api,
  userId: string,
): Promise<{ id: string; name: string; isAdmin: boolean }> {
  const result = await getUserApi(api).getUserById({ userId });
  const user = result.data;

  if (!user.Id || !user.Name) {
    throw new Error("User not found");
  }

  return {
    id: user.Id,
    name: user.Name,
    isAdmin: user.Policy?.IsAdministrator ?? false,
  };
}

/**
 * Update the user's own display name.
 * Uses the user's access token.
 */
export async function updateOwnProfile(
  api: Api,
  userId: string,
  updates: { name?: string },
): Promise<void> {
  const currentUser = await getUserApi(api).getUserById({ userId });
  const currentData = currentUser.data;

  if (!currentData) {
    throw new Error("User not found");
  }

  await getUserApi(api).updateUser({
    userId,
    userDto: {
      ...currentData,
      ...(updates.name !== undefined && { Name: updates.name }),
    },
  });
}

/**
 * Change the user's password.
 * Uses the user's access token.
 */
export async function changePassword(
  api: Api,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await getUserApi(api).updateUserPassword({
    userId,
    updateUserPassword: {
      CurrentPw: currentPassword,
      NewPw: newPassword,
    },
  });
}

/**
 * Upload avatar image using the user's own access token.
 * @param api The API instance with user's access token
 * @param userId Jellyfin user ID
 * @param imageBuffer Raw image bytes (JPEG/PNG/WebP)
 * @param mimeType MIME type of the image
 */
export async function uploadOwnAvatar(
  api: Api,
  userId: string,
  imageBuffer: Buffer,
  mimeType: string,
): Promise<void> {
  const base64Image = imageBuffer.toString("base64");

  const response = await fetch(`${JELLYFIN_URL}/Users/${userId}/Images/Primary`, {
    method: "POST",
    headers: {
      "X-Emby-Token": api.accessToken ?? "",
      "Content-Type": mimeType,
    },
    body: base64Image,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload avatar: ${response.status} ${errorText}`);
  }
}
