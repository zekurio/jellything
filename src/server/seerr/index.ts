export {
  SEERR_EXTERNAL_URL,
  SEERR_INTERNAL_URL,
  SeerrApiError,
  getSeerrStatus,
  seerrRequest,
  type SeerrRequestOptions,
} from "@/server/seerr/client"
export type { SeerrStatus } from "@/server/seerr/schemas"

export {
  deleteSeerrUser,
  findSeerrUserByEmail,
  findSeerrUserByJellyfinId,
  getAllSeerrUsers,
  importSeerrUserFromJellyfin,
  resolveSeerrUser,
  setSeerrUserPermissions,
  setSeerrUserQuotas,
  type SeerrQuotaSettings,
} from "@/server/seerr/users"
export type { SeerrUser } from "@/server/seerr/schemas"
