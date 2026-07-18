export const BRANDING_IMAGE_MIME_TYPES = ["image/png", "image/jpeg"] as const
export type BrandingImageMimeType = (typeof BRANDING_IMAGE_MIME_TYPES)[number]

export const BRANDING_IMAGE_MAX_BYTES = 256 * 1024
export const BRANDING_IMAGE_MAX_BASE64_LENGTH =
  Math.ceil(BRANDING_IMAGE_MAX_BYTES / 3) * 4

// Wordmark logos fit the email header.
export const BRANDING_LOGO_MAX_WIDTH = 1200
export const BRANDING_LOGO_MAX_HEIGHT = 600

export const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/

export interface BrandingImageReplacement {
  mimeType: BrandingImageMimeType
  base64: string
}

export type BrandingImageUpdate =
  | { action: "keep" }
  | { action: "remove" }
  | ({ action: "replace" } & BrandingImageReplacement)

export function normalizeHexColor(value: string): string {
  return value.trim().toUpperCase()
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(normalizeHexColor(value))
}

interface RgbColor {
  red: number
  green: number
  blue: number
}

export function parseHexColor(value: string): RgbColor {
  const normalized = normalizeHexColor(value)
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

function linearizeChannel(channel: number): number {
  const value = channel / 255
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(color: string): number {
  const { red, green, blue } = parseHexColor(color)
  return (
    0.2126 * linearizeChannel(red) +
    0.7152 * linearizeChannel(green) +
    0.0722 * linearizeChannel(blue)
  )
}

export function getContrastRatio(
  foreground: string,
  background: string,
): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  )
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  )
  return (lighter + 0.05) / (darker + 0.05)
}

export function getReadableForeground(
  background: string,
): "#000000" | "#FFFFFF" {
  return getContrastRatio("#000000", background) >=
    getContrastRatio("#FFFFFF", background)
    ? "#000000"
    : "#FFFFFF"
}
