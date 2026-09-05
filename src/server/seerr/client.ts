import type { StaticDecode, TSchema } from "typebox"

import { decodeWithSchema } from "@/lib/schema-decode"
import { configManager, type SeerrConfig } from "@/lib/server/config.server"
import { createChildLogger } from "@/server/logger"
import { SeerrStatusSchema, type SeerrStatus } from "@/server/seerr/schemas"

const log = createChildLogger({ module: "seerr" })

export const SEERR_INTERNAL_URL = (): string => {
  const url = configManager.seerrInternalUrl
  if (!url) {
    throw new Error("Seerr is not configured")
  }
  return url
}

export const SEERR_EXTERNAL_URL = (): string => {
  const url = configManager.seerrExternalUrl
  if (!url) {
    throw new Error("Seerr is not configured")
  }
  return url
}

export class SeerrApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message)
    this.name = "SeerrApiError"
  }
}

export interface SeerrRequestOptions<TBody> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  query?: Record<string, string | number | boolean | null | undefined>
  body?: TBody
  headers?: HeadersInit
  signal?: AbortSignal
  useExternal?: boolean
}

function getSeerrConfig(): SeerrConfig {
  const config = configManager.seerr
  if (!config) {
    throw new Error("Seerr is not configured")
  }
  if (!config.internalUrl) {
    throw new Error("Seerr internal URL is not configured")
  }
  if (!config.apiKey) {
    throw new Error("Seerr API key is not configured")
  }
  return config
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

function normalizePath(path: string): string {
  if (!path) return ""
  return path.startsWith("/") ? path : `/${path}`
}

function buildApiUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}/api/v1${normalizePath(path)}`
}

function encodeSeerrQueryComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export function buildSeerrQuery(
  query?: SeerrRequestOptions<unknown>["query"],
): string {
  if (!query) return ""
  const entries: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    entries.push(
      `${encodeSeerrQueryComponent(key)}=${encodeSeerrQueryComponent(String(value))}`,
    )
  }
  const serialized = entries.join("&")
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

export async function seerrRequest<T = unknown, TBody = unknown>(
  path: string,
  options: SeerrRequestOptions<TBody> = {},
): Promise<T> {
  const config = getSeerrConfig()
  const baseUrl = options.useExternal
    ? SEERR_EXTERNAL_URL()
    : SEERR_INTERNAL_URL()
  const url = `${buildApiUrl(baseUrl, path)}${buildSeerrQuery(options.query)}`
  const method = options.method ?? (options.body ? "POST" : "GET")
  const { payload, headers: bodyHeaders } = serializeBody(options.body)

  log.debug({ method, path }, `Seerr API request: ${method} ${path}`)

  const headers = new Headers({
    Accept: "application/json",
    "X-Api-Key": config.apiKey,
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
      `Seerr API error: ${method} ${path} responded ${response.status} ${response.statusText}`,
    )
    throw new SeerrApiError(
      `Seerr API request failed (${response.status} ${response.statusText})`,
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

  try {
    return JSON.parse(text) as T
  } catch (parseError) {
    log.error(
      { method, path, err: parseError },
      `Failed to parse Seerr JSON response for ${method} ${path}`,
    )
    const message =
      parseError instanceof Error
        ? parseError.message
        : "Unknown JSON parse error"
    throw new Error(`Failed to parse Seerr response: ${message}`, {
      cause: parseError,
    })
  }
}

export async function seerrRequestDecoded<
  Type extends TSchema,
  TBody = unknown,
>(
  path: string,
  schema: Type,
  options: SeerrRequestOptions<TBody> = {},
): Promise<StaticDecode<Type>> {
  const response = await seerrRequest<unknown, TBody>(path, options)
  return decodeWithSchema(schema, response, {
    service: "Seerr",
    path,
  })
}

export async function getSeerrStatus(options?: {
  signal?: AbortSignal
}): Promise<SeerrStatus> {
  const response = await seerrRequest("/status", {
    signal: options?.signal,
  })
  const decoded = decodeWithSchema(SeerrStatusSchema, response, {
    service: "Seerr",
    path: "/status",
  })
  const extraFields =
    typeof response === "object" &&
    response !== null &&
    !Array.isArray(response)
      ? response
      : {}
  return {
    ...extraFields,
    ...decoded,
  }
}
