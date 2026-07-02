import type {
  ProfileRenewalMode,
  ProfileRenewalPolicy,
  RenewalUnavailableReason,
} from "@/lib/renewal-types"

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

export type RenewalEvaluation =
  | {
      canRenew: false
      reason: RenewalUnavailableReason
      mode: ProfileRenewalMode
      expiresAt: Date | null
      maxExpiresAt: Date | null
      earliestRenewAt: Date | null
    }
  | {
      canRenew: true
      mode: ProfileRenewalMode
      expiresAt: Date
      nextExpiresAt: Date
      maxExpiresAt: Date | null
      earliestRenewAt: Date | null
    }

/**
 * Decide whether a member may self-renew and, if so, the exact next expiry.
 *
 * This is the privilege boundary for self-service renewal: the extension is
 * always derived here from the profile policy and the member's `createdAt`,
 * never from client input. Cap semantics are an **absolute lifetime ceiling**
 * (`createdAt + maxTotalDays`): each renewal pushes expiry to `now +
 * extendByDays` but never past that ceiling. When `maxTotalDays` is unset there
 * is no ceiling and the per-renewal window plus rate limiting are the only
 * bounds.
 */
export function evaluateRenewal(input: {
  renewal: ProfileRenewalPolicy | undefined
  createdAt: Date
  expiresAt: Date | null
  now?: Date
}): RenewalEvaluation {
  const now = input.now ?? new Date()
  const renewal = input.renewal
  const mode = renewal?.mode ?? "disabled"

  const unavailable = (
    reason: RenewalUnavailableReason,
    details?: { maxExpiresAt?: Date | null; earliestRenewAt?: Date | null },
  ): RenewalEvaluation => ({
    canRenew: false,
    reason,
    mode,
    expiresAt: input.expiresAt,
    maxExpiresAt: details?.maxExpiresAt ?? null,
    earliestRenewAt: details?.earliestRenewAt ?? null,
  })

  // Disabled or misconfigured (no positive extension) means no self-renewal.
  const extendByDays = renewal?.extendByDays
  if (mode !== "self-serve" || !extendByDays || extendByDays <= 0) {
    return unavailable("disabled")
  }

  // Admins and never-expiring members have nothing to renew.
  if (input.expiresAt === null) {
    return unavailable("no-expiry")
  }

  const expiresAt = input.expiresAt
  const maxExpiresAt =
    renewal.maxTotalDays != null
      ? new Date(input.createdAt.getTime() + renewal.maxTotalDays * MS_PER_DAY)
      : null
  const earliestRenewAt =
    renewal.minLeadTimeHours != null
      ? new Date(expiresAt.getTime() - renewal.minLeadTimeHours * MS_PER_HOUR)
      : null

  const proposed = new Date(now.getTime() + extendByDays * MS_PER_DAY)
  const nextExpiresAt =
    maxExpiresAt && proposed.getTime() > maxExpiresAt.getTime()
      ? maxExpiresAt
      : proposed

  // No forward progress possible (ceiling already met): cannot extend.
  if (nextExpiresAt.getTime() <= expiresAt.getTime()) {
    return unavailable("cap-reached", { maxExpiresAt, earliestRenewAt })
  }

  // Too early relative to the configured lead-time window.
  if (earliestRenewAt && now.getTime() < earliestRenewAt.getTime()) {
    return unavailable("outside-window", { maxExpiresAt, earliestRenewAt })
  }

  return {
    canRenew: true,
    mode,
    expiresAt,
    nextExpiresAt,
    maxExpiresAt,
    earliestRenewAt,
  }
}
