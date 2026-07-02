import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  buildRateLimitKey,
  consumeRateLimit,
  type RateLimiterDefinition,
} from "@/server/rate-limit"

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url")
}

function createTestLimiter(): RateLimiterDefinition {
  return {
    keyPrefix: `test_${crypto.randomUUID()}`,
    points: 2,
    duration: 60,
    blockDuration: 60,
  }
}

describe("buildRateLimitKey", () => {
  it("trims and lowercases string parts", () => {
    expect(buildRateLimitKey(" User@Example.COM ")).toBe(
      buildRateLimitKey("user@example.com"),
    )
  })

  it("uses unknown for nullish parts and returns deterministic SHA-256 base64url", () => {
    const expected = sha256Base64Url("unknown\0unknown")

    expect(buildRateLimitKey(null, undefined)).toBe(expected)
    expect(buildRateLimitKey(null, undefined)).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it("delimits parts so adjacent strings do not collide", () => {
    expect(buildRateLimitKey("ab", "c")).not.toBe(buildRateLimitKey("a", "bc"))
  })
})

describe("consumeRateLimit", () => {
  it("allows configured points and rejects the next consume", async () => {
    const limiter = createTestLimiter()
    const key = crypto.randomUUID()

    expect(await consumeRateLimit(limiter, key)).toMatchObject({
      allowed: true,
      remainingPoints: 1,
    })
    expect(await consumeRateLimit(limiter, key)).toMatchObject({
      allowed: true,
      remainingPoints: 0,
    })

    const blocked = await consumeRateLimit(limiter, key)

    expect(blocked.allowed).toBe(false)
    expect(blocked.remainingPoints).toBe(0)
    expect(blocked.msBeforeNext).toBeGreaterThan(0)
  })

  it("fails closed for an overweight consume", async () => {
    const result = await consumeRateLimit(
      createTestLimiter(),
      crypto.randomUUID(),
      3,
    )

    expect(result.allowed).toBe(false)
    expect(result.remainingPoints).toBe(0)
    expect(result.msBeforeNext).toBeGreaterThan(0)
  })
})
