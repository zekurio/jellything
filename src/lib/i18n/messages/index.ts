import type { Locale } from "../locales"
import { de } from "./de"
import { en } from "./en"
import type { Messages } from "./types"

export type { Messages, MessageKey } from "./types"

/**
 * All available message bundles keyed by locale.
 * Add new locales here when adding translations.
 */
export const messages: Record<Locale, Messages> = {
  en,
  de,
}

/**
 * Get messages for a specific locale.
 */
export function getMessages(locale: Locale): Messages {
  return messages[locale]
}
