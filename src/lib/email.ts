import type { BrandingImageUpdate } from "@/lib/branding"

export const EMAIL_MESSAGE_TYPES = [
  "verifyEmail",
  "passwordReset",
  "expiryWarning",
  "accountDisabled",
  "accountDeleted",
  "accountRenewed",
] as const

export type EmailMessageType = (typeof EMAIL_MESSAGE_TYPES)[number]

export const DEFAULT_EMAIL_BRANDING = {
  accentColor: "#3A64F2",
  pageBackgroundColor: "#F4F4F7",
} as const

export interface EmailBrandingDraft {
  accentColor: string
  pageBackgroundColor: string
  logo: BrandingImageUpdate
}
