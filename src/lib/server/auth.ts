import type { SessionData } from "@/lib/session"
import { resolveSessionFromCookies } from "@/server/session-from-cookies.server"

export class AuthError extends Error {
  readonly reason: "unauthorized" | "forbidden" | "service_unavailable"

  constructor(reason: "unauthorized" | "forbidden" | "service_unavailable") {
    super(
      reason === "unauthorized"
        ? "Unauthorized"
        : reason === "forbidden"
          ? "Forbidden: Admin access required"
          : "Authentication temporarily unavailable",
    )
    this.name = "AuthError"
    this.reason = reason
  }
}

/**
 * Get session data for server-rendered UI.
 */
export async function getSessionData(): Promise<SessionData | null> {
  const resolved = await resolveSessionFromCookies({
    validationMode: "if-stale",
    allowStaleOnJellyfinFailure: true,
    touch: false,
  })

  return resolved?.session ?? null
}

/**
 * Get session data for server-side auth workflows.
 */
export async function getSession(): Promise<SessionData | null> {
  const resolved = await resolveSessionFromCookies({
    validationMode: "if-stale",
    allowStaleOnJellyfinFailure: false,
  })

  if (!resolved) {
    return null
  }

  if (resolved.status === "upstream-unreachable") {
    throw new AuthError("service_unavailable")
  }

  return resolved.session
}

export async function requireSession(): Promise<SessionData> {
  const session = await getSession()
  if (!session) {
    throw new AuthError("unauthorized")
  }
  return session
}

export async function requireAdmin(): Promise<SessionData> {
  const session = await requireSession()
  if (!session.isAdmin) {
    throw new AuthError("forbidden")
  }
  return session
}
