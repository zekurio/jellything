import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins"
import type { RouterClient } from "@orpc/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Route } from "@/routes/rpc.$"
import type { orpcRouter } from "@/server/orpc/router"
import type { ResolveSessionResult } from "@/server/session-resolver"

const resolveSession = vi.hoisted(() =>
  vi.fn<() => Promise<ResolveSessionResult>>(() =>
    Promise.resolve({
      status: "unauthenticated" as const,
      session: null,
      sessionRecord: null,
    }),
  ),
)

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    isConfigured: () => false,
    needsOnboarding: () => true,
    getError: () => null,
  },
}))

vi.mock("@/server/readiness", () => ({
  ensureApplicationReady: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}))

vi.mock("@/server/startup", () => ({
  runStartupTasks: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/server/logger", () => ({
  createChildLogger: () => ({
    debug: vi.fn<() => void>(),
    error: vi.fn<() => void>(),
    info: vi.fn<() => void>(),
    warn: vi.fn<() => void>(),
  }),
  logger: {
    debug: vi.fn<() => void>(),
    error: vi.fn<() => void>(),
    info: vi.fn<() => void>(),
    warn: vi.fn<() => void>(),
  },
}))

vi.mock("@/server/session-resolver", () => ({
  getSessionDataForUser: vi.fn<() => Promise<undefined>>(() =>
    Promise.resolve(undefined),
  ),
  resolveSession,
  resolveSessionFromCookies: resolveSession,
}))

interface RouteClientOptions {
  csrf?: boolean
  cookie?: string
  origin?: string
}

type PostRouteHandler = (options: { request: Request }) => Promise<Response>

function hasPostRouteHandler(
  value: unknown,
): value is { POST: PostRouteHandler } {
  return (
    typeof value === "object" &&
    value !== null &&
    "POST" in value &&
    typeof value.POST === "function"
  )
}

function getPostRouteHandler(): PostRouteHandler {
  const server = Route.options.server
  if (
    !server ||
    typeof server !== "object" ||
    !("handlers" in server) ||
    !hasPostRouteHandler(server.handlers)
  ) {
    throw new Error("Expected the RPC route to expose a POST handler")
  }

  return server.handlers.POST
}

function createRouteClient(options: RouteClientOptions = {}) {
  const responseState: { current: Response | null } = { current: null }
  const plugins =
    options.csrf === false ? [] : [new SimpleCsrfProtectionLinkPlugin()]
  const link = new RPCLink({
    url: "https://app.test/rpc",
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      origin: options.origin ?? "https://app.test",
    },
    plugins,
    fetch: async (request) => {
      const response = await getPostRouteHandler()({ request })
      responseState.current = response
      return response
    },
  })

  return {
    client: createORPCClient<RouterClient<typeof orpcRouter>>(link),
    responseState,
  }
}

function getSetCookieHeader(responseState: {
  current: Response | null
}): string {
  if (!responseState.current) {
    throw new Error("Expected the RPC route to produce a response")
  }

  return responseState.current.headers.get("set-cookie") ?? ""
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("RPC route mutation boundary", () => {
  it("rejects an invalid login submission without creating an auth cookie", async () => {
    const route = createRouteClient()
    await expect(
      route.client.auth.login({ username: "Member", password: "" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      status: 400,
    })
    expect(getSetCookieHeader(route.responseState)).toBe("")
  })

  it("rejects a mutation without the RPC CSRF token before logout can clear cookies", async () => {
    const { client, responseState } = createRouteClient({ csrf: false })

    await expect(client.auth.logout({})).rejects.toMatchObject({
      code: "CSRF_TOKEN_MISMATCH",
      status: 403,
    })
    expect(getSetCookieHeader(responseState)).toBe("")
  })

  it("rejects a token-bearing cross-origin mutation before logout can clear cookies", async () => {
    const { client, responseState } = createRouteClient({
      origin: "https://evil.test",
    })

    await expect(client.auth.logout({})).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      data: { appCode: "FORBIDDEN" },
    })
    expect(getSetCookieHeader(responseState)).toBe("")
  })

  it("propagates both auth-cookie clearing headers from a same-origin logout", async () => {
    const { client, responseState } = createRouteClient()

    await expect(client.auth.logout({})).resolves.toBeNull()

    const setCookie = getSetCookieHeader(responseState)
    expect(setCookie).toContain("inviterr-session=")
    expect(setCookie).toContain("session=")
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT")
  })
})

describe("RPC route bootstrap cookie boundary", () => {
  it("clears a stale auth cookie returned by session resolution", async () => {
    const { client, responseState } = createRouteClient({
      cookie: "inviterr-session=stale-session",
    })

    await expect(client.app.bootstrap({})).resolves.toMatchObject({
      configured: false,
      session: null,
    })
    expect(resolveSession).toHaveBeenCalledOnce()

    const setCookie = getSetCookieHeader(responseState)
    expect(setCookie).toContain("inviterr-session=")
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT")
  })
})
