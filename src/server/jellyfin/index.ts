// Re-export client utilities
export {
  JELLYFIN_INTERNAL_URL,
  JELLYFIN_EXTERNAL_URL,
  JellyfinApiError,
  createAdminApi,
  createApiWithToken,
  jellyfinRequest,
} from "@/server/jellyfin/client"
export type {
  JellyfinClient,
  JellyfinRequestOptions,
} from "@/server/jellyfin/client"

// Re-export admin operations
export {
  adminResetUserPassword,
  authenticateUser,
  createUser,
  deleteUserAvatar,
  deleteUser,
  forgotPassword,
  forgotPasswordPin,
  getAllUsers,
  getMediaLibraries,
  getServerInfo,
  getUserAvatarUrl,
  getUserById,
  getUserPolicy,
  isUserAdmin,
  isUsernameTaken,
  updateUserName,
  updateUserPolicy,
  uploadUserAvatar,
  type ForgotPasswordResult,
  type JellyfinAuthResult,
  type JellyfinTokenValidationResult,
  type JellyfinUser,
  type JellyfinUserListItem,
  type MediaLibrary,
  type ServerInfo,
  type UserPolicyDetails,
  type UserPolicyUpdate,
  validateUserAccessToken,
} from "@/server/jellyfin/admin"

// Re-export user operations
export {
  changePassword,
  getOwnProfile,
  updateOwnProfile,
  uploadOwnAvatar,
} from "@/server/jellyfin/user"
