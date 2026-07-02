import { z } from "zod"

import {
  JELLYFIN_EXTERNAL_URL,
  JellyfinApiError,
  createAdminApi,
  createApiWithToken,
  jellyfinRequest,
  jellyfinRequestDecoded,
  type JellyfinClient,
  type JellyfinRequestOptions,
} from "@/server/jellyfin/client"
import {
  JellyfinAuthenticationResultSchema,
  JellyfinForgotPasswordResultSchema,
  JellyfinMediaFoldersSchema,
  JellyfinPublicSystemInfoSchema,
  JellyfinUserSchema,
  type JellyfinBaseItemRaw,
  type JellyfinUserPolicyRaw,
  type JellyfinUserRaw,
} from "@/server/jellyfin/schemas"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "jellyfin-admin" })

function adminRequest<T, TBody = unknown>(
  path: string,
  options: Omit<JellyfinRequestOptions<TBody>, "token"> = {},
): Promise<T> {
  const api: JellyfinClient = createAdminApi()
  return jellyfinRequest<T, TBody>(path, {
    ...options,
    token: api.token,
    deviceId: api.deviceId,
  })
}

function adminRequestDecoded<TSchema extends z.ZodType, TBody = unknown>(
  path: string,
  schema: TSchema,
  options: Omit<JellyfinRequestOptions<TBody>, "token"> = {},
): Promise<z.output<TSchema>> {
  const api: JellyfinClient = createAdminApi()
  return jellyfinRequestDecoded(path, schema, {
    ...options,
    token: api.token,
    deviceId: api.deviceId,
  })
}

export interface JellyfinUser {
  id: string
  name: string
  isAdmin: boolean
  avatarUrl: string
}

export interface JellyfinAuthResult extends JellyfinUser {
  accessToken: string
}

export type JellyfinTokenValidationResult =
  | {
      status: "valid"
      user: {
        id: string
        name: string
        isAdmin: boolean
        isDisabled: boolean
      }
    }
  | {
      status: "invalid"
    }
  | {
      status: "unreachable"
      error: string
    }

/**
 * Authenticate a user against Jellyfin.
 * Returns user info AND access token on success, throws on failure.
 */
export async function authenticateUser(
  username: string,
  password: string,
  deviceId?: string,
): Promise<JellyfinAuthResult> {
  const tempApi = createApiWithToken(undefined, deviceId)
  const data = await jellyfinRequestDecoded(
    "/Users/AuthenticateByName",
    JellyfinAuthenticationResultSchema,
    {
      method: "POST",
      token: tempApi.token,
      deviceId: tempApi.deviceId,
      body: {
        Username: username,
        Pw: password,
      },
    },
  )

  const user = data.User
  const accessToken = data.AccessToken

  if (!user?.Id || !user?.Name || !accessToken) {
    throw new Error("Invalid authentication response")
  }

  log.info(
    {
      userId: user.Id,
      username: user.Name,
      isAdmin: user.Policy?.IsAdministrator ?? false,
    },
    "User authenticated against Jellyfin",
  )

  return {
    id: user.Id,
    name: user.Name,
    isAdmin: user.Policy?.IsAdministrator ?? false,
    accessToken,
    avatarUrl: getUserAvatarUrl(user.Id),
  }
}

export async function validateUserAccessToken(
  accessToken: string,
  deviceId?: string,
): Promise<JellyfinTokenValidationResult> {
  try {
    const user = await jellyfinRequestDecoded("/Users/Me", JellyfinUserSchema, {
      method: "GET",
      token: accessToken,
      deviceId,
    })

    if (!user.Id || !user.Name) {
      return { status: "invalid" }
    }

    return {
      status: "valid",
      user: {
        id: user.Id,
        name: user.Name,
        isAdmin: user.Policy?.IsAdministrator ?? false,
        isDisabled: user.Policy?.IsDisabled ?? false,
      },
    }
  } catch (err) {
    if (err instanceof JellyfinApiError) {
      if (
        err.statusCode === 401 ||
        err.statusCode === 403 ||
        err.statusCode === 404
      ) {
        return { status: "invalid" }
      }

      return {
        status: "unreachable",
        error: `Jellyfin returned ${err.statusCode}`,
      }
    }

    return {
      status: "unreachable",
      error: err instanceof Error ? err.message : "Jellyfin request failed",
    }
  }
}

/**
 * Check if a user is an administrator.
 * Uses the server API key to fetch user policy.
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const user = await adminRequestDecoded(
    `/Users/${encodeURIComponent(userId)}`,
    JellyfinUserSchema,
  )
  return user.Policy?.IsAdministrator ?? false
}

/**
 * Get user details by ID.
 */
export async function getUserById(userId: string): Promise<JellyfinUser> {
  const user = await adminRequestDecoded(
    `/Users/${encodeURIComponent(userId)}`,
    JellyfinUserSchema,
  )

  if (!user.Id || !user.Name) {
    throw new Error("User not found")
  }

  return {
    id: user.Id,
    name: user.Name,
    isAdmin: user.Policy?.IsAdministrator ?? false,
    avatarUrl: getUserAvatarUrl(user.Id),
  }
}

/**
 * Update a user's display name while preserving the rest of the Jellyfin user payload.
 */
export async function updateUserName(
  userId: string,
  name: string,
): Promise<void> {
  const currentUser = await adminRequest<Record<string, unknown>>(
    `/Users/${encodeURIComponent(userId)}`,
  )

  if (typeof currentUser.Id !== "string" || currentUser.Id.length === 0) {
    throw new Error("User not found")
  }

  await adminRequest<void, Record<string, unknown>>("/Users", {
    method: "POST",
    query: { userId },
    body: {
      ...currentUser,
      Name: name,
    },
  })
}

export function getUserAvatarUrl(userId: string): string {
  return `${JELLYFIN_EXTERNAL_URL()}/Users/${userId}/Images/Primary?fillWidth=512&fillHeight=512&quality=90`
}

export interface JellyfinUserListItem {
  id: string
  name: string
  isAdmin: boolean
  isDisabled: boolean
  lastActivityDate: string | null
  hasPassword: boolean
  avatarUrl: string
}

/**
 * Get all users from the Jellyfin server.
 * Requires admin API key.
 */
export async function getAllUsers(): Promise<JellyfinUserListItem[]> {
  const data = await adminRequestDecoded("/Users", z.array(JellyfinUserSchema))
  return (data ?? []).map((user: JellyfinUserRaw) => ({
    id: user.Id ?? "",
    name: user.Name ?? "Unknown",
    isAdmin: user.Policy?.IsAdministrator ?? false,
    isDisabled: user.Policy?.IsDisabled ?? false,
    lastActivityDate: user.LastActivityDate ?? null,
    hasPassword: user.HasPassword ?? false,
    avatarUrl: getUserAvatarUrl(user.Id ?? ""),
  }))
}

export interface ServerInfo {
  name: string
  version: string
}

/**
 * Get basic server information.
 * Uses the public system info endpoint.
 */
export async function getServerInfo(options?: {
  signal?: AbortSignal
}): Promise<ServerInfo> {
  const result = await adminRequestDecoded(
    "/System/Info/Public",
    JellyfinPublicSystemInfoSchema,
    {
      signal: options?.signal,
    },
  )
  return {
    name: result.ServerName ?? "Jellyfin",
    version: result.Version ?? "Unknown",
  }
}

export interface MediaLibrary {
  id: string
  name: string
  collectionType: string | null
}

/**
 * Get all media libraries from the server.
 */
export async function getMediaLibraries(): Promise<MediaLibrary[]> {
  const result = await adminRequestDecoded(
    "/Library/MediaFolders",
    JellyfinMediaFoldersSchema,
  )
  return (result.Items ?? []).map((item: JellyfinBaseItemRaw) => ({
    id: item.Id ?? "",
    name: item.Name ?? "Unknown",
    collectionType: item.CollectionType ?? null,
  }))
}

export interface UserPolicyDetails {
  enabledFolders: string[]
  enableAllFolders: boolean
  remoteClientBitrateLimit: number
  isAdmin: boolean
  isDisabled: boolean
  isHidden: boolean
  allowVideoTranscoding: boolean
  allowAudioTranscoding: boolean
  allowMediaRemuxing: boolean
}

/**
 * Get user policy details including library access and bitrate limits.
 */
export async function getUserPolicy(
  userId: string,
): Promise<UserPolicyDetails> {
  const result = await adminRequestDecoded(
    `/Users/${encodeURIComponent(userId)}`,
    JellyfinUserSchema,
  )
  const policy = result.Policy
  return {
    enabledFolders: [...(policy?.EnabledFolders ?? [])],
    enableAllFolders: policy?.EnableAllFolders ?? false,
    remoteClientBitrateLimit: policy?.RemoteClientBitrateLimit ?? 0,
    isAdmin: policy?.IsAdministrator ?? false,
    isDisabled: policy?.IsDisabled ?? false,
    isHidden: policy?.IsHidden ?? false,
    allowVideoTranscoding: policy?.EnableVideoPlaybackTranscoding ?? true,
    allowAudioTranscoding: policy?.EnableAudioPlaybackTranscoding ?? true,
    allowMediaRemuxing: policy?.EnablePlaybackRemuxing ?? true,
  }
}

export interface UserPolicyUpdate {
  enabledFolders?: string[]
  enableAllFolders?: boolean
  remoteClientBitrateLimit?: number
  isAdmin?: boolean
  isDisabled?: boolean
  isHidden?: boolean
  allowVideoTranscoding?: boolean
  allowAudioTranscoding?: boolean
  allowMediaRemuxing?: boolean
}

/**
 * Delete a user from Jellyfin.
 */
export async function deleteUser(userId: string): Promise<void> {
  log.info({ userId }, "Deleting Jellyfin user")
  try {
    await adminRequest<void>(`/Users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    })
  } catch (err) {
    if (err instanceof JellyfinApiError && err.statusCode === 404) {
      log.info({ userId }, "Jellyfin user was already deleted")
      return
    }
    throw err
  }
  log.info({ userId }, "Jellyfin user deleted")
}

/**
 * Update user policy settings.
 * Merges updates with existing policy to preserve other settings.
 */
export async function updateUserPolicy(
  userId: string,
  updates: UserPolicyUpdate,
): Promise<void> {
  log.info({ userId, updates }, "Updating Jellyfin user policy")
  const currentUser = await adminRequest<Record<string, unknown>>(
    `/Users/${encodeURIComponent(userId)}`,
  )
  const currentPolicy = currentUser.Policy

  if (
    !currentPolicy ||
    typeof currentPolicy !== "object" ||
    Array.isArray(currentPolicy)
  ) {
    throw new Error("User policy not found")
  }

  const updatedPolicy: Record<string, unknown> = {
    ...currentPolicy,
    ...(updates.enabledFolders !== undefined && {
      EnabledFolders: updates.enabledFolders,
    }),
    ...(updates.enableAllFolders !== undefined && {
      EnableAllFolders: updates.enableAllFolders,
    }),
    ...(updates.remoteClientBitrateLimit !== undefined && {
      RemoteClientBitrateLimit: updates.remoteClientBitrateLimit,
    }),
    ...(updates.isAdmin !== undefined && {
      IsAdministrator: updates.isAdmin,
    }),
    ...(updates.isDisabled !== undefined && {
      IsDisabled: updates.isDisabled,
    }),
    ...(updates.isHidden !== undefined && {
      IsHidden: updates.isHidden,
    }),
    ...(updates.allowVideoTranscoding !== undefined && {
      EnableVideoPlaybackTranscoding: updates.allowVideoTranscoding,
    }),
    ...(updates.allowAudioTranscoding !== undefined && {
      EnableAudioPlaybackTranscoding: updates.allowAudioTranscoding,
    }),
    ...(updates.allowMediaRemuxing !== undefined && {
      EnablePlaybackRemuxing: updates.allowMediaRemuxing,
    }),
  }

  await adminRequest<void, JellyfinUserPolicyRaw>(
    `/Users/${encodeURIComponent(userId)}/Policy`,
    {
      method: "POST",
      body: updatedPolicy as JellyfinUserPolicyRaw,
    },
  )
}

/**
 * Create a new Jellyfin user with username and password.
 */
export async function createUser(
  username: string,
  password: string,
): Promise<JellyfinUser> {
  const result = await adminRequestDecoded("/Users/New", JellyfinUserSchema, {
    method: "POST",
    body: {
      Name: username,
      Password: password,
    },
  })

  if (!result.Id || !result.Name) {
    throw new Error("Failed to create user")
  }

  log.info(
    { userId: result.Id, username: result.Name },
    "Jellyfin user created",
  )

  return {
    id: result.Id,
    name: result.Name,
    isAdmin: false,
    avatarUrl: getUserAvatarUrl(result.Id),
  }
}

/**
 * Check if a username is already taken.
 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const users = await getAllUsers()
  return users.some(
    (user) => user.name.toLowerCase() === username.toLowerCase(),
  )
}

/**
 * Reset a user's password using admin privileges.
 * This bypasses the need for the current password.
 */
export async function adminResetUserPassword(
  jellyfinUserId: string,
  newPassword: string,
): Promise<void> {
  log.info(
    { userId: jellyfinUserId },
    "Resetting Jellyfin user password via admin",
  )
  await adminRequest<void, { NewPw: string; ResetPassword: boolean }>(
    "/Users/Password",
    {
      method: "POST",
      query: {
        userId: jellyfinUserId,
      },
      body: {
        NewPw: newPassword,
        ResetPassword: true,
      },
    },
  )
}

/**
 * Upload avatar image for a user.
 * @param userId Jellyfin user ID
 * @param imageBuffer Raw image bytes (JPEG/PNG)
 * @param mimeType MIME type of the image (e.g., "image/jpeg", "image/png")
 */
export async function uploadUserAvatar(
  userId: string,
  imageBuffer: Buffer,
  mimeType: string = "image/jpeg",
): Promise<void> {
  const base64Image = imageBuffer.toString("base64")
  await adminRequest<void, string>(
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

export async function deleteUserAvatar(userId: string): Promise<void> {
  await adminRequest<void>(
    `/Users/${encodeURIComponent(userId)}/Images/Primary`,
    {
      method: "DELETE",
    },
  )
}

export interface ForgotPasswordResult {
  action: "PinCode" | "ContactAdmin" | "InNetworkRequired"
  pinFile: string | null
  pinExpirationDate: string | null
}

/**
 * Initiate a password reset for a user.
 * This triggers Jellyfin's forgot password flow.
 */
export async function forgotPassword(
  username: string,
): Promise<ForgotPasswordResult> {
  const result = await adminRequestDecoded(
    "/Users/ForgotPassword",
    JellyfinForgotPasswordResultSchema,
    {
      method: "POST",
      body: {
        EnteredUsername: username,
      },
    },
  )

  return {
    action: result.Action ?? "ContactAdmin",
    pinFile: result.PinFile ?? null,
    pinExpirationDate: result.PinExpirationDate ?? null,
  }
}

/**
 * Complete password reset using a PIN.
 * After this, the user's password is set to the PIN itself.
 */
export async function forgotPasswordPin(pin: string): Promise<void> {
  await adminRequest<void, { Pin: string }>("/Users/ForgotPassword/Pin", {
    method: "POST",
    body: {
      Pin: pin,
    },
  })
}
