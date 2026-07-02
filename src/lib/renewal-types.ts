/**
 * Shared, client-safe renewal types.
 *
 * These live in `@/lib` (no server-only imports) so both the Drizzle schema,
 * the server renewal logic, and the profile UI can reference the same shapes
 * without pulling server modules into the client bundle.
 */

export type ProfileRenewalMode = "disabled" | "self-serve"

/**
 * Optional self-service renewal configuration stored on a profile policy.
 * All fields beyond `mode` only apply to `mode: "self-serve"`.
 */
export interface ProfileRenewalPolicy {
  mode: ProfileRenewalMode
  /** Days each renewal adds to the expiry (from the moment of renewal). */
  extendByDays?: number
  /** Absolute lifetime ceiling: expiry may never exceed createdAt + this. */
  maxTotalDays?: number
  /** Only allow renewal within this many hours before the current expiry. */
  minLeadTimeHours?: number
}

/** Why a member cannot self-renew right now. */
export type RenewalUnavailableReason =
  | "disabled"
  | "no-expiry"
  | "outside-window"
  | "cap-reached"

/** Serializable expiry + renewal affordance surfaced to the profile UI. */
export interface MyExpiryInfo {
  expiresAt: string | null
  createdAt: string
  renewalMode: ProfileRenewalMode
  canRenew: boolean
  reason: RenewalUnavailableReason | null
  nextExpiresAt: string | null
  maxExpiresAt: string | null
  earliestRenewAt: string | null
}
