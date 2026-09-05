import { Type, type StaticDecode } from "typebox"

import {
  BRANDING_IMAGE_MAX_BASE64_LENGTH,
  BRANDING_IMAGE_MIME_TYPES,
  isHexColor,
  normalizeHexColor,
} from "@/lib/branding"
import { EMAIL_MESSAGE_TYPES } from "@/lib/email"
import { SUPPORTED_LOCALES } from "@/lib/i18n"
import {
  enumValues,
  nullable,
  refine,
  stringSchema,
  trimmedString,
} from "@/lib/validation"
import {
  AnyStringSchema,
  BooleanSchema,
  DateTimeStringSchema,
  NonEmptyStringSchema,
  NullSchema,
  NullableStringSchema,
  UriStringSchema,
  boundedIntSchema,
  minProperties,
} from "@/server/api/schemas/schema-helpers"

export const localeSchema = enumValues(SUPPORTED_LOCALES)

export const apiErrorBodySchema = Type.Object({
  code: AnyStringSchema,
  message: AnyStringSchema,
  messageKey: Type.Optional(AnyStringSchema),
})

export const nullBodySchema = NullSchema
export const optionalStringSchema = Type.Optional(AnyStringSchema)
export const nullableStringSchema = nullable(AnyStringSchema)

export const onboardingPageSchema = Type.Object({
  id: NonEmptyStringSchema,
  title: trimmedString({ minLength: 1, maxLength: 100 }),
  markdown: trimmedString({ minLength: 1, maxLength: 8000 }),
})

export const sessionSchema = Type.Object({
  userId: AnyStringSchema,
  name: AnyStringSchema,
  avatarUrl: AnyStringSchema,
  isAdmin: BooleanSchema,
  email: NullableStringSchema,
  emailVerified: BooleanSchema,
  locale: nullable(localeSchema),
  createdAt: DateTimeStringSchema,
})

const hexColorSchema = Type.Decode(
  refine(AnyStringSchema, isHexColor, {
    message: "Must be a hex color like #3A64F2",
  }),
  normalizeHexColor,
)

const brandingImageUpdateSchema = Type.Union([
  Type.Object({ action: Type.Literal("keep") }),
  Type.Object({ action: Type.Literal("remove") }),
  Type.Object({
    action: Type.Literal("replace"),
    mimeType: enumValues(BRANDING_IMAGE_MIME_TYPES),
    base64: stringSchema({
      minLength: 1,
      maxLength: BRANDING_IMAGE_MAX_BASE64_LENGTH,
    }),
  }),
])

const brandingImageMetaSchema = Type.Object({
  mimeType: enumValues(BRANDING_IMAGE_MIME_TYPES),
  width: boundedIntSchema(1, 10000),
  height: boundedIntSchema(1, 10000),
  url: AnyStringSchema,
})

export const appSettingsSchema = Type.Object({
  title: NonEmptyStringSchema,
  description: AnyStringSchema,
  defaultLocale: localeSchema,
  url: Type.Optional(UriStringSchema),
})

export const updateAppSettingsBodySchema = minProperties(
  Type.Object({
    title: Type.Optional(NonEmptyStringSchema),
    description: Type.Optional(AnyStringSchema),
    defaultLocale: Type.Optional(localeSchema),
    url: Type.Optional(nullable(UriStringSchema)),
  }),
  1,
)

export const smtpConfigSchema = Type.Object({
  host: NonEmptyStringSchema,
  port: boundedIntSchema(1, 65535),
  secure: Type.Optional(BooleanSchema),
  username: Type.Optional(NonEmptyStringSchema),
  password: Type.Optional(NonEmptyStringSchema),
})

export const jellyfinConfigSchema = Type.Object({
  internalUrl: UriStringSchema,
  externalUrl: Type.Optional(UriStringSchema),
  apiKeySet: BooleanSchema,
  configPath: Type.Optional(AnyStringSchema),
  displayName: Type.Optional(AnyStringSchema),
})

export const updateJellyfinConfigBodySchema = minProperties(
  Type.Object({
    internalUrl: Type.Optional(UriStringSchema),
    externalUrl: Type.Optional(nullable(UriStringSchema)),
    apiKey: Type.Optional(NonEmptyStringSchema),
    configPath: Type.Optional(nullable(AnyStringSchema)),
    displayName: Type.Optional(nullable(NonEmptyStringSchema)),
  }),
  1,
)

const updateSeerrConfigDefinedSchema = minProperties(
  Type.Object({
    internalUrl: Type.Optional(UriStringSchema),
    externalUrl: Type.Optional(nullable(UriStringSchema)),
    apiKey: Type.Optional(NonEmptyStringSchema),
  }),
  1,
)

export const seerrConfigSchema = Type.Object({
  internalUrl: Type.Optional(UriStringSchema),
  externalUrl: Type.Optional(UriStringSchema),
  apiKeySet: BooleanSchema,
})

export const updateSeerrConfigBodySchema = Type.Union([
  updateSeerrConfigDefinedSchema,
  Type.Undefined(),
])

export const seerrTestResultSchema = Type.Object({
  version: Type.Optional(AnyStringSchema),
})

const emailMessageTypeSchema = enumValues(EMAIL_MESSAGE_TYPES)

export const emailBrandingDraftSchema = Type.Object({
  accentColor: hexColorSchema,
  pageBackgroundColor: hexColorSchema,
  logo: brandingImageUpdateSchema,
})

export const emailConfigSchema = Type.Object({
  from: Type.Optional(AnyStringSchema),
  smtp: Type.Optional(
    Type.Object({
      host: NonEmptyStringSchema,
      port: boundedIntSchema(1, 65535),
      secure: BooleanSchema,
      username: Type.Optional(NonEmptyStringSchema),
    }),
  ),
  smtpPasswordSet: BooleanSchema,
  configured: BooleanSchema,
  branding: Type.Object({
    accentColor: AnyStringSchema,
    pageBackgroundColor: AnyStringSchema,
    logo: Type.Optional(brandingImageMetaSchema),
  }),
})

const updateEmailConfigDefinedSchema = Type.Object({
  from: NonEmptyStringSchema,
  smtp: Type.Optional(smtpConfigSchema),
  branding: emailBrandingDraftSchema,
})

export const updateEmailConfigBodySchema = Type.Union([
  updateEmailConfigDefinedSchema,
  Type.Undefined(),
])

export const previewEmailBodySchema = Type.Object({
  messageType: emailMessageTypeSchema,
  branding: emailBrandingDraftSchema,
})

export const sendTestEmailBodySchema = Type.Object({
  ...previewEmailBodySchema.properties,
  recipient: Type.String({ format: "email" }),
})

export const memberOnboardingConfigSchema = Type.Object({
  enabled: BooleanSchema,
  pages: Type.Array(onboardingPageSchema),
})

export const appBootstrapSchema = Type.Object({
  configured: BooleanSchema,
  needsOnboarding: BooleanSchema,
  configError: nullable(AnyStringSchema),
  app: nullable(appSettingsSchema),
  emailConfigured: BooleanSchema,
  session: nullable(sessionSchema),
  locale: localeSchema,
})

export type ApiErrorBodyDto = StaticDecode<typeof apiErrorBodySchema>
export type SessionDto = StaticDecode<typeof sessionSchema>
export type UpdateAppSettingsInput = StaticDecode<
  typeof updateAppSettingsBodySchema
>
export type UpdateJellyfinConfigInput = StaticDecode<
  typeof updateJellyfinConfigBodySchema
>
export type UpdateSeerrConfigInput = StaticDecode<
  typeof updateSeerrConfigBodySchema
>
export type SeerrTestResultDto = StaticDecode<typeof seerrTestResultSchema>
export type UpdateEmailConfigInput = StaticDecode<
  typeof updateEmailConfigBodySchema
>
export type EmailBrandingDraftInput = StaticDecode<
  typeof emailBrandingDraftSchema
>
export type PreviewEmailInput = StaticDecode<typeof previewEmailBodySchema>
export type SendTestEmailInput = StaticDecode<typeof sendTestEmailBodySchema>
export type UpdateMemberOnboardingConfigInput = StaticDecode<
  typeof memberOnboardingConfigSchema
>
export type AppBootstrapDto = StaticDecode<typeof appBootstrapSchema>
