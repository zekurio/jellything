import {
  Type,
  type StaticDecode,
  type TProperties,
  type TObject,
} from "typebox"

import { SUPPORTED_LOCALES } from "@/lib/i18n"
import {
  INVITE_CODE_MAX_LENGTH,
  INVITE_CODE_MIN_LENGTH,
  INVITE_CODE_PATTERN,
} from "@/lib/invite-codes"
import { DEFAULT_SEERR_PERMISSIONS } from "@/lib/seerr-permissions"
import {
  dateSchema,
  defaulted,
  enumValues,
  nullable,
  refine,
  safeParse,
  superRefine,
  trimmedString,
} from "@/lib/validation"

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
const seerrQuotaModeSchema = enumValues(["unlimited", "limited"])

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

export const passwordSchema = Type.Intersect([
  Type.String({
    minLength: 8,
    errorMessage: { minLength: validation.passwordMinLength },
  }),
  Type.String({
    pattern: "[A-Z]",
    errorMessage: { pattern: validation.passwordUppercase },
  }),
  Type.String({
    pattern: "[a-z]",
    errorMessage: { pattern: validation.passwordLowercase },
  }),
])

/**
 * Normalize email: trim whitespace and convert to lowercase
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export const loginSchema = Type.Object({
  username: Type.String({
    minLength: 1,
    errorMessage: {
      minLength: validation.usernameRequired,
      maxLength: validation.nameMaxLength,
    },
    maxLength: 100,
  }),
  password: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.passwordRequired },
  }),
})

export type LoginFormValues = StaticDecode<typeof loginSchema>

const seerrQuotasSchema = Type.Optional(
  Type.Object({
    movieQuotaLimit: Type.Optional(Type.Integer({ minimum: 0 })),
    movieQuotaDays: Type.Optional(
      Type.Integer({ minimum: 1, maximum: SEERR_QUOTA_DAYS_MAX }),
    ),
    tvQuotaLimit: Type.Optional(Type.Integer({ minimum: 0 })),
    tvQuotaDays: Type.Optional(
      Type.Integer({ minimum: 1, maximum: SEERR_QUOTA_DAYS_MAX }),
    ),
  }),
)

// Mirrors ProfileRenewalPolicy in @/lib/renewal-types. Stored inside the JSON
// `policy` column, so no migration is needed to round-trip these fields.
export const profileRenewalPolicySchema = Type.Object({
  mode: enumValues(["disabled", "self-serve"]),
  extendByDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 3650 })),
  maxTotalDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 36500 })),
  minLeadTimeHours: Type.Optional(Type.Integer({ minimum: 1, maximum: 8760 })),
})

const profilePolicySchema = Type.Object({
  enableAllFolders: Type.Boolean(),
  enabledFolders: Type.Array(Type.String()),
  showInLoginScreen: Type.Boolean(),
  remoteClientBitrateLimit: Type.Number({ minimum: 0 }),
  allowVideoTranscoding: Type.Boolean(),
  allowAudioTranscoding: Type.Boolean(),
  allowMediaRemuxing: Type.Boolean(),
  seerrPermissions: defaulted(
    Type.Integer({ minimum: 0 }),
    DEFAULT_SEERR_PERMISSIONS,
  ),
  seerrQuotas: seerrQuotasSchema,
  renewal: Type.Optional(profileRenewalPolicySchema),
})

export const createProfileSchema = Type.Object({
  name: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.nameRequired },
    maxLength: 100,
  }),
  policy: profilePolicySchema,
})

export const updateProfileSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  policy: Type.Optional(profilePolicySchema),
  isDefault: Type.Optional(Type.Boolean()),
})

export const updateManagedUserSchema = refine(
  refine(
    Type.Object({
      profileId: Type.Optional(
        Type.String({
          format: "uuid",
          errorMessage: { format: validation.invalidProfileId },
        }),
      ),
      email: Type.Optional(
        nullable(
          Type.String({
            format: "email",
            errorMessage: { format: validation.invalidEmail },
          }),
        ),
      ),
      emailVerified: Type.Optional(Type.Boolean()),
      isDisabled: Type.Optional(Type.Boolean()),
      expiresAt: Type.Optional(nullable(Type.String({ format: "date-time" }))),
    }),
    (value) =>
      value.profileId !== undefined ||
      value.email !== undefined ||
      value.emailVerified !== undefined ||
      value.isDisabled !== undefined ||
      value.expiresAt !== undefined,
    {
      message: validation.userPropertyRequired,
    },
  ),
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

export const createInviteSchema = refine(
  Type.Object({
    profileId: Type.String({
      format: "uuid",
      errorMessage: { format: validation.invalidProfileId },
    }),
    code: Type.Optional(
      trimmedString({
        minLength: INVITE_CODE_MIN_LENGTH,
        errorMessage: {
          minLength: validation.inviteCodeMinLength,
          maxLength: validation.inviteCodeMaxLength,
          pattern: validation.inviteCodePattern,
        },
        maxLength: INVITE_CODE_MAX_LENGTH,
        pattern: INVITE_CODE_PATTERN.source,
      }),
    ),
    useLimit: Type.Optional(nullable(Type.Integer({ minimum: 1 }))),
    expiresAt: Type.Optional(nullable(Type.String({ format: "date-time" }))),
  }),
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

export const updateInviteSchema = refine(
  refine(
    Type.Object({
      profileId: Type.Optional(
        Type.String({
          format: "uuid",
          errorMessage: { format: validation.invalidProfileId },
        }),
      ),
      code: Type.Optional(
        trimmedString({
          minLength: INVITE_CODE_MIN_LENGTH,
          errorMessage: {
            minLength: validation.inviteCodeMinLength,
            maxLength: validation.inviteCodeMaxLength,
            pattern: validation.inviteCodePattern,
          },
          maxLength: INVITE_CODE_MAX_LENGTH,
          pattern: INVITE_CODE_PATTERN.source,
        }),
      ),
      isDisabled: Type.Optional(Type.Boolean()),
      useLimit: Type.Optional(nullable(Type.Number({ minimum: 1 }))),
      expiresAt: Type.Optional(nullable(Type.String({ format: "date-time" }))),
    }),
    (value) =>
      value.profileId !== undefined ||
      value.code !== undefined ||
      value.isDisabled !== undefined ||
      value.useLimit !== undefined ||
      value.expiresAt !== undefined,
    {
      message: validation.invitePropertyRequired,
    },
  ),
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

export const redeemInviteSchema = Type.Object({
  code: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.inviteCodeRequired },
  }),
  username: Type.String({
    minLength: 1,
    errorMessage: {
      minLength: validation.usernameRequired,
      maxLength: validation.nameMaxLength,
    },
    maxLength: 100,
  }),
  password: passwordSchema,
  email: Type.String({
    format: "email",
    errorMessage: { format: validation.invalidEmail },
  }),
  avatar: Type.Optional(Type.String({ maxLength: MAX_AVATAR_DATA_URL_LENGTH })),
})

export const emailVerificationSchema = Type.Object({
  token: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.tokenRequired },
    maxLength: 128,
  }),
})

export const changePasswordSchema = Type.Object({
  currentPassword: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.currentPasswordRequired },
  }),
  newPassword: passwordSchema,
})

export const updateMyAccountSchema = refine(
  Type.Object({
    name: Type.Optional(
      Type.String({
        minLength: 1,
        errorMessage: { minLength: validation.nameRequired },
      }),
    ),
    email: Type.Optional(
      nullable(
        Type.String({
          format: "email",
          errorMessage: { format: validation.invalidEmail },
        }),
      ),
    ),
    locale: Type.Optional(nullable(enumValues(SUPPORTED_LOCALES))),
  }),
  (value) =>
    value.name !== undefined ||
    value.email !== undefined ||
    value.locale !== undefined,
  {
    message: validation.accountPropertyRequired,
  },
)

export const uploadAvatarSchema = Type.Object({
  imageBase64: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.imageRequired },
    maxLength: MAX_AVATAR_BASE64_LENGTH,
  }),
  mimeType: enumValues(["image/jpeg", "image/png", "image/webp"]),
})

export const removeAvatarSchema = Type.Object({})

export const profileFormSchema = superRefine(
  Type.Object({
    name: Type.String({
      minLength: 1,
      errorMessage: {
        minLength: validation.profileNameRequired,
        maxLength: validation.nameMaxLength,
      },
      maxLength: 100,
    }),
    enableAllFolders: Type.Boolean(),
    enabledFolders: Type.Array(Type.String()),
    showInLoginScreen: Type.Boolean(),
    bitrateMbps: Type.String(),
    allowVideoTranscoding: Type.Boolean(),
    allowAudioTranscoding: Type.Boolean(),
    allowMediaRemuxing: Type.Boolean(),
    seerrPermissions: Type.Integer({ minimum: 0 }),
    seerrMovieQuotaOverride: Type.Boolean(),
    seerrMovieQuotaMode: seerrQuotaModeSchema,
    seerrMovieQuotaLimit: Type.String(),
    seerrMovieQuotaDays: Type.String(),
    seerrTvQuotaOverride: Type.Boolean(),
    seerrTvQuotaMode: seerrQuotaModeSchema,
    seerrTvQuotaLimit: Type.String(),
    seerrTvQuotaDays: Type.String(),
  }),
  (value, ctx) => {
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
        path: ["seerrTvQuotaDays"],
        message: validation.seerrQuotaRange,
      })
    }
  },
)

export type ProfileFormValues = StaticDecode<typeof profileFormSchema>

/**
 * Invite form schema - used in invite-form-dialog
 * useLimit is stored as a string in the form (for empty state handling).
 */
export const inviteFormSchema = refine(
  Type.Object({
    profileId: Type.String({
      minLength: 1,
      errorMessage: { minLength: validation.selectProfileRequired },
    }),
    code: refine(
      trimmedString({
        maxLength: INVITE_CODE_MAX_LENGTH,
        errorMessage: { maxLength: validation.inviteCodeMaxLength },
      }),
      (value) =>
        value.length === 0 ||
        (value.length >= INVITE_CODE_MIN_LENGTH &&
          INVITE_CODE_PATTERN.test(value)),
      validation.inviteCodeFormPattern,
    ),
    useLimit: Type.Optional(Type.String()),
    expiresAt: nullable(dateSchema),
  }),
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

export type InviteFormValues = StaticDecode<typeof inviteFormSchema>

/**
 * App settings form schema - used in app-settings-tab
 */
export const appSettingsFormSchema = Type.Object({
  title: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.appTitleRequired },
  }),
  description: Type.String(),
  defaultLocale: enumValues(SUPPORTED_LOCALES),
  url: Type.Union(
    [
      Type.String({
        format: "uri",
        errorMessage: { format: validation.validUrlRequired },
      }),
      Type.Literal(""),
    ],
    { errorMessage: validation.validUrlRequired },
  ),
})

export type AppSettingsFormValues = StaticDecode<typeof appSettingsFormSchema>

/**
 * User locale preference schema - used in profile settings
 */
export const updateLocaleSchema = Type.Object({
  locale: nullable(enumValues(SUPPORTED_LOCALES)),
})

export type UpdateLocaleValues = StaticDecode<typeof updateLocaleSchema>

/**
 * Jellyfin settings form schema - used in jellyfin-settings-tab
 */
export const jellyfinSettingsFormSchema = Type.Object({
  internalUrl: Type.String({
    minLength: 1,
    errorMessage: {
      minLength: validation.internalUrlRequired,
      format: validation.validUrlRequired,
    },
    format: "uri",
  }),
  externalUrl: Type.Union(
    [
      Type.String({
        format: "uri",
        errorMessage: { format: validation.validUrlRequired },
      }),
      Type.Literal(""),
    ],
    { errorMessage: validation.validUrlRequired },
  ),
  apiKey: Type.String(),
  configPath: Type.String(),
  displayName: Type.String(),
})

export type JellyfinSettingsFormValues = StaticDecode<
  typeof jellyfinSettingsFormSchema
>

/**
 * Seerr settings form schema - used in seerr-settings-tab
 */
export const seerrSettingsFormSchema = Type.Object({
  internalUrl: Type.Union(
    [
      Type.String({
        format: "uri",
        errorMessage: { format: validation.validUrlRequired },
      }),
      Type.Literal(""),
    ],
    { errorMessage: validation.validUrlRequired },
  ),
  externalUrl: Type.Union(
    [
      Type.String({
        format: "uri",
        errorMessage: { format: validation.validUrlRequired },
      }),
      Type.Literal(""),
    ],
    { errorMessage: validation.validUrlRequired },
  ),
  apiKey: Type.String(),
})

export type SeerrSettingsFormValues = StaticDecode<
  typeof seerrSettingsFormSchema
>

/**
 * Email settings form schema - used in email-settings-tab
 */
export const emailSettingsFormSchema = superRefine(
  Type.Object({
    from: Type.String(),
    smtpHost: Type.String(),
    smtpPort: Type.String(),
    smtpSecure: Type.Boolean(),
    smtpUsername: Type.String(),
    smtpPassword: Type.String(),
  }),
  (data, ctx) => {
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
        path: ["smtpHost"],
        message: validation.smtpHostRequired,
      })
    }

    if (!data.smtpPort) {
      ctx.addIssue({
        path: ["smtpPort"],
        message: validation.smtpPortRequired,
      })
      return
    }

    const port = Number.parseInt(data.smtpPort, 10)
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      ctx.addIssue({
        path: ["smtpPort"],
        message: validation.smtpPortRange,
      })
    }
  },
)

export type EmailSettingsFormValues = StaticDecode<
  typeof emailSettingsFormSchema
>

/**
 * Member onboarding settings schema - used in member-onboarding-settings-tab
 */
export const memberOnboardingPageFormSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  title: trimmedString({
    minLength: 1,
    errorMessage: { minLength: validation.pageTitleRequired },
    maxLength: 100,
  }),
  markdown: trimmedString({
    minLength: 1,
    errorMessage: { minLength: validation.pageContentRequired },
    maxLength: 8000,
  }),
})

export const memberOnboardingSettingsFormSchema = Type.Object({
  enabled: Type.Boolean(),
  pages: Type.Array(memberOnboardingPageFormSchema),
})

export type MemberOnboardingPageFormValues = StaticDecode<
  typeof memberOnboardingPageFormSchema
>
export type MemberOnboardingSettingsFormValues = StaticDecode<
  typeof memberOnboardingSettingsFormSchema
>

/**
 * Onboarding setup key form schema
 */
export const setupKeyFormSchema = Type.Object({
  setupKey: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.setupKeyRequired },
    maxLength: 128,
  }),
})

export type SetupKeyFormValues = StaticDecode<typeof setupKeyFormSchema>

/**
 * Onboarding app (Inviterr) form schema
 */
export const onboardingAppFormSchema = Type.Object({
  appUrl: Type.String({
    minLength: 1,
    errorMessage: {
      minLength: validation.appUrlRequired,
      format: validation.validUrlRequired,
    },
    format: "uri",
  }),
})

export type OnboardingAppFormValues = StaticDecode<
  typeof onboardingAppFormSchema
>

/**
 * Onboarding Jellyfin form schema
 */
export const onboardingJellyfinFormSchema = Type.Object({
  internalUrl: Type.String({
    minLength: 1,
    errorMessage: {
      minLength: validation.internalUrlRequired,
      format: validation.validUrlRequired,
    },
    format: "uri",
  }),
  externalUrl: Type.Union(
    [
      Type.String({
        format: "uri",
        errorMessage: { format: validation.validUrlRequired },
      }),
      Type.Literal(""),
    ],
    { errorMessage: validation.validUrlRequired },
  ),
  apiKey: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.apiKeyRequired },
  }),
  configPath: Type.String(),
})

export type OnboardingJellyfinFormValues = StaticDecode<
  typeof onboardingJellyfinFormSchema
>

/**
 * Onboarding Seerr form schema
 */
export const onboardingSeerrFormSchema = superRefine(
  Type.Object({
    internalUrl: Type.Union(
      [
        Type.String({
          format: "uri",
          errorMessage: { format: validation.validUrlRequired },
        }),
        Type.Literal(""),
      ],
      { errorMessage: validation.validUrlRequired },
    ),
    externalUrl: Type.Union(
      [
        Type.String({
          format: "uri",
          errorMessage: { format: validation.validUrlRequired },
        }),
        Type.Literal(""),
      ],
      { errorMessage: validation.validUrlRequired },
    ),
    apiKey: Type.String(),
  }),
  (data, ctx) => {
    const hasAnyInput =
      Boolean(data.internalUrl) ||
      Boolean(data.externalUrl) ||
      Boolean(data.apiKey)

    if (!hasAnyInput) {
      return
    }

    if (!data.internalUrl) {
      ctx.addIssue({
        path: ["internalUrl"],
        message: validation.internalUrlRequired,
      })
    }

    if (!data.apiKey) {
      ctx.addIssue({
        path: ["apiKey"],
        message: validation.apiKeyRequired,
      })
    }
  },
)

export type OnboardingSeerrFormValues = StaticDecode<
  typeof onboardingSeerrFormSchema
>

/**
 * Onboarding email form schema
 */
export const onboardingEmailFormSchema = emailSettingsFormSchema

export type OnboardingEmailFormValues = StaticDecode<
  typeof onboardingEmailFormSchema
>

/**
 * User account form schema - used in profile-settings (name update)
 */
export const accountFormSchema = Type.Object({
  name: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.usernameRequired },
  }),
  email: Type.String({
    format: "email",
    errorMessage: { format: validation.invalidEmail },
  }),
})

export type AccountFormValues = StaticDecode<typeof accountFormSchema>

export const optionalEmailAccountFormSchema = Type.Object({
  name: Type.String({
    minLength: 1,
    errorMessage: { minLength: validation.usernameRequired },
  }),
  email: refine(
    Type.String(),
    (value) =>
      value.trim() === "" ||
      safeParse(Type.String({ format: "email" }), value).success,
    {
      message: validation.invalidEmail,
    },
  ),
})

function withPasswordConfirmation<T extends TProperties>(
  schema: TObject<T>,
  passwordKey: keyof StaticDecode<TObject<T>>,
  confirmKey: keyof StaticDecode<TObject<T>>,
) {
  return refine(schema, (data) => data[passwordKey] === data[confirmKey], {
    message: validation.passwordsDoNotMatch,
    path: [String(confirmKey)],
  })
}

/**
 * Password change form schema - used in profile-settings
 */
export const passwordFormSchema = withPasswordConfirmation(
  Type.Object({
    currentPassword: Type.String({
      minLength: 1,
      errorMessage: { minLength: validation.currentPasswordRequired },
    }),
    newPassword: passwordSchema,
    confirmPassword: Type.String({
      minLength: 1,
      errorMessage: { minLength: validation.confirmPasswordRequired },
    }),
  }),
  "newPassword",
  "confirmPassword",
)

export type PasswordFormValues = StaticDecode<typeof passwordFormSchema>

/**
 * Invite redemption form schema - used in invite/[code]/page
 */
export const inviteRedemptionFormSchema = withPasswordConfirmation(
  Type.Object({
    username: Type.String({
      minLength: 1,
      errorMessage: {
        minLength: validation.usernameRequired,
        maxLength: validation.nameMaxLength,
      },
      maxLength: 100,
    }),
    email: Type.String({
      format: "email",
      errorMessage: { format: validation.invalidEmail },
    }),
    password: passwordSchema,
    confirmPassword: Type.String({
      minLength: 1,
      errorMessage: { minLength: validation.confirmPasswordRequired },
    }),
  }),
  "password",
  "confirmPassword",
)

export type InviteRedemptionFormValues = StaticDecode<
  typeof inviteRedemptionFormSchema
>

/**
 * Forgot password form schema - used in forgot-password page
 */
export const forgotPasswordFormSchema = Type.Object({
  username: Type.String({
    minLength: 1,
    errorMessage: {
      minLength: validation.usernameRequired,
      maxLength: validation.nameMaxLength,
    },
    maxLength: 100,
  }),
})

export type ForgotPasswordFormValues = StaticDecode<
  typeof forgotPasswordFormSchema
>

/**
 * Reset password form schema - used in reset-password page
 */
export const resetPasswordFormSchema = withPasswordConfirmation(
  Type.Object({
    pin: Type.String({
      minLength: 1,
      errorMessage: { minLength: validation.pinRequired },
      maxLength: 128,
    }),
    newPassword: passwordSchema,
    confirmPassword: Type.String({
      minLength: 1,
      errorMessage: { minLength: validation.confirmPasswordRequired },
    }),
  }),
  "newPassword",
  "confirmPassword",
)

export type ResetPasswordFormValues = StaticDecode<
  typeof resetPasswordFormSchema
>
