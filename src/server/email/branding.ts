import "@tanstack/react-start/server-only"
import {
  getContrastRatio,
  getReadableForeground,
  normalizeHexColor,
  parseHexColor,
  relativeLuminance,
} from "@/lib/branding"
import { DEFAULT_EMAIL_BRANDING } from "@/lib/email"
import type {
  BrandingImageConfig,
  EmailConfig,
} from "@/lib/server/config.server"

export interface ResolvedEmailTheme {
  accent: string
  accentForeground: string
  accentText: string
  pageBackground: string
  surface: string
  text: string
  mutedText: string
  border: string
}

export interface ResolvedEmailBranding {
  theme: ResolvedEmailTheme
  logo?: BrandingImageConfig
}

// Draft-based branding used by the settings preview/test flow; when present
// it fully replaces the saved email branding (unset fields inherit the app
// branding, then the defaults).
export interface EmailBrandingOverride {
  accentColor?: string
  pageBackgroundColor?: string
  logo?: BrandingImageConfig
}

function toHexColor(color: {
  red: number
  green: number
  blue: number
}): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase()

  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`
}

function mixColors(from: string, to: string, amount: number): string {
  const start = parseHexColor(from)
  const end = parseHexColor(to)
  return toHexColor({
    red: start.red + (end.red - start.red) * amount,
    green: start.green + (end.green - start.green) * amount,
    blue: start.blue + (end.blue - start.blue) * amount,
  })
}

function ensureContrast(
  color: string,
  background: string,
  minimumRatio: number,
): string {
  if (getContrastRatio(color, background) >= minimumRatio) {
    return normalizeHexColor(color)
  }

  const target = getReadableForeground(background)
  let low = 0
  let high = 1
  let candidate: string = target

  for (let iteration = 0; iteration < 16; iteration += 1) {
    const amount = (low + high) / 2
    const mixed = mixColors(color, target, amount)
    if (getContrastRatio(mixed, background) >= minimumRatio) {
      candidate = mixed
      high = amount
    } else {
      low = amount
    }
  }

  return candidate
}

export function resolveEmailTheme(input?: {
  accentColor?: string
  pageBackgroundColor?: string
}): ResolvedEmailTheme {
  const accent = normalizeHexColor(
    input?.accentColor ?? DEFAULT_EMAIL_BRANDING.accentColor,
  )
  const pageBackground = normalizeHexColor(
    input?.pageBackgroundColor ?? DEFAULT_EMAIL_BRANDING.pageBackgroundColor,
  )
  const darkSurface = relativeLuminance(pageBackground) < 0.2
  const surface = darkSurface ? "#17171D" : "#FFFFFF"
  const text = darkSurface ? "#F5F5F7" : "#24242C"
  const mutedBase = darkSurface ? "#A2A2B0" : "#6C6B75"
  const borderBase = darkSurface ? "#555562" : "#B5B4BE"

  return {
    accent,
    accentForeground: getReadableForeground(accent),
    accentText: ensureContrast(accent, surface, 4.5),
    pageBackground,
    surface,
    text,
    mutedText: ensureContrast(mutedBase, surface, 4.5),
    border: ensureContrast(borderBase, surface, 3),
  }
}

// A preview/test draft fully replaces the saved email branding; unset
// fields fall back to the built-in defaults.
export function resolveEmailBranding(
  emailConfig?: EmailConfig,
  override?: EmailBrandingOverride,
): ResolvedEmailBranding {
  const branding = override ?? emailConfig?.branding
  return {
    theme: resolveEmailTheme({
      accentColor: branding?.accentColor,
      pageBackgroundColor: branding?.pageBackgroundColor,
    }),
    logo: branding?.logo,
  }
}
