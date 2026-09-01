import { configManager } from "@/lib/server/config.server"
import { createChildLogger } from "@/server/logger"
import { startPasswordResetNotificationWatcher } from "@/server/password-reset-notifications"
import {
  runUserStartupMaintenance,
  startUserExpiryMaintenanceScheduler,
} from "@/server/user-lifecycle"

const log = createChildLogger({ module: "startup" })

let startupPromise: Promise<void> | null = null

export function runStartupTasks(): void {
  if (startupPromise !== null) {
    return
  }

  if (!configManager.isConfigured()) {
    if (configManager.needsOnboarding()) {
      log.info("Skipping startup tasks until onboarding is complete")
    } else if (configManager.hasError()) {
      log.warn(
        { error: configManager.getError() },
        "Skipping startup tasks due to config error",
      )
    }

    return
  }

  startupPromise = (async () => {
    log.info("Running startup tasks")
    startPasswordResetNotificationWatcher()
    startUserExpiryMaintenanceScheduler()
    await runUserStartupMaintenance()

    log.info("Jellyfin user sync complete")
  })().catch((err) => {
    log.error({ err }, "Startup tasks failed")
    startupPromise = null
  })
}
