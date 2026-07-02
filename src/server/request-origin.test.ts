import { randomBytes } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

let configDirectory: string | null = null
let configPath = ""

async function loadRequestOrigin(trustProxy: boolean) {
  process.env.TRUST_PROXY = trustProxy ? "true" : "false"
  vi.resetModules()
  return import("@/server/request-origin")
}

beforeAll(async () => {
  configDirectory = await mkdtemp(path.join(tmpdir(), "jellything-origin-"))
  configPath = path.join(configDirectory, "config.json")
  process.env.SKIP_ENV_VALIDATION = "false"
  process.env.NODE_ENV = "test"
  process.env.LOG_LEVEL = "fatal"
  process.env.CONFIG_PATH = configPath
})

afterAll(async () => {
  if (configDirectory) {
    await rm(configDirectory, { recursive: true, force: true })
  }
  configDirectory = null
})

describe("request origin trust gating", () => {
  it("ignores forged x-forwarded-host when TRUST_PROXY is false", async () => {
    const { isAllowedRequestOrigin, getTrustedRequestOrigin } =
      await loadRequestOrigin(false)

    const request = new Request("https://app.example.com/api/rpc", {
      headers: {
        origin: "https://evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
    })

    expect(isAllowedRequestOrigin(request)).toBe(false)
    // A spoofed forwarded host must not become the persisted app URL.
    expect(getTrustedRequestOrigin(request)).toBe("https://app.example.com")
  })

  it("allows the runtime request origin when TRUST_PROXY is false", async () => {
    const { isAllowedRequestOrigin } = await loadRequestOrigin(false)

    const request = new Request("https://app.example.com/api/rpc", {
      headers: {
        origin: "https://app.example.com",
        "x-forwarded-host": "evil.example",
      },
    })

    expect(isAllowedRequestOrigin(request)).toBe(true)
  })

  it("trusts forwarded host/proto for the canonical origin when TRUST_PROXY is true", async () => {
    const { isAllowedRequestOrigin, getTrustedRequestOrigin } =
      await loadRequestOrigin(true)

    const request = new Request("http://internal.local:3000/api/rpc", {
      headers: {
        origin: "https://proxy.example.com",
        "x-forwarded-host": "proxy.example.com",
        "x-forwarded-proto": "https",
      },
    })

    expect(isAllowedRequestOrigin(request)).toBe(true)
    expect(getTrustedRequestOrigin(request)).toBe("https://proxy.example.com")
  })

  it("still rejects unrelated origins when TRUST_PROXY is true", async () => {
    const { isAllowedRequestOrigin } = await loadRequestOrigin(true)

    const request = new Request("http://internal.local:3000/api/rpc", {
      headers: {
        origin: "https://evil.example",
        "x-forwarded-host": "proxy.example.com",
        "x-forwarded-proto": "https",
      },
    })

    expect(isAllowedRequestOrigin(request)).toBe(false)
  })

  it("allows the configured app.url regardless of forwarded headers", async () => {
    const secret = randomBytes(32).toString("hex")
    await writeFile(
      configPath,
      JSON.stringify({
        app: { url: "https://configured.example.com" },
        auth: { sessionSecret: secret, encryptionKey: secret },
        jellyfin: {
          internalUrl: "http://localhost:8096",
          apiKey: "test-api-key",
        },
      }),
      "utf-8",
    )

    const { isAllowedRequestOrigin } = await loadRequestOrigin(false)

    const request = new Request("http://internal.local:3000/api/rpc", {
      headers: {
        origin: "https://configured.example.com",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
    })

    expect(isAllowedRequestOrigin(request)).toBe(true)
  })
})
