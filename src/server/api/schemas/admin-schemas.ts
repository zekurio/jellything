import { z } from "zod"

import { ErrorCode } from "@/lib/api/contracts/errors"
import {
  apiErrorBodySchema,
  appSettingsSchema,
  emailConfigSchema,
  jellyfinConfigSchema,
  memberOnboardingConfigSchema,
  nullBodySchema,
  seerrConfigSchema,
  seerrTestResultSchema,
  updateAppSettingsBodySchema,
  updateEmailConfigBodySchema,
  updateJellyfinConfigBodySchema,
  updateSeerrConfigBodySchema,
} from "@/server/api/schemas/common-schemas"
import {
  AnyStringSchema,
  BooleanSchema,
  DateTimeStringSchema,
  EmailStringSchema,
  NonNegativeIntSchema,
  NonEmptyStringSchema,
  NullableStringSchema,
  UuidStringSchema,
  boundedIntSchema,
  exactOptional,
} from "@/server/api/schemas/zod-helpers"

const inviteStatusValues = [
  "active",
  "disabled",
  "expiring",
  "depleting",
  "expired",
  "exhausted",
] as const

export const pageInputSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const sortDirectionSchema = z.enum(["asc", "desc"])

export const inviteHistoryPageInputSchema = pageInputSchema.extend({
  query: exactOptional(z.string().trim().max(100)),
  sort: z.enum(["usedAt"]).default("usedAt"),
  direction: sortDirectionSchema.default("desc"),
})

export const invitesPageInputSchema = pageInputSchema.extend({
  query: exactOptional(z.string().trim().max(100)),
  sort: z.enum(["createdAt", "code", "profileName"]).default("createdAt"),
  direction: sortDirectionSchema.default("desc"),
})

export const usersPageInputSchema = pageInputSchema.extend({
  query: exactOptional(z.string().trim().max(100)),
  sort: z
    .enum(["name", "email", "profileName", "lastActivityDate"])
    .default("name"),
  direction: sortDirectionSchema.default("asc"),
})

export const userIdParamsSchema = z.object({
  userId: NonEmptyStringSchema,
})

export const profileIdParamsSchema = z.object({
  profileId: NonEmptyStringSchema,
})

export const inviteIdParamsSchema = z.object({
  inviteId: NonEmptyStringSchema,
})

const seerrQuotasSchema = z.object({
  movieQuotaLimit: exactOptional(NonNegativeIntSchema),
  movieQuotaDays: exactOptional(boundedIntSchema(1, 100)),
  tvQuotaLimit: exactOptional(NonNegativeIntSchema),
  tvQuotaDays: exactOptional(boundedIntSchema(1, 100)),
})

export const profilePolicySchema = z.object({
  enableAllFolders: BooleanSchema,
  enabledFolders: z.array(AnyStringSchema),
  showInLoginScreen: BooleanSchema,
  remoteClientBitrateLimit: z.number().nonnegative(),
  allowVideoTranscoding: BooleanSchema,
  allowAudioTranscoding: BooleanSchema,
  allowMediaRemuxing: BooleanSchema,
  seerrPermissions: NonNegativeIntSchema,
  seerrQuotas: exactOptional(seerrQuotasSchema),
})

export const profilePolicyBodySchema = z.object({
  enableAllFolders: BooleanSchema,
  enabledFolders: z.array(AnyStringSchema),
  showInLoginScreen: BooleanSchema,
  remoteClientBitrateLimit: z.number().nonnegative(),
  allowVideoTranscoding: BooleanSchema,
  allowAudioTranscoding: BooleanSchema,
  allowMediaRemuxing: BooleanSchema,
  seerrPermissions: exactOptional(NonNegativeIntSchema),
  seerrQuotas: exactOptional(seerrQuotasSchema),
})

export const profileSchema = z.object({
  id: AnyStringSchema,
  name: AnyStringSchema,
  isDefault: BooleanSchema,
  policy: profilePolicySchema,
  createdAt: DateTimeStringSchema,
  updatedAt: DateTimeStringSchema,
  syncFailedCount: exactOptional(z.number()),
})

export const createProfileBodySchema = z.object({
  name: AnyStringSchema.min(1).max(100),
  policy: profilePolicyBodySchema,
})

export const updateProfileBodySchema = z.object({
  name: exactOptional(AnyStringSchema.min(1).max(100)),
  policy: exactOptional(profilePolicyBodySchema),
  isDefault: exactOptional(BooleanSchema),
})

export const ensureDefaultProfileResponseSchema = z.object({
  exists: BooleanSchema,
  created: exactOptional(BooleanSchema),
  profile: exactOptional(profileSchema),
})

export const inviteSchema = z.object({
  id: AnyStringSchema,
  code: AnyStringSchema,
  profileId: AnyStringSchema,
  profileName: AnyStringSchema,
  isDisabled: BooleanSchema,
  useLimit: z.number().nullable(),
  useCount: z.number(),
  expiresAt: DateTimeStringSchema.nullable(),
  createdAt: DateTimeStringSchema,
  status: z.enum(inviteStatusValues),
})

export const inviteHistoryItemSchema = z.object({
  id: AnyStringSchema,
  inviteId: AnyStringSchema,
  inviteCode: AnyStringSchema,
  userId: AnyStringSchema,
  userName: AnyStringSchema,
  avatarUrl: NullableStringSchema,
  usedAt: DateTimeStringSchema,
})

export const createInviteBodySchema = z.object({
  profileId: UuidStringSchema,
  code: exactOptional(AnyStringSchema.max(32)),
  useLimit: exactOptional(
    boundedIntSchema(1, Number.MAX_SAFE_INTEGER).nullable(),
  ),
  expiresAt: exactOptional(DateTimeStringSchema.nullable()),
})

export const updateInviteBodySchema = z.object({
  profileId: exactOptional(UuidStringSchema),
  code: exactOptional(AnyStringSchema.max(32)),
  isDisabled: exactOptional(BooleanSchema),
  useLimit: exactOptional(
    boundedIntSchema(1, Number.MAX_SAFE_INTEGER).nullable(),
  ),
  expiresAt: exactOptional(DateTimeStringSchema.nullable()),
})

export const userProfileOptionSchema = z.object({
  id: AnyStringSchema,
  name: AnyStringSchema,
  isDefault: BooleanSchema,
})

export const managedUserListItemSchema = z.object({
  userId: AnyStringSchema,
  name: AnyStringSchema,
  email: AnyStringSchema.nullable(),
  emailVerified: BooleanSchema,
  existsInJellyfin: BooleanSchema,
  missingInJellyfin: BooleanSchema,
  isAdmin: BooleanSchema,
  isDisabled: BooleanSchema,
  lastActivityDate: DateTimeStringSchema.nullable(),
  avatarUrl: AnyStringSchema,
  assignedProfileId: AnyStringSchema.nullable(),
  effectiveProfileId: AnyStringSchema.nullable(),
  effectiveProfileName: AnyStringSchema.nullable(),
  seerrSyncedAt: DateTimeStringSchema.nullable(),
  expiresAt: DateTimeStringSchema.nullable(),
})

export const syncUserToSeerrResponseSchema = z.object({
  synced: BooleanSchema,
})

export const usersWithProfilesResponseSchema = z.object({
  users: z.array(managedUserListItemSchema),
  profiles: z.array(userProfileOptionSchema),
  seerrConfigured: BooleanSchema,
})

export const pagedInviteHistoryResponseSchema = z.object({
  items: z.array(inviteHistoryItemSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
  pageCount: z.number().int().min(0),
})

export const pagedInvitesResponseSchema = z.object({
  items: z.array(inviteSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
  pageCount: z.number().int().min(0),
})

export const pagedUsersWithProfilesResponseSchema = z.object({
  users: z.object({
    items: z.array(managedUserListItemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
    pageCount: z.number().int().min(0),
  }),
  profiles: z.array(userProfileOptionSchema),
  seerrConfigured: BooleanSchema,
})

export const deleteManagedUserResponseSchema = z.object({
  userId: AnyStringSchema,
  deletedFromJellyfin: BooleanSchema,
  deletedFromSeerr: BooleanSchema,
})

export const updateManagedUserBodySchema = z.object({
  profileId: exactOptional(UuidStringSchema),
  email: exactOptional(EmailStringSchema.nullable()),
  emailVerified: exactOptional(BooleanSchema),
  isDisabled: exactOptional(BooleanSchema),
  expiresAt: exactOptional(DateTimeStringSchema.nullable()),
})

export const updateManagedUserResponseSchema = z.object({
  userId: AnyStringSchema,
  profileId: AnyStringSchema.nullable(),
  profileName: AnyStringSchema.nullable(),
  email: AnyStringSchema.nullable(),
  emailVerified: BooleanSchema,
  isDisabled: BooleanSchema,
  expiresAt: DateTimeStringSchema.nullable(),
})

export const bulkManagedUserOperationSchema = z.enum([
  "assignProfile",
  "disable",
  "enable",
  "delete",
  "syncSeerr",
])

export const bulkManagedUsersSchema = z
  .object({
    operation: bulkManagedUserOperationSchema,
    userIds: z.array(NonEmptyStringSchema).min(1).max(100),
    updates: exactOptional(updateManagedUserBodySchema),
  })
  .superRefine((value, context) => {
    if (value.operation !== "assignProfile") {
      if (value.updates !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["updates"],
          message: "Updates are only supported for profile assignment",
        })
      }
      return
    }

    if (
      value.updates?.profileId === undefined &&
      value.updates?.expiresAt === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["updates"],
        message: "Profile assignment requires profile or expiry updates",
      })
    }

    if (
      value.updates?.email !== undefined ||
      value.updates?.emailVerified !== undefined ||
      value.updates?.isDisabled !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["updates"],
        message: "Bulk profile assignment only supports profile and expiry",
      })
    }
  })

export const bulkManagedUserSkipReasonSchema = z.enum([
  "admin",
  "missing_in_jellyfin",
  "no_changes",
  "already_disabled",
  "already_enabled",
])

export const bulkManagedUserResultSchema = z.discriminatedUnion("ok", [
  z.object({
    userId: AnyStringSchema,
    ok: z.literal(true),
    operation: z.enum(["assignProfile", "disable", "enable"]),
    result: updateManagedUserResponseSchema,
  }),
  z.object({
    userId: AnyStringSchema,
    ok: z.literal(true),
    operation: z.literal("delete"),
    result: deleteManagedUserResponseSchema,
  }),
  z.object({
    userId: AnyStringSchema,
    ok: z.literal(true),
    operation: z.literal("syncSeerr"),
    result: syncUserToSeerrResponseSchema,
  }),
  z.object({
    userId: AnyStringSchema,
    ok: z.literal(true),
    operation: bulkManagedUserOperationSchema,
    skipped: z.literal(true),
    reason: bulkManagedUserSkipReasonSchema,
  }),
  z.object({
    userId: AnyStringSchema,
    ok: z.literal(false),
    operation: bulkManagedUserOperationSchema,
    code: z.enum(ErrorCode),
    message: AnyStringSchema,
  }),
])

export const bulkManagedUsersResponseSchema = z.object({
  results: z.array(bulkManagedUserResultSchema),
})

export const mediaLibrarySchema = z.object({
  id: AnyStringSchema,
  name: AnyStringSchema,
  collectionType: NullableStringSchema,
})

export const profilesResponseSchema = z.array(profileSchema)
export const invitesResponseSchema = z.array(inviteSchema)
export const inviteHistoryResponseSchema = z.array(inviteHistoryItemSchema)
export const librariesResponseSchema = z.array(mediaLibrarySchema)

export const adminErrorResponses = {
  401: apiErrorBodySchema,
  403: apiErrorBodySchema,
  404: apiErrorBodySchema,
  409: apiErrorBodySchema,
  410: apiErrorBodySchema,
  422: apiErrorBodySchema,
  429: apiErrorBodySchema,
  500: apiErrorBodySchema,
  502: apiErrorBodySchema,
} as const

export {
  appSettingsSchema,
  emailConfigSchema,
  jellyfinConfigSchema,
  memberOnboardingConfigSchema,
  nullBodySchema,
  seerrConfigSchema,
  seerrTestResultSchema,
  updateAppSettingsBodySchema,
  updateEmailConfigBodySchema,
  updateJellyfinConfigBodySchema,
  updateSeerrConfigBodySchema,
}

export type AppSettingsDto = z.output<typeof appSettingsSchema>
export type JellyfinConfigDto = z.output<typeof jellyfinConfigSchema>
export type SeerrConfigDto = z.output<typeof seerrConfigSchema>
export type EmailConfigDto = z.output<typeof emailConfigSchema>
export type MemberOnboardingConfigDto = z.output<
  typeof memberOnboardingConfigSchema
>
export type ProfileDto = z.output<typeof profileSchema>
export type EnsureDefaultProfileDto = z.output<
  typeof ensureDefaultProfileResponseSchema
>
export type InviteDto = z.output<typeof inviteSchema>
export type InviteHistoryItemDto = z.output<typeof inviteHistoryItemSchema>
export type InviteHistoryPageInputDto = z.input<
  typeof inviteHistoryPageInputSchema
>
export type InvitesPageInputDto = z.input<typeof invitesPageInputSchema>
export type UsersPageInputDto = z.input<typeof usersPageInputSchema>
export type PagedInviteHistoryDto = z.output<
  typeof pagedInviteHistoryResponseSchema
>
export type PagedInvitesDto = z.output<typeof pagedInvitesResponseSchema>
export type PagedUsersWithProfilesDto = z.output<
  typeof pagedUsersWithProfilesResponseSchema
>
export type ManagedUserListItemDto = z.output<typeof managedUserListItemSchema>
export type MediaLibraryDto = z.output<typeof mediaLibrarySchema>
export type UserProfileOptionDto = z.output<typeof userProfileOptionSchema>
export type UsersWithProfilesDto = z.output<
  typeof usersWithProfilesResponseSchema
>
export type DeleteManagedUserDto = z.output<
  typeof deleteManagedUserResponseSchema
>
export type UpdateManagedUserDto = z.output<
  typeof updateManagedUserResponseSchema
>
export type SyncUserToSeerrDto = z.output<typeof syncUserToSeerrResponseSchema>
export type BulkManagedUsersInputDto = z.input<typeof bulkManagedUsersSchema>
export type BulkManagedUserResultDto = z.output<
  typeof bulkManagedUserResultSchema
>
export type BulkManagedUsersDto = z.output<
  typeof bulkManagedUsersResponseSchema
>
