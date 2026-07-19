import "@tanstack/react-start/server-only"
import { configManager } from "@/lib/server/config.server"
import { getServerInfo } from "@/server/jellyfin/admin"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "jellyfin-display-name" })

const FALLBACK_MEDIA_SERVER_NAME = "Jellyfin"
const SERVER_NAME_CACHE_TTL_MS = 5 * 60 * 1000
const SERVER_NAME_FETCH_TIMEOUT_MS = 5000

let cachedServerName: { name: string; expiresAt: number } | undefined

/**
 * Resolve the media server name used in user-facing wording. Prefers the
 * admin-configured display name; otherwise falls back to the actual Jellyfin
 * server name (cached), then a static default when Jellyfin is unreachable.
 */
export async function getMediaServerName(): Promise<string> {
  const displayName = configManager.jellyfin.displayName
  if (displayName) {
    return displayName
  }

  const now = Date.now()
  if (cachedServerName && cachedServerName.expiresAt > now) {
    return cachedServerName.name
  }

  try {
    const info = await getServerInfo({
      signal: AbortSignal.timeout(SERVER_NAME_FETCH_TIMEOUT_MS),
    })
    cachedServerName = {
      name: info.name,
      expiresAt: now + SERVER_NAME_CACHE_TTL_MS,
    }
    return info.name
  } catch (err) {
    log.warn({ err }, "Failed to fetch Jellyfin server name, using fallback")
    return cachedServerName?.name ?? FALLBACK_MEDIA_SERVER_NAME
  }
}
