import { DEFAULT_SEERR_PERMISSIONS } from "@/lib/seerr-permissions"
import { configManager } from "@/lib/server/config.server"
import type { ProfilePolicy } from "@/server/db/schema"
import { JellyfinApiError, updateUserPolicy } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"
import {
  resolveSeerrUser,
  setSeerrUserPermissions,
  setSeerrUserQuotas,
} from "@/server/seerr"
import type { SeerrUserLookupCache } from "@/server/seerr/users"

const log = createChildLogger({ module: "profile-sync" })

export interface ApplyProfileToUserInput {
  userId: string
  userName: string
  email?: string | null
  policy: ProfilePolicy
  isAdmin?: boolean
  seerrLookupCache?: SeerrUserLookupCache
}

export class SeerrProfileSyncError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = "SeerrProfileSyncError"
    this.cause = cause
  }
}

export class JellyfinLastAdminError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = "JellyfinLastAdminError"
    this.cause = cause
  }
}

function isJellyfinLastAdminError(err: unknown): boolean {
  if (!(err instanceof JellyfinApiError)) {
    return false
  }
  return (
    err.statusCode === 403 &&
    err.responseBody.includes(
      "There must be at least one user in the system with administrative access.",
    )
  )
}

export async function applyProfileToUser({
  userId,
  userName,
  email,
  policy,
  isAdmin,
  seerrLookupCache,
}: ApplyProfileToUserInput): Promise<{ seerrUserId: number | null }> {
  log.info({ userId, userName }, "Applying profile policy to user")

  try {
    await updateUserPolicy(userId, {
      enableAllFolders: policy.enableAllFolders,
      enabledFolders: policy.enabledFolders,
      remoteClientBitrateLimit: policy.remoteClientBitrateLimit,
      isAdmin,
      isHidden: !(policy.showInLoginScreen ?? false),
      allowVideoTranscoding: policy.allowVideoTranscoding,
      allowAudioTranscoding: policy.allowAudioTranscoding,
      allowMediaRemuxing: policy.allowMediaRemuxing,
    })
  } catch (err) {
    if (isJellyfinLastAdminError(err)) {
      log.warn(
        { userId, userName, err },
        "Jellyfin rejected policy update: last admin safety guard",
      )
      throw new JellyfinLastAdminError(
        "Jellyfin requires at least one user with administrative access",
        err,
      )
    }
    throw err
  }

  if (!configManager.seerr) {
    return { seerrUserId: null }
  }

  try {
    const seerrUser =
      (await resolveSeerrUser({
        jellyfinUserId: userId,
        userName,
        email,
        lookupCache: seerrLookupCache,
      })) ?? null

    if (!seerrUser) {
      throw new Error("Failed to locate Seerr user for profile sync")
    }

    await setSeerrUserPermissions(
      seerrUser.id,
      policy.seerrPermissions ?? DEFAULT_SEERR_PERMISSIONS,
    )
    await setSeerrUserQuotas(seerrUser.id, policy.seerrQuotas ?? {})

    log.info(
      { userId, seerrUserId: seerrUser.id },
      "Seerr profile sync completed",
    )
    return { seerrUserId: seerrUser.id }
  } catch (err) {
    log.error({ userId, err }, "Failed to sync Seerr profile settings")
    throw new SeerrProfileSyncError(
      "Failed to sync Seerr profile settings",
      err,
    )
  }
}
