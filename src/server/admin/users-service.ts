import { and, asc, eq, inArray, ne } from "drizzle-orm"
import { z } from "zod"

import {
  ErrorCode,
  error,
  getErrorMessage,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { normalizeEmail, updateManagedUserSchema } from "@/lib/schemas"
import { configManager } from "@/lib/server/config.server"
import { ensureDefaultProfileService } from "@/server/admin/profiles-service"
import {
  bulkManagedUsersSchema,
  usersPageInputSchema,
  type BulkManagedUserResultDto,
  type BulkManagedUsersDto,
} from "@/server/api/schemas/admin-schemas"
import { db, ensureMigrated } from "@/server/db.server"
import { profiles, users } from "@/server/db/schema"
import {
  deleteUser,
  getAllUsers,
  JellyfinApiError,
  type JellyfinUserListItem,
} from "@/server/jellyfin"
import { updateUserPolicy } from "@/server/jellyfin/admin"
import { logger } from "@/server/logger"
import {
  applyProfileToUser,
  JellyfinLastAdminError,
  SeerrProfileSyncError,
} from "@/server/profile-sync"
import { resolveSeerrUser, syncSeerrUserEmail } from "@/server/seerr"
import { revokeAllUserSessions } from "@/server/session"
import { enforceExpiredUserAccess } from "@/server/user-access"
import { getEffectiveUserExpiry, isUserExpired } from "@/server/user-expiry"
import {
  deleteAppUserData,
  deleteLinkedSeerrUser,
  ensureUserRecord,
  syncUsersWithJellyfin,
} from "@/server/users"

const userIdSchema = z.string().min(1, "User ID is required")

function isJellyfinLastAdminError(err: unknown): boolean {
  return (
    err instanceof JellyfinApiError &&
    err.statusCode === 403 &&
    err.responseBody.includes(
      "There must be at least one user in the system with administrative access.",
    )
  )
}

type UserProfileOption = {
  id: string
  name: string
  isDefault: boolean
}

type ManagedUserListItem = {
  userId: string
  name: string
  email: string | null
  emailVerified: boolean
  existsInJellyfin: boolean
  missingInJellyfin: boolean
  isAdmin: boolean
  isDisabled: boolean
  lastActivityDate: string | null
  avatarUrl: string
  assignedProfileId: string | null
  effectiveProfileId: string | null
  effectiveProfileName: string | null
  seerrSyncedAt: string | null
  expiresAt: string | null
}

type UsersWithProfilesResult = {
  users: {
    items: ManagedUserListItem[]
    page: number
    pageSize: number
    total: number
    pageCount: number
  }
  profiles: UserProfileOption[]
  seerrConfigured: boolean
}

type UnpagedUsersWithProfilesResult = {
  users: ManagedUserListItem[]
  profiles: UserProfileOption[]
  seerrConfigured: boolean
}

type DeleteManagedUserResult = {
  userId: string
  deletedFromJellyfin: boolean
  deletedFromSeerr: boolean
}

type UpdateManagedUserResult = {
  userId: string
  profileId: string | null
  profileName: string | null
  email: string | null
  emailVerified: boolean
  isDisabled: boolean
  expiresAt: string | null
}

type ManagedUserUpdateInput = z.input<typeof updateManagedUserSchema>

type BulkManagedUserOperation = z.output<
  typeof bulkManagedUsersSchema
>["operation"]

type DbUserRow = typeof users.$inferSelect
type ProfileRow = Pick<
  typeof profiles.$inferSelect,
  "id" | "name" | "isDefault" | "policy"
>

type PreparedUserContext = {
  profileRows: ProfileRow[]
  jellyfinUsers: JellyfinUserListItem[]
  dbUsersById: Map<string, DbUserRow>
  profilesById: Map<string, ProfileRow>
  jellyfinUsersById: Map<string, JellyfinUserListItem>
}

type LastAdminGuard = {
  activeAdminCount: number
}

type BulkManagedUserSkipReason =
  | "admin"
  | "missing_in_jellyfin"
  | "no_changes"
  | "already_disabled"
  | "already_enabled"

function getEffectiveProfileName(
  profilesById: Map<string, UserProfileOption>,
  profileId: string | null,
): string | null {
  return profileId !== null ? (profilesById.get(profileId)?.name ?? null) : null
}

type SyncUsersResult = Awaited<ReturnType<typeof syncUsersWithJellyfin>>

function mapLiveUserItem(
  jellyfinUser: SyncUsersResult["jellyfinUsers"][number],
  matchedUsersById: Map<string, SyncUsersResult["matchedUsers"][number]>,
  profilesById: Map<string, UserProfileOption>,
): ManagedUserListItem {
  const matchedUser = matchedUsersById.get(jellyfinUser.id)
  const assignedProfileId = jellyfinUser.isAdmin
    ? null
    : (matchedUser?.profileId ?? null)
  const effectiveProfileId = jellyfinUser.isAdmin ? null : assignedProfileId

  return {
    userId: jellyfinUser.id,
    name: jellyfinUser.name,
    email: matchedUser?.email ?? null,
    emailVerified: matchedUser?.emailVerified ?? false,
    existsInJellyfin: true,
    missingInJellyfin: false,
    isAdmin: jellyfinUser.isAdmin,
    isDisabled: jellyfinUser.isDisabled,
    lastActivityDate: jellyfinUser.lastActivityDate,
    avatarUrl: jellyfinUser.avatarUrl,
    assignedProfileId,
    effectiveProfileId,
    effectiveProfileName: getEffectiveProfileName(
      profilesById,
      effectiveProfileId,
    ),
    seerrSyncedAt: matchedUser?.seerrSyncedAt?.toISOString() ?? null,
    expiresAt:
      getEffectiveUserExpiry(
        { expiresAt: matchedUser?.expiresAt ?? null },
        jellyfinUser.isAdmin,
      )?.toISOString() ?? null,
  }
}

function mapOrphanedUserItem(
  dbUser: SyncUsersResult["orphanedUsers"][number],
  profilesById: Map<string, UserProfileOption>,
): ManagedUserListItem {
  const assignedProfileId = dbUser.profileId ?? null

  return {
    userId: dbUser.userId,
    name: dbUser.email ?? "Unknown user",
    email: dbUser.email ?? null,
    emailVerified: dbUser.emailVerified,
    existsInJellyfin: false,
    missingInJellyfin: true,
    isAdmin: false,
    isDisabled: true,
    lastActivityDate: null,
    avatarUrl: "",
    assignedProfileId,
    effectiveProfileId: assignedProfileId,
    effectiveProfileName: getEffectiveProfileName(
      profilesById,
      assignedProfileId,
    ),
    seerrSyncedAt: dbUser.seerrSyncedAt?.toISOString() ?? null,
    expiresAt: dbUser.expiresAt?.toISOString() ?? null,
  }
}

export async function listUsersWithProfilesService(
  input: z.input<typeof usersPageInputSchema> = {},
): Promise<ActionResult<UsersWithProfilesResult>> {
  const parsed = usersPageInputSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const usersPage = parsed.data
  const result = await listAllUsersWithProfiles()
  if (!result.success) {
    return result
  }

  const filteredUsers = filterUserItems(result.data.users, usersPage.query)
  const sortedUsers = sortUserItems(
    filteredUsers,
    usersPage.sort,
    usersPage.direction,
  )
  const offset = (usersPage.page - 1) * usersPage.pageSize
  const total = sortedUsers.length

  return success({
    users: {
      items: sortedUsers.slice(offset, offset + usersPage.pageSize),
      page: usersPage.page,
      pageSize: usersPage.pageSize,
      total,
      pageCount: Math.ceil(total / usersPage.pageSize),
    },
    profiles: result.data.profiles,
    seerrConfigured: result.data.seerrConfigured,
  })
}

async function listAllUsersWithProfiles(): Promise<
  ActionResult<UnpagedUsersWithProfilesResult>
> {
  try {
    await ensureDefaultProfileService()
    await ensureMigrated()

    const [profileRows, syncResult] = await Promise.all([
      db
        .select({
          id: profiles.id,
          name: profiles.name,
          isDefault: profiles.isDefault,
        })
        .from(profiles)
        .orderBy(asc(profiles.name)),
      syncUsersWithJellyfin(),
    ])

    const profilesById = new Map(
      profileRows.map((profile) => [profile.id, profile]),
    )
    const matchedUsersById = new Map(
      syncResult.matchedUsers.map((user) => [user.userId, user]),
    )
    const liveUserItems = syncResult.jellyfinUsers.map((jellyfinUser) =>
      mapLiveUserItem(jellyfinUser, matchedUsersById, profilesById),
    )

    const orphanedUserItems = syncResult.orphanedUsers
      .map((dbUser) => mapOrphanedUserItem(dbUser, profilesById))
      .toSorted((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      )

    const userItems = [...liveUserItems, ...orphanedUserItems].toSorted(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    )

    return success({
      users: userItems,
      profiles: profileRows,
      seerrConfigured: !!configManager.seerr,
    })
  } catch (err) {
    logger.error({ err }, "Failed to list users")
    return error(ErrorCode.OPERATION_FAILED, "Failed to list users")
  }
}

function filterUserItems(
  users: ManagedUserListItem[],
  query: string | undefined,
): ManagedUserListItem[] {
  const trimmedQuery = query?.trim().toLowerCase()
  if (!trimmedQuery) {
    return users
  }

  return users.filter((user) =>
    [user.name, user.email, user.userId, user.effectiveProfileName].some(
      (value) => value?.toLowerCase().includes(trimmedQuery),
    ),
  )
}

function sortUserItems(
  users: ManagedUserListItem[],
  sort: z.output<typeof usersPageInputSchema>["sort"],
  direction: z.output<typeof usersPageInputSchema>["direction"],
): ManagedUserListItem[] {
  const multiplier = direction === "asc" ? 1 : -1
  return users.toSorted((a, b) => multiplier * compareUserItems(a, b, sort))
}

function compareUserItems(
  a: ManagedUserListItem,
  b: ManagedUserListItem,
  sort: z.output<typeof usersPageInputSchema>["sort"],
): number {
  if (sort === "email") {
    return compareNullableString(a.email, b.email)
  }
  if (sort === "profileName") {
    return compareNullableString(a.effectiveProfileName, b.effectiveProfileName)
  }
  if (sort === "lastActivityDate") {
    return compareNullableString(a.lastActivityDate, b.lastActivityDate)
  }
  return compareNullableString(a.name, b.name)
}

function compareNullableString(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" })
}

async function loadManagedUserSharedState(): Promise<{
  profileRows: ProfileRow[]
  jellyfinUsers: JellyfinUserListItem[]
}> {
  const [profileRows, jellyfinUsers] = await Promise.all([
    db
      .select({
        id: profiles.id,
        name: profiles.name,
        isDefault: profiles.isDefault,
        policy: profiles.policy,
      })
      .from(profiles),
    getAllUsers(),
  ])

  return { profileRows, jellyfinUsers }
}

function buildPreparedUserMaps(input: {
  profileRows: ProfileRow[]
  jellyfinUsers: JellyfinUserListItem[]
  dbUsers: DbUserRow[]
}): PreparedUserContext {
  return {
    profileRows: input.profileRows,
    jellyfinUsers: input.jellyfinUsers,
    dbUsersById: new Map(input.dbUsers.map((user) => [user.userId, user])),
    profilesById: new Map(
      input.profileRows.map((profile) => [profile.id, profile]),
    ),
    jellyfinUsersById: new Map(
      input.jellyfinUsers.map((user) => [user.id, user]),
    ),
  }
}

async function loadDbUsersByIds(userIds: string[]): Promise<DbUserRow[]> {
  const uniqueUserIds = Array.from(new Set(userIds))
  if (uniqueUserIds.length === 0) {
    return []
  }

  return db.select().from(users).where(inArray(users.userId, uniqueUserIds))
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await task(items[currentIndex] as T)
    }
  }

  const workerCount = Math.min(limit, items.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      await worker()
    }),
  )

  return results
}

function bulkFailureResult(
  userId: string,
  operation: BulkManagedUserOperation,
  code: ErrorCode,
  message = getErrorMessage(code),
): BulkManagedUserResultDto {
  return { userId, ok: false, operation, code, message }
}

function bulkSkippedResult(
  userId: string,
  operation: BulkManagedUserOperation,
  reason: BulkManagedUserSkipReason,
): BulkManagedUserResultDto {
  return { userId, ok: true, operation, skipped: true, reason }
}

function bulkFailureFromActionResult(
  userId: string,
  operation: BulkManagedUserOperation,
  result: ActionResult<unknown>,
): BulkManagedUserResultDto {
  if (result.success) {
    return bulkFailureResult(userId, operation, ErrorCode.OPERATION_FAILED)
  }

  return bulkFailureResult(userId, operation, result.code, result.error)
}

function reserveActiveAdmin(
  jellyfinUser: JellyfinUserListItem,
  guard: LastAdminGuard,
): boolean {
  if (!jellyfinUser.isAdmin || jellyfinUser.isDisabled) {
    return true
  }
  if (guard.activeAdminCount <= 1) {
    return false
  }

  guard.activeAdminCount -= 1
  return true
}

function releaseActiveAdmin(
  jellyfinUser: JellyfinUserListItem,
  guard: LastAdminGuard,
): void {
  if (jellyfinUser.isAdmin && !jellyfinUser.isDisabled) {
    guard.activeAdminCount += 1
  }
}

export async function bulkManageUsersService(
  input: z.input<typeof bulkManagedUsersSchema>,
): Promise<ActionResult<BulkManagedUsersDto>> {
  const parsed = bulkManagedUsersSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  try {
    if (parsed.data.operation === "assignProfile") {
      await ensureDefaultProfileService()
    }
    await ensureMigrated()

    const sharedState = await loadManagedUserSharedState()
    const dbUsers = await loadDbUsersByIds(parsed.data.userIds)
    const context = buildPreparedUserMaps({ ...sharedState, dbUsers })
    const lastAdminGuard = {
      activeAdminCount: context.jellyfinUsers.filter(
        (user) => user.isAdmin && !user.isDisabled,
      ).length,
    }

    const results = await runWithConcurrency(
      parsed.data.userIds,
      3,
      async (userId) =>
        applyBulkManagedUserOperation(
          userId,
          parsed.data.operation,
          parsed.data.updates,
          context,
          lastAdminGuard,
        ),
    )

    return success({ results })
  } catch (err) {
    logger.error({ err }, "Failed to run bulk user operation")
    return error(
      ErrorCode.OPERATION_FAILED,
      "Failed to run bulk user operation",
    )
  }
}

async function applyBulkManagedUserOperation(
  userId: string,
  operation: BulkManagedUserOperation,
  updates: ManagedUserUpdateInput | undefined,
  context: PreparedUserContext,
  lastAdminGuard: LastAdminGuard,
): Promise<BulkManagedUserResultDto> {
  const jellyfinUser = context.jellyfinUsersById.get(userId) ?? null

  switch (operation) {
    case "assignProfile": {
      if (jellyfinUser?.isAdmin) {
        return bulkSkippedResult(userId, operation, "admin")
      }
      if (!jellyfinUser) {
        return bulkSkippedResult(userId, operation, "missing_in_jellyfin")
      }
      if (
        updates?.profileId === undefined &&
        updates?.expiresAt === undefined
      ) {
        return bulkSkippedResult(userId, operation, "no_changes")
      }
      return applyBulkManagedUserUpdate(
        userId,
        operation,
        updates ?? {},
        context,
        lastAdminGuard,
      )
    }
    case "disable":
      if (!jellyfinUser) {
        return bulkSkippedResult(userId, operation, "missing_in_jellyfin")
      }
      if (jellyfinUser.isDisabled) {
        return bulkSkippedResult(userId, operation, "already_disabled")
      }
      return applyBulkManagedUserUpdate(
        userId,
        operation,
        { isDisabled: true },
        context,
        lastAdminGuard,
      )
    case "enable":
      if (!jellyfinUser) {
        return bulkSkippedResult(userId, operation, "missing_in_jellyfin")
      }
      if (!jellyfinUser.isDisabled) {
        return bulkSkippedResult(userId, operation, "already_enabled")
      }
      return applyBulkManagedUserUpdate(
        userId,
        operation,
        { isDisabled: false },
        context,
        lastAdminGuard,
      )
    case "delete":
      return applyBulkManagedUserDelete(userId, context, lastAdminGuard)
    case "syncSeerr":
      return applyBulkManagedUserSeerrSync(userId, context)
  }
}

async function applyBulkManagedUserUpdate(
  userId: string,
  operation: "assignProfile" | "disable" | "enable",
  updates: ManagedUserUpdateInput,
  context: PreparedUserContext,
  lastAdminGuard: LastAdminGuard,
): Promise<BulkManagedUserResultDto> {
  try {
    const result = await updatePreparedManagedUser(
      userId,
      updates,
      context,
      lastAdminGuard,
    )
    if (!result.success) {
      return bulkFailureFromActionResult(userId, operation, result)
    }

    return { userId, ok: true, operation, result: result.data }
  } catch (err) {
    logger.error({ err, userId, operation }, "Failed bulk user update")
    return bulkFailureResult(
      userId,
      operation,
      ErrorCode.OPERATION_FAILED,
      "Failed to update user",
    )
  }
}

async function updatePreparedManagedUser(
  userId: string,
  input: ManagedUserUpdateInput,
  context: PreparedUserContext,
  lastAdminGuard: LastAdminGuard,
): Promise<ActionResult<UpdateManagedUserResult>> {
  const parsed = updateManagedUserSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const updates = parsed.data
  const dbUser = context.dbUsersById.get(userId)
  const jellyfinUser = context.jellyfinUsersById.get(userId) ?? null
  if (!dbUser && !jellyfinUser) {
    return error(ErrorCode.NOT_FOUND, "User not found")
  }

  const currentEmail = dbUser?.email ?? null
  const normalizedEmail =
    updates.email !== undefined
      ? updates.email
        ? normalizeEmail(updates.email)
        : null
      : currentEmail
  const hasEmailUpdate =
    updates.email !== undefined || updates.emailVerified !== undefined
  const currentExpiresAt = dbUser?.expiresAt ?? null
  const now = new Date()

  if (hasEmailUpdate && normalizedEmail) {
    const [existingUser] = await db
      .select({ userId: users.userId })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), ne(users.userId, userId)))

    if (existingUser) {
      return error(
        ErrorCode.EMAIL_TAKEN,
        "Email is already registered to another user",
      )
    }
  }

  let assignedProfileId = dbUser?.profileId ?? null
  let effectiveProfileName = jellyfinUser?.isAdmin
    ? null
    : assignedProfileId !== null
      ? (context.profilesById.get(assignedProfileId)?.name ?? null)
      : null
  let isDisabled = jellyfinUser?.isDisabled ?? true
  let nextExpiresAt =
    updates.expiresAt === undefined
      ? currentExpiresAt
      : updates.expiresAt
        ? new Date(updates.expiresAt)
        : null

  if (jellyfinUser?.isAdmin) {
    if (updates.expiresAt !== undefined && updates.expiresAt !== null) {
      return error(ErrorCode.CONFLICT, "Admin users are exempt from expiry")
    }
    nextExpiresAt = null
  }

  if (updates.profileId !== undefined) {
    if (jellyfinUser?.isAdmin) {
      return error(ErrorCode.CONFLICT, "Admin users are exempt from profiles")
    }
    const profile = context.profilesById.get(updates.profileId)
    if (!profile) {
      return error(ErrorCode.NOT_FOUND, "Profile not found")
    }
    if (!jellyfinUser) {
      return error(ErrorCode.NOT_FOUND, "User no longer exists in Jellyfin")
    }

    let seerrSynced = false
    try {
      await applyProfileToUser({
        userId: jellyfinUser.id,
        userName: jellyfinUser.name,
        email: normalizedEmail,
        policy: profile.policy,
        isAdmin: jellyfinUser.isAdmin,
      })
      seerrSynced = !!configManager.seerr
    } catch (err) {
      if (err instanceof JellyfinLastAdminError) {
        return error(ErrorCode.LAST_ADMIN_REQUIRED, err.message)
      }
      if (err instanceof SeerrProfileSyncError) {
        logger.warn(
          { err, userId: jellyfinUser.id, profileId: profile.id },
          "Seerr sync failed; continuing",
        )
      } else {
        throw err
      }
    }

    if (seerrSynced) {
      await db
        .update(users)
        .set({ seerrSyncedAt: new Date() })
        .where(eq(users.userId, jellyfinUser.id))
    }

    assignedProfileId = profile.id
    effectiveProfileName = profile.name
  }

  if (updates.isDisabled !== undefined) {
    if (!jellyfinUser) {
      return error(ErrorCode.NOT_FOUND, "User no longer exists in Jellyfin")
    }
    if (jellyfinUser.isDisabled && updates.isDisabled) {
      return error(ErrorCode.CONFLICT, "User is already disabled")
    }
    if (!jellyfinUser.isDisabled && !updates.isDisabled) {
      return error(ErrorCode.CONFLICT, "User is already enabled")
    }
    if (
      jellyfinUser.isAdmin &&
      updates.isDisabled &&
      !reserveActiveAdmin(jellyfinUser, lastAdminGuard)
    ) {
      return error(ErrorCode.LAST_ADMIN_REQUIRED)
    }

    try {
      await updateUserPolicy(jellyfinUser.id, {
        isDisabled: updates.isDisabled,
      })
      isDisabled = updates.isDisabled
      if (updates.isDisabled) {
        await revokeAllUserSessions(jellyfinUser.id)
      }
    } catch (err) {
      if (jellyfinUser.isAdmin && updates.isDisabled) {
        releaseActiveAdmin(jellyfinUser, lastAdminGuard)
      }
      if (
        err instanceof JellyfinLastAdminError ||
        isJellyfinLastAdminError(err)
      ) {
        return error(ErrorCode.LAST_ADMIN_REQUIRED)
      }
      throw err
    }
  }

  const emailVerified = normalizedEmail
    ? (updates.emailVerified ?? dbUser?.emailVerified ?? false)
    : false
  const expiresAtChanged =
    currentExpiresAt?.getTime() !== nextExpiresAt?.getTime()
  const emailChanged = normalizedEmail !== currentEmail
  const shouldResetExpiryWarning = expiresAtChanged || emailChanged

  await ensureUserRecord(userId)
  await db
    .update(users)
    .set({
      profileId: jellyfinUser?.isAdmin ? null : assignedProfileId,
      email: normalizedEmail,
      emailVerified,
      expiresAt: nextExpiresAt,
      ...(shouldResetExpiryWarning
        ? {
            expiryWarningSentAt: null,
            expiryWarningSentFor: null,
          }
        : {}),
    })
    .where(eq(users.userId, userId))

  if (
    configManager.seerr &&
    normalizedEmail &&
    normalizedEmail !== currentEmail
  ) {
    try {
      const syncedSeerrUser = await syncSeerrUserEmail({
        jellyfinUserId: userId,
        userName: jellyfinUser?.name ?? userId,
        email: normalizedEmail,
      })

      if (syncedSeerrUser) {
        await db
          .update(users)
          .set({ seerrSyncedAt: new Date() })
          .where(eq(users.userId, userId))
      }
    } catch (err) {
      logger.warn(
        { err, userId },
        "Failed to sync Seerr email after managed user update",
      )
    }
  }

  if (
    nextExpiresAt !== null &&
    isUserExpired({ expiresAt: nextExpiresAt }, false, now)
  ) {
    await enforceExpiredUserAccess(
      {
        userId,
        userName: jellyfinUser?.name ?? dbUser?.email ?? null,
        expiresAt: nextExpiresAt,
        isAdmin: false,
        isDisabled,
      },
      now,
    )
    isDisabled = true
  }

  return success({
    userId,
    profileId: jellyfinUser?.isAdmin ? null : assignedProfileId,
    profileName: effectiveProfileName,
    email: normalizedEmail,
    emailVerified,
    isDisabled,
    expiresAt: nextExpiresAt?.toISOString() ?? null,
  })
}

async function applyBulkManagedUserDelete(
  userId: string,
  context: PreparedUserContext,
  lastAdminGuard: LastAdminGuard,
): Promise<BulkManagedUserResultDto> {
  const dbUser = context.dbUsersById.get(userId)
  const jellyfinUser = context.jellyfinUsersById.get(userId) ?? null
  if (!dbUser && !jellyfinUser) {
    return bulkFailureResult(
      userId,
      "delete",
      ErrorCode.NOT_FOUND,
      "User not found",
    )
  }
  if (jellyfinUser && !reserveActiveAdmin(jellyfinUser, lastAdminGuard)) {
    return bulkFailureResult(userId, "delete", ErrorCode.LAST_ADMIN_REQUIRED)
  }

  try {
    let deletedFromSeerr = false

    try {
      deletedFromSeerr = await deleteLinkedSeerrUser(userId, {
        userName: jellyfinUser?.name ?? dbUser?.email ?? userId,
        email: dbUser?.email ?? null,
      })
    } catch (err) {
      logger.warn(
        { err, userId, jellyfinUserMissing: jellyfinUser === null },
        "Failed to delete linked Seerr user; continuing with app user deletion",
      )
    }

    if (jellyfinUser) {
      await deleteUser(jellyfinUser.id)
    }

    await revokeAllUserSessions(userId)

    if (dbUser) {
      await deleteAppUserData(dbUser.userId)
    }

    return {
      userId,
      ok: true,
      operation: "delete",
      result: {
        userId,
        deletedFromJellyfin: jellyfinUser !== null,
        deletedFromSeerr,
      },
    }
  } catch (err) {
    if (jellyfinUser) {
      releaseActiveAdmin(jellyfinUser, lastAdminGuard)
    }
    if (
      err instanceof JellyfinLastAdminError ||
      isJellyfinLastAdminError(err)
    ) {
      return bulkFailureResult(userId, "delete", ErrorCode.LAST_ADMIN_REQUIRED)
    }
    logger.error({ err, userId }, "Failed bulk user delete")
    return bulkFailureResult(
      userId,
      "delete",
      ErrorCode.OPERATION_FAILED,
      "Failed to delete user",
    )
  }
}

async function applyBulkManagedUserSeerrSync(
  userId: string,
  context: PreparedUserContext,
): Promise<BulkManagedUserResultDto> {
  if (!configManager.seerr) {
    return bulkFailureResult(
      userId,
      "syncSeerr",
      ErrorCode.CONFLICT,
      "Seerr integration is not configured",
    )
  }

  const result = await syncPreparedUserToSeerr(userId, context)
  if (!result.success) {
    return bulkFailureFromActionResult(userId, "syncSeerr", result)
  }

  return {
    userId,
    ok: true,
    operation: "syncSeerr",
    result: result.data,
  }
}

async function syncPreparedUserToSeerr(
  userId: string,
  context: PreparedUserContext,
): Promise<ActionResult<{ synced: boolean }>> {
  try {
    const dbUser = context.dbUsersById.get(userId)
    const jellyfinUser = context.jellyfinUsersById.get(userId) ?? null

    if (!dbUser && !jellyfinUser) {
      return error(ErrorCode.NOT_FOUND, "User not found")
    }
    if (!jellyfinUser) {
      return error(ErrorCode.NOT_FOUND, "User no longer exists in Jellyfin")
    }

    const seerrUser = await resolveSeerrUser({
      jellyfinUserId: userId,
      userName: jellyfinUser.name,
      email: dbUser?.email ?? null,
    })
    if (!seerrUser) {
      return error(
        ErrorCode.OPERATION_FAILED,
        "User could not be found or imported in Seerr",
      )
    }

    if (dbUser?.profileId && !jellyfinUser.isAdmin) {
      const profile = context.profilesById.get(dbUser.profileId)
      if (profile?.policy) {
        try {
          await applyProfileToUser({
            userId,
            userName: jellyfinUser.name,
            email: dbUser.email,
            policy: profile.policy,
            isAdmin: jellyfinUser.isAdmin,
          })
        } catch (err) {
          if (err instanceof JellyfinLastAdminError) {
            return error(ErrorCode.LAST_ADMIN_REQUIRED, err.message)
          }
          if (err instanceof SeerrProfileSyncError) {
            logger.warn(
              { err, userId, profileId: profile.id },
              "Seerr profile re-sync failed during manual Seerr sync",
            )
          } else {
            throw err
          }
        }
      }
    }

    if (dbUser?.email) {
      try {
        await syncSeerrUserEmail({
          jellyfinUserId: userId,
          userName: jellyfinUser.name,
          email: dbUser.email,
          attemptImport: false,
        })
      } catch (err) {
        logger.warn(
          { err, userId },
          "Failed to sync Seerr email after manual Seerr sync",
        )
      }
    }

    await ensureUserRecord(userId)
    await db
      .update(users)
      .set({ seerrSyncedAt: new Date() })
      .where(eq(users.userId, userId))

    return success({ synced: true })
  } catch (err) {
    logger.error({ err, userId }, "Failed to sync user to Seerr")
    return error(ErrorCode.OPERATION_FAILED, "Failed to sync user to Seerr")
  }
}

export async function updateManagedUserService(
  userId: string,
  input: z.infer<typeof updateManagedUserSchema>,
): Promise<ActionResult<UpdateManagedUserResult>> {
  try {
    const parsedUserId = userIdSchema.safeParse(userId)
    if (!parsedUserId.success) {
      return error(
        ErrorCode.VALIDATION_FAILED,
        parsedUserId.error.issues[0]?.message,
      )
    }

    const parsed = updateManagedUserSchema.safeParse(input)
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
    }

    await ensureDefaultProfileService()
    await ensureMigrated()

    const [dbUser, profileRows, jellyfinUsers] = await Promise.all([
      db.query.users.findFirst({
        where: (table, { eq: isEqual }) =>
          isEqual(table.userId, parsedUserId.data),
      }),
      db
        .select({
          id: profiles.id,
          name: profiles.name,
          isDefault: profiles.isDefault,
          policy: profiles.policy,
        })
        .from(profiles),
      getAllUsers(),
    ])

    const jellyfinUser =
      jellyfinUsers.find((user) => user.id === parsedUserId.data) ?? null
    if (!dbUser && !jellyfinUser) {
      return error(ErrorCode.NOT_FOUND, "User not found")
    }

    const profilesById = new Map(
      profileRows.map((profile) => [profile.id, profile]),
    )
    const currentEmail = dbUser?.email ?? null
    const normalizedEmail =
      parsed.data.email !== undefined
        ? parsed.data.email
          ? normalizeEmail(parsed.data.email)
          : null
        : currentEmail
    const hasEmailUpdate =
      parsed.data.email !== undefined || parsed.data.emailVerified !== undefined
    const currentExpiresAt = dbUser?.expiresAt ?? null
    const now = new Date()

    if (hasEmailUpdate && normalizedEmail) {
      const [existingUser] = await db
        .select({ userId: users.userId })
        .from(users)
        .where(
          and(
            eq(users.email, normalizedEmail),
            ne(users.userId, parsedUserId.data),
          ),
        )

      if (existingUser) {
        return error(
          ErrorCode.EMAIL_TAKEN,
          "Email is already registered to another user",
        )
      }
    }

    let assignedProfileId = dbUser?.profileId ?? null
    let effectiveProfileName = jellyfinUser?.isAdmin
      ? null
      : assignedProfileId !== null
        ? (profilesById.get(assignedProfileId)?.name ?? null)
        : null
    let isDisabled = jellyfinUser?.isDisabled ?? true
    let nextExpiresAt =
      parsed.data.expiresAt === undefined
        ? currentExpiresAt
        : parsed.data.expiresAt
          ? new Date(parsed.data.expiresAt)
          : null

    if (jellyfinUser?.isAdmin) {
      if (
        parsed.data.expiresAt !== undefined &&
        parsed.data.expiresAt !== null
      ) {
        return error(ErrorCode.CONFLICT, "Admin users are exempt from expiry")
      }
      nextExpiresAt = null
    }

    if (parsed.data.profileId !== undefined) {
      if (jellyfinUser?.isAdmin) {
        return error(ErrorCode.CONFLICT, "Admin users are exempt from profiles")
      }
      const profile = profilesById.get(parsed.data.profileId)
      if (!profile) {
        return error(ErrorCode.NOT_FOUND, "Profile not found")
      }
      if (!jellyfinUser) {
        return error(ErrorCode.NOT_FOUND, "User no longer exists in Jellyfin")
      }

      let seerrSynced = false
      try {
        await applyProfileToUser({
          userId: jellyfinUser.id,
          userName: jellyfinUser.name,
          email: normalizedEmail,
          policy: profile.policy,
          isAdmin: jellyfinUser.isAdmin,
        })
        seerrSynced = !!configManager.seerr
      } catch (err) {
        if (err instanceof JellyfinLastAdminError) {
          return error(ErrorCode.LAST_ADMIN_REQUIRED, err.message)
        }
        if (err instanceof SeerrProfileSyncError) {
          logger.warn(
            { err, userId: jellyfinUser.id, profileId: profile.id },
            "Seerr sync failed; continuing",
          )
        } else {
          throw err
        }
      }

      if (seerrSynced) {
        await db
          .update(users)
          .set({ seerrSyncedAt: new Date() })
          .where(eq(users.userId, jellyfinUser.id))
      }

      assignedProfileId = profile.id
      effectiveProfileName = profile.name
    }

    if (parsed.data.isDisabled !== undefined) {
      if (!jellyfinUser) {
        return error(ErrorCode.NOT_FOUND, "User no longer exists in Jellyfin")
      }

      if (jellyfinUser.isAdmin && parsed.data.isDisabled) {
        const activeAdminCount = jellyfinUsers.filter(
          (user) => user.isAdmin && !user.isDisabled,
        ).length
        if (activeAdminCount <= 1) {
          return error(ErrorCode.LAST_ADMIN_REQUIRED)
        }
      }

      try {
        await updateUserPolicy(jellyfinUser.id, {
          isDisabled: parsed.data.isDisabled,
        })
        isDisabled = parsed.data.isDisabled
        if (parsed.data.isDisabled) {
          await revokeAllUserSessions(jellyfinUser.id)
        }
      } catch (err) {
        if (
          err instanceof JellyfinLastAdminError ||
          isJellyfinLastAdminError(err)
        ) {
          return error(ErrorCode.LAST_ADMIN_REQUIRED)
        }
        throw err
      }
    }

    const emailVerified = normalizedEmail
      ? (parsed.data.emailVerified ?? dbUser?.emailVerified ?? false)
      : false
    const expiresAtChanged =
      currentExpiresAt?.getTime() !== nextExpiresAt?.getTime()
    const emailChanged = normalizedEmail !== currentEmail
    const shouldResetExpiryWarning = expiresAtChanged || emailChanged

    await ensureUserRecord(parsedUserId.data)
    await db
      .update(users)
      .set({
        profileId: jellyfinUser?.isAdmin ? null : assignedProfileId,
        email: normalizedEmail,
        emailVerified,
        expiresAt: nextExpiresAt,
        ...(shouldResetExpiryWarning
          ? {
              expiryWarningSentAt: null,
              expiryWarningSentFor: null,
            }
          : {}),
      })
      .where(eq(users.userId, parsedUserId.data))

    if (
      configManager.seerr &&
      normalizedEmail &&
      normalizedEmail !== currentEmail
    ) {
      try {
        const syncedSeerrUser = await syncSeerrUserEmail({
          jellyfinUserId: parsedUserId.data,
          userName: jellyfinUser?.name ?? parsedUserId.data,
          email: normalizedEmail,
        })

        if (syncedSeerrUser) {
          await db
            .update(users)
            .set({ seerrSyncedAt: new Date() })
            .where(eq(users.userId, parsedUserId.data))
        }
      } catch (err) {
        logger.warn(
          { err, userId: parsedUserId.data },
          "Failed to sync Seerr email after managed user update",
        )
      }
    }

    if (
      nextExpiresAt !== null &&
      isUserExpired({ expiresAt: nextExpiresAt }, false, now)
    ) {
      await enforceExpiredUserAccess(
        {
          userId: parsedUserId.data,
          userName: jellyfinUser?.name ?? dbUser?.email ?? null,
          expiresAt: nextExpiresAt,
          isAdmin: false,
          isDisabled,
        },
        now,
      )
      isDisabled = true
    }

    return success({
      userId: parsedUserId.data,
      profileId: jellyfinUser?.isAdmin ? null : assignedProfileId,
      profileName: effectiveProfileName,
      email: normalizedEmail,
      emailVerified,
      isDisabled,
      expiresAt: nextExpiresAt?.toISOString() ?? null,
    })
  } catch (err) {
    logger.error({ err }, "Failed to update user")
    return error(ErrorCode.OPERATION_FAILED, "Failed to update user")
  }
}

export async function syncUserToSeerrService(
  userId: string,
): Promise<ActionResult<{ synced: boolean }>> {
  try {
    const parsedUserId = userIdSchema.safeParse(userId)
    if (!parsedUserId.success) {
      return error(
        ErrorCode.VALIDATION_FAILED,
        parsedUserId.error.issues[0]?.message,
      )
    }

    if (!configManager.seerr) {
      return error(ErrorCode.CONFLICT, "Seerr integration is not configured")
    }

    await ensureMigrated()

    const [dbUser, jellyfinUsers] = await Promise.all([
      db.query.users.findFirst({
        where: (table, { eq: isEqual }) =>
          isEqual(table.userId, parsedUserId.data),
      }),
      getAllUsers(),
    ])

    const jellyfinUser =
      jellyfinUsers.find((u) => u.id === parsedUserId.data) ?? null

    logger.info(
      {
        userId: parsedUserId.data,
        hasDbRecord: !!dbUser,
        foundInJellyfin: !!jellyfinUser,
      },
      "Syncing user to Seerr",
    )

    if (!dbUser && !jellyfinUser) {
      return error(ErrorCode.NOT_FOUND, "User not found")
    }

    if (!jellyfinUser) {
      return error(ErrorCode.NOT_FOUND, "User no longer exists in Jellyfin")
    }

    let seerrUser = await resolveSeerrUser({
      jellyfinUserId: parsedUserId.data,
      userName: jellyfinUser.name,
      email: dbUser?.email ?? null,
    })
    logger.info(
      { userId: parsedUserId.data, seerrUserId: seerrUser?.id ?? null },
      seerrUser ? "Resolved Seerr user" : "User not found in Seerr",
    )

    if (!seerrUser) {
      return error(
        ErrorCode.OPERATION_FAILED,
        "User could not be found or imported in Seerr",
      )
    }

    if (dbUser?.profileId && !jellyfinUser.isAdmin) {
      const profile = await db.query.profiles.findFirst({
        where: (table, { eq: isEqual }) => isEqual(table.id, dbUser.profileId!),
      })

      if (profile?.policy) {
        try {
          await applyProfileToUser({
            userId: parsedUserId.data,
            userName: jellyfinUser.name,
            email: dbUser.email,
            policy: profile.policy,
            isAdmin: jellyfinUser.isAdmin,
          })
        } catch (err) {
          if (err instanceof JellyfinLastAdminError) {
            return error(ErrorCode.LAST_ADMIN_REQUIRED, err.message)
          }
          if (err instanceof SeerrProfileSyncError) {
            logger.warn(
              { err, userId: parsedUserId.data, profileId: profile.id },
              "Seerr profile re-sync failed during manual Seerr sync",
            )
          } else {
            throw err
          }
        }
      }
    }

    if (dbUser?.email) {
      try {
        await syncSeerrUserEmail({
          jellyfinUserId: parsedUserId.data,
          userName: jellyfinUser.name,
          email: dbUser.email,
          attemptImport: false,
        })
      } catch (err) {
        logger.warn(
          { err, userId: parsedUserId.data },
          "Failed to sync Seerr email after manual Seerr sync",
        )
      }
    }

    await ensureUserRecord(parsedUserId.data)
    await db
      .update(users)
      .set({ seerrSyncedAt: new Date() })
      .where(eq(users.userId, parsedUserId.data))

    return success({ synced: true })
  } catch (err) {
    logger.error({ err, userId }, "Failed to sync user to Seerr")
    return error(ErrorCode.OPERATION_FAILED, "Failed to sync user to Seerr")
  }
}

export async function deleteManagedUserService(
  userId: string,
): Promise<ActionResult<DeleteManagedUserResult>> {
  try {
    const parsedUserId = userIdSchema.safeParse(userId)
    if (!parsedUserId.success) {
      return error(
        ErrorCode.VALIDATION_FAILED,
        parsedUserId.error.issues[0]?.message,
      )
    }

    await ensureMigrated()

    const [dbUser, jellyfinUsers] = await Promise.all([
      db.query.users.findFirst({
        where: (table, { eq: isEqual }) =>
          isEqual(table.userId, parsedUserId.data),
      }),
      getAllUsers(),
    ])

    const jellyfinUser =
      jellyfinUsers.find((user) => user.id === parsedUserId.data) ?? null

    if (!dbUser && !jellyfinUser) {
      return error(ErrorCode.NOT_FOUND, "User not found")
    }

    if (jellyfinUser?.isAdmin && !jellyfinUser.isDisabled) {
      const enabledAdminCount = jellyfinUsers.filter(
        (user) => user.isAdmin && !user.isDisabled,
      ).length
      if (enabledAdminCount <= 1) {
        return error(ErrorCode.LAST_ADMIN_REQUIRED)
      }
    }

    let deletedFromSeerr = false

    try {
      deletedFromSeerr = await deleteLinkedSeerrUser(parsedUserId.data, {
        userName: jellyfinUser?.name ?? dbUser?.email ?? parsedUserId.data,
        email: dbUser?.email ?? null,
      })
    } catch (err) {
      logger.warn(
        {
          err,
          userId: parsedUserId.data,
          jellyfinUserMissing: jellyfinUser === null,
        },
        "Failed to delete linked Seerr user; continuing with app user deletion",
      )
    }

    if (jellyfinUser) {
      await deleteUser(jellyfinUser.id)
    }

    await revokeAllUserSessions(parsedUserId.data)

    if (dbUser) {
      await deleteAppUserData(dbUser.userId)
    }

    return success({
      userId: parsedUserId.data,
      deletedFromJellyfin: jellyfinUser !== null,
      deletedFromSeerr,
    })
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to delete user")
  }
}
