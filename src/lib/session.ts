import type { Locale } from "@/lib/i18n"

export interface SessionData {
  userId: string
  name: string
  avatarUrl: string
  isAdmin: boolean
  email: string | null
  emailVerified: boolean
  locale: Locale | null
  createdAt: string
}
