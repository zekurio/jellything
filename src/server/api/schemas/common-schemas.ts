import { z } from "zod"

import { SUPPORTED_LOCALES } from "@/lib/i18n"
import {
  AnyStringSchema,
  BooleanSchema,
  DateTimeStringSchema,
  NonEmptyStringSchema,
  NullSchema,
  NullableStringSchema,
  UriStringSchema,
  boundedIntSchema,
  exactOptional,
  minProperties,
} from "@/server/api/schemas/zod-helpers"

export const localeSchema = z.enum(SUPPORTED_LOCALES)

export const apiErrorBodySchema = z.object({
  code: AnyStringSchema,
  message: AnyStringSchema,
  messageKey: exactOptional(AnyStringSchema),
})

export const nullBodySchema = NullSchema
export const optionalStringSchema = AnyStringSchema.optional()
export const nullableStringSchema = AnyStringSchema.nullable()

export const onboardingPageSchema = z.object({
  id: NonEmptyStringSchema,
  title: z.string().trim().min(1).max(100),
  markdown: z.string().trim().min(1).max(8000),
})

export const sessionSchema = z.object({
  userId: AnyStringSchema,
  name: AnyStringSchema,
  avatarUrl: AnyStringSchema,
  isAdmin: BooleanSchema,
  email: NullableStringSchema,
  emailVerified: BooleanSchema,
  locale: localeSchema.nullable(),
  createdAt: DateTimeStringSchema,
})

export const appSettingsSchema = z.object({
  title: NonEmptyStringSchema,
  description: AnyStringSchema,
  defaultLocale: localeSchema,
  url: exactOptional(UriStringSchema),
})

export const updateAppSettingsBodySchema = minProperties(
  z.object({
    title: exactOptional(NonEmptyStringSchema),
    description: exactOptional(AnyStringSchema),
    defaultLocale: exactOptional(localeSchema),
    url: exactOptional(UriStringSchema.nullable()),
  }),
  1,
)

export const smtpConfigSchema = z.object({
  host: NonEmptyStringSchema,
  port: boundedIntSchema(1, 65535),
  secure: exactOptional(BooleanSchema),
  username: exactOptional(NonEmptyStringSchema),
  password: exactOptional(NonEmptyStringSchema),
})

export const jellyfinConfigSchema = z.object({
  internalUrl: UriStringSchema,
  externalUrl: exactOptional(UriStringSchema),
  apiKeySet: BooleanSchema,
  configPath: exactOptional(AnyStringSchema),
})

export const updateJellyfinConfigBodySchema = minProperties(
  z.object({
    internalUrl: exactOptional(UriStringSchema),
    externalUrl: exactOptional(UriStringSchema.nullable()),
    apiKey: exactOptional(NonEmptyStringSchema),
    configPath: exactOptional(AnyStringSchema.nullable()),
  }),
  1,
)

const updateSeerrConfigDefinedSchema = minProperties(
  z.object({
    internalUrl: exactOptional(UriStringSchema),
    externalUrl: exactOptional(UriStringSchema.nullable()),
    apiKey: exactOptional(NonEmptyStringSchema),
  }),
  1,
)

export const seerrConfigSchema = z.object({
  internalUrl: exactOptional(UriStringSchema),
  externalUrl: exactOptional(UriStringSchema),
  apiKeySet: BooleanSchema,
})

export const updateSeerrConfigBodySchema = z.union([
  updateSeerrConfigDefinedSchema,
  z.undefined(),
])

export const seerrTestResultSchema = z.object({
  version: exactOptional(AnyStringSchema),
})

export const emailConfigSchema = z.object({
  from: exactOptional(AnyStringSchema),
  smtp: exactOptional(
    z.object({
      host: NonEmptyStringSchema,
      port: boundedIntSchema(1, 65535),
      secure: BooleanSchema,
      username: exactOptional(NonEmptyStringSchema),
    }),
  ),
  smtpPasswordSet: BooleanSchema,
})

const updateEmailConfigDefinedSchema = z.object({
  from: NonEmptyStringSchema,
  smtp: exactOptional(smtpConfigSchema),
})

export const updateEmailConfigBodySchema = z.union([
  updateEmailConfigDefinedSchema,
  z.undefined(),
])

export const memberOnboardingConfigSchema = z.object({
  enabled: BooleanSchema,
  pages: z.array(onboardingPageSchema),
})

export const appBootstrapSchema = z.object({
  configured: BooleanSchema,
  needsOnboarding: BooleanSchema,
  configError: AnyStringSchema.nullable(),
  app: appSettingsSchema.nullable(),
  emailConfigured: BooleanSchema,
  session: sessionSchema.nullable(),
  locale: localeSchema,
})

export type ApiErrorBodyDto = z.output<typeof apiErrorBodySchema>
export type SessionDto = z.output<typeof sessionSchema>
export type UpdateAppSettingsInput = z.output<
  typeof updateAppSettingsBodySchema
>
export type UpdateJellyfinConfigInput = z.output<
  typeof updateJellyfinConfigBodySchema
>
export type UpdateSeerrConfigInput = z.output<
  typeof updateSeerrConfigBodySchema
>
export type SeerrTestResultDto = z.output<typeof seerrTestResultSchema>
export type UpdateEmailConfigInput = z.output<
  typeof updateEmailConfigBodySchema
>
export type UpdateMemberOnboardingConfigInput = z.output<
  typeof memberOnboardingConfigSchema
>
export type AppBootstrapDto = z.output<typeof appBootstrapSchema>
