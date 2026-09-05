import { createEnv } from "@t3-oss/env-core"
import { Type } from "typebox"

// Vite loads this module before the application's path aliases are available.
import {
  defaulted,
  enumValues,
  standardSchema,
  stringSchema,
} from "./lib/validation"

const truthyValues = ["true", "1", "yes", "on", "y", "enabled"]
const stringBooleanPattern = `^(?:${[
  ...truthyValues,
  "false",
  "0",
  "no",
  "off",
  "n",
  "disabled",
]
  .map((value) =>
    value.replace(
      /[a-z]/g,
      (character) => `[${character}${character.toUpperCase()}]`,
    ),
  )
  .join("|")})(?![\\s\\S])`

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
    DB_PATH: standardSchema(
      defaulted(stringSchema({ minLength: 1 }), "./data/inviterr.db"),
    ),
    CONFIG_PATH: standardSchema(
      defaulted(stringSchema({ minLength: 1 }), "./data/config.json"),
    ),
    MIGRATIONS_PATH: standardSchema(
      Type.Union([stringSchema({ minLength: 1 }), Type.Undefined()]),
    ),
    NODE_ENV: standardSchema(
      defaulted(
        enumValues(["development", "production", "test"]),
        "development",
      ),
    ),
    LOG_LEVEL: standardSchema(
      defaulted(
        enumValues(["trace", "debug", "info", "warn", "error", "fatal"]),
        "info",
      ),
    ),
    // Only enable when Inviterr runs behind a trusted proxy that overwrites
    // forwarded IP headers. When false (the default, safe for direct exposure)
    // forwarded IP headers are ignored so clients cannot spoof their address.
    TRUST_PROXY: standardSchema(
      Type.Decode(
        defaulted(Type.String({ pattern: stringBooleanPattern }), "false"),
        (value) => truthyValues.includes(value.toLowerCase()),
      ),
    ),
  },
  runtimeEnv: withSkipValidationDefaults(),
  skipValidation: shouldSkipValidation,
  emptyStringAsUndefined: true,
})
