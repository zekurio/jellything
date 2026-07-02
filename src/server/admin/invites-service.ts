import { asc, count, desc, eq, like, or, type SQL } from "drizzle-orm"
import { z } from "zod"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { normalizeInviteCode } from "@/lib/invite-codes"
import { deriveInviteStatus, type InviteStatus } from "@/lib/invite-status"
import { createInviteSchema, updateInviteSchema } from "@/lib/schemas"
import {
  inviteHistoryPageInputSchema,
  invitesPageInputSchema,
} from "@/server/api/schemas/admin-schemas"
import { db, ensureMigrated } from "@/server/db.server"
import { inviteUsages, invites, profiles, users } from "@/server/db/schema"
import { generateInviteCode } from "@/server/invite"
import { getAllUsers } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "admin-invites-service" })

type InviteListItem = {
  id: string
  code: string
  profileId: string
  profileName: string
  isDisabled: boolean
  useLimit: number | null
  useCount: number
  expiresAt: string | null
  createdAt: string
  status: InviteStatus
}

type InviteHistoryItem = {
  id: string
  inviteId: string
  inviteCode: string
  userId: string
  userName: string
  avatarUrl: string | null
  usedAt: string
}

type PagedInviteHistory = {
  items: InviteHistoryItem[]
  page: number
  pageSize: number
  total: number
  pageCount: number
}

type PagedInvites = {
  items: InviteListItem[]
  page: number
  pageSize: number
  total: number
  pageCount: number
}

type InviteRecord = {
  id: string
  code: string
  profileId: string
  profileName?: string | null
  isDisabled: boolean
  useLimit: number | null
  useCount: number
  expiresAt: Date | null
  createdAt: Date
}

function toInviteListItem(
  invite: InviteRecord,
  profileName?: string | null,
): InviteListItem {
  return {
    id: invite.id,
    code: invite.code,
    profileId: invite.profileId,
    profileName: profileName ?? invite.profileName ?? "Unknown",
    isDisabled: invite.isDisabled,
    useLimit: invite.useLimit,
    useCount: invite.useCount,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
    status: deriveInviteStatus(invite),
  }
}

export async function listInvitesService(): Promise<
  ActionResult<InviteListItem[]>
> {
  try {
    await ensureMigrated()

    const result = await db
      .select({
        id: invites.id,
        code: invites.code,
        profileId: invites.profileId,
        profileName: profiles.name,
        isDisabled: invites.isDisabled,
        useLimit: invites.useLimit,
        useCount: invites.useCount,
        expiresAt: invites.expiresAt,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .leftJoin(profiles, eq(invites.profileId, profiles.id))
      .orderBy(desc(invites.createdAt))

    const items = result.map((invite) =>
      toInviteListItem(invite, invite.profileName),
    )

    return success(items)
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to list invites")
  }
}

export async function listInvitesPageService(
  input: z.input<typeof invitesPageInputSchema>,
): Promise<ActionResult<PagedInvites>> {
  const parsed = invitesPageInputSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const invitePage = parsed.data
  const offset = (invitePage.page - 1) * invitePage.pageSize
  const searchFilter = getInvitesSearchFilter(invitePage.query?.trim())

  try {
    await ensureMigrated()

    const [totalRow] = await db
      .select({ total: count() })
      .from(invites)
      .leftJoin(profiles, eq(invites.profileId, profiles.id))
      .where(searchFilter)
    const total = totalRow?.total ?? 0

    const result = await db
      .select({
        id: invites.id,
        code: invites.code,
        profileId: invites.profileId,
        profileName: profiles.name,
        isDisabled: invites.isDisabled,
        useLimit: invites.useLimit,
        useCount: invites.useCount,
        expiresAt: invites.expiresAt,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .leftJoin(profiles, eq(invites.profileId, profiles.id))
      .where(searchFilter)
      .orderBy(getInvitesOrderBy(invitePage.sort, invitePage.direction))
      .limit(invitePage.pageSize)
      .offset(offset)

    return success({
      items: result.map((invite) =>
        toInviteListItem(invite, invite.profileName),
      ),
      page: invitePage.page,
      pageSize: invitePage.pageSize,
      total,
      pageCount: Math.ceil(total / invitePage.pageSize),
    })
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to list invites")
  }
}

function getInvitesSearchFilter(query: string | undefined): SQL | undefined {
  if (!query) {
    return undefined
  }

  const pattern = `%${query}%`
  return or(like(invites.code, pattern), like(profiles.name, pattern))
}

function getInvitesOrderBy(
  sort: z.output<typeof invitesPageInputSchema>["sort"],
  direction: z.output<typeof invitesPageInputSchema>["direction"],
): SQL {
  if (sort === "code") {
    return direction === "asc" ? asc(invites.code) : desc(invites.code)
  }
  if (sort === "profileName") {
    return direction === "asc" ? asc(profiles.name) : desc(profiles.name)
  }
  return direction === "asc" ? asc(invites.createdAt) : desc(invites.createdAt)
}

export async function createInviteService(
  createdById: string | undefined,
  input: z.infer<typeof createInviteSchema>,
): Promise<ActionResult<InviteListItem>> {
  try {
    await ensureMigrated()
    const parsed = createInviteSchema.safeParse(input)
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
    }

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, parsed.data.profileId))
    if (!profile) {
      return error(ErrorCode.NOT_FOUND, "Profile not found")
    }

    let code = parsed.data.code
      ? normalizeInviteCode(parsed.data.code)
      : generateInviteCode()

    if (parsed.data.code) {
      const [existingInvite] = await db
        .select()
        .from(invites)
        .where(eq(invites.code, code))
      if (existingInvite) {
        return error(ErrorCode.ALREADY_EXISTS, "Invite code is already in use")
      }
    } else {
      let attempts = 0
      while (attempts < 10) {
        const [existingInvite] = await db
          .select()
          .from(invites)
          .where(eq(invites.code, code))
        if (!existingInvite) {
          break
        }

        code = generateInviteCode()
        attempts++
      }

      if (attempts >= 10) {
        return error(
          ErrorCode.OPERATION_FAILED,
          "Failed to generate unique invite code. Please try again.",
        )
      }
    }

    const [invite] = await db
      .insert(invites)
      .values({
        id: crypto.randomUUID(),
        code,
        profileId: parsed.data.profileId,
        isDisabled: false,
        useLimit: parsed.data.useLimit ?? null,
        useCount: 0,
        expiresAt: parsed.data.expiresAt
          ? new Date(parsed.data.expiresAt)
          : null,
        createdById: createdById ?? null,
        createdAt: new Date(),
      })
      .returning()

    return success(toInviteListItem(invite, profile.name))
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to create invite")
  }
}

export async function updateInviteService(
  inviteId: string,
  input: z.infer<typeof updateInviteSchema>,
): Promise<ActionResult<InviteListItem>> {
  try {
    await ensureMigrated()
    const parsed = updateInviteSchema.safeParse(input)
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
    }

    const [existing] = await db
      .select()
      .from(invites)
      .where(eq(invites.id, inviteId))
    if (!existing) {
      return error(ErrorCode.NOT_FOUND, "Invite not found")
    }

    if (parsed.data.profileId !== undefined) {
      const [profile] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, parsed.data.profileId))

      if (!profile) {
        return error(ErrorCode.NOT_FOUND, "Profile not found")
      }
    }

    const updateValues = {
      ...(parsed.data.profileId !== undefined && {
        profileId: parsed.data.profileId,
      }),
      ...(parsed.data.isDisabled !== undefined && {
        isDisabled: parsed.data.isDisabled,
      }),
      ...(parsed.data.useLimit !== undefined && {
        useLimit: parsed.data.useLimit,
      }),
      ...(parsed.data.expiresAt !== undefined && {
        expiresAt: parsed.data.expiresAt
          ? new Date(parsed.data.expiresAt)
          : null,
      }),
    }

    if (parsed.data.code !== undefined) {
      const normalizedCode = normalizeInviteCode(parsed.data.code)
      const [codeConflict] = await db
        .select({ id: invites.id })
        .from(invites)
        .where(eq(invites.code, normalizedCode))

      if (codeConflict && codeConflict.id !== existing.id) {
        return error(ErrorCode.ALREADY_EXISTS, "Invite code is already in use")
      }

      Object.assign(updateValues, { code: normalizedCode })
    }

    const [updated] = await db
      .update(invites)
      .set(updateValues)
      .where(eq(invites.id, inviteId))
      .returning()

    const [profile] = await db
      .select({ name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, updated.profileId))

    return success(toInviteListItem(updated, profile?.name))
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to update invite")
  }
}

export async function deleteInviteService(
  inviteId: string,
): Promise<ActionResult<null>> {
  try {
    await ensureMigrated()

    const [existing] = await db
      .select()
      .from(invites)
      .where(eq(invites.id, inviteId))
    if (!existing) {
      return error(ErrorCode.NOT_FOUND, "Invite not found")
    }

    await db.delete(inviteUsages).where(eq(inviteUsages.inviteId, inviteId))
    await db.delete(invites).where(eq(invites.id, inviteId))

    return success(null)
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to delete invite")
  }
}

export async function getInviteHistoryService(): Promise<
  ActionResult<InviteHistoryItem[]>
> {
  return getUnboundedInviteHistoryService()
}

export async function getInviteHistoryPageService(
  input: z.input<typeof inviteHistoryPageInputSchema>,
): Promise<ActionResult<PagedInviteHistory>> {
  const parsed = inviteHistoryPageInputSchema.safeParse(input)
  if (!parsed.success) {
    return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
  }

  const historyPage = parsed.data
  const offset = (historyPage.page - 1) * historyPage.pageSize
  const trimmedQuery = historyPage.query?.trim()
  const searchFilter = getInviteHistorySearchFilter(trimmedQuery)

  try {
    await ensureMigrated()

    const [totalRow] = await db
      .select({ total: count() })
      .from(inviteUsages)
      .leftJoin(invites, eq(inviteUsages.inviteId, invites.id))
      .leftJoin(users, eq(inviteUsages.userId, users.userId))
      .where(searchFilter)
    const total = totalRow?.total ?? 0

    const result = await db
      .select({
        id: inviteUsages.id,
        inviteId: inviteUsages.inviteId,
        inviteCode: invites.code,
        userId: inviteUsages.userId,
        localEmail: users.email,
        usedAt: inviteUsages.usedAt,
      })
      .from(inviteUsages)
      .leftJoin(invites, eq(inviteUsages.inviteId, invites.id))
      .leftJoin(users, eq(inviteUsages.userId, users.userId))
      .where(searchFilter)
      .orderBy(
        historyPage.direction === "asc"
          ? asc(inviteUsages.usedAt)
          : desc(inviteUsages.usedAt),
      )
      .limit(historyPage.pageSize)
      .offset(offset)

    const jellyfinUsersById = new Map<
      string,
      { name: string; avatarUrl: string }
    >()
    try {
      const jellyfinUsers = await getAllUsers()
      for (const jellyfinUser of jellyfinUsers) {
        jellyfinUsersById.set(jellyfinUser.id, {
          name: jellyfinUser.name,
          avatarUrl: jellyfinUser.avatarUrl,
        })
      }
    } catch (err) {
      log.warn({ err }, "Failed to fetch Jellyfin users for invite history")
    }

    return success({
      items: result.map((usage) => {
        const jellyfinUser = usage.userId
          ? jellyfinUsersById.get(usage.userId)
          : null
        return {
          id: usage.id,
          inviteId: usage.inviteId ?? "",
          inviteCode: usage.inviteCode ?? "",
          userId: usage.userId,
          userName: jellyfinUser?.name ?? "Unknown",
          avatarUrl: jellyfinUser?.avatarUrl ?? null,
          usedAt: usage.usedAt.toISOString(),
        }
      }),
      page: historyPage.page,
      pageSize: historyPage.pageSize,
      total,
      pageCount: Math.ceil(total / historyPage.pageSize),
    })
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to get invite history")
  }
}

function getInviteHistorySearchFilter(
  query: string | undefined,
): SQL | undefined {
  if (!query) {
    return undefined
  }

  const pattern = `%${query}%`
  return or(
    like(invites.code, pattern),
    like(inviteUsages.userId, pattern),
    like(users.email, pattern),
  )
}

async function getUnboundedInviteHistoryService(): Promise<
  ActionResult<InviteHistoryItem[]>
> {
  try {
    await ensureMigrated()

    const result = await db
      .select({
        id: inviteUsages.id,
        inviteId: inviteUsages.inviteId,
        inviteCode: invites.code,
        userId: inviteUsages.userId,
        usedAt: inviteUsages.usedAt,
      })
      .from(inviteUsages)
      .leftJoin(invites, eq(inviteUsages.inviteId, invites.id))
      .leftJoin(users, eq(inviteUsages.userId, users.userId))
      .orderBy(desc(inviteUsages.usedAt))

    const jellyfinUsersById = new Map<
      string,
      { name: string; avatarUrl: string }
    >()
    try {
      const jellyfinUsers = await getAllUsers()
      for (const jellyfinUser of jellyfinUsers) {
        jellyfinUsersById.set(jellyfinUser.id, {
          name: jellyfinUser.name,
          avatarUrl: jellyfinUser.avatarUrl,
        })
      }
    } catch (err) {
      log.warn({ err }, "Failed to fetch Jellyfin users for invite history")
    }

    return success(
      result.map((usage) => {
        const jellyfinUser = usage.userId
          ? jellyfinUsersById.get(usage.userId)
          : null
        return {
          id: usage.id,
          inviteId: usage.inviteId ?? "",
          inviteCode: usage.inviteCode ?? "",
          userId: usage.userId,
          userName: jellyfinUser?.name ?? "Unknown",
          avatarUrl: jellyfinUser?.avatarUrl ?? null,
          usedAt: usage.usedAt.toISOString(),
        }
      }),
    )
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to get invite history")
  }
}
