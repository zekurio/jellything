import { describe, expect, it } from "vitest"

import type { ProfileRenewalPolicy } from "@/lib/renewal-types"
import { evaluateRenewal } from "@/server/renewal"

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

const now = new Date("2026-07-02T12:00:00.000Z")
const createdAt = new Date("2026-01-01T00:00:00.000Z")

function daysFromNow(days: number): Date {
  return new Date(now.getTime() + days * MS_PER_DAY)
}

const selfServe: ProfileRenewalPolicy = {
  mode: "self-serve",
  extendByDays: 30,
}

describe("evaluateRenewal", () => {
  it("rejects when renewal is undefined or disabled", () => {
    for (const renewal of [
      undefined,
      { mode: "disabled" } as ProfileRenewalPolicy,
    ]) {
      const result = evaluateRenewal({
        renewal,
        createdAt,
        expiresAt: daysFromNow(1),
        now,
      })
      expect(result).toMatchObject({ canRenew: false, reason: "disabled" })
    }
  })

  it("treats self-serve without a positive extension as disabled", () => {
    const result = evaluateRenewal({
      renewal: { mode: "self-serve" },
      createdAt,
      expiresAt: daysFromNow(1),
      now,
    })
    expect(result).toMatchObject({ canRenew: false, reason: "disabled" })
  })

  it("rejects members with no expiry (admins / never-expiring)", () => {
    const result = evaluateRenewal({
      renewal: selfServe,
      createdAt,
      expiresAt: null,
      now,
    })
    expect(result).toMatchObject({ canRenew: false, reason: "no-expiry" })
  })

  it("extends by extendByDays from now on the happy path", () => {
    const result = evaluateRenewal({
      renewal: selfServe,
      createdAt,
      expiresAt: daysFromNow(1),
      now,
    })
    expect(result).toMatchObject({
      canRenew: true,
      nextExpiresAt: daysFromNow(30),
    })
  })

  it("caps the next expiry at the absolute lifetime ceiling", () => {
    // Ceiling = createdAt + 190 days. now is 182 days after createdAt, so a
    // 30-day extension would overshoot and must clamp to the ceiling.
    const ceilingDays = 190
    const ceiling = new Date(createdAt.getTime() + ceilingDays * MS_PER_DAY)
    const result = evaluateRenewal({
      renewal: {
        mode: "self-serve",
        extendByDays: 30,
        maxTotalDays: ceilingDays,
      },
      createdAt,
      expiresAt: daysFromNow(1),
      now,
    })
    expect(result).toMatchObject({
      canRenew: true,
      nextExpiresAt: ceiling,
      maxExpiresAt: ceiling,
    })
  })

  it("rejects when the ceiling leaves no forward progress (cap reached)", () => {
    // Ceiling is already before the current expiry, so no extension is possible.
    const result = evaluateRenewal({
      renewal: { mode: "self-serve", extendByDays: 30, maxTotalDays: 100 },
      createdAt,
      expiresAt: daysFromNow(10),
      now,
    })
    expect(result).toMatchObject({ canRenew: false, reason: "cap-reached" })
  })

  it("rejects renewal attempted before the lead-time window opens", () => {
    // Expiry is 10 days out but renewal only opens 24h before expiry.
    const result = evaluateRenewal({
      renewal: { mode: "self-serve", extendByDays: 30, minLeadTimeHours: 24 },
      createdAt,
      expiresAt: daysFromNow(10),
      now,
    })
    expect(result).toMatchObject({
      canRenew: false,
      reason: "outside-window",
      earliestRenewAt: new Date(daysFromNow(10).getTime() - 24 * MS_PER_HOUR),
    })
  })

  it("allows renewal once inside the lead-time window", () => {
    // Expiry is 12h out, lead window is 24h, so renewal is open.
    const result = evaluateRenewal({
      renewal: { mode: "self-serve", extendByDays: 30, minLeadTimeHours: 24 },
      createdAt,
      expiresAt: new Date(now.getTime() + 12 * MS_PER_HOUR),
      now,
    })
    expect(result).toMatchObject({ canRenew: true })
  })
})
