import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Type } from "typebox"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let temporaryDirectory: string

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "inviterr-jellyfin-"))
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
  await configManager.initialize({
    internalUrl: "http://jellyfin.test",
    apiKey: "jellyfin-key",
  })
  return import("@/server/jellyfin/client")
}

describe("Jellyfin response decoding", () => {
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
    const result = await client.jellyfinRequestDecoded("/count", schema)
    const count: number = result.count
    expect(count).toBe(42)
    expect(result).toEqual({ count: 42 })
  })

  it("rejects malformed responses with service and endpoint context", async () => {
    const client = await configureClient()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ id: "secret" })),
    )
    await expect(
      client.jellyfinRequestDecoded(
        "/Users/Me",
        Type.Object({ id: Type.Number() }),
      ),
    ).rejects.toMatchObject({
      name: "ExternalServiceDecodeError",
      service: "Jellyfin",
      path: "/Users/Me",
    })
  })
})
