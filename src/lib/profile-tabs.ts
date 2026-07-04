export const PROFILE_TABS = ["general", "password", "preferences"] as const

export type ProfileTab = (typeof PROFILE_TABS)[number]

export const DEFAULT_PROFILE_TAB: ProfileTab = "general"

const PROFILE_TAB_VALUES: ReadonlySet<string> = new Set(PROFILE_TABS)

export function isProfileTab(value: string): value is ProfileTab {
  return PROFILE_TAB_VALUES.has(value)
}

export function getProfileTabPath(tab: ProfileTab): string {
  return `/profile/${tab}`
}
