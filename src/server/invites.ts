import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm"
import { z } from "zod"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { normalizeInviteCode } from "@/lib/invite-codes"
import { isInviteExpired } from "@/lib/invite-status"
import {
  MAX_AVATAR_BYTES,
  normalizeEmail,
  redeemInviteSchema,
} from "@/lib/schemas"
import { configManager } from "@/lib/server/config.server"
import type { SessionData } from "@/lib/session"
import { clearAuthCookies, establishAuthenticatedSession } from "@/server/auth"
import { db, ensureMigrated, getUserByEmail } from "@/server/db"
import {
  inviteUsages,
  invites,
  profiles,
  users,
  type ProfilePolicy,
} from "@/server/db/schema"
import { sendEmail, isEmailConfigured } from "@/server/email"
import {
  getVerifyEmailSubject,
  renderVerifyEmail,
} from "@/server/email/templates/verify-email"
import {
  authenticateUser,
  createUser,
  deleteUser,
  isUsernameTaken,
  uploadUserAvatar,
} from "@/server/jellyfin"
import { logger } from "@/server/logger"
import {
  applyProfileToUser,
  SeerrProfileSyncError,
} from "@/server/profile-sync"
import { deleteSeerrUser, resolveSeerrUser } from "@/server/seerr"
import { createSeerrUserLookupCache } from "@/server/seerr/users"
import { revokeAllUserSessions } from "@/server/session"
import { getSessionDataForUser } from "@/server/session-resolver"
import { createEmailVerificationToken } from "@/server/tokens"

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const CODE_LENGTH = 8

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")
}

async function resolveInviteProfile(input: { profileId: string }): Promise<
  ActionResult<{
    profileId: string
    profileName: string
    policy: ProfilePolicy | null
  }>
> {
  const [targetProfile] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      policy: profiles.policy,
    })
    .from(profiles)
    .where(eq(profiles.id, input.profileId))

  if (!targetProfile) {
    return error(ErrorCode.INVITE_INVALID)
  }

  return success({
    profileId: targetProfile.id,
    profileName: targetProfile.name,
    policy: targetProfile.policy,
  })
}

export async function validateInvite(code: string): Promise<
  ActionResult<{
    valid: boolean
    profileName: string
    error?: string
    onboardingSteps?: Array<{ id: string; title: string }>
  }>
> {
  const normalizedCode = normalizeInviteCode(code)
  await ensureMigrated()

  const [invite] = await db
    .select({
      id: invites.id,
      profileId: invites.profileId,
      isDisabled: invites.isDisabled,
      useLimit: invites.useLimit,
      useCount: invites.useCount,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(eq(invites.code, normalizedCode))

  if (!invite) {
    return success({
      valid: false,
      profileName: "",
      error: ErrorCode.INVITE_INVALID,
    })
  }

  if (invite.isDisabled) {
    return success({
      valid: false,
      profileName: "",
      error: ErrorCode.INVITE_DISABLED,
    })
  }

  if (isInviteExpired(invite.expiresAt)) {
    return success({
      valid: false,
      profileName: "",
      error: ErrorCode.INVITE_EXPIRED,
    })
  }

  if (invite.useLimit !== null && invite.useCount >= invite.useLimit) {
    return success({
      valid: false,
      profileName: "",
      error: ErrorCode.INVITE_EXHAUSTED,
    })
  }

  const resolvedProfile = await resolveInviteProfile({
    profileId: invite.profileId,
  })

  if (!resolvedProfile.success) {
    return success({
      valid: false,
      profileName: "",
      error: resolvedProfile.code,
    })
  }

  const onboarding = configManager.memberOnboarding
  const onboardingSteps =
    onboarding.enabled && onboarding.pages.length > 0
      ? onboarding.pages.map((p) => ({ id: p.id, title: p.title }))
      : undefined

  return success({
    valid: true,
    profileName: resolvedProfile.data.profileName,
    onboardingSteps,
  })
}

async function releaseInviteReservation(inviteId: string): Promise<void> {
  try {
    const released = await db
      .update(invites)
      .set({ useCount: sql`${invites.useCount} - 1` })
      .where(and(eq(invites.id, inviteId), gt(invites.useCount, 0)))
      .returning({ id: invites.id })

    if (released.length === 0) {
      logger.warn(
        { inviteId },
        "Invite reservation was already released or reconciled",
      )
      return
    }

    logger.info({ inviteId }, "Released invite slot after failed redemption")
  } catch (err) {
    logger.error(
      { err, inviteId },
      "Failed to release invite slot; startup reconciliation will restore capacity",
    )
  }
}

async function compensateInviteRedemption(input: {
  inviteId: string
  jellyfinUserId: string
  seerrUserId: number | null
  localStateRecorded: boolean
  preserveJellyfinUser?: boolean
}): Promise<void> {
  if (input.localStateRecorded) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(inviteUsages)
          .where(
            and(
              eq(inviteUsages.inviteId, input.inviteId),
              eq(inviteUsages.userId, input.jellyfinUserId),
            ),
          )
        await tx.delete(users).where(eq(users.userId, input.jellyfinUserId))
      })
      logger.info(
        { inviteId: input.inviteId, userId: input.jellyfinUserId },
        "Removed local redemption state during compensation",
      )
    } catch (err) {
      logger.error(
        {
          err,
          inviteId: input.inviteId,
          userId: input.jellyfinUserId,
        },
        "Failed to remove local redemption state; preserving external users and invite usage for reconciliation",
      )
      return
    }
  }

  await releaseInviteReservation(input.inviteId)
  if (input.preserveJellyfinUser) {
    logger.warn(
      { userId: input.jellyfinUserId },
      "Preserving Jellyfin user because Seerr outcome is unknown; startup reconciliation will restore its local record",
    )
    return
  }

  if (input.seerrUserId !== null) {
    try {
      await deleteSeerrUser(input.seerrUserId)
      logger.info(
        {
          userId: input.jellyfinUserId,
          seerrUserId: input.seerrUserId,
        },
        "Deleted Seerr user during invite compensation",
      )
    } catch (err) {
      logger.error(
        {
          err,
          userId: input.jellyfinUserId,
          seerrUserId: input.seerrUserId,
        },
        "Failed to delete Seerr user during invite compensation; preserving Jellyfin user for startup reconciliation",
      )
      return
    }
  }

  try {
    await deleteUser(input.jellyfinUserId)
    logger.info(
      { userId: input.jellyfinUserId },
      "Deleted Jellyfin user during invite compensation",
    )
  } catch (err) {
    logger.error(
      { err, userId: input.jellyfinUserId },
      "Failed to delete Jellyfin user during invite compensation; startup reconciliation will restore its local record",
    )
  }
}

export async function redeemInvite(
  input: z.infer<typeof redeemInviteSchema>,
): Promise<
  ActionResult<{
    success: boolean
    user?: { userId: string; name: string }
    session?: SessionData
    onboardingPages?: Array<{ id: string; title: string; markdown: string }>
  }>
> {
  try {
    const parsed = redeemInviteSchema.safeParse(input)
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message)
    }

    const code = normalizeInviteCode(parsed.data.code)
    const normalizedEmail = normalizeEmail(parsed.data.email)
    await ensureMigrated()

    const [invite] = await db
      .select({
        id: invites.id,
        profileId: invites.profileId,
        isDisabled: invites.isDisabled,
        useLimit: invites.useLimit,
        useCount: invites.useCount,
        expiresAt: invites.expiresAt,
      })
      .from(invites)
      .where(eq(invites.code, code))

    if (!invite) {
      return error(ErrorCode.INVITE_INVALID)
    }

    if (invite.isDisabled) {
      return error(ErrorCode.INVITE_DISABLED)
    }

    if (isInviteExpired(invite.expiresAt)) {
      return error(ErrorCode.INVITE_EXPIRED)
    }

    if (invite.useLimit !== null && invite.useCount >= invite.useLimit) {
      return error(ErrorCode.INVITE_EXHAUSTED)
    }

    if (await getUserByEmail(normalizedEmail)) {
      return error(ErrorCode.EMAIL_TAKEN)
    }

    const resolvedProfile = await resolveInviteProfile({
      profileId: invite.profileId,
    })

    if (!resolvedProfile.success) {
      return error(resolvedProfile.code)
    }

    const inviteId = invite.id
    const now = new Date()
    const reserveResult = await db
      .update(invites)
      .set({ useCount: sql`${invites.useCount} + 1` })
      .where(
        and(
          eq(invites.id, inviteId),
          eq(invites.isDisabled, false),
          or(isNull(invites.expiresAt), gt(invites.expiresAt, now)),
          or(isNull(invites.useLimit), lt(invites.useCount, invite.useLimit!)),
        ),
      )
      .returning({ id: invites.id })

    if (reserveResult.length === 0) {
      const [latestInvite] = await db
        .select({
          isDisabled: invites.isDisabled,
          useLimit: invites.useLimit,
          useCount: invites.useCount,
          expiresAt: invites.expiresAt,
        })
        .from(invites)
        .where(eq(invites.id, inviteId))

      if (latestInvite?.isDisabled) {
        return error(ErrorCode.INVITE_DISABLED)
      }

      if (isInviteExpired(latestInvite?.expiresAt ?? null, now)) {
        return error(ErrorCode.INVITE_EXPIRED)
      }

      if (
        latestInvite !== undefined &&
        latestInvite.useLimit !== null &&
        latestInvite.useCount >= latestInvite.useLimit
      ) {
        return error(
          ErrorCode.INVITE_EXHAUSTED,
          "This invite is no longer valid",
        )
      }

      return error(ErrorCode.INVITE_EXHAUSTED, "This invite is no longer valid")
    }

    let inviteAfterReservation: { isDisabled: boolean } | undefined
    try {
      const reservationRows = await db
        .select({ isDisabled: invites.isDisabled })
        .from(invites)
        .where(eq(invites.id, inviteId))
      inviteAfterReservation = reservationRows[0]
    } catch (err) {
      logger.error(
        { err, inviteId },
        "Failed to verify invite after reserving a slot",
      )
      await releaseInviteReservation(inviteId)
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to complete registration. Please try again.",
      )
    }

    if (inviteAfterReservation?.isDisabled) {
      await releaseInviteReservation(inviteId)
      return error(ErrorCode.INVITE_DISABLED)
    }

    let jellyfinUser: { id: string; name: string; isAdmin: boolean }
    try {
      if (await isUsernameTaken(parsed.data.username)) {
        await releaseInviteReservation(inviteId)
        return error(ErrorCode.USERNAME_TAKEN)
      }

      jellyfinUser = await createUser(
        parsed.data.username,
        parsed.data.password,
      )
      logger.info(
        { userId: jellyfinUser.id, username: jellyfinUser.name },
        "Created Jellyfin user",
      )
    } catch (err) {
      logger.error(
        { err, username: parsed.data.username },
        "Failed to create Jellyfin user",
      )
      await releaseInviteReservation(inviteId)
      return error(ErrorCode.JELLYFIN_ERROR, "Failed to create user account")
    }

    let seerrConfigured: boolean
    try {
      seerrConfigured = configManager.seerr !== undefined
    } catch (err) {
      logger.error(
        { err, userId: jellyfinUser.id },
        "Failed to read Seerr configuration during invite redemption",
      )
      await compensateInviteRedemption({
        inviteId,
        jellyfinUserId: jellyfinUser.id,
        seerrUserId: null,
        localStateRecorded: false,
      })
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to complete registration. Please try again.",
      )
    }
    const seerrLookupCache = createSeerrUserLookupCache()
    let rollbackSeerrUserId: number | null = null

    if (seerrConfigured) {
      try {
        const seerrUser = await resolveSeerrUser({
          jellyfinUserId: jellyfinUser.id,
          userName: jellyfinUser.name,
          email: normalizedEmail,
          lookupCache: seerrLookupCache,
        })
        if (!seerrUser) {
          throw new Error("Failed to locate the created user in Seerr")
        }
        rollbackSeerrUserId = seerrUser.id
      } catch (err) {
        logger.error(
          { err, userId: jellyfinUser.id },
          "Failed to create or resolve Seerr user during invite redemption",
        )
        await compensateInviteRedemption({
          inviteId,
          jellyfinUserId: jellyfinUser.id,
          seerrUserId: rollbackSeerrUserId,
          localStateRecorded: false,
          preserveJellyfinUser: rollbackSeerrUserId === null,
        })
        return error(
          ErrorCode.SEERR_ERROR,
          "Failed to complete registration with Seerr",
        )
      }
    }

    if (resolvedProfile.data.policy) {
      try {
        const profileSyncResult = await applyProfileToUser({
          userId: jellyfinUser.id,
          userName: jellyfinUser.name,
          email: normalizedEmail,
          policy: resolvedProfile.data.policy,
          isAdmin: jellyfinUser.isAdmin,
          seerrLookupCache,
        })
        rollbackSeerrUserId =
          profileSyncResult.seerrUserId ?? rollbackSeerrUserId
      } catch (err) {
        const profileErrorCode =
          err instanceof SeerrProfileSyncError
            ? ErrorCode.SEERR_ERROR
            : ErrorCode.JELLYFIN_ERROR
        logger.error(
          { err, userId: jellyfinUser.id },
          "Failed to apply invite profile during redemption",
        )
        await compensateInviteRedemption({
          inviteId,
          jellyfinUserId: jellyfinUser.id,
          seerrUserId: rollbackSeerrUserId,
          localStateRecorded: false,
        })
        return error(
          profileErrorCode,
          "Failed to apply the invite profile to the account",
        )
      }
    }

    const jellyfinDeviceId = crypto.randomUUID()
    let authResult: {
      accessToken: string
      isAdmin: boolean
      name: string
    }
    try {
      authResult = await authenticateUser(
        parsed.data.username,
        parsed.data.password,
        jellyfinDeviceId,
      )
    } catch (err) {
      logger.error(
        { err, userId: jellyfinUser.id },
        "Failed to authenticate newly created Jellyfin user",
      )
      await compensateInviteRedemption({
        inviteId,
        jellyfinUserId: jellyfinUser.id,
        seerrUserId: rollbackSeerrUserId,
        localStateRecorded: false,
      })
      return error(
        ErrorCode.JELLYFIN_ERROR,
        "Failed to authenticate the created account",
      )
    }

    if (parsed.data.avatar) {
      try {
        const dataUrlMatch = parsed.data.avatar.match(
          /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/,
        )

        if (dataUrlMatch) {
          const mimeType = dataUrlMatch[1]
          const base64Data = dataUrlMatch[2]
          const imageBuffer = Buffer.from(base64Data, "base64")

          if (imageBuffer.length <= MAX_AVATAR_BYTES) {
            await uploadUserAvatar(jellyfinUser.id, imageBuffer, mimeType)
          } else {
            logger.warn(
              { userId: jellyfinUser.id },
              "Avatar too large, skipping upload",
            )
          }
        } else {
          logger.warn(
            { userId: jellyfinUser.id },
            "Invalid avatar format, skipping upload",
          )
        }
      } catch (err) {
        logger.warn({ err, userId: jellyfinUser.id }, "Failed to upload avatar")
      }
    }

    try {
      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          userId: jellyfinUser.id,
          email: normalizedEmail,
          emailVerified: false,
          locale: null,
          profileId: resolvedProfile.data.profileId,
          inviteId,
          seerrSyncedAt: seerrConfigured ? new Date() : null,
          expiresAt: null,
          expiryWarningSentAt: null,
          expiryWarningSentFor: null,
          createdAt: new Date(),
        })

        await tx.insert(inviteUsages).values({
          id: crypto.randomUUID(),
          inviteId,
          userId: jellyfinUser.id,
          usedAt: new Date(),
        })
      })

      logger.info(
        { userId: jellyfinUser.id, email: normalizedEmail },
        "Recorded user in database",
      )
    } catch (err) {
      logger.error(
        { err, inviteId, userId: jellyfinUser.id },
        "Failed to record user in database, checking transaction outcome",
      )

      let localStateRecorded: boolean
      try {
        const [recordedUsage] = await db
          .select({ id: inviteUsages.id })
          .from(inviteUsages)
          .where(
            and(
              eq(inviteUsages.inviteId, inviteId),
              eq(inviteUsages.userId, jellyfinUser.id),
            ),
          )
          .limit(1)
        localStateRecorded = recordedUsage !== undefined
      } catch (reconcileErr) {
        logger.error(
          {
            err: reconcileErr,
            inviteId,
            userId: jellyfinUser.id,
          },
          "Could not determine local transaction outcome; preserving reservation and external users for startup reconciliation",
        )
        return error(
          ErrorCode.INTERNAL_ERROR,
          "Failed to complete registration. Please try again.",
        )
      }

      await compensateInviteRedemption({
        inviteId,
        jellyfinUserId: jellyfinUser.id,
        seerrUserId: rollbackSeerrUserId,
        localStateRecorded,
      })
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to complete registration. Please try again.",
      )
    }

    let session: SessionData
    try {
      await establishAuthenticatedSession({
        userId: jellyfinUser.id,
        displayName: authResult.name,
        isAdmin: authResult.isAdmin,
        jellyfinAccessToken: authResult.accessToken,
        jellyfinDeviceId,
      })
      session = await getSessionDataForUser({
        userId: jellyfinUser.id,
        name: authResult.name,
        isAdmin: authResult.isAdmin,
      })
      logger.info(
        { userId: jellyfinUser.id },
        "Created session after registration",
      )
    } catch (err) {
      logger.error(
        { err, userId: jellyfinUser.id },
        "Failed to create session after registration, performing compensation",
      )
      try {
        clearAuthCookies()
      } catch (clearCookieErr) {
        logger.error(
          { err: clearCookieErr, userId: jellyfinUser.id },
          "Failed to clear authentication cookie after session failure",
        )
      }
      try {
        await revokeAllUserSessions(jellyfinUser.id)
      } catch (revokeErr) {
        logger.error(
          { err: revokeErr, userId: jellyfinUser.id },
          "Failed to revoke sessions after invite redemption failure",
        )
      }
      await compensateInviteRedemption({
        inviteId,
        jellyfinUserId: jellyfinUser.id,
        seerrUserId: rollbackSeerrUserId,
        localStateRecorded: true,
      })
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to create a session for the new account",
      )
    }

    try {
      if (isEmailConfigured()) {
        const token = await createEmailVerificationToken(jellyfinUser.id)
        const appUrl = configManager.appUrl
        if (!appUrl) {
          throw new Error("Application URL is not configured")
        }

        const verifyUrl = `${appUrl}/verify-email/${token}`

        const html = await renderVerifyEmail({
          username: parsed.data.username,
          verifyUrl,
          baseUrl: appUrl,
          locale: configManager.defaultLocale,
        })

        await sendEmail({
          to: normalizedEmail,
          subject: getVerifyEmailSubject({
            locale: configManager.defaultLocale,
          }),
          html,
        })
        logger.info(
          { userId: jellyfinUser.id, email: normalizedEmail },
          "Sent verification email",
        )
      }
    } catch (err) {
      logger.warn(
        { err, userId: jellyfinUser.id },
        "Failed to send verification email",
      )
    }

    let onboardingPages:
      | Array<{ id: string; title: string; markdown: string }>
      | undefined

    try {
      const memberOnboarding = configManager.memberOnboarding
      if (memberOnboarding.enabled && memberOnboarding.pages.length > 0) {
        onboardingPages = memberOnboarding.pages.map((page) => ({
          id: page.id,
          title: page.title,
          markdown: page.markdown,
        }))
      }
    } catch (err) {
      logger.warn(
        { err },
        "Failed to load member onboarding pages during invite redemption",
      )
    }

    return success({
      success: true,
      user: {
        userId: jellyfinUser.id,
        name: jellyfinUser.name,
      },
      session,
      onboardingPages,
    })
  } catch (err) {
    logger.error({ err }, "Unexpected failure while redeeming invite")
    return error(ErrorCode.OPERATION_FAILED, "Failed to redeem invite")
  }
}
