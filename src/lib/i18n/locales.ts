/**
 * Supported locales for the application.
 * Add new locales here when adding translations.
 */
export const SUPPORTED_LOCALES = ["en", "de"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

/**
 * Human-readable labels for each locale.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
}

/**
 * Check if a string is a valid locale.
 */
export function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale)
}

/**
 * Get a valid locale from a string, falling back to default.
 */
export function parseLocale(locale: string | null | undefined): Locale {
  if (locale && isValidLocale(locale)) {
    return locale
  }
  return DEFAULT_LOCALE
}
