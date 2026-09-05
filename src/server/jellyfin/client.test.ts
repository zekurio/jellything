import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
  return import("@/server/jellyfin/admin")
}

describe("Jellyfin authentication", () => {
  it("sends credentials to Jellyfin and returns a member identity without upstream-only fields", async () => {
    const client = await configureClient()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        User: { Id: "member-id", Name: "Member", ServerId: "private-server" },
        AccessToken: "user-token",
        SessionInfo: { private: true },
      }),
    )
    vi.stubGlobal("fetch", fetch)

    const result = await client.authenticateUser("Member", "password")
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "http://jellyfin.test/Users/AuthenticateByName",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ Username: "Member", Pw: "password" }),
      }),
    )
    expect(result).toEqual({
      id: "member-id",
      name: "Member",
      isAdmin: false,
      accessToken: "user-token",
      avatarUrl: expect.any(String),
    })
  })

  it("rejects malformed privilege data instead of treating a truthy string as admin access", async () => {
    const client = await configureClient()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          User: {
            Id: "member-id",
            Name: "Member",
            Policy: { IsAdministrator: "true" },
          },
          AccessToken: "secret-token",
        }),
      ),
    )
    const result = client.authenticateUser("Member", "password")
    await expect(result).rejects.toMatchObject({
      name: "ExternalServiceDecodeError",
      service: "Jellyfin",
      path: "/Users/AuthenticateByName",
    })
    await expect(result).rejects.not.toThrow("secret-token")
  })
})
