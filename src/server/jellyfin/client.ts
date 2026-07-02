import { z } from "zod"

import { configManager } from "@/lib/server/config.server"
import { decodeWithSchema } from "@/lib/zod-decode"
import { appVersion } from "@/server/app-version"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "jellyfin" })

export const JELLYFIN_INTERNAL_URL = (): string =>
  configManager.jellyfinInternalUrl
export const JELLYFIN_EXTERNAL_URL = (): string =>
  configManager.jellyfinExternalUrl

const CLIENT_NAME = "Jellything"
const DEVICE_NAME = "Jellything Server"
const DEVICE_ID = "jellything-server"

export interface JellyfinClient {
  token?: string
  deviceId?: string
}

export class JellyfinApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message)
    this.name = "JellyfinApiError"
  }
}

export interface JellyfinRequestOptions<TBody> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  query?: Record<string, string | number | boolean | null | undefined>
  body?: TBody
  headers?: HeadersInit
  signal?: AbortSignal
  useExternal?: boolean
  token?: string
  deviceId?: string
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

function normalizePath(path: string): string {
  if (!path) return ""
  return path.startsWith("/") ? path : `/${path}`
}

function buildApiUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${normalizePath(path)}`
}

function buildQuery(query?: JellyfinRequestOptions<unknown>["query"]): string {
  if (!query) return ""
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ""
}

function serializeBody(body: unknown): {
  payload?: BodyInit
  headers?: HeadersInit
} {
  if (body === undefined) return {}
  if (typeof body === "string") {
    return { payload: body }
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return { payload: body as BodyInit }
  }
  if (body instanceof Blob || body instanceof FormData) {
    return { payload: body }
  }
  return {
    payload: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }
}

function applyHeaders(target: Headers, headers?: HeadersInit): void {
  if (!headers) {
    return
  }

  new Headers(headers).forEach((value, key) => {
    target.set(key, value)
  })
}

export function getJellyfinAuthorizationHeader(
  token?: string,
  deviceId?: string,
): string {
  const authToken = token ?? ""
  return [
    `MediaBrowser Client="${encodeURIComponent(CLIENT_NAME)}"`,
    `Device="${encodeURIComponent(DEVICE_NAME)}"`,
    `DeviceId="${encodeURIComponent(deviceId ?? DEVICE_ID)}"`,
    `Version="${encodeURIComponent(appVersion)}"`,
    `Token="${encodeURIComponent(authToken)}"`,
  ].join(", ")
}

export async function jellyfinRequest<T = unknown, TBody = unknown>(
  path: string,
  options: JellyfinRequestOptions<TBody> = {},
): Promise<T> {
  const baseUrl = options.useExternal
    ? JELLYFIN_EXTERNAL_URL()
    : JELLYFIN_INTERNAL_URL()
  const url = `${buildApiUrl(baseUrl, path)}${buildQuery(options.query)}`
  const method = options.method ?? (options.body === undefined ? "GET" : "POST")
  const { payload, headers: bodyHeaders } = serializeBody(options.body)

  log.debug({ method, path }, `Jellyfin API request: ${method} ${path}`)

  const headers = new Headers({
    Accept: "application/json",
    Authorization: getJellyfinAuthorizationHeader(
      options.token,
      options.deviceId,
    ),
  })
  applyHeaders(headers, bodyHeaders)
  applyHeaders(headers, options.headers)

  const response = await fetch(url, {
    method,
    headers,
    body: payload,
    signal: options.signal,
  })

  if (!response.ok) {
    const responseBody = await response.text()
    log.warn(
      {
        method,
        path,
        statusCode: response.status,
        statusText: response.statusText,
      },
      `Jellyfin API error: ${method} ${path} responded ${response.status} ${response.statusText}`,
    )
    throw new JellyfinApiError(
      `Jellyfin API request failed (${response.status} ${response.statusText})`,
      response.status,
      responseBody,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  const contentType = response.headers.get("content-type")
  const isJsonResponse = contentType?.includes("application/json") ?? true
  if (!isJsonResponse) {
    return text as T
  }

  try {
    return JSON.parse(text) as T
  } catch (parseError) {
    log.error(
      { method, path, err: parseError },
      `Failed to parse Jellyfin JSON response for ${method} ${path}`,
    )
    const message =
      parseError instanceof Error
        ? parseError.message
        : "Unknown JSON parse error"
    throw new Error(`Failed to parse Jellyfin response: ${message}`, {
      cause: parseError,
    })
  }
}

export async function jellyfinRequestDecoded<
  TSchema extends z.ZodType,
  TBody = unknown,
>(
  path: string,
  schema: TSchema,
  options: JellyfinRequestOptions<TBody> = {},
): Promise<z.output<TSchema>> {
  const response = await jellyfinRequest<unknown, TBody>(path, options)
  return decodeWithSchema(schema, response, {
    service: "Jellyfin",
    path,
  })
}

export function createApiWithToken(
  token?: string,
  deviceId?: string,
): JellyfinClient {
  return { token, deviceId }
}

export function createAdminApi(): JellyfinClient {
  return { token: configManager.jellyfin.apiKey }
}
