import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { Type } from "typebox"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionData } from "@/lib/session"
import { standardSchema } from "@/lib/validation"
import type { ORPCContext } from "@/server/orpc/context"
import {
  authedProcedure,
  configuredAdminProcedure,
  mutationProcedure,
  publicProcedure,
} from "@/server/orpc/middleware"
import type { ResolveSessionResult } from "@/server/session-resolver"

const configState = vi.hoisted(() => ({ configured: true }))
const errorLog = vi.hoisted(() =>
  vi.fn<(context: Record<string, unknown>, message: string) => void>(),
)

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    isConfigured: () => configState.configured,
    get appUrl() {
      return "https://app.test"
    },
  },
}))

vi.mock("@/server/logger", () => ({
  createChildLogger: () => ({
    debug: vi.fn<() => void>(),
    error: errorLog,
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

const securedHandler = vi.fn<() => string>(() => "secured")
const adminHandler = vi.fn<() => string>(() => "admin")
const mutationHandler = vi.fn<() => string>(() => "mutated")

const noInputSchema = standardSchema(Type.Object({}))

const boundaryRouter = {
  secured: authedProcedure.input(noInputSchema).handler(securedHandler),
  adminOnly: configuredAdminProcedure
    .input(noInputSchema)
    .handler(adminHandler),
  mutate: mutationProcedure.input(noInputSchema).handler(mutationHandler),
  explode: publicProcedure.input(noInputSchema).handler(() => {
    throw new Error("sensitive internal failure")
  }),
}

const regularSession: SessionData = {
  userId: "user-1",
  name: "Regular User",
  avatarUrl: "https://app.test/avatar",
  isAdmin: false,
  email: "user@example.com",
  emailVerified: true,
  locale: null,
  createdAt: new Date(0).toISOString(),
}

const adminSession: SessionData = {
  ...regularSession,
  userId: "admin-1",
  name: "Admin User",
  isAdmin: true,
}

function createContext(
  request: Request,
  session: SessionData | null,
): ORPCContext {
  return {
    request,
    requestId: "request-1",
    clientIp: "127.0.0.1",
    userAgent: "boundary-test",
    resolveSession: vi.fn<() => Promise<ResolveSessionResult>>(() =>
      Promise.resolve({
        status: session
          ? ("authenticated" as const)
          : ("unauthenticated" as const),
        session,
        sessionRecord: null,
      }),
    ),
  }
}

function createBoundaryClient(options: {
  session: SessionData | null
  origin?: string
}) {
  const handler = new RPCHandler(boundaryRouter)
  const link = new RPCLink({
    url: "https://app.test/rpc",
    headers: {
      origin: options.origin ?? "https://app.test",
    },
    fetch: async (request) => {
      const handled = await handler.handle(request, {
        prefix: "/rpc",
        context: createContext(request, options.session),
      })

      return handled.matched
        ? handled.response
        : new Response(null, { status: 404 })
    },
  })

  return createORPCClient<RouterClient<typeof boundaryRouter>>(link)
}

afterEach(() => {
  configState.configured = true
  vi.clearAllMocks()
})

describe("ORPC authorization boundary", () => {
  it("rejects an unauthenticated caller before the secured handler", async () => {
    const client = createBoundaryClient({ session: null })

    await expect(client.secured({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
      data: { appCode: "UNAUTHORIZED" },
    })
    expect(securedHandler).not.toHaveBeenCalled()
  })

  it("allows an authenticated member on authed procedures but denies admin procedures", async () => {
    const client = createBoundaryClient({ session: regularSession })

    await expect(client.secured({})).resolves.toBe("secured")
    await expect(client.adminOnly({})).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      data: { appCode: "FORBIDDEN" },
    })
    expect(securedHandler).toHaveBeenCalledOnce()
    expect(adminHandler).not.toHaveBeenCalled()
  })

  it("checks admin authorization before configured-admin gating", async () => {
    configState.configured = false
    const client = createBoundaryClient({ session: regularSession })

    await expect(client.adminOnly({})).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      data: { appCode: "FORBIDDEN" },
    })
    expect(adminHandler).not.toHaveBeenCalled()
  })

  it("rejects an admin while configuration is incomplete and allows one once configured", async () => {
    configState.configured = false
    const unconfiguredClient = createBoundaryClient({ session: adminSession })

    await expect(unconfiguredClient.adminOnly({})).rejects.toMatchObject({
      code: "CONFIG_NOT_INITIALIZED",
      status: 409,
      data: { appCode: "CONFIG_NOT_INITIALIZED" },
    })
    expect(adminHandler).not.toHaveBeenCalled()

    configState.configured = true
    const configuredClient = createBoundaryClient({ session: adminSession })

    await expect(configuredClient.adminOnly({})).resolves.toBe("admin")
    expect(adminHandler).toHaveBeenCalledOnce()
  })
})

describe("ORPC mutation and error boundary", () => {
  it("rejects a cross-origin mutation before its handler", async () => {
    const client = createBoundaryClient({
      session: regularSession,
      origin: "https://evil.test",
    })

    await expect(client.mutate({})).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      message: "Request origin is not allowed",
      data: { appCode: "FORBIDDEN" },
    })
    expect(mutationHandler).not.toHaveBeenCalled()
  })

  it("translates unexpected handler failures to the stable public error", async () => {
    const client = createBoundaryClient({ session: null })

    await expect(client.explode({})).rejects.toMatchObject({
      code: "OPERATION_FAILED",
      status: 500,
      data: { appCode: "OPERATION_FAILED" },
    })
    expect(errorLog).toHaveBeenCalledOnce()
  })
})
