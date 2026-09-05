import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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

  it("searches subsequent pages for the matching Jellyfin account rather than selecting the first result", async () => {
    await configureClient()
    const { findSeerrUserByJellyfinId } = await import("@/server/seerr/users")
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({
          results: Array.from({ length: 50 }, (_, id) => ({
            id,
            jellyfinUserId: `other-${id}`,
          })),
          pageInfo: { pages: 2, pageSize: 50, results: 51, page: 1 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              id: 51,
              jellyfinUserId: "member-id",
              email: null,
              internalSecret: "hidden",
            },
          ],
          pageInfo: { pages: 2, pageSize: 50, results: 51, page: 2 },
        }),
      )
    vi.stubGlobal("fetch", fetch)
    expect(await findSeerrUserByJellyfinId("member-id", "Member")).toEqual({
      id: 51,
      jellyfinUserId: "member-id",
      email: null,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("skip=50"),
      expect.any(Object),
    )
  })

  it("finds an account when Seerr returns the legacy unpaginated user list", async () => {
    await configureClient()
    const { findSeerrUserByJellyfinId } = await import("@/server/seerr/users")
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json([
        { id: 1, jellyfinUserId: "other-id" },
        { id: 2, jellyfinUserId: "member-id" },
      ]),
    )
    vi.stubGlobal("fetch", fetch)
    expect(await findSeerrUserByJellyfinId("member-id", "Member")).toEqual({
      id: 2,
      jellyfinUserId: "member-id",
    })
    expect(fetch).toHaveBeenCalledOnce()
  })
})
