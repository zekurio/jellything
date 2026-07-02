import { os } from "@orpc/server"

import { ErrorCode } from "@/lib/api/contracts/errors"
import { configManager } from "@/lib/server/config.server"
import type { ORPCContext } from "@/server/orpc/context"
import { throwAppError } from "@/server/orpc/errors"
import {
  buildRateLimitKey,
  type RateLimiterDefinition,
  consumeRateLimit,
} from "@/server/rate-limit"
import { isAllowedRequestOrigin } from "@/server/request-origin"

export const orpc = os.$context<ORPCContext>()

type SessionRequirement = "optional" | "required" | "admin"

async function enforceSessionRequirement(
  context: ORPCContext,
  requirement: SessionRequirement,
) {
  const resolved = await context.resolveSession({
    validationMode: "if-stale",
    allowStaleOnJellyfinFailure: requirement === "optional",
    touch: requirement !== "optional",
  })

  if (resolved.status === "reauth-required") {
    throwAppError(ErrorCode.SESSION_EXPIRED)
  }

  if (
    resolved.status === "upstream-unreachable" &&
    requirement !== "optional"
  ) {
    throwAppError(
      ErrorCode.OPERATION_FAILED,
      "Authentication provider is temporarily unavailable",
    )
  }

  if (requirement !== "optional" && !resolved.session) {
    throwAppError(ErrorCode.UNAUTHORIZED)
  }

  if (
    requirement === "admin" &&
    resolved.session &&
    !resolved.session.isAdmin
  ) {
    throwAppError(ErrorCode.FORBIDDEN)
  }

  return resolved.session ?? null
}

const optionalSessionMiddleware = orpc.middleware(async ({ context, next }) => {
  const session = await enforceSessionRequirement(context, "optional")
  return next({
    context: {
      session,
    },
  })
})

const requireSessionMiddleware = orpc.middleware(async ({ context, next }) => {
  const session = await enforceSessionRequirement(context, "required")
  return next({
    context: {
      session,
    },
  })
})

const requireAdminMiddleware = orpc.middleware(async ({ context, next }) => {
  const session = await enforceSessionRequirement(context, "admin")
  return next({
    context: {
      session,
    },
  })
})

const requireConfiguredMiddleware = orpc.middleware(({ next }) => {
  if (!configManager.isConfigured()) {
    throwAppError(ErrorCode.CONFIG_NOT_INITIALIZED)
  }

  return next()
})

const sameOriginMutationMiddleware = orpc.middleware(({ context, next }) => {
  if (!isAllowedRequestOrigin(context.request)) {
    throwAppError(ErrorCode.FORBIDDEN, "Request origin is not allowed", {
      status: 403,
    })
  }

  return next()
})

export function rateLimitMiddleware(limiter: RateLimiterDefinition) {
  return orpc.middleware(async ({ context, next }) => {
    await enforceRateLimit(limiter, getClientIpRateLimitKey(context))

    return next()
  })
}

export function getClientIpRateLimitKey(
  context: Pick<ORPCContext, "clientIp">,
  ...parts: Array<string | number | null | undefined>
): string {
  // Without TRUST_PROXY, clientIp is null for every request, so all traffic
  // shares the "unknown" bucket. This is intentionally fail-closed: it throttles
  // more aggressively rather than letting spoofed headers mint fresh buckets.
  // Deployments behind a trusted proxy set TRUST_PROXY=true to get per-IP keys.
  return buildRateLimitKey("ip", context.clientIp ?? "unknown", ...parts)
}

export async function enforceRateLimit(
  limiter: RateLimiterDefinition,
  key: string,
): Promise<void> {
  const result = await consumeRateLimit(limiter, key)

  if (!result.allowed) {
    throwAppError(ErrorCode.RATE_LIMITED, undefined, { status: 429 })
  }
}

export const publicProcedure = orpc
export const queryProcedure = publicProcedure.use(optionalSessionMiddleware)
export const mutationProcedure = publicProcedure.use(
  sameOriginMutationMiddleware,
)
export const authedProcedure = mutationProcedure.use(requireSessionMiddleware)
const adminProcedure = mutationProcedure.use(requireAdminMiddleware)
export const configuredAdminProcedure = adminProcedure.use(
  requireConfiguredMiddleware,
)
