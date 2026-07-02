"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"

import type { Locale } from "./locales"
import { DEFAULT_LOCALE } from "./locales"
import type { MessageKey } from "./messages"
import { createTranslator, type TranslationValues } from "./translator"

interface LocaleContextValue {
  locale: Locale
  t: (key: MessageKey, values?: TranslationValues) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

interface LocaleProviderProps {
  children: ReactNode
  locale: Locale
}

/**
 * Provider component that makes locale and translation function available to the app.
 */
export function LocaleProvider({ children, locale }: LocaleProviderProps) {
  const value = useMemo<LocaleContextValue>(() => {
    const t = createTranslator(locale)
    return { locale, t }
  }, [locale])

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  )
}

/**
 * Hook to access the current locale.
 */
export function useLocale(): Locale {
  const context = useContext(LocaleContext)
  if (!context) {
    // Return default locale when used outside provider (e.g., during SSR)
    return DEFAULT_LOCALE
  }
  return context.locale
}

/**
 * Hook to access the translation function.
 * Returns a function t(key, values?) that translates message keys.
 */
export function useTranslations(): (
  key: MessageKey,
  values?: TranslationValues,
) => string {
  const context = useContext(LocaleContext)
  if (!context) {
    return (key: MessageKey) => key
  }
  return context.t
}

/**
 * Combined hook that returns both locale and translation function.
 */
export function useI18n(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) {
    const t = createTranslator(DEFAULT_LOCALE)
    return { locale: DEFAULT_LOCALE, t }
  }
  return context
}
