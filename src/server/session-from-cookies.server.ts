import "@tanstack/react-start/server-only"
import { getRequestCookie } from "@/server/request-context.server"
import { SESSION_COOKIE_NAME } from "@/server/session"
import {
  resolveSession,
  type ResolvedSessionData,
  type SessionResolutionStatus,
} from "@/server/session-resolver"

interface ResolveSessionFromCookiesOptions {
  validationMode?: "never" | "if-stale" | "force"
  allowStaleOnJellyfinFailure?: boolean
  touch?: boolean
}

export interface SessionFromCookiesResult {
  status: SessionResolutionStatus
  session: ResolvedSessionData | null
  hasCookie: boolean
  shouldClearCookie: boolean
}

export async function resolveSessionFromCookies(
  options: ResolveSessionFromCookiesOptions = {},
): Promise<SessionFromCookiesResult | null> {
  const sessionCookieValue = getRequestCookie(SESSION_COOKIE_NAME)
  const hasCookie = Boolean(sessionCookieValue)

  const resolved = await resolveSession(sessionCookieValue, {
    validationMode: options.validationMode ?? "if-stale",
    allowStaleOnJellyfinFailure: options.allowStaleOnJellyfinFailure ?? false,
    touch: options.touch,
  })

  if (resolved.status === "unauthenticated") {
    return null
  }

  return {
    status: resolved.status,
    session: resolved.session,
    hasCookie,
    shouldClearCookie:
      hasCookie &&
      resolved.status !== "upstream-unreachable" &&
      !resolved.session,
  }
}
