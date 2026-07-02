import { describe, expect, it } from "vitest"

import { createInviteSchema, redeemInviteSchema } from "@/lib/schemas"

const profileId = "018f3f9f-3a65-7a6d-8c8f-30a8a1f705a1"

function issueMessages(value: unknown): string[] {
  const result = createInviteSchema.safeParse(value)
  if (result.success) {
    return []
  }

  return result.error.issues.map((issue) => issue.message)
}

function parseCreateInvite(value: unknown) {
  const result = createInviteSchema.safeParse(value)
  if (!result.success) {
    throw new Error("Expected createInviteSchema to parse input")
  }

  return result.data
}

function parseRedeemInvite(value: unknown) {
  const result = redeemInviteSchema.safeParse(value)
  if (!result.success) {
    throw new Error("Expected redeemInviteSchema to parse input")
  }

  return result.data
}

function redeemIssueMessages(value: unknown): string[] {
  const result = redeemInviteSchema.safeParse(value)
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
})
