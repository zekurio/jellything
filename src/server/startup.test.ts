import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  startPasswordResetNotificationWatcher:
    vi.fn<
      typeof import("@/server/password-reset-notifications").startPasswordResetNotificationWatcher
    >(),
  startUserExpiryMaintenanceScheduler:
    vi.fn<
      typeof import("@/server/user-lifecycle").startUserExpiryMaintenanceScheduler
    >(),
  runUserStartupMaintenance:
    vi.fn<typeof import("@/server/user-lifecycle").runUserStartupMaintenance>(),
}))

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    isConfigured: () => true,
    needsOnboarding: () => false,
    hasError: () => false,
    getError: () => null,
  },
}))

vi.mock("@/server/password-reset-notifications", () => ({
  startPasswordResetNotificationWatcher:
    mocks.startPasswordResetNotificationWatcher,
}))

vi.mock("@/server/user-lifecycle", () => ({
  runUserStartupMaintenance: mocks.runUserStartupMaintenance,
  startUserExpiryMaintenanceScheduler:
    mocks.startUserExpiryMaintenanceScheduler,
}))

describe("startup tasks", () => {
  it("starts one password reset watcher", async () => {
    mocks.runUserStartupMaintenance.mockResolvedValue(undefined)
    const startup = await import("@/server/startup")

    startup.runStartupTasks()
    startup.runStartupTasks()

    await vi.waitFor(() => {
      expect(mocks.runUserStartupMaintenance).toHaveBeenCalledOnce()
    })
    expect(mocks.startPasswordResetNotificationWatcher).toHaveBeenCalledOnce()
    expect(mocks.startUserExpiryMaintenanceScheduler).toHaveBeenCalledOnce()
  })
})
