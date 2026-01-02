import {
	JELLYFIN_URL,
	JellyfinClient,
	createAdminApi,
	type CompanionPasswordResetResponse,
	type JellyfinAuthResponse,
	type JellyfinForgotPasswordResponse,
	type JellyfinMediaFoldersResponse,
	type JellyfinSystemInfo,
	type JellyfinUserDto,
	type JellyfinUserPolicy,
} from "@/server/jellyfin/client";

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
	const tempApi = new JellyfinClient(JELLYFIN_URL);

	const result = await tempApi.post<JellyfinAuthResponse>("/Users/AuthenticateByName", {
		Username: username,
		Pw: password,
	});

	const user = result.User;
	const accessToken = result.AccessToken;

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
	const result = await api.get<JellyfinUserDto>(`/Users/${userId}`);
	return result.Policy?.IsAdministrator ?? false;
}

/**
 * Get user details by ID.
 */
export async function getUserById(userId: string): Promise<JellyfinUser> {
	const user = await api.get<JellyfinUserDto>(`/Users/${userId}`);

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
	const result = await api.get<JellyfinUserDto[]>("/Users");
	return (result ?? []).map((user) => ({
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
	const result = await api.get<JellyfinSystemInfo>("/System/Info/Public");
	return {
		name: result.ServerName ?? "Jellyfin",
		version: result.Version ?? "Unknown",
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
	const result = await api.get<JellyfinMediaFoldersResponse>("/Library/MediaFolders");
	return (result.Items ?? []).map((item) => ({
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
	const result = await api.get<JellyfinUserDto>(`/Users/${userId}`);
	const policy = result.Policy;
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
	await api.delete(`/Users/${userId}`);
}

/**
 * Update user policy settings.
 * Merges updates with existing policy to preserve other settings.
 */
export async function updateUserPolicy(userId: string, updates: UserPolicyUpdate): Promise<void> {
	const currentUser = await api.get<JellyfinUserDto>(`/Users/${userId}`);
	const currentPolicy = currentUser.Policy;

	if (!currentPolicy) {
		throw new Error("User policy not found");
	}

	const updatedPolicy: JellyfinUserPolicy = {
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

	await api.post(`/Users/${userId}/Policy`, updatedPolicy);
}

/**
 * Create a new Jellyfin user with username and password.
 */
export async function createUser(username: string, password: string): Promise<JellyfinUser> {
	const result = await api.post<JellyfinUserDto>("/Users/New", {
		Name: username,
		Password: password,
	});

	if (!result.Id || !result.Name) {
		throw new Error("Failed to create user");
	}

	return {
		id: result.Id,
		name: result.Name,
		isAdmin: false,
		avatarUrl: getUserAvatarUrl(result.Id),
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
	await api.post(`/Users/${jellyfinUserId}/Password`, {
		NewPw: newPassword,
		ResetPassword: true, // Admin-only: bypass current password requirement
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
	await api.upload(`/Users/${userId}/Images/Primary`, base64Image, mimeType);
}

export interface ForgotPasswordResult {
	action: "PinCode" | "ContactAdmin" | "InNetworkRequired";
	pinFile: string | null;
	pinExpirationDate: string | null;
}

/**
 * Initiate a password reset for a user.
 * This triggers Jellyfin's forgot password flow.
 */
export async function forgotPassword(username: string): Promise<ForgotPasswordResult> {
	const result = await api.post<JellyfinForgotPasswordResponse>("/Users/ForgotPassword", {
		EnteredUsername: username,
	});

	return {
		action: result.Action ?? "ContactAdmin",
		pinFile: result.PinFile ?? null,
		pinExpirationDate: result.PinExpirationDate ?? null,
	};
}

/**
 * Complete password reset using a PIN.
 * After this, the user's password is set to the PIN itself.
 */
export async function forgotPasswordPin(pin: string): Promise<void> {
	await api.post("/Users/ForgotPassword/Pin", {
		Pin: pin,
	});
}

// ============================================================================
// JellyThing Companion Plugin API
// ============================================================================

export interface PasswordResetPinInfo {
	username: string;
	pin: string;
	expirationDate: string;
}

/**
 * Get the password reset PIN for a user from the Jellything Companion plugin.
 * This reads PIN files created by Jellyfin's default password reset flow.
 *
 * Note: The plugin endpoint uses LocalAccessOrRequiresElevation authorization,
 * meaning it works without auth from local network, or with admin credentials remotely.
 *
 * @param username The username to get the PIN for (case-insensitive)
 * @returns PIN info if found, null if no active reset exists
 * @throws Error if the plugin API is disabled (503) or unavailable
 */
export async function getPasswordResetPin(username: string): Promise<PasswordResetPinInfo | null> {
	try {
		const result = await api.get<CompanionPasswordResetResponse>(
			`/JellythingCompanion/PasswordReset/${encodeURIComponent(username)}`,
		);

		return {
			username: result.Username,
			pin: result.Pin,
			expirationDate: result.ExpirationDate,
		};
	} catch (error) {
		// Check if it's a 404 (no active PIN) or 503 (API disabled)
		if (error instanceof Error && "statusCode" in error) {
			const apiError = error as { statusCode: number };
			if (apiError.statusCode === 404) {
				return null; // No active PIN found
			}
			if (apiError.statusCode === 503) {
				throw new Error("Password reset PIN API is disabled in plugin configuration");
			}
		}
		throw error;
	}
}
