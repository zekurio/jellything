export type PlaceholderValues = Record<string, string | number>

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g

// Placeholders shared by every customizable text surface (email messages,
// member onboarding pages). Per-surface extras extend this list.
export const COMMON_PLACEHOLDERS = [
  "serverName",
  "appUrl",
  "username",
  "email",
] as const

export type CommonPlaceholder = (typeof COMMON_PLACEHOLDERS)[number]

// Member onboarding pages additionally expose the connected media services
// so pages can link members straight to Jellyfin and Seerr.
export const ONBOARDING_PLACEHOLDERS = [
  ...COMMON_PLACEHOLDERS,
  "jellyfinName",
  "jellyfinUrl",
  "seerrUrl",
] as const

export type OnboardingPlaceholder = (typeof ONBOARDING_PLACEHOLDERS)[number]

export function formatPlaceholder(key: string): string {
  return `{{${key}}}`
}

// Unknown tokens are left verbatim so typos stay visible instead of
// silently disappearing from the rendered text. Object.hasOwn keeps
// prototype members ({{constructor}}, {{toString}}) from resolving.
export function interpolatePlaceholders(
  template: string,
  values: PlaceholderValues,
): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  )
}
