import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let temporaryDirectory: string
let pinDirectory: string

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "inviterr-pins-"))
  pinDirectory = join(temporaryDirectory, "pins")
  mkdirSync(pinDirectory)
  vi.stubEnv("CONFIG_PATH", join(temporaryDirectory, "config.json"))
  globalThis.__INVITERR_CONFIG_MANAGER__ = undefined
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  globalThis.__INVITERR_CONFIG_MANAGER__ = undefined
  vi.resetModules()
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

describe("password reset PIN files", () => {
  it("reads valid PINs and ignores malformed, expired, and unrelated files", async () => {
    const { configManager } = await import("@/lib/server/config.server")
    await configManager.initialize({
      internalUrl: "http://jellyfin.test",
      apiKey: "test-key",
      configPath: pinDirectory,
    })
    const valid = {
      Pin: "123456",
      UserName: "Alice",
      PinFile: "passwordreset-valid.json",
      ExpirationDate: "2999-01-01T00:00:00Z",
    }
    const files = {
      "passwordreset-valid.json": JSON.stringify({
        ...valid,
        Extra: "ignored",
      }),
      "passwordreset-empty.json": JSON.stringify({ ...valid, Pin: "" }),
      "passwordreset-type.json": JSON.stringify({ ...valid, UserName: 123 }),
      "passwordreset-missing.json": JSON.stringify({ Pin: "123456" }),
      "passwordreset-expired.json": JSON.stringify({
        ...valid,
        ExpirationDate: "2000-01-01T00:00:00Z",
      }),
      "passwordreset-date.json": JSON.stringify({
        ...valid,
        ExpirationDate: "invalid",
      }),
      "passwordreset-json.json": "{",
      "unrelated.json": JSON.stringify(valid),
    }
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(pinDirectory, name), content)
    }
    const { listPasswordResetPins, findPasswordResetPin } =
      await import("@/server/jellyfin/password-reset")

    expect(await listPasswordResetPins()).toEqual([
      {
        pin: "123456",
        userName: "Alice",
        pinFile: "passwordreset-valid.json",
        expirationDate: new Date(valid.ExpirationDate),
      },
    ])
    expect(await findPasswordResetPin("ALICE")).toMatchObject({ pin: "123456" })
  })
})
