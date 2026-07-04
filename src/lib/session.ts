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

/**
 * Single source of truth for "this session may act as an administrator".
 * Both the server auth helpers (`requireAdmin`) and the ORPC admin middleware
 * gate on this predicate so the admin rule lives in exactly one place.
 */
export function canActAsAdmin(session: SessionData): boolean {
  return session.isAdmin
}
