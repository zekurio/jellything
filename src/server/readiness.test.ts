import { beforeEach, describe, expect, it, vi } from "vitest"

beforeEach(() => {
  process.env.LOG_LEVEL = "fatal"
  vi.resetModules()
})

describe("application readiness", () => {
  it("shares one successful initialization across callers", async () => {
    const ensureMigrated = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined)
    vi.doMock("@/server/db", () => ({ ensureMigrated }))

    const { ensureApplicationReady, getReadinessStatus } =
      await import("@/server/readiness")

    await Promise.all([ensureApplicationReady(), ensureApplicationReady()])

    expect(ensureMigrated).toHaveBeenCalledTimes(1)
    expect(getReadinessStatus()).toBe("ready")
  })

  it("reports failure and retries initialization", async () => {
    const ensureMigrated = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("migration failed"))
      .mockResolvedValueOnce(undefined)
    vi.doMock("@/server/db", () => ({ ensureMigrated }))

    const { ensureApplicationReady, getReadinessStatus } =
      await import("@/server/readiness")

    await expect(ensureApplicationReady()).rejects.toThrow("migration failed")
    expect(getReadinessStatus()).toBe("error")

    await expect(ensureApplicationReady()).resolves.toBeUndefined()
    expect(ensureMigrated).toHaveBeenCalledTimes(2)
    expect(getReadinessStatus()).toBe("ready")
  })
})
