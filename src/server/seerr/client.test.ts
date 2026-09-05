import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Type } from "typebox"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let temporaryDirectory: string

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "inviterr-seerr-"))
  vi.stubEnv("CONFIG_PATH", join(temporaryDirectory, "config.json"))
  globalThis.__INVITERR_CONFIG_MANAGER__ = undefined
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  globalThis.__INVITERR_CONFIG_MANAGER__ = undefined
  vi.resetModules()
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

async function configureClient() {
  const { configManager } = await import("@/lib/server/config.server")
  await configManager.initialize(
    { internalUrl: "http://jellyfin.test", apiKey: "jellyfin-key" },
    {
      seerr: { internalUrl: "http://seerr.test", apiKey: "seerr-key" },
    },
  )
  return import("@/server/seerr/client")
}

describe("Seerr response decoding", () => {
  it("preserves extra status fields while validating known fields", async () => {
    const client = await configureClient()
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ version: "1.0", extra: { supported: true } }),
        ),
    )
    expect(await client.getSeerrStatus()).toEqual({
      version: "1.0",
      extra: { supported: true },
    })
  })

  it("rejects malformed status fields with service and endpoint context", async () => {
    const client = await configureClient()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ version: 12 })),
    )
    await expect(client.getSeerrStatus()).rejects.toMatchObject({
      name: "ExternalServiceDecodeError",
      service: "Seerr",
      path: "/status",
    })
  })

  it("strips extra fields and returns the generic schema's decoded type", async () => {
    const client = await configureClient()
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ count: "42", secret: "hidden" })),
    )
    const schema = Type.Object({
      count: Type.Decode(Type.String(), (value) => Number(value)),
    })
    const result = await client.seerrRequestDecoded("/count", schema)
    const count: number = result.count
    expect(count).toBe(42)
    expect(result).toEqual({ count: 42 })
  })
})
