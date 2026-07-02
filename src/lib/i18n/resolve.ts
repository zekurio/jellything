import { isValidLocale, type Locale } from "./locales"

/**
 * Resolve the effective locale for a user.
 * Priority: user preference -> app default.
 *
 * @param userLocale - The user's locale preference (null means use default)
 * @param appDefaultLocale - The app's default locale from config
 * @returns The resolved locale
 */
export function resolveLocale(
  userLocale: string | null | undefined,
  appDefaultLocale: Locale,
): Locale {
  if (userLocale && isValidLocale(userLocale)) {
    return userLocale
  }

  return appDefaultLocale
}
