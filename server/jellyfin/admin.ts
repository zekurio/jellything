import { env } from "@/lib/env";
import { getLibraryApi, getSystemApi, getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { JELLYFIN_URL, createAdminApi, jellyfin } from "@/server/jellyfin/client";

// API instance with server API key for admin operations
const api = createAdminApi();

export interface JellyfinUser {
  id: string;
  name: string;
  isAdmin: boolean;
  avatarUrl: string;
}

export interface JellyfinAuthResult extends JellyfinUser {
  accessToken: string;
}

/**
 * Authenticate a user against Jellyfin.
 * Returns user info AND access token on success, throws on failure.
 */
export async function authenticateUser(
  username: string,
  password: string,
): Promise<JellyfinAuthResult> {
  // Create a temporary API instance WITHOUT credentials for authentication
  const tempApi = jellyfin.createApi(JELLYFIN_URL as string);

  const result = await getUserApi(tempApi).authenticateUserByName({
    authenticateUserByName: {
      Username: username,
      Pw: password,
    },
  });

  const user = result.data.User;
  const accessToken = result.data.AccessToken;

  if (!user?.Id || !user?.Name || !accessToken) {
    throw new Error("Invalid authentication response");
  }

  return {
    id: user.Id,
    name: user.Name,
    isAdmin: user.Policy?.IsAdministrator ?? false,
    accessToken,
    avatarUrl: getUserAvatarUrl(user.Id),
  };
}

/**
 * Check if a user is an administrator.
 * Uses the server API key to fetch user policy.
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const result = await getUserApi(api).getUserById({ userId });
  return result.data.Policy?.IsAdministrator ?? false;
}

/**
 * Get user details by ID.
 */
export async function getUserById(userId: string): Promise<JellyfinUser> {
  const result = await getUserApi(api).getUserById({ userId });
  const user = result.data;

  if (!user.Id || !user.Name) {
    throw new Error("User not found");
  }

  return {
    id: user.Id,
    name: user.Name,
    isAdmin: user.Policy?.IsAdministrator ?? false,
    avatarUrl: getUserAvatarUrl(user.Id),
  };
}

/**
 * Get the URL for a user's avatar image.
 * Uses fillWidth/fillHeight to crop images to a square for consistent display.
 * Requests 512x512 to look sharp on retina displays (2x/3x DPI).
 */
export function getUserAvatarUrl(userId: string): string {
  return `${JELLYFIN_URL}/Users/${userId}/Images/Primary?fillWidth=512&fillHeight=512&quality=90`;
}

export interface JellyfinUserListItem {
  id: string;
  name: string;
  isAdmin: boolean;
  isDisabled: boolean;
  lastActivityDate: string | null;
  hasPassword: boolean;
  avatarUrl: string;
}

/**
 * Get all users from the Jellyfin server.
 * Requires admin API key.
 */
export async function getAllUsers(): Promise<JellyfinUserListItem[]> {
  const result = await getUserApi(api).getUsers();
  return (result.data ?? []).map((user) => ({
    id: user.Id ?? "",
    name: user.Name ?? "Unknown",
    isAdmin: user.Policy?.IsAdministrator ?? false,
    isDisabled: user.Policy?.IsDisabled ?? false,
    lastActivityDate: user.LastActivityDate ?? null,
    hasPassword: user.HasPassword ?? false,
    avatarUrl: getUserAvatarUrl(user.Id ?? ""),
  }));
}

export interface ServerInfo {
  name: string;
  version: string;
}

/**
 * Get basic server information.
 * Uses the public system info endpoint.
 */
export async function getServerInfo(): Promise<ServerInfo> {
  const result = await getSystemApi(api).getPublicSystemInfo();
  return {
    name: result.data.ServerName ?? "Jellyfin",
    version: result.data.Version ?? "Unknown",
  };
}

export interface MediaLibrary {
  id: string;
  name: string;
  collectionType: string | null;
}

/**
 * Get all media libraries from the server.
 */
export async function getMediaLibraries(): Promise<MediaLibrary[]> {
  const result = await getLibraryApi(api).getMediaFolders();
  return (result.data.Items ?? []).map((item) => ({
    id: item.Id ?? "",
    name: item.Name ?? "Unknown",
    collectionType: item.CollectionType ?? null,
  }));
}

export interface UserPolicyDetails {
	enabledFolders: string[];
	enableAllFolders: boolean;
	remoteClientBitrateLimit: number;
	isDisabled: boolean;
	allowVideoTranscoding: boolean;
	allowAudioTranscoding: boolean;
	allowMediaRemuxing: boolean;
}

/**
 * Get user policy details including library access and bitrate limits.
 */
export async function getUserPolicy(userId: string): Promise<UserPolicyDetails> {
	const result = await getUserApi(api).getUserById({ userId });
	const policy = result.data.Policy;
	return {
		enabledFolders: policy?.EnabledFolders ?? [],
		enableAllFolders: policy?.EnableAllFolders ?? false,
		remoteClientBitrateLimit: policy?.RemoteClientBitrateLimit ?? 0,
		isDisabled: policy?.IsDisabled ?? false,
		allowVideoTranscoding: policy?.EnableVideoPlaybackTranscoding ?? true,
		allowAudioTranscoding: policy?.EnableAudioPlaybackTranscoding ?? true,
		allowMediaRemuxing: policy?.EnablePlaybackRemuxing ?? true,
	};
}

export interface UserPolicyUpdate {
	enabledFolders?: string[];
	enableAllFolders?: boolean;
	remoteClientBitrateLimit?: number;
	isDisabled?: boolean;
	allowVideoTranscoding?: boolean;
	allowAudioTranscoding?: boolean;
	allowMediaRemuxing?: boolean;
}

/**
 * Delete a user from Jellyfin.
 */
export async function deleteUser(userId: string): Promise<void> {
  await getUserApi(api).deleteUser({ userId });
}

/**
 * Update user policy settings.
 * Merges updates with existing policy to preserve other settings.
 */
export async function updateUserPolicy(userId: string, updates: UserPolicyUpdate): Promise<void> {
	const currentUser = await getUserApi(api).getUserById({ userId });
	const currentPolicy = currentUser.data.Policy;

	if (!currentPolicy) {
		throw new Error("User policy not found");
	}

	const updatedPolicy = {
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
		...(updates.isDisabled !== undefined && {
			IsDisabled: updates.isDisabled,
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
	};

	await getUserApi(api).updateUserPolicy({
		userId,
		userPolicy: updatedPolicy,
	});
}

/**
 * Create a new Jellyfin user with username and password.
 */
export async function createUser(username: string, password: string): Promise<JellyfinUser> {
  const result = await getUserApi(api).createUserByName({
    createUserByName: {
      Name: username,
      Password: password,
    },
  });

  const user = result.data;
  if (!user.Id || !user.Name) {
    throw new Error("Failed to create user");
  }

  return {
    id: user.Id,
    name: user.Name,
    isAdmin: false,
    avatarUrl: getUserAvatarUrl(user.Id),
  };
}

/**
 * Check if a username is already taken.
 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const users = await getAllUsers();
  return users.some((user) => user.name.toLowerCase() === username.toLowerCase());
}

/**
 * Reset a user's password using admin privileges.
 * This bypasses the need for the current password.
 */
export async function adminResetUserPassword(
  jellyfinUserId: string,
  newPassword: string,
): Promise<void> {
  await getUserApi(api).updateUserPassword({
    userId: jellyfinUserId,
    updateUserPassword: {
      NewPw: newPassword,
      ResetPassword: true, // Admin-only: bypass current password requirement
    },
  });
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
  // Jellyfin API expects base64-encoded string, not raw binary
  const base64Image = imageBuffer.toString("base64");

  const response = await fetch(`${env.JELLYFIN_URL}/Users/${userId}/Images/Primary`, {
    method: "POST",
    headers: {
      "X-Emby-Token": env.JELLYFIN_API_KEY,
      "Content-Type": mimeType,
    },
    body: base64Image,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload avatar: ${response.status} ${errorText}`);
  }
}

export interface ForgotPasswordResult {
	action: "PinCode" | "ContactAdmin" | "InNetworkRequired";
	pinFile: string | null;
	pinExpirationDate: string | null;
}

export async function forgotPassword(username: string): Promise<ForgotPasswordResult> {
	const result = await getUserApi(api).forgotPassword({
		forgotPasswordDto: {
			EnteredUsername: username,
		},
	});

	return {
		action: result.data.Action ?? "ContactAdmin",
		pinFile: result.data.PinFile ?? null,
		pinExpirationDate: result.data.PinExpirationDate ?? null,
	};
}

export async function forgotPasswordPin(pin: string): Promise<void> {
	await getUserApi(api).forgotPasswordPin({
		forgotPasswordPinDto: {
			Pin: pin,
		},
	});
}
