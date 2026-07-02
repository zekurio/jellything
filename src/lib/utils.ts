import { type ClassValue, clsx } from "clsx"
import { isValid, parseISO } from "date-fns"
import { twMerge } from "tailwind-merge"

import { parseLocale } from "@/lib/i18n"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function toDate(value: Date | string): Date | null {
  const dateObj = typeof value === "string" ? parseISO(value) : value
  if (!isValid(dateObj)) {
    return null
  }
  return dateObj
}

export function formatRelativeTime(
  dateString: string | null,
  locale?: string,
): string {
  if (!dateString) return ""
  const date = toDate(dateString)
  if (!date) return dateString

  const rtf = new Intl.RelativeTimeFormat(parseLocale(locale), {
    numeric: "auto",
  })
  const now = Date.now()
  const diffSeconds = Math.round((date.getTime() - now) / 1000)
  const absSeconds = Math.abs(diffSeconds)

  if (absSeconds < 60) {
    return rtf.format(diffSeconds, "second")
  }

  const diffMinutes = Math.round(diffSeconds / 60)
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute")
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour")
  }

  const diffDays = Math.round(diffHours / 24)
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, "day")
  }

  const diffMonths = Math.round(diffDays / 30)
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, "month")
  }

  const diffYears = Math.round(diffMonths / 12)
  return rtf.format(diffYears, "year")
}

export function formatDate(
  date: Date | string,
  locale?: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  },
): string {
  const dateObj = toDate(date)
  if (!dateObj) {
    return typeof date === "string" ? date : ""
  }

  return new Intl.DateTimeFormat(parseLocale(locale), options).format(dateObj)
}

export function formatDateTime(
  date: Date | string,
  locale?: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  const dateObj = toDate(date)
  if (!dateObj) {
    return typeof date === "string" ? date : ""
  }

  return new Intl.DateTimeFormat(parseLocale(locale), options).format(dateObj)
}

export function formatTime(
  date: Date | string,
  locale?: string,
  options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  },
): string {
  const dateObj = toDate(date)
  if (!dateObj) {
    return typeof date === "string" ? date : ""
  }

  return new Intl.DateTimeFormat(parseLocale(locale), options).format(dateObj)
}

export function formatMemberSince(
  date: Date | string,
  locale?: string,
): string {
  return formatDate(date, locale, { month: "long", year: "numeric" })
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
