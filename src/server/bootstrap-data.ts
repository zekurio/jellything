import { cache } from "react"

import type {
  AppBootstrapData,
  DashboardSettingsBootstrap,
} from "@/lib/bootstrap-data"
import { configManager } from "@/lib/server/config.server"
import { projectAppSettingsDto } from "@/server/admin/app"
import { projectEmailConfigDto } from "@/server/admin/email"
import { isEmailConfigured } from "@/server/email"
import { ensureApplicationReady } from "@/server/readiness"
import { resolveSessionFromCookies } from "@/server/session-resolver"
import { runStartupTasks } from "@/server/startup"

runStartupTasks()

export const getAppBootstrap = cache(async (): Promise<AppBootstrapData> => {
  await ensureApplicationReady()
  const resolvedSession = await resolveSessionFromCookies({
    validationMode: "if-stale",
    allowStaleOnJellyfinFailure: true,
    touch: false,
  })
  const session = resolvedSession?.session ?? null

  return {
    configured: configManager.isConfigured(),
    needsOnboarding: configManager.needsOnboarding(),
    configError: session?.isAdmin ? configManager.getError() : null,
    app: configManager.isConfigured() ? projectAppSettingsDto() : null,
    emailConfigured: isEmailConfigured(),
    session,
    shouldClearAuthCookies: resolvedSession?.shouldClearCookie ?? false,
  }
})

export const getDashboardSettingsBootstrap = cache(
  async (): Promise<DashboardSettingsBootstrap | null> => {
    if (!configManager.isConfigured()) {
      return null
    }

    return {
      app: projectAppSettingsDto(),
      email: projectEmailConfigDto(),
      jellyfin: {
        internalUrl: configManager.jellyfin.internalUrl,
        externalUrl: configManager.jellyfin.externalUrl,
        apiKeySet: Boolean(configManager.jellyfin.apiKey),
        configPath: configManager.jellyfin.configPath,
      },
      seerr: {
        internalUrl: configManager.seerr?.internalUrl,
        externalUrl: configManager.seerr?.externalUrl,
        apiKeySet: Boolean(configManager.seerr?.apiKey),
      },
      memberOnboarding: configManager.memberOnboarding,
    }
  },
)
