import { describe, expect, it } from "vitest"

import { normalizeInviteCode } from "@/lib/invite-codes"

describe("normalizeInviteCode", () => {
  it("trims and uppercases invite codes", () => {
    expect(normalizeInviteCode(" ab-cd12 ")).toBe("AB-CD12")
  })
})
