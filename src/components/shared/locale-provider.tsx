"use client"

import type { ReactNode } from "react"

import { LocaleProvider, type Locale } from "@/lib/i18n"

interface LocaleProviderWrapperProps {
  children: ReactNode
  locale: Locale
}

export function LocaleProviderWrapper({
  children,
  locale,
}: LocaleProviderWrapperProps) {
  return <LocaleProvider locale={locale}>{children}</LocaleProvider>
}
