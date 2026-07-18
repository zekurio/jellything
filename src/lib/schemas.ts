import { z } from "zod"

import { SUPPORTED_LOCALES } from "@/lib/i18n"
import {
  INVITE_CODE_MAX_LENGTH,
  INVITE_CODE_MIN_LENGTH,
  INVITE_CODE_PATTERN,
} from "@/lib/invite-codes"
import { DEFAULT_SEERR_PERMISSIONS } from "@/lib/seerr-permissions"

const validation = {
  passwordMinLength: "validation.passwordMinLength",
  passwordUppercase: "validation.passwordUppercase",
  passwordLowercase: "validation.passwordLowercase",
  usernameRequired: "validation.usernameRequired",
  passwordRequired: "validation.passwordRequired",
  nameRequired: "validation.nameRequired",
  invalidProfileId: "validation.invalidProfileId",
  invalidEmail: "validation.invalidEmail",
  userPropertyRequired: "validation.userPropertyRequired",
  inviteCodeMinLength: "validation.inviteCodeMinLength",
  inviteCodeMaxLength: "validation.inviteCodeMaxLength",
  inviteCodePattern: "validation.inviteCodePattern",
  inviteCodeRequired: "validation.inviteCodeRequired",
  inviteCodeFormPattern: "validation.inviteCodeFormPattern",
  expiryFuture: "validation.expiryFuture",
  invitePropertyRequired: "validation.invitePropertyRequired",
  tokenRequired: "validation.tokenRequired",
  currentPasswordRequired: "validation.currentPasswordRequired",
  accountPropertyRequired: "validation.accountPropertyRequired",
  imageRequired: "validation.imageRequired",
  profileNameRequired: "validation.profileNameRequired",
  nameMaxLength: "validation.nameMaxLength",
  selectProfileRequired: "validation.selectProfileRequired",
  appTitleRequired: "validation.appTitleRequired",
  appUrlRequired: "validation.appUrlRequired",
  validUrlRequired: "validation.validUrlRequired",
  internalUrlRequired: "validation.internalUrlRequired",
  smtpHostRequired: "validation.smtpHostRequired",
  smtpPortRequired: "validation.smtpPortRequired",
  smtpPortRange: "validation.smtpPortRange",
  pageTitleRequired: "validation.pageTitleRequired",
  pageContentRequired: "validation.pageContentRequired",
  setupKeyRequired: "validation.setupKeyRequired",
  apiKeyRequired: "validation.apiKeyRequired",
  confirmPasswordRequired: "validation.confirmPasswordRequired",
  passwordsDoNotMatch: "validation.passwordsDoNotMatch",
  pinRequired: "validation.pinRequired",
  seerrQuotaRange: "validation.seerrQuotaRange",
} as const

const SEERR_QUOTA_DAYS_MAX = 100
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
export const MAX_AVATAR_BASE64_LENGTH =
  Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + 4
export const MAX_AVATAR_DATA_URL_LENGTH =
  MAX_AVATAR_BASE64_LENGTH + "data:image/webp;base64,".length
const seerrQuotaModeSchema = z.enum(["unlimited", "limited"])

function hasValue(value: string): boolean {
  return value.trim().length > 0
}

function isPositiveIntegerString(value: string): boolean {
  if (!hasValue(value)) {
    return false
  }

  return /^[1-9]\d*$/.test(value.trim())
}

// Password validation types
export type PasswordStrength = "weak" | "fair" | "good" | "strong"

export interface PasswordValidationResult {
  isValid: boolean
  strength: PasswordStrength
  errors: string[]
  checks: {
    minLength: boolean
    hasUppercase: boolean
    hasLowercase: boolean
    hasNumber: boolean
    hasSpecial: boolean
  }
}

const PASSWORD_STRENGTH_BY_PASSED_COUNT: PasswordStrength[] = [
  "weak",
  "weak",
  "weak",
  "fair",
  "good",
  "strong",
]

/**
 * Validate password and return detailed results for UI
 */
export function validatePassword(password: string): PasswordValidationResult {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  }

  const errors: string[] = []
  if (!checks.minLength) errors.push(validation.passwordMinLength)
  if (!checks.hasUppercase) errors.push(validation.passwordUppercase)
  if (!checks.hasLowercase) errors.push(validation.passwordLowercase)

  // Calculate strength based on passed checks
  const passedCount = Object.values(checks).filter(Boolean).length
  const strength = PASSWORD_STRENGTH_BY_PASSED_COUNT[passedCount] ?? "weak"

  const isValid = checks.minLength && checks.hasUppercase && checks.hasLowercase

  return { isValid, strength, errors, checks }
}

export const passwordSchema = z
  .string()
  .min(8, validation.passwordMinLength)
  .regex(/[A-Z]/, validation.passwordUppercase)
  .regex(/[a-z]/, validation.passwordLowercase)

/**
 * Normalize email: trim whitespace and convert to lowercase
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export const loginSchema = z.object({
  username: z
    .string()
    .min(1, validation.usernameRequired)
    .max(100, validation.nameMaxLength),
  password: z.string().min(1, validation.passwordRequired),
})

export type LoginFormValues = z.infer<typeof loginSchema>

const seerrQuotasSchema = z
  .object({
    movieQuotaLimit: z.number().int().min(0).optional(),
    movieQuotaDays: z
      .number()
      .int()
      .min(1)
      .max(SEERR_QUOTA_DAYS_MAX)
      .optional(),
    tvQuotaLimit: z.number().int().min(0).optional(),
    tvQuotaDays: z.number().int().min(1).max(SEERR_QUOTA_DAYS_MAX).optional(),
  })
  .optional()

// Mirrors ProfileRenewalPolicy in @/lib/renewal-types. Stored inside the JSON
// `policy` column, so no migration is needed to round-trip these fields.
export const profileRenewalPolicySchema = z.object({
  mode: z.enum(["disabled", "self-serve"]),
  extendByDays: z.number().int().min(1).max(3650).optional(),
  maxTotalDays: z.number().int().min(1).max(36500).optional(),
  minLeadTimeHours: z.number().int().min(1).max(8760).optional(),
})

const profilePolicySchema = z.object({
  enableAllFolders: z.boolean(),
  enabledFolders: z.array(z.string()),
  showInLoginScreen: z.boolean(),
  remoteClientBitrateLimit: z.number().min(0),
  allowVideoTranscoding: z.boolean(),
  allowAudioTranscoding: z.boolean(),
  allowMediaRemuxing: z.boolean(),
  seerrPermissions: z.number().int().min(0).default(DEFAULT_SEERR_PERMISSIONS),
  seerrQuotas: seerrQuotasSchema,
  renewal: profileRenewalPolicySchema.optional(),
})

export const createProfileSchema = z.object({
  name: z.string().min(1, validation.nameRequired).max(100),
  policy: profilePolicySchema,
})

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  policy: profilePolicySchema.optional(),
  isDefault: z.boolean().optional(),
})

export const updateManagedUserSchema = z
  .object({
    profileId: z.uuid(validation.invalidProfileId).optional(),
    email: z.string().email(validation.invalidEmail).nullable().optional(),
    emailVerified: z.boolean().optional(),
    isDisabled: z.boolean().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .refine(
    (value) =>
      value.profileId !== undefined ||
      value.email !== undefined ||
      value.emailVerified !== undefined ||
      value.isDisabled !== undefined ||
      value.expiresAt !== undefined,
    {
      message: validation.userPropertyRequired,
    },
  )
  .refine(
    (value) => {
      if (!value.expiresAt) {
        return true
      }

      return new Date(value.expiresAt).getTime() > Date.now()
    },
    {
      message: validation.expiryFuture,
      path: ["expiresAt"],
    },
  )

export const createInviteSchema = z
  .object({
    profileId: z.uuid(validation.invalidProfileId),
    code: z
      .string()
      .trim()
      .min(INVITE_CODE_MIN_LENGTH, validation.inviteCodeMinLength)
      .max(INVITE_CODE_MAX_LENGTH, validation.inviteCodeMaxLength)
      .regex(INVITE_CODE_PATTERN, validation.inviteCodePattern)
      .optional(),
    useLimit: z.number().int().min(1).nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .refine(
    (value) => {
      if (!value.expiresAt) {
        return true
      }

      return new Date(value.expiresAt).getTime() > Date.now()
    },
    {
      message: validation.expiryFuture,
      path: ["expiresAt"],
    },
  )

export const updateInviteSchema = z
  .object({
    profileId: z.uuid(validation.invalidProfileId).optional(),
    code: z
      .string()
      .trim()
      .min(INVITE_CODE_MIN_LENGTH, validation.inviteCodeMinLength)
      .max(INVITE_CODE_MAX_LENGTH, validation.inviteCodeMaxLength)
      .regex(INVITE_CODE_PATTERN, validation.inviteCodePattern)
      .optional(),
    isDisabled: z.boolean().optional(),
    useLimit: z.number().min(1).nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .refine(
    (value) =>
      value.profileId !== undefined ||
      value.code !== undefined ||
      value.isDisabled !== undefined ||
      value.useLimit !== undefined ||
      value.expiresAt !== undefined,
    {
      message: validation.invitePropertyRequired,
    },
  )
  .refine(
    (value) => {
      if (!value.expiresAt) {
        return true
      }

      return new Date(value.expiresAt).getTime() > Date.now()
    },
    {
      message: validation.expiryFuture,
      path: ["expiresAt"],
    },
  )

export const redeemInviteSchema = z.object({
  code: z.string().min(1, validation.inviteCodeRequired),
  username: z
    .string()
    .min(1, validation.usernameRequired)
    .max(100, validation.nameMaxLength),
  password: passwordSchema,
  email: z.email(validation.invalidEmail),
  avatar: z.string().max(MAX_AVATAR_DATA_URL_LENGTH).optional(),
})

export const emailVerificationSchema = z.object({
  token: z.string().min(1, validation.tokenRequired).max(128),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, validation.currentPasswordRequired),
  newPassword: passwordSchema,
})

export const updateMyAccountSchema = z
  .object({
    name: z.string().min(1, validation.nameRequired).optional(),
    email: z.email(validation.invalidEmail).nullable().optional(),
    locale: z.enum(SUPPORTED_LOCALES).nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.locale !== undefined,
    {
      message: validation.accountPropertyRequired,
    },
  )

export const uploadAvatarSchema = z.object({
  imageBase64: z
    .string()
    .min(1, validation.imageRequired)
    .max(MAX_AVATAR_BASE64_LENGTH),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
})

export const removeAvatarSchema = z.object({})

export const profileFormSchema = z
  .object({
    name: z
      .string()
      .min(1, validation.profileNameRequired)
      .max(100, validation.nameMaxLength),
    enableAllFolders: z.boolean(),
    enabledFolders: z.array(z.string()),
    showInLoginScreen: z.boolean(),
    bitrateMbps: z.string(),
    allowVideoTranscoding: z.boolean(),
    allowAudioTranscoding: z.boolean(),
    allowMediaRemuxing: z.boolean(),
    seerrPermissions: z.number().int().min(0),
    seerrMovieQuotaOverride: z.boolean(),
    seerrMovieQuotaMode: seerrQuotaModeSchema,
    seerrMovieQuotaLimit: z.string(),
    seerrMovieQuotaDays: z.string(),
    seerrTvQuotaOverride: z.boolean(),
    seerrTvQuotaMode: seerrQuotaModeSchema,
    seerrTvQuotaLimit: z.string(),
    seerrTvQuotaDays: z.string(),
  })
  .superRefine((value, ctx) => {
    const movieDays = isPositiveIntegerString(value.seerrMovieQuotaDays)
      ? Number.parseInt(value.seerrMovieQuotaDays, 10)
      : undefined
    const tvDays = isPositiveIntegerString(value.seerrTvQuotaDays)
      ? Number.parseInt(value.seerrTvQuotaDays, 10)
      : undefined

    const movieLimit = isPositiveIntegerString(value.seerrMovieQuotaLimit)
      ? Number.parseInt(value.seerrMovieQuotaLimit, 10)
      : undefined
    const tvLimit = isPositiveIntegerString(value.seerrTvQuotaLimit)
      ? Number.parseInt(value.seerrTvQuotaLimit, 10)
      : undefined

    if (
      value.seerrMovieQuotaOverride &&
      value.seerrMovieQuotaMode === "limited" &&
      (movieLimit === undefined || movieLimit > 100)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["seerrMovieQuotaLimit"],
        message: validation.seerrQuotaRange,
      })
    }

    if (
      value.seerrMovieQuotaOverride &&
      value.seerrMovieQuotaMode === "limited" &&
      (movieDays === undefined || movieDays > SEERR_QUOTA_DAYS_MAX)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["seerrMovieQuotaDays"],
        message: validation.seerrQuotaRange,
      })
    }

    if (
      value.seerrTvQuotaOverride &&
      value.seerrTvQuotaMode === "limited" &&
      (tvLimit === undefined || tvLimit > 100)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["seerrTvQuotaLimit"],
        message: validation.seerrQuotaRange,
      })
    }

    if (
      value.seerrTvQuotaOverride &&
      value.seerrTvQuotaMode === "limited" &&
      (tvDays === undefined || tvDays > SEERR_QUOTA_DAYS_MAX)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["seerrTvQuotaDays"],
        message: validation.seerrQuotaRange,
      })
    }
  })

export type ProfileFormValues = z.infer<typeof profileFormSchema>

/**
 * Invite form schema - used in invite-form-dialog
 * useLimit is stored as a string in the form (for empty state handling).
 */
export const inviteFormSchema = z
  .object({
    profileId: z.string().min(1, validation.selectProfileRequired),
    code: z
      .string()
      .trim()
      .max(INVITE_CODE_MAX_LENGTH, validation.inviteCodeMaxLength)
      .refine(
        (value) =>
          value.length === 0 ||
          (value.length >= INVITE_CODE_MIN_LENGTH &&
            INVITE_CODE_PATTERN.test(value)),
        validation.inviteCodeFormPattern,
      ),
    useLimit: z.string().optional(),
    expiresAt: z.date().nullable(),
  })
  .refine(
    (value) => {
      if (!value.expiresAt) {
        return true
      }

      return value.expiresAt.getTime() > Date.now()
    },
    {
      message: validation.expiryFuture,
      path: ["expiresAt"],
    },
  )

export type InviteFormValues = z.infer<typeof inviteFormSchema>

/**
 * App settings form schema - used in app-settings-tab
 */
export const appSettingsFormSchema = z.object({
  title: z.string().min(1, validation.appTitleRequired),
  description: z.string(),
  defaultLocale: z.enum(SUPPORTED_LOCALES),
  url: z.string().url(validation.validUrlRequired).or(z.literal("")),
})

export type AppSettingsFormValues = z.infer<typeof appSettingsFormSchema>

/**
 * User locale preference schema - used in profile settings
 */
export const updateLocaleSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).nullable(),
})

export type UpdateLocaleValues = z.infer<typeof updateLocaleSchema>

/**
 * Jellyfin settings form schema - used in jellyfin-settings-tab
 */
export const jellyfinSettingsFormSchema = z.object({
  internalUrl: z
    .string()
    .min(1, validation.internalUrlRequired)
    .url(validation.validUrlRequired),
  externalUrl: z.string().url(validation.validUrlRequired).or(z.literal("")),
  apiKey: z.string(),
  configPath: z.string(),
})

export type JellyfinSettingsFormValues = z.infer<
  typeof jellyfinSettingsFormSchema
>

/**
 * Seerr settings form schema - used in seerr-settings-tab
 */
export const seerrSettingsFormSchema = z.object({
  internalUrl: z.string().url(validation.validUrlRequired).or(z.literal("")),
  externalUrl: z.string().url(validation.validUrlRequired).or(z.literal("")),
  apiKey: z.string(),
})

export type SeerrSettingsFormValues = z.infer<typeof seerrSettingsFormSchema>

/**
 * Email settings form schema - used in email-settings-tab
 */
export const emailSettingsFormSchema = z
  .object({
    from: z.string(),
    smtpHost: z.string(),
    smtpPort: z.string(),
    smtpSecure: z.boolean(),
    smtpUsername: z.string(),
    smtpPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    const hasAnyInput =
      Boolean(data.from) ||
      Boolean(data.smtpHost) ||
      Boolean(data.smtpPort) ||
      Boolean(data.smtpUsername) ||
      Boolean(data.smtpPassword)

    if (!hasAnyInput) {
      return
    }

    if (!data.smtpHost) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["smtpHost"],
        message: validation.smtpHostRequired,
      })
    }

    if (!data.smtpPort) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["smtpPort"],
        message: validation.smtpPortRequired,
      })
      return
    }

    const port = Number.parseInt(data.smtpPort, 10)
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["smtpPort"],
        message: validation.smtpPortRange,
      })
    }
  })

export type EmailSettingsFormValues = z.infer<typeof emailSettingsFormSchema>

/**
 * Member onboarding settings schema - used in member-onboarding-settings-tab
 */
export const memberOnboardingPageFormSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, validation.pageTitleRequired).max(100),
  markdown: z.string().trim().min(1, validation.pageContentRequired).max(8000),
})

export const memberOnboardingSettingsFormSchema = z.object({
  enabled: z.boolean(),
  pages: z.array(memberOnboardingPageFormSchema),
})

export type MemberOnboardingPageFormValues = z.infer<
  typeof memberOnboardingPageFormSchema
>
export type MemberOnboardingSettingsFormValues = z.infer<
  typeof memberOnboardingSettingsFormSchema
>

/**
 * Onboarding setup key form schema
 */
export const setupKeyFormSchema = z.object({
  setupKey: z.string().min(1, validation.setupKeyRequired).max(128),
})

export type SetupKeyFormValues = z.infer<typeof setupKeyFormSchema>

/**
 * Onboarding app (Inviterr) form schema
 */
export const onboardingAppFormSchema = z.object({
  appUrl: z
    .string()
    .min(1, validation.appUrlRequired)
    .url(validation.validUrlRequired),
})

export type OnboardingAppFormValues = z.infer<typeof onboardingAppFormSchema>

/**
 * Onboarding Jellyfin form schema
 */
export const onboardingJellyfinFormSchema = z.object({
  internalUrl: z
    .string()
    .min(1, validation.internalUrlRequired)
    .url(validation.validUrlRequired),
  externalUrl: z.string().url(validation.validUrlRequired).or(z.literal("")),
  apiKey: z.string().min(1, validation.apiKeyRequired),
  configPath: z.string(),
})

export type OnboardingJellyfinFormValues = z.infer<
  typeof onboardingJellyfinFormSchema
>

/**
 * Onboarding Seerr form schema
 */
export const onboardingSeerrFormSchema = z
  .object({
    internalUrl: z.string().url(validation.validUrlRequired).or(z.literal("")),
    externalUrl: z.string().url(validation.validUrlRequired).or(z.literal("")),
    apiKey: z.string(),
  })
  .superRefine((data, ctx) => {
    const hasAnyInput =
      Boolean(data.internalUrl) ||
      Boolean(data.externalUrl) ||
      Boolean(data.apiKey)

    if (!hasAnyInput) {
      return
    }

    if (!data.internalUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["internalUrl"],
        message: validation.internalUrlRequired,
      })
    }

    if (!data.apiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["apiKey"],
        message: validation.apiKeyRequired,
      })
    }
  })

export type OnboardingSeerrFormValues = z.infer<
  typeof onboardingSeerrFormSchema
>

/**
 * Onboarding email form schema
 */
export const onboardingEmailFormSchema = emailSettingsFormSchema

export type OnboardingEmailFormValues = z.infer<
  typeof onboardingEmailFormSchema
>

/**
 * User account form schema - used in profile-settings (name update)
 */
export const accountFormSchema = z.object({
  name: z.string().min(1, validation.usernameRequired),
  email: z.string().email(validation.invalidEmail),
})

export type AccountFormValues = z.infer<typeof accountFormSchema>

export const optionalEmailAccountFormSchema = z.object({
  name: z.string().min(1, validation.usernameRequired),
  email: z
    .string()
    .refine(
      (value) => value.trim() === "" || z.email().safeParse(value).success,
      {
        message: validation.invalidEmail,
      },
    ),
})

function withPasswordConfirmation<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  passwordKey: keyof z.infer<z.ZodObject<T>>,
  confirmKey: keyof z.infer<z.ZodObject<T>>,
) {
  return schema.refine((data) => data[passwordKey] === data[confirmKey], {
    message: validation.passwordsDoNotMatch,
    path: [String(confirmKey)],
  })
}

/**
 * Password change form schema - used in profile-settings
 */
export const passwordFormSchema = withPasswordConfirmation(
  z.object({
    currentPassword: z.string().min(1, validation.currentPasswordRequired),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, validation.confirmPasswordRequired),
  }),
  "newPassword",
  "confirmPassword",
)

export type PasswordFormValues = z.infer<typeof passwordFormSchema>

/**
 * Invite redemption form schema - used in invite/[code]/page
 */
export const inviteRedemptionFormSchema = withPasswordConfirmation(
  z.object({
    username: z
      .string()
      .min(1, validation.usernameRequired)
      .max(100, validation.nameMaxLength),
    email: z.string().email(validation.invalidEmail),
    password: passwordSchema,
    confirmPassword: z.string().min(1, validation.confirmPasswordRequired),
  }),
  "password",
  "confirmPassword",
)

export type InviteRedemptionFormValues = z.infer<
  typeof inviteRedemptionFormSchema
>

/**
 * Forgot password form schema - used in forgot-password page
 */
export const forgotPasswordFormSchema = z.object({
  username: z
    .string()
    .min(1, validation.usernameRequired)
    .max(100, validation.nameMaxLength),
})

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>

/**
 * Reset password form schema - used in reset-password page
 */
export const resetPasswordFormSchema = withPasswordConfirmation(
  z.object({
    pin: z.string().min(1, validation.pinRequired).max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, validation.confirmPasswordRequired),
  }),
  "newPassword",
  "confirmPassword",
)

export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>
