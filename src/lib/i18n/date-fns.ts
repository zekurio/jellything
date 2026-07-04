import type { Locale } from "date-fns"
import { de, enUS } from "date-fns/locale"

import type { SUPPORTED_LOCALES } from "./locales"

type AppLocale = (typeof SUPPORTED_LOCALES)[number]

const DATE_FNS_LOCALES: Record<AppLocale, Locale> = {
  en: enUS,
  de,
}

export function getDateFnsLocale(locale: AppLocale): Locale {
  return DATE_FNS_LOCALES[locale] ?? enUS
}
