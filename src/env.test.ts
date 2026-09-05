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

describe("deployment configuration", () => {
  it("starts with local storage defaults and does not trust proxy headers by default", async () => {
    const { env } = await import("@/env")
    expect(env.DB_PATH).toBe("./data/inviterr.db")
    expect(env.CONFIG_PATH).toBe("./data/config.json")
    expect(env.TRUST_PROXY).toBe(false)
  })

  it("uses deployment paths and explicitly enables trusted proxy handling", async () => {
    vi.stubEnv("DB_PATH", "/var/lib/inviterr/db.sqlite")
    vi.stubEnv("CONFIG_PATH", "/var/lib/inviterr/config.json")
    vi.stubEnv("TRUST_PROXY", "true")
    const { env } = await import("@/env")
    expect(env.DB_PATH).toBe("/var/lib/inviterr/db.sqlite")
    expect(env.CONFIG_PATH).toBe("/var/lib/inviterr/config.json")
    expect(env.TRUST_PROXY).toBe(true)
  })

  it("refuses to start with an ambiguous proxy setting", async () => {
    vi.stubEnv("TRUST_PROXY", "maybe")
    await expect(import("@/env")).rejects.toThrow(
      "Invalid environment variables",
    )
  })

  it("allows build-time validation bypass without requiring deployment configuration", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "true")
    vi.stubEnv("DB_PATH", "")
    vi.stubEnv("TRUST_PROXY", "unvalidated")
    const { env } = await import("@/env")
    expect(env.DB_PATH).toBe("./data/inviterr.db")
    expect(env.CONFIG_PATH).toBe("./data/config.json")
    expect(env.TRUST_PROXY).toBe("unvalidated")
  })
})
