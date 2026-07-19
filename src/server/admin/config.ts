import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import {
  configManager,
  type JellyfinConfig,
  type SeerrConfig,
  type MemberOnboardingConfig,
} from "@/lib/server/config.server"
import type {
  UpdateJellyfinConfigInput,
  UpdateMemberOnboardingConfigInput,
  UpdateSeerrConfigInput,
} from "@/server/api/schemas/common-schemas"
import {
  assertJellyfinConnection,
  assertSeerrConnection,
  JellyfinConnectionValidationError,
  SeerrConnectionValidationError,
} from "@/server/config-validation"
import { createChildLogger } from "@/server/logger"
import { getSeerrStatus } from "@/server/seerr"

const log = createChildLogger({ module: "admin-config" })
const CONNECTION_TEST_TIMEOUT_MS = 8000

export async function updateJellyfinConfigService(
  data: UpdateJellyfinConfigInput,
): Promise<ActionResult<void>> {
  try {
    if (!configManager.isConfigured()) {
      return error(ErrorCode.CONFIG_NOT_INITIALIZED)
    }

    const updates: Partial<JellyfinConfig> = {}

    if (data.internalUrl !== undefined) {
      updates.internalUrl = data.internalUrl
    }
    if (data.apiKey !== undefined) {
      updates.apiKey = data.apiKey
    }
    if (Object.hasOwn(data, "externalUrl")) {
      updates.externalUrl = data.externalUrl ?? undefined
    }
    if (Object.hasOwn(data, "configPath")) {
      updates.configPath = data.configPath ?? undefined
    }
    if (Object.hasOwn(data, "displayName")) {
      updates.displayName = data.displayName ?? undefined
    }

    const shouldValidateConnection =
      updates.internalUrl !== undefined || updates.apiKey !== undefined
    if (shouldValidateConnection) {
      const current = configManager.jellyfin
      const nextInternalUrl = updates.internalUrl ?? current.internalUrl
      const nextApiKey = updates.apiKey ?? current.apiKey
      await assertJellyfinConnection(nextInternalUrl, nextApiKey)
    }

    await configManager.setJellyfin(updates)
    return success(undefined)
  } catch (e) {
    if (e instanceof JellyfinConnectionValidationError) {
      return error(
        ErrorCode.JELLYFIN_ERROR,
        "Failed to connect to Jellyfin with provided settings",
      )
    }
    return error(ErrorCode.OPERATION_FAILED, "Failed to update Jellyfin config")
  }
}

export async function getSeerrConfigService(): Promise<
  ActionResult<{
    internalUrl: string | undefined
    externalUrl: string | undefined
    apiKeySet: boolean
  }>
> {
  if (!configManager.isConfigured()) {
    return error(ErrorCode.CONFIG_NOT_INITIALIZED)
  }

  const config = configManager.seerr
  return success({
    internalUrl: config?.internalUrl,
    externalUrl: config?.externalUrl,
    apiKeySet: Boolean(config?.apiKey),
  })
}

export async function updateSeerrConfigService(
  data: UpdateSeerrConfigInput,
): Promise<ActionResult<void>> {
  try {
    if (!configManager.isConfigured()) {
      return error(ErrorCode.CONFIG_NOT_INITIALIZED)
    }

    if (!data) {
      await configManager.setSeerr(undefined)
      return success(undefined)
    }

    const existing = configManager.seerr
    const internalUrl = data.internalUrl ?? existing?.internalUrl
    const apiKey = data.apiKey ?? existing?.apiKey

    if (!internalUrl || !apiKey) {
      return error(
        ErrorCode.VALIDATION_FAILED,
        "Internal URL and API key are required",
      )
    }

    const nextConfig: SeerrConfig = {
      internalUrl,
      externalUrl: Object.hasOwn(data, "externalUrl")
        ? (data.externalUrl ?? undefined)
        : existing?.externalUrl,
      apiKey,
    }

    await assertSeerrConnection(nextConfig)
    await configManager.setSeerr(nextConfig)
    return success(undefined)
  } catch (e) {
    if (e instanceof SeerrConnectionValidationError) {
      return error(
        ErrorCode.SEERR_ERROR,
        "Failed to connect to Seerr with provided settings",
      )
    }
    log.error({ err: e }, "Failed to update Seerr config")
    return error(ErrorCode.OPERATION_FAILED, "Failed to update Seerr config")
  }
}

export async function testSeerrConnectionService(): Promise<
  ActionResult<{ version?: string }>
> {
  try {
    if (!configManager.isConfigured()) {
      return error(ErrorCode.CONFIG_NOT_INITIALIZED)
    }

    const status = await getSeerrStatus({
      signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
    })
    return success({ version: status.version })
  } catch (err) {
    log.warn({ err }, "Seerr connection test failed")
    return error(ErrorCode.SEERR_ERROR, "Failed to connect to Seerr")
  }
}

export async function updateMemberOnboardingConfigService(
  data: UpdateMemberOnboardingConfigInput,
): Promise<ActionResult<void>> {
  if (!configManager.isConfigured()) {
    return error(ErrorCode.CONFIG_NOT_INITIALIZED)
  }

  const nextConfig: MemberOnboardingConfig = data
  await configManager.setMemberOnboarding(nextConfig)
  return success(undefined)
}
