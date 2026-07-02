import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins"
import { createRouterClient, ORPCError, type RouterClient } from "@orpc/server"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { createIsomorphicFn } from "@tanstack/react-start"

import type { AppRouter } from "@/lib/orpc/router-contract"
import type { ApiErrorBodyDto } from "@/server/api/schemas/common-schemas"

export type AppORPCClient = RouterClient<AppRouter>

function assertBrowserRuntime() {
  if (typeof window === "undefined") {
    throw new Error(
      "Browser oRPC client cannot execute during server rendering.",
    )
  }
}

function getBrowserRPCUrl() {
  assertBrowserRuntime()

  return new URL("/rpc", window.location.origin)
}

function createBrowserORPCClient() {
  const link = new RPCLink({
    // Client components still render on the server, so browser globals must stay lazy.
    url: () => getBrowserRPCUrl(),
    plugins: [new SimpleCsrfProtectionLinkPlugin()],
    fetch: (request: Request, init: RequestInit) => {
      assertBrowserRuntime()

      return fetch(request, { ...init, credentials: "include" })
    },
  })

  return createORPCClient<AppORPCClient>(link)
}

function createBrowserORPCUtils() {
  return createTanstackQueryUtils(getBrowserORPCClient())
}

type AppORPCUtils = ReturnType<typeof createBrowserORPCUtils>

let browserClientSingleton: AppORPCClient | null = null
let browserUtilsSingleton: AppORPCUtils | null = null

export function getBrowserORPCClient() {
  if (browserClientSingleton === null) {
    browserClientSingleton = createBrowserORPCClient()
  }

  return browserClientSingleton
}

export function getBrowserORPCUtils() {
  if (browserUtilsSingleton === null) {
    browserUtilsSingleton = createBrowserORPCUtils()
  }

  return browserUtilsSingleton
}

const getEnvironmentORPCClient = createIsomorphicFn()
  .client(() => getBrowserORPCClient())
  .server(async () => {
    const [{ createORPCContextFromCurrentRequest }, { orpcRouter }] =
      await Promise.all([
        import("@/server/orpc/context"),
        import("@/server/orpc/router"),
      ])

    return createRouterClient(orpcRouter, {
      context: createORPCContextFromCurrentRequest(),
    })
  })

const getEnvironmentORPCUtils = createIsomorphicFn()
  .client(() => getBrowserORPCUtils())
  .server(async () =>
    createTanstackQueryUtils(await getEnvironmentORPCClient()),
  )

export const getORPCClient = getEnvironmentORPCClient

export const getORPCUtils = getEnvironmentORPCUtils

export type ApiResult<T = unknown> = {
  data: T | null
  error: ApiErrorBodyDto | null
}

function toApiErrorBody(error: unknown): ApiErrorBodyDto {
  if (error instanceof ORPCError) {
    return {
      code: String(error.data?.appCode ?? error.code).toLowerCase(),
      message: error.message,
      messageKey:
        error.data &&
        typeof error.data === "object" &&
        "messageKey" in error.data
          ? (error.data.messageKey as string | undefined)
          : undefined,
    }
  }

  return {
    code: "internal_error",
    message: "Request failed",
  }
}

export async function runApiEffect<T>(
  promise: Promise<T>,
): Promise<ApiResult<T>> {
  try {
    return {
      data: await promise,
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      error: toApiErrorBody(error),
    }
  }
}
