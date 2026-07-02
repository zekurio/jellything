import pino from "pino"

import { env } from "@/env"

const isDevelopment = env.NODE_ENV !== "production"

export const logger = pino({
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: "jellything",
  },
})

export function createChildLogger(
  context: Record<string, unknown>,
): pino.Logger {
  return logger.child(context)
}

export function logError(
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const errorInfo =
    error instanceof Error
      ? {
          errorName: error.name,
          errorMessage: error.message,
          stack: error.stack,
        }
      : { errorMessage: String(error) }

  logger.error({ ...errorInfo, ...context }, message)
}

export type Logger = typeof logger
