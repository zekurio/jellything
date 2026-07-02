import { eq, isNull } from "drizzle-orm"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { createProfileSchema, updateProfileSchema } from "@/lib/schemas"
import { db, ensureMigrated } from "@/server/db.server"
import {
  DEFAULT_PROFILE_POLICY,
  profiles,
  users,
  type Profile,
  type ProfilePolicy,
  type SeerrQuotas,
} from "@/server/db/schema"
import { getAllUsers } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"
import {
  applyProfileToUser,
  JellyfinLastAdminError,
} from "@/server/profile-sync"
import { createSeerrUserLookupCache } from "@/server/seerr/users"

const log = createChildLogger({ module: "admin-profiles-service" })
const PROFILE_SYNC_CONCURRENCY = 3

type ProfileListItem = Omit<Profile, "createdAt" | "updatedAt"> & {
  createdAt: string
  updatedAt: string
  syncFailedCount?: number
}

type EnsureDefaultProfileResult = {
  exists: boolean
  created?: boolean
  profile?: ProfileListItem
}

function normalizeSeerrQuotas(
  quotas: ProfilePolicy["seerrQuotas"],
): SeerrQuotas | undefined {
  if (!quotas || typeof quotas !== "object") {
    return undefined
  }

  const normalized: SeerrQuotas = {}

  if (
    typeof quotas.movieQuotaLimit === "number" &&
    quotas.movieQuotaLimit >= 0
  ) {
    normalized.movieQuotaLimit = quotas.movieQuotaLimit
  }
  if (typeof quotas.movieQuotaDays === "number" && quotas.movieQuotaDays > 0) {
    normalized.movieQuotaDays = quotas.movieQuotaDays
  }
  if (typeof quotas.tvQuotaLimit === "number" && quotas.tvQuotaLimit >= 0) {
    normalized.tvQuotaLimit = quotas.tvQuotaLimit
  }
  if (typeof quotas.tvQuotaDays === "number" && quotas.tvQuotaDays > 0) {
    normalized.tvQuotaDays = quotas.tvQuotaDays
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function normalizeProfilePolicy(
  policy: Profile["policy"] | null | undefined,
): ProfilePolicy {
  const { referrals: _referrals, ...policyWithoutReferrals } =
    (policy as
      | (Partial<ProfilePolicy> & { referrals?: unknown })
      | null
      | undefined) ?? {}

  return {
    ...DEFAULT_PROFILE_POLICY,
    ...policyWithoutReferrals,
    enabledFolders: Array.isArray(policy?.enabledFolders)
      ? policy.enabledFolders
      : [],
    seerrPermissions:
      typeof policy?.seerrPermissions === "number"
        ? policy.seerrPermissions
        : DEFAULT_PROFILE_POLICY.seerrPermissions,
    seerrQuotas: normalizeSeerrQuotas(policy?.seerrQuotas),
  }
}

function toProfileListItem(profile: Profile): ProfileListItem {
  const normalizedPolicy = normalizeProfilePolicy(profile.policy)

  return {
    ...profile,
    policy: normalizedPolicy,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  }
}

async function syncUsersForProfile(profile: Profile): Promise<number> {
  const normalizedPolicy = normalizeProfilePolicy(profile.policy)
  const affectedUsers = await db
    .select({
      userId: users.userId,
      email: users.email,
    })
    .from(users)
    .where(eq(users.profileId, profile.id))

  if (affectedUsers.length === 0) {
    return 0
  }

  const jellyfinUsers = await getAllUsers()
  const jellyfinUsersById = new Map(
    jellyfinUsers.map((jellyfinUser) => [jellyfinUser.id, jellyfinUser]),
  )
  const affectedJellyfinUsers = affectedUsers.flatMap((affectedUser) => {
    const jellyfinUser = jellyfinUsersById.get(affectedUser.userId)
    if (!jellyfinUser || jellyfinUser.isAdmin) {
      return []
    }

    return [
      {
        jellyfinUser,
        email: affectedUser.email,
      },
    ]
  })
  const seerrLookupCache = createSeerrUserLookupCache()

  const syncResults = await runWithConcurrency(
    affectedJellyfinUsers,
    PROFILE_SYNC_CONCURRENCY,
    async (affectedUser) => {
      try {
        await applyProfileToUser({
          userId: affectedUser.jellyfinUser.id,
          userName: affectedUser.jellyfinUser.name,
          email: affectedUser.email,
          policy: normalizedPolicy,
          isAdmin: affectedUser.jellyfinUser.isAdmin,
          seerrLookupCache,
        })
        return true
      } catch (err) {
        if (err instanceof JellyfinLastAdminError) {
          log.warn(
            {
              userId: affectedUser.jellyfinUser.id,
              profileId: profile.id,
              err,
            },
            "Skipped sync due to last-admin safety guard",
          )
          return false
        }

        log.warn(
          {
            userId: affectedUser.jellyfinUser.id,
            profileId: profile.id,
            err,
          },
          "Failed to sync profile for user",
        )
        return false
      }
    },
  )

  return syncResults.filter((syncResult) => !syncResult).length
}

async function runWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = []
  let nextIndex = 0

  async function runWorker(): Promise<void> {
    const itemIndex = nextIndex
    nextIndex += 1

    if (itemIndex >= items.length) {
      return
    }

    results[itemIndex] = await worker(items[itemIndex])
    await runWorker()
  }

  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, runWorker))

  return results
}

export async function ensureDefaultProfileService(): Promise<
  ActionResult<EnsureDefaultProfileResult>
> {
  try {
    await ensureMigrated()
    const allProfiles = await db.select().from(profiles)
    const defaultProfile =
      allProfiles.find((profile) => profile.isDefault) ?? null

    if (defaultProfile) {
      return success({
        exists: true,
        created: false,
        profile: toProfileListItem(defaultProfile),
      })
    }

    if (allProfiles.length > 0) {
      return success({
        exists: true,
        created: false,
      })
    }

    const [createdProfile] = await db
      .insert(profiles)
      .values({
        id: crypto.randomUUID(),
        name: "Default",
        isDefault: true,
        policy: DEFAULT_PROFILE_POLICY,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    return success({
      exists: false,
      created: true,
      profile: toProfileListItem(createdProfile),
    })
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("profiles_default_unique") ||
        err.message.includes("UNIQUE constraint failed: profiles.is_default"))
    ) {
      const [existing] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.isDefault, true))
      if (existing) {
        return success({
          exists: true,
          created: false,
          profile: toProfileListItem(existing),
        })
      }
    }
    return error(ErrorCode.OPERATION_FAILED, "Failed to ensure default profile")
  }
}

export async function listProfilesService(): Promise<
  ActionResult<ProfileListItem[]>
> {
  try {
    await ensureMigrated()
    await ensureDefaultProfileService()
    const result = await db
      .select({
        id: profiles.id,
        name: profiles.name,
        isDefault: profiles.isDefault,
        policy: profiles.policy,
        createdAt: profiles.createdAt,
        updatedAt: profiles.updatedAt,
      })
      .from(profiles)
      .orderBy(profiles.name)

    return success(result.map(toProfileListItem))
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to list profiles")
  }
}

export async function createProfileService(
  input: unknown,
): Promise<ActionResult<ProfileListItem>> {
  try {
    await ensureMigrated()
    const parsed = createProfileSchema.safeParse(input)
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
    }

    const [profile] = await db
      .insert(profiles)
      .values({
        id: crypto.randomUUID(),
        name: parsed.data.name,
        isDefault: false,
        policy: normalizeProfilePolicy(parsed.data.policy),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    return success(toProfileListItem(profile))
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("profiles_name_unique") ||
        err.message.includes("UNIQUE constraint failed: profiles.name"))
    ) {
      return error(
        ErrorCode.ALREADY_EXISTS,
        "A profile with this name already exists",
      )
    }
    return error(ErrorCode.OPERATION_FAILED, "Failed to create profile")
  }
}

export async function updateProfileService(
  profileId: string,
  input: unknown,
): Promise<ActionResult<ProfileListItem>> {
  try {
    await ensureMigrated()
    const parsed = updateProfileSchema.safeParse(input)
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
    }

    const updated = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, profileId))
      if (!existing) {
        throw new Error("PROFILE_NOT_FOUND")
      }

      if (parsed.data.isDefault === false && existing.isDefault) {
        throw new Error("CANNOT_UNSET_DEFAULT_PROFILE")
      }

      if (parsed.data.isDefault) {
        const [currentDefaultProfile] = await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.isDefault, true))

        if (currentDefaultProfile && currentDefaultProfile.id !== existing.id) {
          await tx
            .update(users)
            .set({ profileId: currentDefaultProfile.id })
            .where(isNull(users.profileId))
        }

        await tx
          .update(profiles)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(profiles.isDefault, true))
      }

      const [nextProfile] = await tx
        .update(profiles)
        .set({
          ...(parsed.data.name && { name: parsed.data.name }),
          ...(parsed.data.policy && {
            policy: normalizeProfilePolicy(parsed.data.policy),
          }),
          ...(parsed.data.isDefault !== undefined && {
            isDefault: parsed.data.isDefault,
          }),
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, profileId))
        .returning()

      return nextProfile
    })

    const shouldSyncUsers = parsed.data.policy !== undefined
    const syncFailedCount = shouldSyncUsers
      ? await syncUsersForProfile(updated)
      : 0

    const profileItem = toProfileListItem(updated)
    return success(
      syncFailedCount > 0 ? { ...profileItem, syncFailedCount } : profileItem,
    )
  } catch (err) {
    if (err instanceof Error && err.message === "PROFILE_NOT_FOUND") {
      return error(ErrorCode.NOT_FOUND, "Profile not found")
    }
    if (
      err instanceof Error &&
      err.message === "CANNOT_UNSET_DEFAULT_PROFILE"
    ) {
      return error(
        ErrorCode.CONFLICT,
        "Cannot unset the default profile. Set another profile as default instead.",
      )
    }
    if (
      err instanceof Error &&
      (err.message.includes("profiles_default_unique") ||
        err.message.includes("UNIQUE constraint failed: profiles.is_default"))
    ) {
      return error(
        ErrorCode.CONFLICT,
        "Another profile was set as default. Refresh and try again.",
      )
    }
    if (
      err instanceof Error &&
      (err.message.includes("profiles_name_unique") ||
        err.message.includes("UNIQUE constraint failed: profiles.name"))
    ) {
      return error(
        ErrorCode.ALREADY_EXISTS,
        "A profile with this name already exists",
      )
    }

    return error(ErrorCode.OPERATION_FAILED, "Failed to update profile")
  }
}

export async function deleteProfileService(
  profileId: string,
): Promise<ActionResult<null>> {
  try {
    await ensureMigrated()

    const allProfiles = await db.select().from(profiles)
    const existing =
      allProfiles.find((profile) => profile.id === profileId) ?? null
    if (!existing) {
      return error(ErrorCode.NOT_FOUND, "Profile not found")
    }

    if (allProfiles.length <= 1) {
      return error(ErrorCode.CONFLICT, "Cannot delete the last profile")
    }

    if (existing.isDefault) {
      return error(ErrorCode.CONFLICT, "Cannot delete the default profile")
    }

    const defaultProfile =
      allProfiles.find((profile) => profile.isDefault) ?? null
    if (!defaultProfile) {
      return error(
        ErrorCode.CONFLICT,
        "Cannot delete a profile before a default profile exists",
      )
    }

    const affectedUsers = await db
      .select({
        userId: users.userId,
      })
      .from(users)
      .where(eq(users.profileId, profileId))

    await db.transaction(async (tx) => {
      if (affectedUsers.length > 0) {
        await tx
          .update(users)
          .set({ profileId: defaultProfile.id })
          .where(eq(users.profileId, profileId))
      }

      await tx.delete(profiles).where(eq(profiles.id, profileId))
    })

    if (affectedUsers.length > 0) {
      const jellyfinUsers = await getAllUsers()
      const affectedUserIds = new Set(affectedUsers.map((user) => user.userId))
      const jellyfinUsersById = new Map(
        jellyfinUsers.map((jellyfinUser) => [jellyfinUser.id, jellyfinUser]),
      )
      const affectedJellyfinUsers = Array.from(affectedUserIds).flatMap(
        (userId) => {
          const jellyfinUser = jellyfinUsersById.get(userId)
          if (!jellyfinUser || jellyfinUser.isAdmin) {
            return []
          }

          return [jellyfinUser]
        },
      )
      const seerrLookupCache = createSeerrUserLookupCache()

      await runWithConcurrency(
        affectedJellyfinUsers,
        PROFILE_SYNC_CONCURRENCY,
        async (jellyfinUser) => {
          try {
            await applyProfileToUser({
              userId: jellyfinUser.id,
              userName: jellyfinUser.name,
              policy: defaultProfile.policy,
              isAdmin: jellyfinUser.isAdmin,
              seerrLookupCache,
            })
            return true
          } catch (err) {
            if (err instanceof JellyfinLastAdminError) {
              log.warn(
                { userId: jellyfinUser.id, profileId: defaultProfile.id, err },
                "Skipped fallback profile sync due to last-admin safety guard",
              )
              return false
            }

            log.warn(
              { userId: jellyfinUser.id, profileId: defaultProfile.id, err },
              "Failed to sync fallback profile after delete",
            )
            return false
          }
        },
      )
    }

    return success(null)
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to delete profile")
  }
}
