import { configManager, type AppConfig } from "@/lib/server/config.server"
import type { UpdateAppSettingsInput } from "@/server/api/schemas/common-schemas"
export {
  getSeerrConfigService,
  testSeerrConnectionService,
  updateEmailConfigService,
  updateJellyfinConfigService,
  updateMemberOnboardingConfigService,
  updateSeerrConfigService,
} from "@/server/admin/config-service"

export async function updateAppConfig(payload: UpdateAppSettingsInput) {
  const updates: Partial<AppConfig> = {}

  if (payload.title !== undefined) {
    updates.title = payload.title
  }

  if (payload.description !== undefined) {
    updates.description = payload.description
  }

  if (payload.defaultLocale !== undefined) {
    updates.defaultLocale = payload.defaultLocale
  }

  if (Object.hasOwn(payload, "url")) {
    updates.url = payload.url ?? undefined
  }

  await configManager.setApp(updates)
  return configManager.app
}
