export const PROFILE_TABS = ["general", "password", "preferences"] as const

export type ProfileTab = (typeof PROFILE_TABS)[number]

export const DEFAULT_PROFILE_TAB: ProfileTab = "general"

export function isProfileTab(value: string): value is ProfileTab {
  return PROFILE_TABS.includes(value as ProfileTab)
}

export function getProfileTabPath(tab: ProfileTab): string {
  return `/profile/${tab}`
}
