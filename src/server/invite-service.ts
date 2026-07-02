import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm"
import { z } from "zod"

import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { normalizeInviteCode } from "@/lib/invite-codes"
import {
  MAX_AVATAR_BYTES,
  normalizeEmail,
  redeemInviteSchema,
} from "@/lib/schemas"
import { configManager } from "@/lib/server/config.server"
import type { SessionData } from "@/lib/session"
import { establishAuthenticatedSession } from "@/server/auth-service"
import { db, ensureMigrated, getUserByEmail } from "@/server/db.server"
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
import { deleteSeerrUser, syncSeerrUserEmail } from "@/server/seerr"
import { getSessionDataForUser } from "@/server/session-data"
import { createEmailVerificationToken } from "@/server/tokens"

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
  try {
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

    if (invite.expiresAt && invite.expiresAt <= new Date()) {
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
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to validate invite")
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

    if (invite.expiresAt && invite.expiresAt <= new Date()) {
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

      if (latestInvite?.expiresAt && latestInvite.expiresAt <= now) {
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

    const [inviteAfterReservation] = await db
      .select({ isDisabled: invites.isDisabled })
      .from(invites)
      .where(eq(invites.id, inviteId))

    if (inviteAfterReservation?.isDisabled) {
      await releaseInviteSlot()
      return error(ErrorCode.INVITE_DISABLED)
    }

    async function releaseInviteSlot(): Promise<void> {
      try {
        await db
          .update(invites)
          .set({ useCount: sql`${invites.useCount} - 1` })
          .where(eq(invites.id, inviteId))
        logger.info({ inviteId }, "Released invite slot after failure")
      } catch (err) {
        logger.error({ err, inviteId }, "Failed to release invite slot")
      }
    }

    let jellyfinUser: { id: string; name: string; isAdmin: boolean }
    try {
      if (await isUsernameTaken(parsed.data.username)) {
        await releaseInviteSlot()
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
      await releaseInviteSlot()
      return error(ErrorCode.JELLYFIN_ERROR, "Failed to create user account")
    }

    let policyApplied = false
    let rollbackSeerrUserId: number | null = null
    if (resolvedProfile.data.policy) {
      try {
        const profileSyncResult = await applyProfileToUser({
          userId: jellyfinUser.id,
          userName: jellyfinUser.name,
          email: normalizedEmail,
          policy: resolvedProfile.data.policy,
          isAdmin: jellyfinUser.isAdmin,
        })
        rollbackSeerrUserId = profileSyncResult.seerrUserId
        policyApplied = true
      } catch (err) {
        if (err instanceof SeerrProfileSyncError) {
          logger.warn(
            { err, userId: jellyfinUser.id },
            "Failed to sync Seerr settings during registration",
          )
        } else {
          logger.warn(
            { err, userId: jellyfinUser.id },
            "Failed to apply invite profile settings",
          )
        }
      }
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
          seerrSyncedAt: null,
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

      if (configManager.seerr) {
        try {
          let seerrSynced = false
          if (resolvedProfile.data.policy && policyApplied) {
            seerrSynced = true
          } else if (!resolvedProfile.data.policy) {
            const syncedSeerrUser = await syncSeerrUserEmail({
              jellyfinUserId: jellyfinUser.id,
              userName: jellyfinUser.name,
              email: normalizedEmail,
            })
            if (syncedSeerrUser) {
              seerrSynced = true
            }
          }
          if (seerrSynced) {
            await db
              .update(users)
              .set({ seerrSyncedAt: new Date() })
              .where(eq(users.userId, jellyfinUser.id))
          }
        } catch (err) {
          logger.warn(
            { err, userId: jellyfinUser.id },
            "Failed to sync user to Seerr during registration",
          )
        }
      }
    } catch (err) {
      logger.error(
        { err, userId: jellyfinUser.id },
        "Failed to record user in database, performing compensation",
      )

      try {
        if (rollbackSeerrUserId !== null) {
          await deleteSeerrUser(rollbackSeerrUserId)
          logger.info(
            { userId: jellyfinUser.id, seerrUserId: rollbackSeerrUserId },
            "Deleted Seerr user as compensation",
          )
        }
      } catch (deleteSeerrErr) {
        logger.error(
          {
            deleteSeerrErr,
            userId: jellyfinUser.id,
            seerrUserId: rollbackSeerrUserId,
          },
          "Failed to delete Seerr user during compensation",
        )
      }

      try {
        await deleteUser(jellyfinUser.id)
        logger.info(
          { userId: jellyfinUser.id },
          "Deleted Jellyfin user as compensation",
        )
      } catch (deleteErr) {
        logger.error(
          { deleteErr, userId: jellyfinUser.id },
          "CRITICAL: Failed to delete Jellyfin user during compensation - orphaned user exists",
        )
      }

      await releaseInviteSlot()
      return error(
        ErrorCode.INTERNAL_ERROR,
        "Failed to complete registration. Please try again.",
      )
    }

    if (isEmailConfigured()) {
      try {
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
      } catch (err) {
        logger.warn(
          { err, userId: jellyfinUser.id },
          "Failed to send verification email",
        )
      }
    }

    let session: SessionData | undefined
    try {
      const jellyfinDeviceId = crypto.randomUUID()
      const authResult = await authenticateUser(
        parsed.data.username,
        parsed.data.password,
        jellyfinDeviceId,
      )
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
      logger.warn(
        { err, userId: jellyfinUser.id },
        "Failed to create session after registration",
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
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to redeem invite")
  }
}
