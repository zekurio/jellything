import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const shouldSkipValidation = process.env.SKIP_ENV_VALIDATION === "true"

function withSkipValidationDefaults() {
  if (!shouldSkipValidation) {
    return process.env
  }

  return {
    ...process.env,
    DB_PATH: process.env.DB_PATH || "./data/inviterr.db",
    CONFIG_PATH: process.env.CONFIG_PATH || "./data/config.json",
    NODE_ENV: process.env.NODE_ENV || "development",
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
  }
}

export const env = createEnv({
  server: {
    DB_PATH: z.string().min(1).default("./data/inviterr.db"),
    CONFIG_PATH: z.string().min(1).default("./data/config.json"),
    MIGRATIONS_PATH: z.string().min(1).optional(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal"])
      .default("info"),
    // Only enable when Inviterr runs behind a trusted proxy that overwrites
    // forwarded IP headers. When false (the default, safe for direct exposure)
    // forwarded IP headers are ignored so clients cannot spoof their address.
    TRUST_PROXY: z.stringbool().default(false),
  },
  runtimeEnv: withSkipValidationDefaults(),
  skipValidation: shouldSkipValidation,
  emptyStringAsUndefined: true,
})
