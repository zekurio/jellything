import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

beforeEach(() => {
  for (const name of [
    "DB_PATH",
    "CONFIG_PATH",
    "MIGRATIONS_PATH",
    "NODE_ENV",
    "LOG_LEVEL",
    "TRUST_PROXY",
    "SKIP_ENV_VALIDATION",
  ]) {
    vi.stubEnv(name, undefined)
  }
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("environment validation", () => {
  it("supplies defaults for missing and empty values", async () => {
    vi.stubEnv("DB_PATH", "")
    vi.stubEnv("TRUST_PROXY", "")
    const { env } = await import("@/env")

    expect(env.DB_PATH).toBe("./data/inviterr.db")
    expect(env.CONFIG_PATH).toBe("./data/config.json")
    expect(env.NODE_ENV).toBe("development")
    expect(env.LOG_LEVEL).toBe("info")
    expect(env.MIGRATIONS_PATH).toBeUndefined()
    expect(env.TRUST_PROXY).toBe(false)
  })

  it.each(["true", "1", "yes", "on", "y", "enabled", "TRUE", "EnAbLeD"])(
    "decodes TRUST_PROXY=%s as true",
    async (value) => {
      vi.stubEnv("TRUST_PROXY", value)
      const { env } = await import("@/env")
      expect(env.TRUST_PROXY).toBe(true)
    },
  )

  it.each(["false", "0", "no", "off", "n", "disabled", "FALSE", "DiSaBlEd"])(
    "decodes TRUST_PROXY=%s as false",
    async (value) => {
      vi.stubEnv("TRUST_PROXY", value)
      const { env } = await import("@/env")
      expect(env.TRUST_PROXY).toBe(false)
    },
  )

  it.each([
    ["TRUST_PROXY", "maybe"],
    ["TRUST_PROXY", " true "],
    ["TRUST_PROXY", "true\n"],
    ["TRUST_PROXY", "false\r\n"],
    ["NODE_ENV", "staging"],
    ["LOG_LEVEL", "verbose"],
  ])("rejects %s=%s", async (name, value) => {
    vi.stubEnv(name, value)
    await expect(import("@/env")).rejects.toThrow(
      "Invalid environment variables",
    )
  })

  it("preserves explicit paths and enums", async () => {
    vi.stubEnv("DB_PATH", "/custom/db.sqlite")
    vi.stubEnv("CONFIG_PATH", "/custom/config.json")
    vi.stubEnv("MIGRATIONS_PATH", "/custom/migrations")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("LOG_LEVEL", "debug")
    const { env } = await import("@/env")
    expect(env.DB_PATH).toBe("/custom/db.sqlite")
    expect(env.CONFIG_PATH).toBe("/custom/config.json")
    expect(env.MIGRATIONS_PATH).toBe("/custom/migrations")
    expect(env.NODE_ENV).toBe("production")
    expect(env.LOG_LEVEL).toBe("debug")
  })

  it("skips validation only for the exact true flag and keeps skip defaults", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "true")
    vi.stubEnv("DB_PATH", "")
    vi.stubEnv("TRUST_PROXY", "unvalidated")
    const { env } = await import("@/env")
    expect(env.DB_PATH).toBe("./data/inviterr.db")
    expect(env.CONFIG_PATH).toBe("./data/config.json")
    expect(env.NODE_ENV).toBe("development")
    expect(env.LOG_LEVEL).toBe("info")
    expect(env.TRUST_PROXY).toBe("unvalidated")
  })

  it("does not skip validation for a differently cased flag", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "TRUE")
    vi.stubEnv("TRUST_PROXY", "unvalidated")
    await expect(import("@/env")).rejects.toThrow(
      "Invalid environment variables",
    )
  })
})
