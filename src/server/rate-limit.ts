import { createHash } from "node:crypto"

import { RateLimiterMemory } from "rate-limiter-flexible"

import { logger } from "@/server/logger"

export interface RateLimiterDefinition {
  keyPrefix: string
  points: number
  duration: number
  blockDuration: number
}

function createLimiter(config: RateLimiterDefinition): RateLimiterDefinition {
  return config
}

export const loginLimiter = createLimiter({
  keyPrefix: "login",
  points: 5,
  duration: 5 * 60,
  blockDuration: 15 * 60,
})

export const loginIdentifierLimiter = createLimiter({
  keyPrefix: "login_identifier",
  points: 20,
  duration: 60 * 60,
  blockDuration: 15 * 60,
})

export const redeemInviteLimiter = createLimiter({
  keyPrefix: "redeem_invite",
  points: 3,
  duration: 10 * 60,
  blockDuration: 30 * 60,
})

export const redeemInviteIdentifierLimiter = createLimiter({
  keyPrefix: "redeem_invite_identifier",
  points: 5,
  duration: 10 * 60,
  blockDuration: 30 * 60,
})

export const validateInviteLimiter = createLimiter({
  keyPrefix: "validate_invite",
  points: 10,
  duration: 60,
  blockDuration: 5 * 60,
})

export const invalidInviteLookupLimiter = createLimiter({
  keyPrefix: "invalid_invite_lookup",
  points: 5,
  duration: 10 * 60,
  blockDuration: 30 * 60,
})

export const inviteCodeLookupLimiter = createLimiter({
  keyPrefix: "invite_code_lookup",
  points: 20,
  duration: 10 * 60,
  blockDuration: 15 * 60,
})

export const verifyEmailLimiter = createLimiter({
  keyPrefix: "verify_email",
  points: 5,
  duration: 5 * 60,
  blockDuration: 15 * 60,
})

export const verifyEmailTokenLimiter = createLimiter({
  keyPrefix: "verify_email_token",
  points: 5,
  duration: 15 * 60,
  blockDuration: 30 * 60,
})

export const passwordResetRequestLimiter = createLimiter({
  keyPrefix: "password_reset_request",
  points: 3,
  duration: 15 * 60,
  blockDuration: 30 * 60,
})

export const passwordResetIdentifierLimiter = createLimiter({
  keyPrefix: "password_reset_identifier",
  points: 3,
  duration: 60 * 60,
  blockDuration: 60 * 60,
})

export const setupKeyValidationLimiter = createLimiter({
  keyPrefix: "setup_key_validation",
  points: 5,
  duration: 15 * 60,
  blockDuration: 30 * 60,
})

export const setupKeyIdentifierLimiter = createLimiter({
  keyPrefix: "setup_key_identifier",
  points: 5,
  duration: 60 * 60,
  blockDuration: 60 * 60,
})

export const initializeConfigLimiter = createLimiter({
  keyPrefix: "initialize_config",
  points: 5,
  duration: 15 * 60,
  blockDuration: 30 * 60,
})

export const passwordResetCompleteLimiter = createLimiter({
  keyPrefix: "password_reset_complete",
  points: 5,
  duration: 15 * 60,
  blockDuration: 30 * 60,
})

export const passwordResetPinLimiter = createLimiter({
  keyPrefix: "password_reset_pin",
  points: 5,
  duration: 30 * 60,
  blockDuration: 60 * 60,
})

// Renewals are rare by nature, so a tight budget still never inconveniences a
// legitimate member while blocking abusive retry loops. IP-keyed limiter for
// the transport, plus a per-identity limiter enforced in the handler.
export const renewalLimiter = createLimiter({
  keyPrefix: "renewal",
  points: 3,
  duration: 15 * 60,
  blockDuration: 60 * 60,
})

export const renewalIdentifierLimiter = createLimiter({
  keyPrefix: "renewal_identifier",
  points: 3,
  duration: 15 * 60,
  blockDuration: 60 * 60,
})

export interface RateLimitResult {
  allowed: boolean
  remainingPoints: number
  msBeforeNext: number
  consumedPoints: number
}

interface LimiterResponseLike {
  remainingPoints: number
  msBeforeNext: number
  consumedPoints: number
}

const limiterInstances = new Map<string, RateLimiterMemory>()

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("base64url")
}

function normalizeKeyPart(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "unknown"
  }

  return String(value).trim().toLowerCase()
}

function keyLogId(key: string): string {
  return hashValue(key).slice(0, 12)
}

export function buildRateLimitKey(
  ...parts: Array<string | number | null | undefined>
): string {
  return hashValue(parts.map(normalizeKeyPart).join("\0"))
}

function getLimiterInstance(limiter: RateLimiterDefinition): RateLimiterMemory {
  const existing = limiterInstances.get(limiter.keyPrefix)
  if (existing) {
    return existing
  }

  const next = new RateLimiterMemory({
    keyPrefix: limiter.keyPrefix,
    points: limiter.points,
    duration: limiter.duration,
    blockDuration: limiter.blockDuration,
  })
  limiterInstances.set(limiter.keyPrefix, next)
  return next
}

function isLimiterResponseLike(value: unknown): value is LimiterResponseLike {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<LimiterResponseLike>
  return (
    typeof candidate.remainingPoints === "number" &&
    typeof candidate.msBeforeNext === "number" &&
    typeof candidate.consumedPoints === "number"
  )
}

function toRateLimitResult(
  result: LimiterResponseLike,
  allowed: boolean,
): RateLimitResult {
  return {
    allowed,
    remainingPoints: Math.max(0, result.remainingPoints),
    msBeforeNext: Math.max(0, result.msBeforeNext),
    consumedPoints: result.consumedPoints,
  }
}

export async function consumeRateLimit(
  limiter: RateLimiterDefinition,
  key: string,
  pointsToConsume: number = 1,
): Promise<RateLimitResult> {
  try {
    const result = await getLimiterInstance(limiter).consume(
      key,
      pointsToConsume,
    )
    return toRateLimitResult(result, true)
  } catch (error) {
    if (isLimiterResponseLike(error)) {
      logger.warn(
        {
          keyId: keyLogId(key),
          limiter: limiter.keyPrefix,
          msBeforeNext: error.msBeforeNext,
        },
        "Rate limit exceeded",
      )
      return toRateLimitResult(error, false)
    }

    logger.error(
      { error, keyId: keyLogId(key), limiter: limiter.keyPrefix },
      "Rate limiter error",
    )
    return {
      allowed: false,
      remainingPoints: 0,
      msBeforeNext: 60_000,
      consumedPoints: 0,
    }
  }
}
