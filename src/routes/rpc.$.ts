import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"

import { ensureApplicationReady } from "@/server/readiness"

type RpcFetchModule = typeof import("@orpc/server/fetch")
type RpcPluginsModule = typeof import("@orpc/server/plugins")
type LoggerModule = typeof import("@/server/logger")
type ORPCContextModule = typeof import("@/server/orpc/context")
type ORPCRouterModule = typeof import("@/server/orpc/router")
type RequestContextModule = typeof import("@/server/request-context")
type StartupModule = typeof import("@/server/startup")

type RpcServerModules = {
  RPCHandler: RpcFetchModule["RPCHandler"]
  RequestHeadersPlugin: RpcPluginsModule["RequestHeadersPlugin"]
  ResponseHeadersPlugin: RpcPluginsModule["ResponseHeadersPlugin"]
  SimpleCsrfProtectionHandlerPlugin: RpcPluginsModule["SimpleCsrfProtectionHandlerPlugin"]
  createChildLogger: LoggerModule["createChildLogger"]
  createORPCContext: ORPCContextModule["createORPCContext"]
  orpcRouter: ORPCRouterModule["orpcRouter"]
  getRequestClientIp: RequestContextModule["getRequestClientIp"]
  getRequestId: RequestContextModule["getRequestId"]
  getRequestUserAgent: RequestContextModule["getRequestUserAgent"]
  REQUEST_ID_HEADER: RequestContextModule["REQUEST_ID_HEADER"]
  runWithRequestContext: RequestContextModule["runWithRequestContext"]
  runStartupTasks: StartupModule["runStartupTasks"]
}

const rpcServerModulesPromise: Promise<RpcServerModules> | null = import.meta
  .env.SSR
  ? Promise.all([
      import("@orpc/server/fetch"),
      import("@orpc/server/plugins"),
      import("@/server/logger"),
      import("@/server/orpc/context"),
      import("@/server/orpc/router"),
      import("@/server/request-context"),
      import("@/server/startup"),
    ]).then(
      ([
        { RPCHandler },
        {
          RequestHeadersPlugin,
          ResponseHeadersPlugin,
          SimpleCsrfProtectionHandlerPlugin,
        },
        { createChildLogger },
        { createORPCContext },
        { orpcRouter },
        {
          getRequestClientIp,
          getRequestId,
          getRequestUserAgent,
          REQUEST_ID_HEADER,
          runWithRequestContext,
        },
        { runStartupTasks },
      ]) => ({
        RPCHandler,
        RequestHeadersPlugin,
        ResponseHeadersPlugin,
        SimpleCsrfProtectionHandlerPlugin,
        createChildLogger,
        createORPCContext,
        orpcRouter,
        getRequestClientIp,
        getRequestId,
        getRequestUserAgent,
        REQUEST_ID_HEADER,
        runWithRequestContext,
        runStartupTasks,
      }),
    )
  : null

async function getRpcServerModules(): Promise<RpcServerModules> {
  if (!rpcServerModulesPromise) {
    throw new Error("RPC server modules are unavailable in the browser build.")
  }

  return rpcServerModulesPromise
}

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => Array<string>
}

function getSetCookieValues(headers: Headers): Array<string> {
  const headersWithSetCookie = headers as HeadersWithSetCookie

  if (typeof headersWithSetCookie.getSetCookie === "function") {
    return headersWithSetCookie.getSetCookie()
  }

  const value = headers.get("set-cookie")
  return value ? [value] : []
}

function sanitizeRpcPath(pathname: string): string {
  return pathname
}

function getSanitizedRpcLogContext(request: Request): {
  path: string
  search?: string
} {
  const url = new URL(request.url)
  return {
    path: sanitizeRpcPath(url.pathname),
    search: undefined,
  }
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 100) / 100
}

async function handleRpcRouteRequest({ request }: { request: Request }) {
  const {
    RPCHandler,
    RequestHeadersPlugin,
    ResponseHeadersPlugin,
    SimpleCsrfProtectionHandlerPlugin,
    createChildLogger,
    createORPCContext,
    orpcRouter,
    getRequestClientIp,
    getRequestId,
    getRequestUserAgent,
    REQUEST_ID_HEADER,
    runWithRequestContext,
    runStartupTasks,
  } = await getRpcServerModules()
  await ensureApplicationReady()
  runStartupTasks()
  const rpcRouteLogger = createChildLogger({ module: "rpc-route" })
  const rpcHandler = new RPCHandler(orpcRouter, {
    plugins: [
      new RequestHeadersPlugin(),
      new ResponseHeadersPlugin(),
      new SimpleCsrfProtectionHandlerPlugin(),
    ],
  })
  const startedAt = performance.now()
  const requestId = getRequestId(request) ?? crypto.randomUUID()
  const responseHeaders = new Headers()

  try {
    const pathname = new URL(request.url).pathname
    const handled = await runWithRequestContext(
      request,
      responseHeaders,
      async () =>
        pathname === "/rpc/openapi" || pathname === "/rpc/openapi/json"
          ? { matched: false as const, response: undefined }
          : rpcHandler.handle(request, {
              prefix: "/rpc",
              context: createORPCContext(request),
            }),
    )
    const response =
      handled.matched && handled.response
        ? handled.response
        : new Response(null, { status: 404 })
    const headers = responseHeaders

    for (const [name, value] of headers.entries()) {
      if (name === "set-cookie") {
        continue
      }

      response.headers.set(name, value)
    }

    for (const value of getSetCookieValues(headers)) {
      response.headers.append("set-cookie", value)
    }

    response.headers.set(REQUEST_ID_HEADER, requestId)

    const sanitizedUrl = getSanitizedRpcLogContext(request)
    const context = {
      requestId:
        getRequestId(request) ??
        response.headers.get(REQUEST_ID_HEADER) ??
        undefined,
      method: request.method,
      path: sanitizedUrl.path,
      search: sanitizedUrl.search,
      status: response.status,
      durationMs: roundDuration(performance.now() - startedAt),
      clientIp: getRequestClientIp(request) ?? undefined,
      userAgent: getRequestUserAgent(request) ?? undefined,
    }

    if (response.status >= 500) {
      rpcRouteLogger.error(context, "RPC request failed")
    } else if (response.status >= 400) {
      rpcRouteLogger.warn(context, "RPC request completed with client error")
    } else {
      rpcRouteLogger.info(context, "RPC request completed")
    }

    return response
  } catch (error) {
    const sanitizedUrl = getSanitizedRpcLogContext(request)
    rpcRouteLogger.error(
      {
        requestId,
        error,
        method: request.method,
        path: sanitizedUrl.path,
        search: sanitizedUrl.search,
        durationMs: roundDuration(performance.now() - startedAt),
        clientIp: getRequestClientIp(request) ?? undefined,
        userAgent: getRequestUserAgent(request) ?? undefined,
      },
      "RPC request threw unexpectedly",
    )
    throw error
  }
}

export const Route = createFileRoute("/rpc/$")({
  server: {
    handlers: {
      HEAD: handleRpcRouteRequest,
      OPTIONS: handleRpcRouteRequest,
      GET: handleRpcRouteRequest,
      POST: handleRpcRouteRequest,
      PUT: handleRpcRouteRequest,
      PATCH: handleRpcRouteRequest,
      DELETE: handleRpcRouteRequest,
    },
  },
})
