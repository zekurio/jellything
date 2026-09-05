import { Type, type StaticDecode, type StaticEncode } from "typebox"
import { describe, expect, expectTypeOf, it } from "vitest"

import { ErrorCode } from "@/lib/api/contracts/errors"
import { BRANDING_IMAGE_MAX_BASE64_LENGTH } from "@/lib/branding"
import { parse, safeParse } from "@/lib/validation"
import {
  bulkInviteResultSchema,
  bulkInvitesSchema,
  bulkManagedUserResultSchema,
  bulkManagedUsersSchema,
  bulkProfileResultSchema,
  bulkProfilesSchema,
  createInviteBodySchema,
  createProfileBodySchema,
  inviteHistoryPageInputSchema,
  invitesPageInputSchema,
  pageInputSchema,
  profilePolicyBodySchema,
  profilePolicySchema,
  updateInviteBodySchema,
  updateManagedUserBodySchema,
  usersPageInputSchema,
} from "@/server/api/schemas/admin-schemas"
import {
  emailBrandingDraftSchema,
  onboardingPageSchema,
  sendTestEmailBodySchema,
  smtpConfigSchema,
  updateAppSettingsBodySchema,
  updateEmailConfigBodySchema,
  updateJellyfinConfigBodySchema,
  updateSeerrConfigBodySchema,
} from "@/server/api/schemas/common-schemas"
import { initializeConfigBodySchema } from "@/server/api/schemas/public-schemas"
import {
  DateTimeStringSchema,
  EmailStringSchema,
  NonNegativeIntSchema,
  UriStringSchema,
  UuidStringSchema,
  boundedIntSchema,
} from "@/server/api/schemas/schema-helpers"

const profileId = "123e4567-e89b-42d3-a456-426614174000"
const policy = {
  enableAllFolders: true,
  enabledFolders: [],
  showInLoginScreen: false,
  remoteClientBitrateLimit: 0,
  allowVideoTranscoding: true,
  allowAudioTranscoding: false,
  allowMediaRemuxing: true,
}
const branding = {
  accentColor: " #3a64f2 ",
  pageBackgroundColor: "#ffffff",
  logo: { action: "keep" },
}

describe("API pagination", () => {
  it("defaults omitted and explicitly undefined inputs with required decoded types", () => {
    expect(parse(pageInputSchema, {})).toEqual({ page: 1, pageSize: 50 })
    expect(parse(inviteHistoryPageInputSchema, {})).toEqual({
      page: 1,
      pageSize: 50,
      sort: "usedAt",
      direction: "desc",
    })
    expect(
      parse(invitesPageInputSchema, {
        page: undefined,
        pageSize: undefined,
        sort: undefined,
        direction: undefined,
      }),
    ).toEqual({ page: 1, pageSize: 50, sort: "createdAt", direction: "desc" })
    expect(parse(usersPageInputSchema, {})).toEqual({
      page: 1,
      pageSize: 50,
      sort: "name",
      direction: "asc",
    })

    expectTypeOf<StaticEncode<typeof invitesPageInputSchema>>().toMatchTypeOf<{
      page?: unknown
      pageSize?: unknown
      sort?: "createdAt" | "code" | "profileName" | "useCount"
      direction?: "asc" | "desc"
    }>()
    expectTypeOf<{}>().toMatchTypeOf<
      StaticEncode<typeof invitesPageInputSchema>
    >()
    expectTypeOf<StaticDecode<typeof invitesPageInputSchema>>().toMatchTypeOf<{
      page: number
      pageSize: number
      sort: "createdAt" | "code" | "profileName" | "useCount"
      direction: "asc" | "desc"
    }>()
    expectTypeOf<
      StaticDecode<typeof inviteHistoryPageInputSchema>
    >().toMatchTypeOf<{ sort: "usedAt"; direction: "asc" | "desc" }>()
    expectTypeOf<StaticDecode<typeof usersPageInputSchema>>().toMatchTypeOf<{
      sort: "name" | "email" | "profileName" | "lastActivityDate"
      direction: "asc" | "desc"
    }>()
  })

  it.each([
    ["2", 2],
    [" 3 ", 3],
    [true, 1],
    [[4], 4],
    [BigInt(2), 2],
    ["0x10", 16],
  ])("uses Number conversion for %s", (value, expected) => {
    expect(parse(pageInputSchema, { page: value, pageSize: value })).toEqual({
      page: expected,
      pageSize: expected,
    })
  })

  it.each(
    [
      null,
      false,
      "",
      " ",
      [],
      "abc",
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      Symbol("invalid"),
      [Symbol("invalid")],
      Object.create(null),
    ].map((value) => [value]),
  )("rejects invalid page %s without throwing from safeParse", (page) => {
    const result = safeParse(pageInputSchema, { page })
    expect(result).toMatchObject({
      success: false,
      error: {
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ["page"] }),
        ]),
      },
    })
  })

  it("prefixes numeric codec failures inside nested objects", () => {
    expect(
      safeParse(Type.Object({ paging: pageInputSchema }), {
        paging: { pageSize: "101" },
      }),
    ).toMatchObject({
      success: false,
      error: {
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ["paging", "pageSize"] }),
        ]),
      },
    })
  })

  it("bounds page size and trims queries before checking length", () => {
    expect(safeParse(pageInputSchema, { pageSize: 101 }).success).toBe(false)
    expect(
      parse(invitesPageInputSchema, {
        pageSize: "100",
        query: ` ${"a".repeat(100)} `,
        extra: true,
      }),
    ).toEqual({
      page: 1,
      pageSize: 100,
      sort: "createdAt",
      direction: "desc",
      query: "a".repeat(100),
    })
    expect(
      safeParse(invitesPageInputSchema, { query: "a".repeat(101) }).success,
    ).toBe(false)
    expect(safeParse(invitesPageInputSchema, { sort: null }).success).toBe(
      false,
    )
    expect(safeParse(invitesPageInputSchema, { direction: "up" }).success).toBe(
      false,
    )
    expect(safeParse(usersPageInputSchema, { status: "active" }).success).toBe(
      false,
    )
    expect(safeParse(invitesPageInputSchema, { status: "admin" }).success).toBe(
      false,
    )
  })
})

describe("API update validation", () => {
  it.each([
    updateAppSettingsBodySchema,
    updateJellyfinConfigBodySchema,
    updateSeerrConfigBodySchema,
  ])("rejects empty and unknown-only updates", (schema) => {
    expect(safeParse(schema, {}).success).toBe(false)
    expect(safeParse(schema, { unknown: "value" }).success).toBe(false)
    expect(safeParse(schema, null).success).toBe(false)
  })

  it("strips unknown update keys rather than making existing updates strict", () => {
    expect(
      parse(updateAppSettingsBodySchema, { title: "Inviterr", unknown: true }),
    ).toEqual({ title: "Inviterr" })
    expect(
      parse(updateJellyfinConfigBodySchema, {
        displayName: null,
        unknown: true,
      }),
    ).toEqual({ displayName: null })
    expect(
      parse(updateSeerrConfigBodySchema, { externalUrl: null, unknown: true }),
    ).toEqual({ externalUrl: null })
    expect(parse(updateAppSettingsBodySchema, { title: undefined })).toEqual({
      title: undefined,
    })
  })

  it("keeps undefined-only integration removal and nullable fields", () => {
    expect(parse(updateSeerrConfigBodySchema, undefined)).toBeUndefined()
    expect(parse(updateEmailConfigBodySchema, undefined)).toBeUndefined()
    expect(safeParse(updateAppSettingsBodySchema, undefined).success).toBe(
      false,
    )
    expect(safeParse(updateEmailConfigBodySchema, null).success).toBe(false)
    expect(
      parse(updateInviteBodySchema, { useLimit: null, expiresAt: null }),
    ).toEqual({ useLimit: null, expiresAt: null })
    expect(
      parse(updateManagedUserBodySchema, { email: null, expiresAt: null }),
    ).toEqual({ email: null, expiresAt: null })
    expect(
      safeParse(updateManagedUserBodySchema, { profileId: null }).success,
    ).toBe(false)
    expect(
      safeParse(updateInviteBodySchema, { isDisabled: "false" }).success,
    ).toBe(false)
  })
})

describe("API bulk cross-field requirements", () => {
  it.each([undefined, {}, { email: "a@b.c" }])(
    "requires profile or expiry updates for assignment",
    (updates) => {
      const result = safeParse(bulkManagedUsersSchema, {
        operation: "assignProfile",
        userIds: ["user"],
        updates,
      })
      expect(result).toMatchObject({
        success: false,
        error: {
          issues: expect.arrayContaining([
            {
              path: ["updates"],
              message: "Profile assignment requires profile or expiry updates",
            },
          ]),
        },
      })
    },
  )

  it.each([{ profileId }, { expiresAt: null }, { expiresAt: "2026-04-01" }])(
    "accepts profile or expiry assignment",
    (updates) => {
      expect(
        parse(bulkManagedUsersSchema, {
          operation: "assignProfile",
          userIds: ["user"],
          updates,
        }),
      ).toEqual({ operation: "assignProfile", userIds: ["user"], updates })
    },
  )

  it.each([{ email: null }, { emailVerified: false }, { isDisabled: false }])(
    "rejects other managed-user updates in assignments",
    (extra) => {
      const result = safeParse(bulkManagedUsersSchema, {
        operation: "assignProfile",
        userIds: ["user"],
        updates: { profileId, ...extra },
      })
      expect(result).toMatchObject({
        success: false,
        error: {
          issues: [
            {
              path: ["updates"],
              message:
                "Bulk profile assignment only supports profile and expiry",
            },
          ],
        },
      })
    },
  )

  it.each(["disable", "enable", "delete", "syncSeerr"])(
    "rejects updates for %s",
    (operation) => {
      expect(
        safeParse(bulkManagedUsersSchema, { operation, userIds: ["user"] })
          .success,
      ).toBe(true)
      const result = safeParse(bulkManagedUsersSchema, {
        operation,
        userIds: ["user"],
        updates: {},
      })
      expect(result).toMatchObject({
        success: false,
        error: {
          issues: [
            {
              path: ["updates"],
              message: "Updates are only supported for profile assignment",
            },
          ],
        },
      })
    },
  )

  it("reports multiple refinement issues and prefixes nested paths", () => {
    const result = safeParse(Type.Object({ bulk: bulkManagedUsersSchema }), {
      bulk: {
        operation: "assignProfile",
        userIds: ["user"],
        updates: { emailVerified: false },
      },
    })
    expect(result).toMatchObject({
      success: false,
      error: {
        issues: [
          {
            path: ["bulk", "updates"],
            message: "Profile assignment requires profile or expiry updates",
          },
          {
            path: ["bulk", "updates"],
            message: "Bulk profile assignment only supports profile and expiry",
          },
        ],
      },
    })
  })

  it("enforces batch limits and ID constraints", () => {
    for (const size of [0, 101]) {
      expect(
        safeParse(bulkManagedUsersSchema, {
          operation: "disable",
          userIds: Array.from({ length: size }, () => "user"),
        }).success,
      ).toBe(false)
      expect(
        safeParse(bulkInvitesSchema, {
          operation: "delete",
          inviteIds: Array.from({ length: size }, () => profileId),
        }).success,
      ).toBe(false)
      expect(
        safeParse(bulkProfilesSchema, {
          operation: "delete",
          profileIds: Array.from({ length: size }, () => profileId),
        }).success,
      ).toBe(false)
    }
    expect(
      safeParse(bulkManagedUsersSchema, { operation: "disable", userIds: [""] })
        .success,
    ).toBe(false)
    expect(
      safeParse(bulkInvitesSchema, {
        operation: "delete",
        inviteIds: ["invalid"],
      }).success,
    ).toBe(false)
    expect(
      safeParse(bulkProfilesSchema, {
        operation: "disable",
        profileIds: [profileId],
      }).success,
    ).toBe(false)
    expect(
      safeParse(bulkInvitesSchema, {
        operation: "delete",
        inviteIds: Array.from({ length: 100 }, () => profileId),
      }).success,
    ).toBe(true)
  })
})

describe("API transforms and constraints", () => {
  it("normalizes hex colors and validates branding variants", () => {
    expect(parse(emailBrandingDraftSchema, branding)).toEqual({
      accentColor: "#3A64F2",
      pageBackgroundColor: "#FFFFFF",
      logo: { action: "keep" },
    })
    expect(
      safeParse(emailBrandingDraftSchema, { ...branding, accentColor: "#abc" })
        .success,
    ).toBe(false)
    for (const logo of [
      { action: "other" },
      { action: "replace", mimeType: "image/svg+xml", base64: "abc" },
      { action: "replace", mimeType: "image/png", base64: "" },
      {
        action: "replace",
        mimeType: "image/jpeg",
        base64: "a".repeat(BRANDING_IMAGE_MAX_BASE64_LENGTH + 1),
      },
    ])
      expect(
        safeParse(emailBrandingDraftSchema, { ...branding, logo }).success,
      ).toBe(false)
    expect(
      parse(emailBrandingDraftSchema, {
        ...branding,
        logo: { action: "remove", extra: true },
      }).logo,
    ).toEqual({ action: "remove" })
    expect(
      safeParse(emailBrandingDraftSchema, {
        ...branding,
        logo: {
          action: "replace",
          mimeType: "image/png",
          base64: "a".repeat(BRANDING_IMAGE_MAX_BASE64_LENGTH),
        },
      }).success,
    ).toBe(true)
  })

  it("trims onboarding content before length validation", () => {
    expect(
      parse(onboardingPageSchema, {
        id: "page",
        title: " Welcome ",
        markdown: " Hello ",
      }),
    ).toEqual({ id: "page", title: "Welcome", markdown: "Hello" })
    expect(
      safeParse(onboardingPageSchema, {
        id: "page",
        title: "   ",
        markdown: "Hello",
      }).success,
    ).toBe(false)
    expect(
      safeParse(onboardingPageSchema, {
        id: "page",
        title: "a".repeat(101),
        markdown: "Hello",
      }).success,
    ).toBe(false)
    expect(
      safeParse(onboardingPageSchema, {
        id: "page",
        title: "Hi",
        markdown: "a".repeat(8001),
      }).success,
    ).toBe(false)
  })

  it("preserves the legacy API email, URL, date-time and UUID rules", () => {
    expect(parse(EmailStringSchema, "a@b.c")).toBe("a@b.c")
    expect(parse(UriStringSchema, "mailto:user@example.com")).toBe(
      "mailto:user@example.com",
    )
    expect(parse(DateTimeStringSchema, "2026-04-01")).toBe("2026-04-01")
    expect(parse(DateTimeStringSchema, "2026-04-01T10:30:00+02:00")).toBe(
      "2026-04-01T10:30:00+02:00",
    )
    expect(parse(UuidStringSchema, profileId)).toBe(profileId)
    expect(safeParse(EmailStringSchema, " a@b.c").success).toBe(false)
    expect(safeParse(UriStringSchema, "relative/path").success).toBe(false)
    expect(safeParse(DateTimeStringSchema, "not a date").success).toBe(false)
    expect(
      safeParse(UuidStringSchema, "123e4567-e89b-02d3-a456-426614174000")
        .success,
    ).toBe(false)
    expect(
      safeParse(sendTestEmailBodySchema, {
        messageType: "verifyEmail",
        branding,
        recipient: "a@b.c",
      }).success,
    ).toBe(false)
  })

  it("preserves safe integer constraints without coercing other API numbers", () => {
    expect(
      safeParse(NonNegativeIntSchema, Number.MAX_SAFE_INTEGER).success,
    ).toBe(true)
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, "1"])
      expect(safeParse(NonNegativeIntSchema, value).success).toBe(false)
    expect(safeParse(boundedIntSchema(1, 100), 100).success).toBe(true)
    expect(safeParse(boundedIntSchema(1, 100), 101).success).toBe(false)
    for (const port of [0, 65536, "25", 25.5])
      expect(safeParse(smtpConfigSchema, { host: "smtp", port }).success).toBe(
        false,
      )
    expect(
      safeParse(smtpConfigSchema, { host: "smtp", port: 65535 }).success,
    ).toBe(true)
  })

  it("keeps profile policy request permissions optional and response permissions required", () => {
    expect(parse(profilePolicyBodySchema, policy)).toEqual(policy)
    expect(safeParse(profilePolicySchema, policy).success).toBe(false)
    expect(
      safeParse(profilePolicySchema, { ...policy, seerrPermissions: 0 })
        .success,
    ).toBe(true)
    expect(
      safeParse(profilePolicyBodySchema, {
        ...policy,
        seerrQuotas: { movieQuotaDays: 0 },
      }).success,
    ).toBe(false)
    expect(
      safeParse(profilePolicyBodySchema, {
        ...policy,
        remoteClientBitrateLimit: -1,
      }).success,
    ).toBe(false)
    expect(
      safeParse(profilePolicyBodySchema, {
        ...policy,
        remoteClientBitrateLimit: 0.5,
      }).success,
    ).toBe(true)
    expect(
      safeParse(profilePolicyBodySchema, {
        ...policy,
        remoteClientBitrateLimit: Infinity,
      }).success,
    ).toBe(false)
    expect(
      safeParse(createProfileBodySchema, { name: "", policy }).success,
    ).toBe(false)
    expect(
      safeParse(createProfileBodySchema, { name: "a".repeat(101), policy })
        .success,
    ).toBe(false)
    expect(
      safeParse(createProfileBodySchema, { name: " ", policy }).success,
    ).toBe(true)
    expect(
      safeParse(createInviteBodySchema, { profileId, code: "a".repeat(33) })
        .success,
    ).toBe(false)
    expect(
      safeParse(createInviteBodySchema, { profileId, useLimit: 0 }).success,
    ).toBe(false)
  })

  it("counts string limits in UTF-16 code units, not grapheme clusters", () => {
    expect(
      safeParse(createInviteBodySchema, { profileId, code: "😀".repeat(16) })
        .success,
    ).toBe(true)
    expect(
      safeParse(createInviteBodySchema, { profileId, code: "😀".repeat(17) })
        .success,
    ).toBe(false)
    expect(
      safeParse(createProfileBodySchema, { name: "e\u0301".repeat(51), policy })
        .success,
    ).toBe(false)
    expect(
      safeParse(invitesPageInputSchema, { query: ` ${"😀".repeat(51)} ` })
        .success,
    ).toBe(false)
    expect(
      safeParse(onboardingPageSchema, {
        id: "page",
        title: "Hello",
        markdown: "😀".repeat(4001),
      }).success,
    ).toBe(false)
    expect(
      safeParse(emailBrandingDraftSchema, {
        ...branding,
        logo: {
          action: "replace",
          mimeType: "image/png",
          base64: "😀".repeat(
            Math.floor(BRANDING_IMAGE_MAX_BASE64_LENGTH / 2) + 1,
          ),
        },
      }).success,
    ).toBe(false)
  })

  it("strips unknown initialization fields recursively without coercing booleans", () => {
    const input = {
      setupKey: "secret",
      jellyfin: {
        internalUrl: "http://jellyfin:8096",
        apiKey: "key",
        extra: true,
      },
      extra: true,
    }
    expect(parse(initializeConfigBodySchema, input)).toEqual({
      setupKey: "secret",
      jellyfin: { internalUrl: "http://jellyfin:8096", apiKey: "key" },
    })
    expect(
      safeParse(initializeConfigBodySchema, {
        ...input,
        email: {
          from: "Inviterr",
          smtp: { host: "smtp", port: 25, secure: "false" },
        },
      }).success,
    ).toBe(false)
  })

  it("validates success, skip and failure result variants", () => {
    expect(
      parse(bulkInviteResultSchema, {
        inviteId: "invite",
        ok: true,
        operation: "delete",
      }),
    ).toEqual({ inviteId: "invite", ok: true, operation: "delete" })
    expect(
      safeParse(bulkInviteResultSchema, {
        inviteId: "invite",
        ok: true,
        operation: "disable",
      }).success,
    ).toBe(false)
    expect(
      safeParse(bulkManagedUserResultSchema, {
        userId: "user",
        ok: true,
        operation: "syncSeerr",
        result: { synced: true },
      }).success,
    ).toBe(true)
    expect(
      safeParse(bulkManagedUserResultSchema, {
        userId: "user",
        ok: true,
        operation: "disable",
        skipped: true,
        reason: "admin",
      }).success,
    ).toBe(true)
    expect(
      safeParse(bulkProfileResultSchema, {
        profileId,
        ok: false,
        operation: "delete",
        code: ErrorCode.OPERATION_FAILED,
        message: "Failed",
      }).success,
    ).toBe(true)
    expect(
      safeParse(bulkProfileResultSchema, {
        profileId,
        ok: false,
        operation: "delete",
        code: "unknown",
        message: "Failed",
      }).success,
    ).toBe(false)
  })
})
