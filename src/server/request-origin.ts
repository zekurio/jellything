import { env } from "@/env"
import { configManager } from "@/lib/server/config.server"
import { logger } from "@/server/logger"

function getSafeOrigin(value: string, source: string): string | null {
  try {
    return new URL(value).origin
  } catch (error) {
    logger.warn({ error, source, value }, "Skipping invalid origin")
    return null
  }
}

// Forwarded host/proto headers are attacker-controlled on a directly-exposed
// deployment, so they are only honored when the operator has opted into a
// trusted, header-overwriting proxy via TRUST_PROXY=true. When false (the safe
// default) the request URL is the only trusted origin source, so a spoofed
// x-forwarded-host cannot widen the same-origin allowlist or poison app.url.
function getForwardedOrigin(request: Request): string | null {
  if (!env.TRUST_PROXY) {
    return null
  }

  const forwardedHost = request.headers.get("x-forwarded-host")
  if (!forwardedHost) {
    return null
  }

  const forwardedProto =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(/:$/, "")
  return getSafeOrigin(`${forwardedProto}://${forwardedHost}`, "forwarded.host")
}

export function getRequestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin")
  if (origin) {
    return origin
  }

  const referer = request.headers.get("referer")
  if (!referer) {
    return null
  }

  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

function getAllowedOrigins(request: Request): Set<string> {
  const allowedOrigins = new Set<string>()

  const appUrl = configManager.isConfigured() ? configManager.appUrl : undefined
  if (appUrl) {
    const appOrigin = getSafeOrigin(appUrl, "config.app.url")
    if (appOrigin) {
      allowedOrigins.add(appOrigin)
    }
  }

  const requestUrlOrigin = getSafeOrigin(request.url, "request.url")
  if (requestUrlOrigin) {
    allowedOrigins.add(requestUrlOrigin)
  }

  const forwardedOrigin = getForwardedOrigin(request)
  if (forwardedOrigin) {
    allowedOrigins.add(forwardedOrigin)
  }

  return allowedOrigins
}

export function isAllowedRequestOrigin(request: Request): boolean {
  const requestOrigin = getRequestOrigin(request)
  return requestOrigin === null || getAllowedOrigins(request).has(requestOrigin)
}

export function getTrustedRequestOrigin(request: Request): string | null {
  return (
    getForwardedOrigin(request) ?? getSafeOrigin(request.url, "request.url")
  )
}
