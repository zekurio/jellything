import type { JellyfinClient, JellyfinUserDto } from "./client";

/**
 * Get the user's own profile information.
 * Uses the user's access token.
 */
export async function getOwnProfile(
	api: JellyfinClient,
	userId: string,
): Promise<{ id: string; name: string; isAdmin: boolean }> {
	const user = await api.get<JellyfinUserDto>(`/Users/${userId}`);

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
	api: JellyfinClient,
	userId: string,
	updates: { name?: string },
): Promise<void> {
	const currentData = await api.get<JellyfinUserDto>(`/Users/${userId}`);

	if (!currentData) {
		throw new Error("User not found");
	}

	await api.post(`/Users/${userId}`, {
		...currentData,
		...(updates.name !== undefined && { Name: updates.name }),
	});
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
	await api.post(`/Users/${userId}/Password`, {
		CurrentPw: currentPassword,
		NewPw: newPassword,
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
	api: JellyfinClient,
	userId: string,
	imageBuffer: Buffer,
	mimeType: string,
): Promise<void> {
	const base64Image = imageBuffer.toString("base64");
	await api.upload(`/Users/${userId}/Images/Primary`, base64Image, mimeType);
}
