"use client"

import { useHydrated } from "@/hooks/use-hydrated"
import { formatDateTime, formatRelativeTime } from "@/lib/utils"

type RelativeTimeProps = {
  date: string | null
  locale?: string
  fallback?: string
}

export function RelativeTime({
  date,
  locale,
  fallback = "",
}: RelativeTimeProps) {
  const hydrated = useHydrated()

  if (!date) {
    return fallback
  }

  const absoluteLabel = formatDateTime(date, locale)
  const label = hydrated ? formatRelativeTime(date, locale) : absoluteLabel

  return (
    <time dateTime={date} title={absoluteLabel} suppressHydrationWarning>
      {label}
    </time>
  )
}
