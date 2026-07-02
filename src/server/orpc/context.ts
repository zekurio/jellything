import {
  getCurrentRequest,
  getCurrentRequestHeaders,
  getRequestClientIp,
  getRequestId,
  getRequestUserAgent,
  REQUEST_ID_HEADER,
} from "@/server/request-context.server"
import { SESSION_COOKIE_NAME } from "@/server/session"
import {
  resolveSession,
  type ResolveSessionOptions,
  type ResolveSessionResult,
} from "@/server/session-resolver"

export interface ORPCContext {
  request: Request
  requestId: string
  clientIp: string | null
  userAgent: string | null
  reqHeaders?: Headers
  resHeaders?: Headers
  resolveSession: (
    options?: ResolveSessionOptions,
  ) => Promise<ResolveSessionResult>
}

function createSessionResolver(request: Request) {
  const cache = new Map<string, Promise<ResolveSessionResult>>()
  const sessionCookieValue =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.slice(`${SESSION_COOKIE_NAME}=`.length) ?? undefined

  return (options: ResolveSessionOptions = {}) => {
    const key = JSON.stringify({
      validationMode: options.validationMode ?? "if-stale",
      allowStaleOnJellyfinFailure: options.allowStaleOnJellyfinFailure ?? false,
      touch: options.touch ?? true,
    })
    const cached = cache.get(key)

    if (cached) {
      return cached
    }

    const next = resolveSession(sessionCookieValue, options)
    cache.set(key, next)
    return next
  }
}

export function createORPCContext(request: Request): ORPCContext {
  const requestId = getRequestId(request) ?? crypto.randomUUID()

  return {
    request,
    requestId,
    clientIp: getRequestClientIp(request),
    userAgent: getRequestUserAgent(request),
    resolveSession: createSessionResolver(request),
  }
}

export function createORPCContextFromCurrentRequest(): ORPCContext {
  const request = getCurrentRequest()
  const context = createORPCContext(request)

  return {
    ...context,
    reqHeaders: getCurrentRequestHeaders(),
    requestId:
      context.requestId ||
      request.headers.get(REQUEST_ID_HEADER) ||
      crypto.randomUUID(),
  }
}
