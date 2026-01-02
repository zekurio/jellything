// Re-export client utilities
export {
	JELLYFIN_URL,
	JellyfinClient,
	JellyfinApiError,
	createAdminApi,
	createApiWithToken,
} from "@/server/jellyfin/client";

// Re-export admin operations
export {
	adminResetUserPassword,
	authenticateUser,
	createUser,
	deleteUser,
	forgotPassword,
	forgotPasswordPin,
	getAllUsers,
	getMediaLibraries,
	getPasswordResetPin,
	getServerInfo,
	getUserAvatarUrl,
	getUserById,
	getUserPolicy,
	isUserAdmin,
	isUsernameTaken,
	updateUserPolicy,
	uploadUserAvatar,
	type ForgotPasswordResult,
	type JellyfinAuthResult,
	type JellyfinUser,
	type JellyfinUserListItem,
	type MediaLibrary,
	type PasswordResetPinInfo,
	type ServerInfo,
	type UserPolicyDetails,
	type UserPolicyUpdate,
} from "@/server/jellyfin/admin";

// Re-export user operations
export {
	changePassword,
	getOwnProfile,
	updateOwnProfile,
	uploadOwnAvatar,
} from "@/server/jellyfin/user";
