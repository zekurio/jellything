import { Type, type StaticDecode, type StaticEncode } from "typebox"

import { ErrorCode } from "@/lib/api/contracts/errors"
import {
  defaulted,
  enumValues,
  nullable,
  stringSchema,
  superRefine,
  trimmedString,
} from "@/lib/validation"
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
  coercedBoundedIntSchema,
} from "@/server/api/schemas/schema-helpers"

const inviteStatusValues = [
  "active",
  "disabled",
  "expiring",
  "depleting",
  "expired",
  "exhausted",
] as const

const pageProperties = {
  page: Type.Optional(
    defaulted(coercedBoundedIntSchema(1, Number.MAX_SAFE_INTEGER), 1),
  ),
  pageSize: Type.Optional(defaulted(coercedBoundedIntSchema(1, 100), 50)),
}

// Object codecs keep defaulted inputs optional and decoded outputs required.
export const pageInputSchema = Type.Decode(
  Type.Object(pageProperties),
  (value) => ({
    ...value,
    page: value.page ?? 1,
    pageSize: value.pageSize ?? 50,
  }),
)

export const sortDirectionSchema = enumValues(["asc", "desc"])

export const inviteHistoryPageInputSchema = Type.Decode(
  Type.Object({
    ...pageProperties,
    query: Type.Optional(trimmedString({ maxLength: 100 })),
    sort: Type.Optional(defaulted(enumValues(["usedAt"]), "usedAt")),
    direction: Type.Optional(defaulted(sortDirectionSchema, "desc")),
  }),
  (value) => ({
    ...value,
    page: value.page ?? 1,
    pageSize: value.pageSize ?? 50,
    sort: value.sort ?? "usedAt",
    direction: value.direction ?? "desc",
  }),
)

export const invitesPageInputSchema = Type.Decode(
  Type.Object({
    ...pageProperties,
    query: Type.Optional(trimmedString({ maxLength: 100 })),
    sort: Type.Optional(
      defaulted(
        enumValues(["createdAt", "code", "profileName", "useCount"]),
        "createdAt",
      ),
    ),
    direction: Type.Optional(defaulted(sortDirectionSchema, "desc")),
    status: Type.Optional(enumValues(inviteStatusValues)),
  }),
  (value) => ({
    ...value,
    page: value.page ?? 1,
    pageSize: value.pageSize ?? 50,
    sort: value.sort ?? "createdAt",
    direction: value.direction ?? "desc",
  }),
)

export const userStatusFilterValues = [
  "admin",
  "member",
  "disabled",
  "missing",
  "expired",
] as const

export const usersPageInputSchema = Type.Decode(
  Type.Object({
    ...pageProperties,
    query: Type.Optional(trimmedString({ maxLength: 100 })),
    sort: Type.Optional(
      defaulted(
        enumValues(["name", "email", "profileName", "lastActivityDate"]),
        "name",
      ),
    ),
    direction: Type.Optional(defaulted(sortDirectionSchema, "asc")),
    status: Type.Optional(enumValues(userStatusFilterValues)),
  }),
  (value) => ({
    ...value,
    page: value.page ?? 1,
    pageSize: value.pageSize ?? 50,
    sort: value.sort ?? "name",
    direction: value.direction ?? "asc",
  }),
)

export const userIdParamsSchema = Type.Object({
  userId: NonEmptyStringSchema,
})

export const profileIdParamsSchema = Type.Object({
  profileId: NonEmptyStringSchema,
})

export const inviteIdParamsSchema = Type.Object({
  inviteId: NonEmptyStringSchema,
})

const seerrQuotasSchema = Type.Object({
  movieQuotaLimit: Type.Optional(NonNegativeIntSchema),
  movieQuotaDays: Type.Optional(boundedIntSchema(1, 100)),
  tvQuotaLimit: Type.Optional(NonNegativeIntSchema),
  tvQuotaDays: Type.Optional(boundedIntSchema(1, 100)),
})

export const profilePolicySchema = Type.Object({
  enableAllFolders: BooleanSchema,
  enabledFolders: Type.Array(AnyStringSchema),
  showInLoginScreen: BooleanSchema,
  remoteClientBitrateLimit: Type.Number({ minimum: 0 }),
  allowVideoTranscoding: BooleanSchema,
  allowAudioTranscoding: BooleanSchema,
  allowMediaRemuxing: BooleanSchema,
  seerrPermissions: NonNegativeIntSchema,
  seerrQuotas: Type.Optional(seerrQuotasSchema),
})

export const profilePolicyBodySchema = Type.Object({
  enableAllFolders: BooleanSchema,
  enabledFolders: Type.Array(AnyStringSchema),
  showInLoginScreen: BooleanSchema,
  remoteClientBitrateLimit: Type.Number({ minimum: 0 }),
  allowVideoTranscoding: BooleanSchema,
  allowAudioTranscoding: BooleanSchema,
  allowMediaRemuxing: BooleanSchema,
  seerrPermissions: Type.Optional(NonNegativeIntSchema),
  seerrQuotas: Type.Optional(seerrQuotasSchema),
})

export const profileSchema = Type.Object({
  id: AnyStringSchema,
  name: AnyStringSchema,
  isDefault: BooleanSchema,
  policy: profilePolicySchema,
  createdAt: DateTimeStringSchema,
  updatedAt: DateTimeStringSchema,
  syncFailedCount: Type.Optional(Type.Number()),
})

export const createProfileBodySchema = Type.Object({
  name: stringSchema({ minLength: 1, maxLength: 100 }),
  policy: profilePolicyBodySchema,
})

export const updateProfileBodySchema = Type.Object({
  name: Type.Optional(stringSchema({ minLength: 1, maxLength: 100 })),
  policy: Type.Optional(profilePolicyBodySchema),
  isDefault: Type.Optional(BooleanSchema),
})

export const ensureDefaultProfileResponseSchema = Type.Object({
  exists: BooleanSchema,
  created: Type.Optional(BooleanSchema),
  profile: Type.Optional(profileSchema),
})

export const inviteSchema = Type.Object({
  id: AnyStringSchema,
  code: AnyStringSchema,
  profileId: AnyStringSchema,
  profileName: AnyStringSchema,
  isDisabled: BooleanSchema,
  useLimit: nullable(Type.Number()),
  useCount: Type.Number(),
  expiresAt: nullable(DateTimeStringSchema),
  createdAt: DateTimeStringSchema,
  status: enumValues(inviteStatusValues),
})

export const inviteHistoryItemSchema = Type.Object({
  id: AnyStringSchema,
  inviteId: AnyStringSchema,
  inviteCode: AnyStringSchema,
  userId: AnyStringSchema,
  userName: AnyStringSchema,
  avatarUrl: NullableStringSchema,
  usedAt: DateTimeStringSchema,
})

export const createInviteBodySchema = Type.Object({
  profileId: UuidStringSchema,
  code: Type.Optional(stringSchema({ maxLength: 32 })),
  useLimit: Type.Optional(
    nullable(boundedIntSchema(1, Number.MAX_SAFE_INTEGER)),
  ),
  expiresAt: Type.Optional(nullable(DateTimeStringSchema)),
})

export const updateInviteBodySchema = Type.Object({
  profileId: Type.Optional(UuidStringSchema),
  code: Type.Optional(stringSchema({ maxLength: 32 })),
  isDisabled: Type.Optional(BooleanSchema),
  useLimit: Type.Optional(
    nullable(boundedIntSchema(1, Number.MAX_SAFE_INTEGER)),
  ),
  expiresAt: Type.Optional(nullable(DateTimeStringSchema)),
})

export const userProfileOptionSchema = Type.Object({
  id: AnyStringSchema,
  name: AnyStringSchema,
  isDefault: BooleanSchema,
})

export const managedUserListItemSchema = Type.Object({
  userId: AnyStringSchema,
  name: AnyStringSchema,
  email: nullable(AnyStringSchema),
  emailVerified: BooleanSchema,
  existsInJellyfin: BooleanSchema,
  missingInJellyfin: BooleanSchema,
  isAdmin: BooleanSchema,
  isDisabled: BooleanSchema,
  lastActivityDate: nullable(DateTimeStringSchema),
  avatarUrl: AnyStringSchema,
  assignedProfileId: nullable(AnyStringSchema),
  effectiveProfileId: nullable(AnyStringSchema),
  effectiveProfileName: nullable(AnyStringSchema),
  seerrSyncedAt: nullable(DateTimeStringSchema),
  expiresAt: nullable(DateTimeStringSchema),
})

export const syncUserToSeerrResponseSchema = Type.Object({
  synced: BooleanSchema,
})

export const usersWithProfilesResponseSchema = Type.Object({
  users: Type.Array(managedUserListItemSchema),
  profiles: Type.Array(userProfileOptionSchema),
  seerrConfigured: BooleanSchema,
})

export const pagedInviteHistoryResponseSchema = Type.Object({
  items: Type.Array(inviteHistoryItemSchema),
  page: boundedIntSchema(1, Number.MAX_SAFE_INTEGER),
  pageSize: boundedIntSchema(1, 100),
  total: NonNegativeIntSchema,
  pageCount: NonNegativeIntSchema,
})

export const pagedInvitesResponseSchema = Type.Object({
  items: Type.Array(inviteSchema),
  page: boundedIntSchema(1, Number.MAX_SAFE_INTEGER),
  pageSize: boundedIntSchema(1, 100),
  total: NonNegativeIntSchema,
  pageCount: NonNegativeIntSchema,
})

export const pagedUsersWithProfilesResponseSchema = Type.Object({
  users: Type.Object({
    items: Type.Array(managedUserListItemSchema),
    page: boundedIntSchema(1, Number.MAX_SAFE_INTEGER),
    pageSize: boundedIntSchema(1, 100),
    total: NonNegativeIntSchema,
    pageCount: NonNegativeIntSchema,
  }),
  profiles: Type.Array(userProfileOptionSchema),
  seerrConfigured: BooleanSchema,
})

export const deleteManagedUserResponseSchema = Type.Object({
  userId: AnyStringSchema,
  deletedFromJellyfin: BooleanSchema,
  deletedFromSeerr: BooleanSchema,
})

export const updateManagedUserBodySchema = Type.Object({
  profileId: Type.Optional(UuidStringSchema),
  email: Type.Optional(nullable(EmailStringSchema)),
  emailVerified: Type.Optional(BooleanSchema),
  isDisabled: Type.Optional(BooleanSchema),
  expiresAt: Type.Optional(nullable(DateTimeStringSchema)),
})

export const updateManagedUserResponseSchema = Type.Object({
  userId: AnyStringSchema,
  profileId: nullable(AnyStringSchema),
  profileName: nullable(AnyStringSchema),
  email: nullable(AnyStringSchema),
  emailVerified: BooleanSchema,
  isDisabled: BooleanSchema,
  expiresAt: nullable(DateTimeStringSchema),
})

export const bulkManagedUserOperationSchema = enumValues([
  "assignProfile",
  "disable",
  "enable",
  "delete",
  "syncSeerr",
])

export const bulkManagedUsersSchema = superRefine(
  Type.Object({
    operation: bulkManagedUserOperationSchema,
    userIds: Type.Array(NonEmptyStringSchema, { minItems: 1, maxItems: 100 }),
    updates: Type.Optional(updateManagedUserBodySchema),
  }),
  (value, context) => {
    if (value.operation !== "assignProfile") {
      if (value.updates !== undefined) {
        context.addIssue({
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
        path: ["updates"],
        message: "Bulk profile assignment only supports profile and expiry",
      })
    }
  },
)

export const bulkManagedUserSkipReasonSchema = enumValues([
  "admin",
  "missing_in_jellyfin",
  "no_changes",
  "already_disabled",
  "already_enabled",
])

export const bulkManagedUserResultSchema = Type.Union([
  Type.Object({
    userId: AnyStringSchema,
    ok: Type.Literal(true),
    operation: enumValues(["assignProfile", "disable", "enable"]),
    result: updateManagedUserResponseSchema,
  }),
  Type.Object({
    userId: AnyStringSchema,
    ok: Type.Literal(true),
    operation: Type.Literal("delete"),
    result: deleteManagedUserResponseSchema,
  }),
  Type.Object({
    userId: AnyStringSchema,
    ok: Type.Literal(true),
    operation: Type.Literal("syncSeerr"),
    result: syncUserToSeerrResponseSchema,
  }),
  Type.Object({
    userId: AnyStringSchema,
    ok: Type.Literal(true),
    operation: bulkManagedUserOperationSchema,
    skipped: Type.Literal(true),
    reason: bulkManagedUserSkipReasonSchema,
  }),
  Type.Object({
    userId: AnyStringSchema,
    ok: Type.Literal(false),
    operation: bulkManagedUserOperationSchema,
    code: enumValues(ErrorCode),
    message: AnyStringSchema,
  }),
])

export const bulkManagedUsersResponseSchema = Type.Object({
  results: Type.Array(bulkManagedUserResultSchema),
})

export const bulkInviteOperationSchema = enumValues([
  "disable",
  "enable",
  "delete",
])

export const bulkInvitesSchema = Type.Object({
  operation: bulkInviteOperationSchema,
  inviteIds: Type.Array(UuidStringSchema, { minItems: 1, maxItems: 100 }),
})

export const bulkInviteSkipReasonSchema = enumValues([
  "already_disabled",
  "already_enabled",
])

export const bulkInviteResultSchema = Type.Union([
  Type.Object({
    inviteId: AnyStringSchema,
    ok: Type.Literal(true),
    operation: enumValues(["disable", "enable"]),
    result: inviteSchema,
  }),
  Type.Object({
    inviteId: AnyStringSchema,
    ok: Type.Literal(true),
    operation: Type.Literal("delete"),
  }),
  Type.Object({
    inviteId: AnyStringSchema,
    ok: Type.Literal(true),
    operation: bulkInviteOperationSchema,
    skipped: Type.Literal(true),
    reason: bulkInviteSkipReasonSchema,
  }),
  Type.Object({
    inviteId: AnyStringSchema,
    ok: Type.Literal(false),
    operation: bulkInviteOperationSchema,
    code: enumValues(ErrorCode),
    message: AnyStringSchema,
  }),
])

export const bulkInvitesResponseSchema = Type.Object({
  results: Type.Array(bulkInviteResultSchema),
})

export const bulkProfileOperationSchema = enumValues(["delete"])

export const bulkProfilesSchema = Type.Object({
  operation: bulkProfileOperationSchema,
  profileIds: Type.Array(UuidStringSchema, { minItems: 1, maxItems: 100 }),
})

export const bulkProfileSkipReasonSchema = enumValues(["default_profile"])

export const bulkProfileResultSchema = Type.Union([
  Type.Object({
    profileId: AnyStringSchema,
    ok: Type.Literal(true),
    operation: Type.Literal("delete"),
  }),
  Type.Object({
    profileId: AnyStringSchema,
    ok: Type.Literal(true),
    operation: bulkProfileOperationSchema,
    skipped: Type.Literal(true),
    reason: bulkProfileSkipReasonSchema,
  }),
  Type.Object({
    profileId: AnyStringSchema,
    ok: Type.Literal(false),
    operation: bulkProfileOperationSchema,
    code: enumValues(ErrorCode),
    message: AnyStringSchema,
  }),
])

export const bulkProfilesResponseSchema = Type.Object({
  results: Type.Array(bulkProfileResultSchema),
})

export const mediaLibrarySchema = Type.Object({
  id: AnyStringSchema,
  name: AnyStringSchema,
  collectionType: NullableStringSchema,
})

export const profilesResponseSchema = Type.Array(profileSchema)
export const invitesResponseSchema = Type.Array(inviteSchema)
export const inviteHistoryResponseSchema = Type.Array(inviteHistoryItemSchema)
export const librariesResponseSchema = Type.Array(mediaLibrarySchema)

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

export type AppSettingsDto = StaticDecode<typeof appSettingsSchema>
export type JellyfinConfigDto = StaticDecode<typeof jellyfinConfigSchema>
export type SeerrConfigDto = StaticDecode<typeof seerrConfigSchema>
export type EmailConfigDto = StaticDecode<typeof emailConfigSchema>
export type MemberOnboardingConfigDto = StaticDecode<
  typeof memberOnboardingConfigSchema
>
export type ProfileDto = StaticDecode<typeof profileSchema>
export type EnsureDefaultProfileDto = StaticDecode<
  typeof ensureDefaultProfileResponseSchema
>
export type InviteDto = StaticDecode<typeof inviteSchema>
export type InviteHistoryItemDto = StaticDecode<typeof inviteHistoryItemSchema>
export type InviteHistoryPageInputDto = StaticEncode<
  typeof inviteHistoryPageInputSchema
>
export type InvitesPageInputDto = StaticEncode<typeof invitesPageInputSchema>
export type UsersPageInputDto = StaticEncode<typeof usersPageInputSchema>
export type PagedInviteHistoryDto = StaticDecode<
  typeof pagedInviteHistoryResponseSchema
>
export type PagedInvitesDto = StaticDecode<typeof pagedInvitesResponseSchema>
export type PagedUsersWithProfilesDto = StaticDecode<
  typeof pagedUsersWithProfilesResponseSchema
>
export type ManagedUserListItemDto = StaticDecode<
  typeof managedUserListItemSchema
>
export type MediaLibraryDto = StaticDecode<typeof mediaLibrarySchema>
export type UserProfileOptionDto = StaticDecode<typeof userProfileOptionSchema>
export type UsersWithProfilesDto = StaticDecode<
  typeof usersWithProfilesResponseSchema
>
export type DeleteManagedUserDto = StaticDecode<
  typeof deleteManagedUserResponseSchema
>
export type UpdateManagedUserDto = StaticDecode<
  typeof updateManagedUserResponseSchema
>
export type SyncUserToSeerrDto = StaticDecode<
  typeof syncUserToSeerrResponseSchema
>
export type BulkManagedUsersInputDto = StaticEncode<
  typeof bulkManagedUsersSchema
>
export type BulkManagedUserResultDto = StaticDecode<
  typeof bulkManagedUserResultSchema
>
export type BulkManagedUsersDto = StaticDecode<
  typeof bulkManagedUsersResponseSchema
>
export type BulkInvitesInputDto = StaticEncode<typeof bulkInvitesSchema>
export type BulkInviteOperationDto = StaticDecode<
  typeof bulkInviteOperationSchema
>
export type BulkInviteResultDto = StaticDecode<typeof bulkInviteResultSchema>
export type BulkInvitesDto = StaticDecode<typeof bulkInvitesResponseSchema>
export type BulkProfilesInputDto = StaticEncode<typeof bulkProfilesSchema>
export type BulkProfileResultDto = StaticDecode<typeof bulkProfileResultSchema>
export type BulkProfilesDto = StaticDecode<typeof bulkProfilesResponseSchema>
