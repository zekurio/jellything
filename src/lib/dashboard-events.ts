export const DASHBOARD_PROFILES_CHANGED_EVENT = "dashboard:profiles-changed"

export function notifyProfilesChanged(): void {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new Event(DASHBOARD_PROFILES_CHANGED_EVENT))
}
