import type { Locale as DateFnsLocale } from "date-fns"
import { de, enUS } from "date-fns/locale"

import type { Locale } from "./locales"

const DATE_FNS_LOCALES: Record<Locale, DateFnsLocale> = {
  en: enUS,
  de,
}

export function getDateFnsLocale(locale: Locale): DateFnsLocale {
  return DATE_FNS_LOCALES[locale] ?? enUS
}
