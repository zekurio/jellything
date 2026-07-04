import { z } from "zod"

import { ErrorCode } from "@/lib/api/contracts/errors"
import { DEFAULT_LOCALE, resolveLocale } from "@/lib/i18n"
import { INVITE_CODE_MAX_LENGTH, INVITE_CODE_PATTERN } from "@/lib/invite-codes"
import {
  changePasswordSchema,
  createInviteSchema,
  createProfileSchema,
  loginSchema,
  MAX_AVATAR_DATA_URL_LENGTH,
  removeAvatarSchema,
  setupKeyFormSchema,
  updateInviteSchema,
  updateManagedUserSchema,
  updateMyAccountSchema,
  updateProfileSchema,
  uploadAvatarSchema,
} from "@/lib/schemas"
import { configManager } from "@/lib/server/config.server"
import {
  createInviteService,
  deleteInviteService,
  getInviteHistoryPageService,
  updateInviteService,
} from "@/server/admin/invites"
import { getOverviewService } from "@/server/admin/overview"
import {
  createProfileService,
  deleteProfileService,
  updateProfileService,
} from "@/server/admin/profiles"
import {
  bulkManageUsersService,
  deleteManagedUserService,
  listUsersWithProfilesService,
  syncUserToSeerrService,
  updateManagedUserService,
} from "@/server/admin/users"
import {
  bulkManagedUsersSchema,
  inviteHistoryPageInputSchema,
  invitesPageInputSchema,
  usersPageInputSchema,
} from "@/server/api/schemas/admin-schemas"
import {
  memberOnboardingConfigSchema,
  updateAppSettingsBodySchema,
  updateEmailConfigBodySchema,
  updateJellyfinConfigBodySchema,
  updateSeerrConfigBodySchema,
} from "@/server/api/schemas/common-schemas"
import { initializeConfigBodySchema } from "@/server/api/schemas/public-schemas"
import { clearAuthCookies, login, logout } from "@/server/auth"
import { getDashboardSettingsBootstrap } from "@/server/bootstrap-data"
import {
  loadAdminInvitesPageServices,
  loadAdminProfilesPageServices,
} from "@/server/dashboard-page-data"
import { isEmailConfigured } from "@/server/email"
import { verifyEmail, resendVerification } from "@/server/email-verification"
import { redeemInvite, validateInvite } from "@/server/invites"
import {
  changeMyPassword,
  deleteMyAccount,
  getMyExpiry,
  removeMyAvatar,
  renewMyAccess,
  updateMyAccount,
  uploadMyAvatar,
} from "@/server/me"
import { initializeConfig, validateSetupKey } from "@/server/onboarding"
import { unwrapActionResultOrThrow, throwAppError } from "@/server/orpc/errors"
import {
  authedProcedure,
  configuredAdminProcedure,
  enforceRateLimit,
  getClientIpRateLimitKey,
  mutationProcedure,
  publicProcedure,
  queryProcedure,
  rateLimitMiddleware,
} from "@/server/orpc/middleware"
import {
  testSeerrConnectionService,
  updateAppConfig,
  updateEmailConfigService,
  updateJellyfinConfigService,
  updateMemberOnboardingConfigService,
  updateSeerrConfigService,
} from "@/server/orpc/service-adapters"
import {
  findPasswordResetPinForCode,
  requestPasswordReset,
  resetPassword,
} from "@/server/password-reset"
import {
  buildRateLimitKey,
  invalidInviteLookupLimiter,
  initializeConfigLimiter,
  inviteCodeLookupLimiter,
  loginIdentifierLimiter,
  loginLimiter,
  passwordResetCompleteLimiter,
  passwordResetIdentifierLimiter,
  passwordResetPinLimiter,
  passwordResetRequestLimiter,
  redeemInviteIdentifierLimiter,
  redeemInviteLimiter,
  renewalIdentifierLimiter,
  renewalLimiter,
  setupKeyIdentifierLimiter,
  setupKeyValidationLimiter,
  verifyEmailTokenLimiter,
  validateInviteLimiter,
  verifyEmailLimiter,
} from "@/server/rate-limit"
import { SESSION_COOKIE_NAME } from "@/server/session"

const noInputSchema = z.object({})

const inviteCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(INVITE_CODE_MAX_LENGTH)
    .regex(INVITE_CODE_PATTERN),
})

const verifyEmailSchema = z.object({
  token: z.string().min(1).max(128),
})

const requestPasswordResetSchema = z.object({
  username: z.string().trim().min(1).max(100),
})

const resetPasswordSchema = z.object({
  pin: z.string().trim().min(1).max(128),
  newPassword: z.string().min(1),
})

const appProcedures = {
  bootstrap: publicProcedure
    .input(noInputSchema)
    .handler(async ({ context }) => {
      const resolvedSession = await context.resolveSession({
        validationMode: "if-stale",
        allowStaleOnJellyfinFailure: true,
        touch: false,
      })
      const hasSessionCookie = (
        context.request.headers.get("cookie") ?? ""
      ).includes(`${SESSION_COOKIE_NAME}=`)
      const session = resolvedSession.session
      const shouldClearAuthCookie =
        hasSessionCookie &&
        resolvedSession.status !== "upstream-unreachable" &&
        resolvedSession.session === null

      if (shouldClearAuthCookie) {
        clearAuthCookies()
      }

      return {
        configured: configManager.isConfigured(),
        needsOnboarding: configManager.needsOnboarding(),
        configError: session?.isAdmin ? configManager.getError() : null,
        app: configManager.isConfigured() ? configManager.app : null,
        emailConfigured: isEmailConfigured(),
        session,
        locale: resolveLocale(
          session?.locale ?? null,
          (configManager.isConfigured()
            ? configManager.app.defaultLocale
            : DEFAULT_LOCALE) ?? DEFAULT_LOCALE,
        ),
      }
    }),
}

const authProcedures = {
  login: mutationProcedure
    .use(rateLimitMiddleware(loginLimiter))
    .input(loginSchema)
    .handler(async ({ input }) => {
      await enforceRateLimit(
        loginIdentifierLimiter,
        buildRateLimitKey("login", input.username),
      )
      return unwrapActionResultOrThrow(await login(input))
    }),
  logout: mutationProcedure.input(noInputSchema).handler(async () => {
    unwrapActionResultOrThrow(await logout())
    return null
  }),
}

const onboardingProcedures = {
  validateSetupKey: mutationProcedure
    .use(rateLimitMiddleware(setupKeyValidationLimiter))
    .input(setupKeyFormSchema)
    .handler(async ({ input }) => {
      await enforceRateLimit(
        setupKeyIdentifierLimiter,
        buildRateLimitKey("setup_key", input.setupKey),
      )
      return unwrapActionResultOrThrow(await validateSetupKey(input.setupKey))
    }),
  initialize: mutationProcedure
    .use(rateLimitMiddleware(initializeConfigLimiter))
    .input(initializeConfigBodySchema)
    .handler(async ({ input, context }) => {
      await enforceRateLimit(
        setupKeyIdentifierLimiter,
        buildRateLimitKey("setup_key", input.setupKey),
      )
      unwrapActionResultOrThrow(await initializeConfig(input, context.request))
      return null
    }),
}

const inviteProcedures = {
  redeemPage: queryProcedure
    .use(rateLimitMiddleware(validateInviteLimiter))
    .input(inviteCodeSchema)
    .handler(async ({ input, context }) => {
      await enforceRateLimit(
        inviteCodeLookupLimiter,
        getClientIpRateLimitKey(context, "invite_lookup", input.code),
      )
      const invite = unwrapActionResultOrThrow(await validateInvite(input.code))
      if (!invite.valid) {
        await enforceRateLimit(
          invalidInviteLookupLimiter,
          getClientIpRateLimitKey(context, "invalid_invite_lookup"),
        )
      }
      const session = (
        await context.resolveSession({
          validationMode: "if-stale",
          allowStaleOnJellyfinFailure: true,
          touch: false,
        })
      ).session

      return {
        ...invite,
        session,
      }
    }),
  redeem: mutationProcedure
    .use(rateLimitMiddleware(redeemInviteLimiter))
    .input(
      z.object({
        code: z
          .string()
          .trim()
          .min(1)
          .max(INVITE_CODE_MAX_LENGTH)
          .regex(INVITE_CODE_PATTERN),
        username: z.string().min(1),
        password: z.string().min(1),
        email: z.string().email(),
        avatar: z.string().max(MAX_AVATAR_DATA_URL_LENGTH).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      await enforceRateLimit(
        redeemInviteIdentifierLimiter,
        getClientIpRateLimitKey(context, "invite_redeem", input.code),
      )
      return unwrapActionResultOrThrow(await redeemInvite(input))
    }),
}

const emailProcedures = {
  verify: mutationProcedure
    .use(rateLimitMiddleware(verifyEmailLimiter))
    .input(verifyEmailSchema)
    .handler(async ({ input, context }) => {
      await enforceRateLimit(
        verifyEmailTokenLimiter,
        buildRateLimitKey("verify_email", input.token),
      )
      const session = (
        await context.resolveSession({
          validationMode: "if-stale",
          allowStaleOnJellyfinFailure: true,
          touch: false,
        })
      ).session
      return unwrapActionResultOrThrow(await verifyEmail(input, session))
    }),
}

const passwordResetProcedures = {
  request: mutationProcedure
    .use(rateLimitMiddleware(passwordResetRequestLimiter))
    .input(requestPasswordResetSchema)
    .handler(async ({ input }) => {
      await enforceRateLimit(
        passwordResetIdentifierLimiter,
        buildRateLimitKey("password_reset_request", input.username),
      )
      unwrapActionResultOrThrow(await requestPasswordReset(input))
      return null
    }),
  confirm: mutationProcedure
    .use(rateLimitMiddleware(passwordResetCompleteLimiter))
    .input(resetPasswordSchema)
    .handler(async ({ input }) => {
      // Throttle failed reset attempts by resolved account identity, never by
      // the guessed PIN: keying on input.pin would mint a fresh bucket per guess
      // and throttle nothing. Unresolved PINs share one fallback bucket, and the
      // resolved userName is never surfaced to the client.
      const pinInfo = await findPasswordResetPinForCode(input.pin)
      await enforceRateLimit(
        passwordResetPinLimiter,
        buildRateLimitKey("password_reset_pin", pinInfo?.userName ?? "invalid"),
      )
      unwrapActionResultOrThrow(await resetPassword(input))
      return null
    }),
}

const meProcedures = {
  updateAccount: authedProcedure
    .input(updateMyAccountSchema)
    .handler(async ({ input, context }) =>
      unwrapActionResultOrThrow(
        await updateMyAccount(input, context.session ?? undefined),
      ),
    ),
  changePassword: authedProcedure
    .input(changePasswordSchema)
    .handler(async ({ input, context }) => {
      unwrapActionResultOrThrow(
        await changeMyPassword(input, context.session ?? undefined),
      )
      return null
    }),
  uploadAvatar: authedProcedure
    .input(uploadAvatarSchema)
    .handler(async ({ input, context }) => {
      return unwrapActionResultOrThrow(
        await uploadMyAvatar(input, context.session ?? undefined),
      )
    }),
  removeAvatar: authedProcedure
    .input(removeAvatarSchema)
    .handler(async ({ input, context }) => {
      return unwrapActionResultOrThrow(
        await removeMyAvatar(input, context.session ?? undefined),
      )
    }),
  resendVerification: authedProcedure
    .use(rateLimitMiddleware(verifyEmailLimiter))
    .input(noInputSchema)
    .handler(async ({ context }) => {
      unwrapActionResultOrThrow(
        await resendVerification(context.session ?? undefined),
      )
      return null
    }),
  deleteAccount: authedProcedure
    .input(noInputSchema)
    .handler(async ({ context }) => {
      unwrapActionResultOrThrow(
        await deleteMyAccount(context.session ?? undefined),
      )
      return null
    }),
  getExpiry: authedProcedure
    .input(noInputSchema)
    .handler(async ({ context }) =>
      unwrapActionResultOrThrow(
        await getMyExpiry(context.session ?? undefined),
      ),
    ),
  renew: authedProcedure
    .use(rateLimitMiddleware(renewalLimiter))
    .input(noInputSchema)
    .handler(async ({ context }) => {
      await enforceRateLimit(
        renewalIdentifierLimiter,
        buildRateLimitKey("renewal", context.session?.userId),
      )
      return unwrapActionResultOrThrow(
        await renewMyAccess(context.session ?? undefined),
      )
    }),
}

const adminProcedures = {
  overview: configuredAdminProcedure
    .input(noInputSchema)
    .handler(async () => unwrapActionResultOrThrow(await getOverviewService())),
  invites: {
    page: configuredAdminProcedure
      .input(invitesPageInputSchema)
      .handler(async ({ input }) => {
        const page = await loadAdminInvitesPageServices(input)

        return {
          invites: unwrapActionResultOrThrow(page.invites),
          profileOptions: unwrapActionResultOrThrow(page.profileOptions),
        }
      }),
    history: configuredAdminProcedure
      .input(inviteHistoryPageInputSchema)
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(await getInviteHistoryPageService(input)),
      ),
    create: configuredAdminProcedure
      .input(createInviteSchema)
      .handler(async ({ input, context }) =>
        unwrapActionResultOrThrow(
          await createInviteService(context.session?.userId, input),
        ),
      ),
    update: configuredAdminProcedure
      .input(z.object({ inviteId: z.uuid(), updates: updateInviteSchema }))
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(
          await updateInviteService(input.inviteId, input.updates),
        ),
      ),
    delete: configuredAdminProcedure
      .input(z.object({ inviteId: z.uuid() }))
      .handler(async ({ input }) => {
        unwrapActionResultOrThrow(await deleteInviteService(input.inviteId))
        return null
      }),
  },
  profiles: {
    page: configuredAdminProcedure.input(noInputSchema).handler(async () => {
      const page = await loadAdminProfilesPageServices()
      unwrapActionResultOrThrow(page.defaultProfile)
      const profiles = unwrapActionResultOrThrow(page.profiles)
      const libraries = unwrapActionResultOrThrow(page.libraries)
      const seerrConfig = unwrapActionResultOrThrow(page.seerrConfig)

      return {
        profiles,
        libraries,
        isSeerrConfigured: Boolean(
          seerrConfig.apiKeySet && seerrConfig.internalUrl,
        ),
      }
    }),
    create: configuredAdminProcedure
      .input(createProfileSchema)
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(await createProfileService(input)),
      ),
    update: configuredAdminProcedure
      .input(z.object({ profileId: z.uuid(), updates: updateProfileSchema }))
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(
          await updateProfileService(input.profileId, input.updates),
        ),
      ),
    delete: configuredAdminProcedure
      .input(z.object({ profileId: z.uuid() }))
      .handler(async ({ input }) => {
        unwrapActionResultOrThrow(await deleteProfileService(input.profileId))
        return null
      }),
  },
  users: {
    page: configuredAdminProcedure
      .input(usersPageInputSchema)
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(await listUsersWithProfilesService(input)),
      ),
    update: configuredAdminProcedure
      .input(
        z.object({
          userId: z.string().min(1),
          updates: updateManagedUserSchema,
        }),
      )
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(
          await updateManagedUserService(input.userId, input.updates),
        ),
      ),
    bulk: configuredAdminProcedure
      .input(bulkManagedUsersSchema)
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(await bulkManageUsersService(input)),
      ),
    delete: configuredAdminProcedure
      .input(z.object({ userId: z.string().min(1) }))
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(await deleteManagedUserService(input.userId)),
      ),
    syncSeerr: configuredAdminProcedure
      .input(z.object({ userId: z.string().min(1) }))
      .handler(async ({ input }) =>
        unwrapActionResultOrThrow(await syncUserToSeerrService(input.userId)),
      ),
  },
  settings: {
    page: configuredAdminProcedure.input(noInputSchema).handler(async () => {
      const settings = await getDashboardSettingsBootstrap()

      if (!settings) {
        throwAppError(ErrorCode.CONFIG_NOT_INITIALIZED)
      }

      return settings
    }),
    updateApp: configuredAdminProcedure
      .input(updateAppSettingsBodySchema)
      .handler(async ({ input }) => updateAppConfig(input)),
    updateJellyfin: configuredAdminProcedure
      .input(updateJellyfinConfigBodySchema)
      .handler(async ({ input }) => {
        unwrapActionResultOrThrow(await updateJellyfinConfigService(input))
        return null
      }),
    updateSeerr: configuredAdminProcedure
      .input(updateSeerrConfigBodySchema)
      .handler(async ({ input }) => {
        unwrapActionResultOrThrow(await updateSeerrConfigService(input))
        return null
      }),
    testSeerr: configuredAdminProcedure
      .input(noInputSchema)
      .handler(async () => {
        return unwrapActionResultOrThrow(await testSeerrConnectionService())
      }),
    updateEmail: configuredAdminProcedure
      .input(updateEmailConfigBodySchema)
      .handler(async ({ input }) => {
        unwrapActionResultOrThrow(await updateEmailConfigService(input))
        return null
      }),
    updateMemberOnboarding: configuredAdminProcedure
      .input(memberOnboardingConfigSchema)
      .handler(async ({ input }) => {
        unwrapActionResultOrThrow(
          await updateMemberOnboardingConfigService(input),
        )
        return null
      }),
  },
}

export const procedures = {
  app: appProcedures,
  auth: authProcedures,
  onboarding: onboardingProcedures,
  invites: inviteProcedures,
  email: emailProcedures,
  passwordReset: passwordResetProcedures,
  me: meProcedures,
  admin: adminProcedures,
}
