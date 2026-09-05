import { describe, expect, it } from "vitest"

import { defaultFormValues } from "@/components/profiles/profile-form-utils"
import {
  appSettingsFormSchema,
  createInviteSchema,
  createProfileSchema,
  emailSettingsFormSchema,
  inviteFormSchema,
  inviteRedemptionFormSchema,
  loginSchema,
  MAX_AVATAR_BASE64_LENGTH,
  MAX_AVATAR_DATA_URL_LENGTH,
  memberOnboardingSettingsFormSchema,
  onboardingSeerrFormSchema,
  optionalEmailAccountFormSchema,
  passwordFormSchema,
  passwordSchema,
  profileFormSchema,
  profileRenewalPolicySchema,
  redeemInviteSchema,
  resetPasswordFormSchema,
  updateInviteSchema,
  updateManagedUserSchema,
  updateMyAccountSchema,
  uploadAvatarSchema,
} from "@/lib/schemas"
import { DEFAULT_SEERR_PERMISSIONS } from "@/lib/seerr-permissions"
import { parse, safeParse } from "@/lib/validation"

const profileId = "018f3f9f-3a65-7a6d-8c8f-30a8a1f705a1"

function issueMessages(value: unknown): string[] {
  const result = safeParse(createInviteSchema, value)
  if (result.success) {
    return []
  }

  return result.error.issues.map((issue) => issue.message)
}

function parseCreateInvite(value: unknown) {
  const result = safeParse(createInviteSchema, value)
  if (!result.success) {
    throw new Error("Expected createInviteSchema to parse input")
  }

  return result.data
}

function parseRedeemInvite(value: unknown) {
  const result = safeParse(redeemInviteSchema, value)
  if (!result.success) {
    throw new Error("Expected redeemInviteSchema to parse input")
  }

  return result.data
}

function redeemIssueMessages(value: unknown): string[] {
  const result = safeParse(redeemInviteSchema, value)
  if (result.success) {
    return []
  }

  return result.error.issues.map((issue) => issue.message)
}

describe("createInviteSchema", () => {
  it("accepts a trimmed invite code that satisfies length and pattern", () => {
    const data = parseCreateInvite({
      profileId,
      code: " ab-cd123 ",
    })

    expect(data.code).toBe("ab-cd123")
  })

  it("rejects too-short invite codes with the existing validation message", () => {
    expect(issueMessages({ profileId, code: "abc123" })).toContain(
      "validation.inviteCodeMinLength",
    )
  })

  it("rejects too-long invite codes with the existing validation message", () => {
    expect(issueMessages({ profileId, code: "a".repeat(33) })).toContain(
      "validation.inviteCodeMaxLength",
    )
  })

  it("rejects invalid invite code characters with the existing validation message", () => {
    expect(issueMessages({ profileId, code: "abcd123!" })).toContain(
      "validation.inviteCodePattern",
    )
  })
})

describe("redeemInviteSchema", () => {
  const redeemInput = {
    code: " ab-cd123 ",
    username: "test-user",
    password: "Password1",
    email: "user@example.com",
  }

  it("requires an invite code", () => {
    expect(
      redeemIssueMessages({
        ...redeemInput,
        code: "",
      }),
    ).toContain("validation.inviteCodeRequired")
  })

  it("does not normalize the invite code during schema parsing", () => {
    const data = parseRedeemInvite(redeemInput)

    expect(data.code).toBe(" ab-cd123 ")
  })

  it("enforces avatar payload limits without changing optional behavior", () => {
    expect(safeParse(redeemInviteSchema, { ...redeemInput, avatar: "a".repeat(MAX_AVATAR_DATA_URL_LENGTH) }).success).toBe(true)
    expect(safeParse(redeemInviteSchema, { ...redeemInput, avatar: "a".repeat(MAX_AVATAR_DATA_URL_LENGTH + 1) }).success).toBe(false)
    expect(safeParse(uploadAvatarSchema, { imageBase64: "a".repeat(MAX_AVATAR_BASE64_LENGTH + 1), mimeType: "image/png" }).success).toBe(false)
  })
})

function schemaIssues(schema: Parameters<typeof safeParse>[0], value: unknown) {
  const result = safeParse(schema, value)
  expect(result.success).toBe(false)
  return result.success ? [] : result.error.issues
}

describe("shared schema regressions", () => {
  it("preserves all password checks in their original order", () => {
    expect(schemaIssues(passwordSchema, "123").map((issue) => issue.message)).toEqual([
      "validation.passwordMinLength",
      "validation.passwordUppercase",
      "validation.passwordLowercase",
    ])
    expect(schemaIssues(passwordSchema, "abcdefgh")).toEqual([{ path: [], message: "validation.passwordUppercase" }])
    expect(schemaIssues(passwordSchema, "ABCDEFGH")).toEqual([{ path: [], message: "validation.passwordLowercase" }])
    expect(parse(passwordSchema, "Abcdefgh")).toBe("Abcdefgh")
    expect(parse(loginSchema, { username: " user ", password: " " })).toEqual({ username: " user ", password: " " })
  })

  it.each([
    [passwordFormSchema, { currentPassword: "old", newPassword: "short", confirmPassword: "other" }],
    [resetPasswordFormSchema, { pin: "123", newPassword: "short", confirmPassword: "other" }],
    [inviteRedemptionFormSchema, { username: "user", email: "user@example.com", password: "short", confirmPassword: "other" }],
  ])("retains confirmation errors alongside password constraint errors", (schema, value) => {
    expect(schemaIssues(schema, value)).toContainEqual({ path: ["confirmPassword"], message: "validation.passwordsDoNotMatch" })
  })

  it.each([
    [updateManagedUserSchema, "validation.userPropertyRequired"],
    [updateInviteSchema, "validation.invitePropertyRequired"],
    [updateMyAccountSchema, "validation.accountPropertyRequired"],
  ])("rejects empty and unknown-only patches", (schema, message) => {
    expect(schemaIssues(schema, {})).toEqual([{ path: [], message }])
    expect(schemaIssues(schema, { unknown: true })).toEqual([{ path: [], message }])
  })

  it("accepts explicit nulls and false values in patches", () => {
    expect(parse(updateManagedUserSchema, { email: null, expiresAt: null, isDisabled: false })).toEqual({ email: null, expiresAt: null, isDisabled: false })
    expect(parse(updateInviteSchema, { useLimit: null, expiresAt: null, isDisabled: false })).toEqual({ useLimit: null, expiresAt: null, isDisabled: false })
    expect(parse(updateMyAccountSchema, { email: null, locale: null })).toEqual({ email: null, locale: null })
    expect(schemaIssues(updateManagedUserSchema, { email: "invalid" })).toContainEqual({ path: ["email"], message: "validation.invalidEmail" })
    expect(schemaIssues(updateManagedUserSchema, { profileId: "invalid" })).toContainEqual({ path: ["profileId"], message: "validation.invalidProfileId" })
  })

  it("retains future-expiry checks for request strings and form Dates", () => {
    for (const schema of [createInviteSchema, updateInviteSchema, updateManagedUserSchema]) {
      expect(schemaIssues(schema, { profileId, expiresAt: "2000-01-01T00:00:00Z" })).toContainEqual({ path: ["expiresAt"], message: "validation.expiryFuture" })
      expect(safeParse(schema, { profileId, expiresAt: "2099-01-01T00:00:00Z" }).success).toBe(true)
    }
    const value = { profileId, code: "", expiresAt: new Date("2099-01-01T00:00:00Z") }
    expect(parse(inviteFormSchema, value).expiresAt).toEqual(value.expiresAt)
    expect(schemaIssues(inviteFormSchema, { ...value, expiresAt: new Date("2000-01-01T00:00:00Z") })).toContainEqual({ path: ["expiresAt"], message: "validation.expiryFuture" })
    expect(safeParse(inviteFormSchema, { ...value, expiresAt: value.expiresAt.toISOString() }).success).toBe(false)
    expect(safeParse(inviteFormSchema, { ...value, expiresAt: new Date("invalid") }).success).toBe(false)
  })

  it("retains optional invite code and numeric-limit differences between create/update", () => {
    expect(parse(createInviteSchema, { profileId })).toEqual({ profileId })
    expect(parse(inviteFormSchema, { profileId, code: "  ", expiresAt: null })).toEqual({ profileId, code: "", expiresAt: null })
    expect(schemaIssues(inviteFormSchema, { profileId, code: "short", expiresAt: null })).toContainEqual({ path: ["code"], message: "validation.inviteCodeFormPattern" })
    expect(safeParse(createInviteSchema, { profileId, useLimit: 1.5 }).success).toBe(false)
    expect(parse(updateInviteSchema, { useLimit: 1.5 })).toEqual({ useLimit: 1.5 })
  })

  it("defaults nested profile permissions and validates renewal boundaries", () => {
    const policy = { enableAllFolders: true, enabledFolders: [], showInLoginScreen: false, remoteClientBitrateLimit: 0, allowVideoTranscoding: true, allowAudioTranscoding: true, allowMediaRemuxing: true }
    expect(parse(createProfileSchema, { name: "Default", policy }).policy).toEqual({ ...policy, seerrPermissions: DEFAULT_SEERR_PERMISSIONS })
    expect(safeParse(createProfileSchema, { name: "Default", policy: { ...policy, seerrPermissions: null } }).success).toBe(false)
    expect(parse(profileRenewalPolicySchema, { mode: "self-serve", extendByDays: 3650, maxTotalDays: 36500, minLeadTimeHours: 8760 })).toEqual({ mode: "self-serve", extendByDays: 3650, maxTotalDays: 36500, minLeadTimeHours: 8760 })
    expect(safeParse(profileRenewalPolicySchema, { mode: "disabled", extendByDays: 3651 }).success).toBe(false)
  })

  it("validates quota limits and days only for enabled limited overrides", () => {
    const value = { ...defaultFormValues, name: "Profile", seerrMovieQuotaOverride: true, seerrMovieQuotaMode: "limited", seerrTvQuotaOverride: true, seerrTvQuotaMode: "limited" }
    expect(schemaIssues(profileFormSchema, value)).toEqual([
      { path: ["seerrMovieQuotaLimit"], message: "validation.seerrQuotaRange" },
      { path: ["seerrMovieQuotaDays"], message: "validation.seerrQuotaRange" },
      { path: ["seerrTvQuotaLimit"], message: "validation.seerrQuotaRange" },
      { path: ["seerrTvQuotaDays"], message: "validation.seerrQuotaRange" },
    ])
    expect(safeParse(profileFormSchema, { ...defaultFormValues, name: "Profile" }).success).toBe(true)
    expect(safeParse(profileFormSchema, { ...value, seerrMovieQuotaLimit: " 100 ", seerrMovieQuotaDays: "1", seerrTvQuotaLimit: "1", seerrTvQuotaDays: "100" }).success).toBe(true)
    expect(safeParse(profileFormSchema, { ...value, seerrMovieQuotaLimit: "101", seerrMovieQuotaDays: "0", seerrTvQuotaLimit: "01", seerrTvQuotaDays: "1.5" }).success).toBe(false)
  })

  it("keeps SMTP conditional requirements and existing parseInt port behavior", () => {
    const blank = { from: "", smtpHost: "", smtpPort: "", smtpSecure: true, smtpUsername: "", smtpPassword: "" }
    expect(parse(emailSettingsFormSchema, blank)).toEqual(blank)
    expect(schemaIssues(emailSettingsFormSchema, { ...blank, from: "sender" })).toEqual([
      { path: ["smtpHost"], message: "validation.smtpHostRequired" },
      { path: ["smtpPort"], message: "validation.smtpPortRequired" },
    ])
    expect(schemaIssues(emailSettingsFormSchema, { ...blank, smtpHost: "smtp", smtpPort: "65536" })).toEqual([{ path: ["smtpPort"], message: "validation.smtpPortRange" }])
    expect(safeParse(emailSettingsFormSchema, { ...blank, smtpHost: "smtp", smtpPort: "25suffix" }).success).toBe(true)
  })

  it("keeps optional Seerr setup and blank URL behavior", () => {
    expect(parse(onboardingSeerrFormSchema, { internalUrl: "", externalUrl: "", apiKey: "" })).toEqual({ internalUrl: "", externalUrl: "", apiKey: "" })
    expect(schemaIssues(onboardingSeerrFormSchema, { internalUrl: "", externalUrl: "https://example.com", apiKey: "" })).toEqual([
      { path: ["internalUrl"], message: "validation.internalUrlRequired" },
      { path: ["apiKey"], message: "validation.apiKeyRequired" },
    ])
    expect(schemaIssues(appSettingsFormSchema, { title: "App", description: "", defaultLocale: "en", url: "invalid" })).toContainEqual({ path: ["url"], message: "validation.validUrlRequired" })
  })

  it("accepts whitespace-only optional email without normalizing it", () => {
    expect(parse(optionalEmailAccountFormSchema, { name: "user", email: "  " })).toEqual({ name: "user", email: "  " })
    expect(schemaIssues(optionalEmailAccountFormSchema, { name: "user", email: " user@example.com " })).toEqual([{ path: ["email"], message: "validation.invalidEmail" }])
  })

  it("trims onboarding pages before length checks and reports nested field paths", () => {
    expect(parse(memberOnboardingSettingsFormSchema, { enabled: true, pages: [{ id: "1", title: " Title ", markdown: " content " }] })).toEqual({ enabled: true, pages: [{ id: "1", title: "Title", markdown: "content" }] })
    expect(schemaIssues(memberOnboardingSettingsFormSchema, { enabled: true, pages: [{ id: "1", title: " ", markdown: " " }] })).toEqual([
      { path: ["pages", 0, "title"], message: "validation.pageTitleRequired" },
      { path: ["pages", 0, "markdown"], message: "validation.pageContentRequired" },
    ])
  })
})
