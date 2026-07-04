import { cache } from "react"

import type {
  AppBootstrapData,
  DashboardSettingsBootstrap,
} from "@/lib/bootstrap-data"
import { configManager } from "@/lib/server/config.server"
import { isEmailConfigured } from "@/server/email"
import { resolveSessionFromCookies } from "@/server/session-resolver"
import { runStartupTasks } from "@/server/startup"

runStartupTasks()

export const getAppBootstrap = cache(async (): Promise<AppBootstrapData> => {
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
    app: configManager.isConfigured() ? configManager.app : null,
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
      app: configManager.app,
      email: configManager.email
        ? {
            from: configManager.email.from,
            smtp: configManager.email.smtp
              ? {
                  host: configManager.email.smtp.host,
                  port: configManager.email.smtp.port,
                  secure: configManager.email.smtp.secure ?? false,
                  username: configManager.email.smtp.username,
                }
              : undefined,
            smtpPasswordSet: Boolean(configManager.email.smtp?.password),
          }
        : {
            from: undefined,
            smtp: undefined,
            smtpPasswordSet: false,
          },
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
