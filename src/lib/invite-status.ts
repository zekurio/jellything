export const inviteStatusValues = [
  "active",
  "disabled",
  "expiring",
  "depleting",
  "expired",
  "exhausted",
] as const

export type InviteStatus = (typeof inviteStatusValues)[number]
export type InviteGroup = "active" | "attention" | "inactive"

type InviteStatusInput = {
  isDisabled: boolean
  useLimit: number | null
  useCount: number
  expiresAt: Date | string | null
}

export function deriveInviteStatus(invite: InviteStatusInput): InviteStatus {
  const expiresAtDate = getExpiresAtDate(invite.expiresAt)

  if (invite.isDisabled) {
    return "disabled"
  }
  if (expiresAtDate && expiresAtDate <= new Date()) {
    return "expired"
  }
  if (invite.useLimit !== null && invite.useCount >= invite.useLimit) {
    return "exhausted"
  }

  const remaining =
    invite.useLimit !== null ? invite.useLimit - invite.useCount : null
  const isNearExhaustion =
    invite.useLimit !== null &&
    invite.useLimit > 0 &&
    remaining !== null &&
    (remaining <= 1 || invite.useCount / invite.useLimit >= 0.8)

  const isNearExpiry =
    expiresAtDate !== null &&
    expiresAtDate.getTime() - Date.now() <= 24 * 60 * 60 * 1000

  if (isNearExhaustion) {
    return "depleting"
  }
  if (isNearExpiry) {
    return "expiring"
  }

  return "active"
}

export function classifyInviteStatus(status: InviteStatus): InviteGroup {
  switch (status) {
    case "active":
      return "active"
    case "expiring":
    case "depleting":
      return "attention"
    case "disabled":
    case "expired":
    case "exhausted":
      return "inactive"
    default:
      return "inactive"
  }
}

function getExpiresAtDate(expiresAt: Date | string | null): Date | null {
  if (expiresAt === null) {
    return null
  }
  if (expiresAt instanceof Date) {
    return Number.isNaN(expiresAt.getTime()) ? null : expiresAt
  }

  const date = new Date(expiresAt)
  return Number.isNaN(date.getTime()) ? null : date
}
