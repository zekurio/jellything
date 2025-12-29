// Re-export client utilities
export { JELLYFIN_URL, createAdminApi, createApiWithToken } from "@/server/jellyfin/client";

// Re-export admin operations
export {
  adminResetUserPassword,
  authenticateUser,
  createUser,
  deleteUser,
  getAllUsers,
  getMediaLibraries,
  getServerInfo,
  getUserAvatarUrl,
  getUserById,
  getUserPolicy,
  isUserAdmin,
  isUsernameTaken,
  updateUserPolicy,
  uploadUserAvatar,
  type JellyfinAuthResult,
  type JellyfinUser,
  type JellyfinUserListItem,
  type MediaLibrary,
  type ServerInfo,
  type UserPolicyDetails,
  type UserPolicyUpdate,
} from "@/server/jellyfin/admin";

// Re-export user operations
export { changePassword, getOwnProfile, updateOwnProfile } from "@/server/jellyfin/user";
