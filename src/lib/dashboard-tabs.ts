export const DASHBOARD_TABS = [
  "invites",
  "profiles",
  "history",
  "users",
  "settings",
] as const
export const DASHBOARD_SETTINGS_TABS = [
  "jellyfin",
  "seerr",
  "memberOnboarding",
  "app",
  "email",
] as const

export type DashboardTab = (typeof DASHBOARD_TABS)[number]
export type DashboardSettingsTab = (typeof DASHBOARD_SETTINGS_TABS)[number]

export const DEFAULT_DASHBOARD_TAB: DashboardTab = "invites"
export const DEFAULT_DASHBOARD_SETTINGS_TAB: DashboardSettingsTab = "jellyfin"

export function isDashboardTab(value: string): value is DashboardTab {
  return DASHBOARD_TABS.includes(value as DashboardTab)
}

export function isDashboardSettingsTab(
  value: string,
): value is DashboardSettingsTab {
  return DASHBOARD_SETTINGS_TABS.includes(value as DashboardSettingsTab)
}

export function getDashboardTabPath(
  tab: DashboardTab,
  settingsTab: DashboardSettingsTab = DEFAULT_DASHBOARD_SETTINGS_TAB,
): string {
  if (tab === "settings") {
    return `/dashboard/settings/${settingsTab}`
  }

  return `/dashboard/${tab}`
}
