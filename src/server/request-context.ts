import "@tanstack/react-start/server-only"
import { AsyncLocalStorage } from "node:async_hooks"

import {
  deleteCookie,
  getCookie,
  getRequest,
  getRequestHeader,
  getRequestHeaders,
  getResponseHeaders,
  setCookie,
} from "@tanstack/react-start/server"

import { env } from "@/env"

export const REQUEST_ID_HEADER = "x-request-id"

type CookieOptions = Parameters<typeof setCookie>[2]

interface RequestContextStore {
  request: Request
  responseHeaders: Headers
}

const requestContextStorage = new AsyncLocalStorage<RequestContextStore>()

function getRequestContextStore(): RequestContextStore | undefined {
  return requestContextStorage.getStore()
}

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) {
    return {}
  }

  return Object.fromEntries(
    header
      .split(";")
      .map((part) => {
        const separatorIndex = part.indexOf("=")
        if (separatorIndex === -1) {
          return null
        }

        const name = part.slice(0, separatorIndex).trim()
        const value = part.slice(separatorIndex + 1).trim()

        if (!name) {
          return null
        }

        return [name, decodeURIComponent(value)] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

function serializeCookieValue(
  name: string,
  value: string,
  options?: CookieOptions,
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]

  if (options?.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`)
  }

  if (options?.domain) {
    parts.push(`Domain=${options.domain}`)
  }

  if (options?.path) {
    parts.push(`Path=${options.path}`)
  }

  if (options?.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }

  if (options?.httpOnly) {
    parts.push("HttpOnly")
  }

  if (options?.secure) {
    parts.push("Secure")
  }

  if (options?.sameSite) {
    parts.push(`SameSite=${options.sameSite}`)
  }

  return parts.join("; ")
}

export function runWithRequestContext<T>(
  request: Request,
  responseHeaders: Headers,
  callback: () => T,
): T {
  return requestContextStorage.run(
    {
      request,
      responseHeaders,
    },
    callback,
  )
}

function getFirstForwardedForValue(value: string | null): string | null {
  const forwardedFor = value?.split(",")[0]?.trim()
  return forwardedFor && forwardedFor.length > 0 ? forwardedFor : null
}

// Forwarded IP headers (x-forwarded-for / x-real-ip) are attacker-controlled on
// a directly-exposed deployment, so they are only honored when the operator has
// opted into a trusted, header-overwriting proxy via TRUST_PROXY=true.
function getTrustedForwardedClientIp(headers: Headers): string | null {
  if (!env.TRUST_PROXY) {
    return null
  }

  return (
    getFirstForwardedForValue(headers.get("x-forwarded-for")) ??
    headers.get("x-real-ip")
  )
}

// Derives the client IP used for rate limiting and logging.
//
// This runtime (TanStack Start) hands route handlers a standard web `Request`
// that does not expose the socket/peer address, so there is no trustworthy
// default source for the client IP. Deployments that need per-client rate-limit
// buckets must run behind a trusted, header-overwriting proxy and set
// TRUST_PROXY=true. Without that, forwarded headers are ignored and this returns
// null. That is fail-closed: throttles fall back to a shared bucket rather than
// being bypassable by spoofed headers.
export function getClientIpFromHeaders(headers: Headers): string | null {
  return getTrustedForwardedClientIp(headers)
}

export function getRequestClientIp(request: Request): string | null {
  return getClientIpFromHeaders(request.headers)
}

export function getRequestIdFromHeaders(headers: Headers): string | null {
  return headers.get(REQUEST_ID_HEADER)
}

export function getRequestId(request: Request): string | null {
  const { headers } = request
  return headers.get(REQUEST_ID_HEADER)
}

export function getCurrentClientIp(): string | null {
  return getClientIpFromHeaders(getCurrentRequestHeaders())
}

export function getRequestUserAgent(request: Request): string | null {
  return request.headers.get("user-agent")
}

export function getCurrentUserAgent(): string | null {
  return getCurrentRequestHeaders().get("user-agent")
}

export function getCurrentRequest(): Request {
  const store = getRequestContextStore()
  if (store) {
    return store.request
  }

  return getRequest()
}

export function getCurrentRequestHeaders(): Headers {
  const store = getRequestContextStore()
  if (store) {
    return store.request.headers
  }

  return getRequestHeaders()
}

export function getCurrentRequestHeader(name: string): string | null {
  return getRequestHeader(name) ?? null
}

export function getCurrentResponseHeaders(): Headers {
  const store = getRequestContextStore()
  if (store) {
    return store.responseHeaders
  }

  const responseHeaders = new Headers()
  getResponseHeaders().forEach((value, key) => {
    responseHeaders.set(String(key), String(value))
  })
  return responseHeaders
}

export function getRequestCookie(name: string): string | undefined {
  const store = getRequestContextStore()
  if (store) {
    return parseCookieHeader(store.request.headers.get("cookie"))[name]
  }

  return getCookie(name) ?? undefined
}

export function setRequestCookie(
  name: string,
  value: string,
  options?: CookieOptions,
): void {
  const store = getRequestContextStore()
  if (store) {
    store.responseHeaders.append(
      "set-cookie",
      serializeCookieValue(name, value, options),
    )
    return
  }

  setCookie(name, value, options)
}

export function deleteRequestCookie(
  name: string,
  options?: Parameters<typeof deleteCookie>[1],
): void {
  const store = getRequestContextStore()
  if (store) {
    store.responseHeaders.append(
      "set-cookie",
      serializeCookieValue(name, "", {
        ...options,
        expires: new Date(0),
        maxAge: 0,
      }),
    )
    return
  }

  deleteCookie(name, options)
}
