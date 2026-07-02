import {
  jellyfinRequest,
  type JellyfinClient,
  type JellyfinRequestOptions,
} from "./client"

interface JellyfinUserPolicyRaw {
  IsAdministrator?: boolean
  [key: string]: unknown
}

interface JellyfinUserRaw {
  Id?: string
  Name?: string | null
  Policy?: JellyfinUserPolicyRaw
  [key: string]: unknown
}

function userRequest<T, TBody = unknown>(
  api: JellyfinClient,
  path: string,
  options: Omit<JellyfinRequestOptions<TBody>, "token"> = {},
): Promise<T> {
  return jellyfinRequest<T, TBody>(path, {
    ...options,
    token: api.token,
    deviceId: api.deviceId,
  })
}

/**
 * Get the user's own profile information.
 * Uses the user's access token.
 */
export async function getOwnProfile(
  api: JellyfinClient,
  userId: string,
): Promise<{ id: string; name: string; isAdmin: boolean }> {
  const user = await userRequest<JellyfinUserRaw>(
    api,
    `/Users/${encodeURIComponent(userId)}`,
  )

  if (!user.Id || !user.Name) {
    throw new Error("User not found")
  }

  return {
    id: user.Id,
    name: user.Name,
    isAdmin: user.Policy?.IsAdministrator ?? false,
  }
}

/**
 * Update the user's own display name.
 * Uses the user's access token.
 */
export async function updateOwnProfile(
  api: JellyfinClient,
  userId: string,
  updates: { name?: string },
): Promise<void> {
  const currentData = await userRequest<JellyfinUserRaw>(
    api,
    `/Users/${encodeURIComponent(userId)}`,
  )

  if (!currentData) {
    throw new Error("User not found")
  }

  const updated: JellyfinUserRaw = {
    ...currentData,
    ...(updates.name !== undefined && { Name: updates.name }),
  }

  await userRequest<void, JellyfinUserRaw>(api, "/Users", {
    method: "POST",
    query: { userId },
    body: updated,
  })
}

/**
 * Change the user's password.
 * Uses the user's access token.
 */
export async function changePassword(
  api: JellyfinClient,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await userRequest<void, { CurrentPw: string; NewPw: string }>(
    api,
    "/Users/Password",
    {
      method: "POST",
      query: { userId },
      body: {
        CurrentPw: currentPassword,
        NewPw: newPassword,
      },
    },
  )
}

/**
 * Upload avatar image using the user's own access token.
 * @param api The API instance with user's access token
 * @param userId Jellyfin user ID
 * @param imageBuffer Raw image bytes (JPEG/PNG/WebP)
 * @param mimeType MIME type of the image
 */
export async function uploadOwnAvatar(
  api: JellyfinClient,
  userId: string,
  imageBuffer: Buffer,
  mimeType: string,
): Promise<void> {
  const base64Image = imageBuffer.toString("base64")
  await userRequest<void, string>(
    api,
    `/Users/${encodeURIComponent(userId)}/Images/Primary`,
    {
      method: "POST",
      body: base64Image,
      headers: {
        "Content-Type": mimeType,
      },
    },
  )
}

export async function deleteOwnAvatar(
  api: JellyfinClient,
  userId: string,
): Promise<void> {
  await userRequest<void>(
    api,
    `/Users/${encodeURIComponent(userId)}/Images/Primary`,
    {
      method: "DELETE",
    },
  )
}
