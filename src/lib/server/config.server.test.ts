import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let temporaryDirectory: string
let configPath: string

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "inviterr-config-"))
  configPath = join(temporaryDirectory, "private", "config.json")
  vi.stubEnv("CONFIG_PATH", configPath)
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("LOG_LEVEL", "fatal")
  globalThis.__INVITERR_CONFIG_MANAGER__ = undefined
  globalThis.__inviterrSetupKey = undefined
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  globalThis.__INVITERR_CONFIG_MANAGER__ = undefined
  globalThis.__inviterrSetupKey = undefined
  vi.resetModules()
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

async function loadConfigManager() {
  // The singleton reads CONFIG_PATH at module initialization, so each isolated
  // filesystem fixture intentionally exercises a fresh module boundary.
  const { configManager } = await import("@/lib/server/config.server")
  return configManager
}

const jellyfinConfig = {
  internalUrl: "http://jellyfin.test",
  apiKey: "test-api-key",
}

describe("config validation", () => {
  it("defaults nested settings, trims pages, and strips unknown properties", async () => {
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(
      configPath,
      JSON.stringify({
        jellyfin: { ...jellyfinConfig, unknown: "discard" },
        app: { title: "", unknown: true },
        memberOnboarding: {
          pages: [
            {
              id: "welcome",
              title: `  ${"x".repeat(100)}  `,
              markdown: "  Hello  ",
              unknown: true,
            },
          ],
        },
        email: { smtp: { host: "smtp.test", port: 587 } },
        unknown: true,
      }),
    )
    const configManager = await loadConfigManager()

    expect(configManager.get()).toMatchObject({
      app: {
        title: "",
        description: "A companion app for Jellyfin",
        defaultLocale: "en",
      },
      memberOnboarding: {
        enabled: false,
        pages: [{ id: "welcome", title: "x".repeat(100), markdown: "Hello" }],
      },
      email: {
        from: "Inviterr <noreply@example.com>",
        smtp: { secure: false },
      },
    })
    expect(configManager.get()).not.toHaveProperty("unknown")
    expect(configManager.jellyfin).not.toHaveProperty("unknown")
    expect(configManager.app).not.toHaveProperty("unknown")
    expect(configManager.memberOnboarding.pages[0]).not.toHaveProperty(
      "unknown",
    )
  })

  it.each([
    [{ app: null }, "app"],
    [{ app: { defaultLocale: "fr" } }, "app.defaultLocale"],
    [
      { auth: { sessionSecret: "short", encryptionKey: "x".repeat(32) } },
      "auth.sessionSecret",
    ],
    [
      { jellyfin: { ...jellyfinConfig, internalUrl: "not a URL" } },
      "jellyfin.internalUrl",
    ],
    [
      { seerr: { internalUrl: "http://seerr.test", apiKey: "" } },
      "seerr.apiKey",
    ],
    [
      {
        memberOnboarding: {
          pages: [{ id: "page", title: "   ", markdown: "body" }],
        },
      },
      "memberOnboarding.pages.0.title",
    ],
    [{ email: { smtp: { host: "smtp.test", port: 1.5 } } }, "email.smtp.port"],
    [
      { email: { smtp: { host: "smtp.test", port: 65536 } } },
      "email.smtp.port",
    ],
    [
      { email: { branding: { accentColor: "red" } } },
      "email.branding.accentColor",
    ],
    [
      {
        email: {
          branding: {
            logo: { mimeType: "text/plain", base64: "x", width: 1, height: 1 },
          },
        },
      },
      "email.branding.logo.mimeType",
    ],
  ])("rejects invalid config %j with a field path", async (invalid, path) => {
    mkdirSync(dirname(configPath), { recursive: true })
    const payload = JSON.stringify({ jellyfin: jellyfinConfig, ...invalid })
    writeFileSync(configPath, payload)
    const configManager = await loadConfigManager()

    expect(configManager.isConfigured()).toBe(false)
    expect(configManager.needsOnboarding()).toBe(false)
    expect(configManager.getError()).toContain("Config validation error:")
    expect(configManager.getError()).toContain(path)
    expect(readFileSync(configPath, "utf-8")).toBe(payload)
  })

  it("recovers after an invalid config file is replaced", async () => {
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, "{")
    const configManager = await loadConfigManager()
    expect(configManager.getError()).toContain("Config JSON parse error:")

    // A missing file changes the tracked mtime even on coarse-resolution filesystems.
    rmSync(configPath)
    expect(configManager.needsOnboarding()).toBe(true)
    writeFileSync(configPath, JSON.stringify({ jellyfin: jellyfinConfig }))
    expect(configManager.isConfigured()).toBe(true)
    expect(configManager.getError()).toBeNull()
    expect(configManager.needsOnboarding()).toBe(false)
  })
})

describe("config persistence", () => {
  it("creates the config directory and file with restrictive permissions", async () => {
    const configManager = await loadConfigManager()

    await configManager.initialize(jellyfinConfig)

    expect(statSync(dirname(configPath)).mode & 0o777).toBe(0o700)
    expect(statSync(configPath).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(configPath, "utf-8"))).toMatchObject({
      jellyfin: jellyfinConfig,
    })
  })

  it("normalizes legacy config synchronously through a restrictive atomic write", async () => {
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, JSON.stringify({ jellyfin: jellyfinConfig }), {
      mode: 0o644,
    })
    const configManager = await loadConfigManager()

    expect(configManager.isConfigured()).toBe(true)

    const persisted = JSON.parse(readFileSync(configPath, "utf-8"))
    expect(persisted.auth.sessionSecret).toHaveLength(43)
    expect(persisted.auth.encryptionKey).toHaveLength(43)
    expect(statSync(dirname(configPath)).mode & 0o777).toBe(0o700)
    expect(statSync(configPath).mode & 0o777).toBe(0o600)
  })

  it("keeps the valid file and in-memory config when atomic replacement fails", async () => {
    const configManager = await loadConfigManager()
    await configManager.initialize(jellyfinConfig, {
      app: { title: "Original title" },
    })
    const originalPayload = readFileSync(configPath, "utf-8")
    const backupPath = `${configPath}.valid`

    renameSync(configPath, backupPath)
    mkdirSync(configPath)
    writeFileSync(join(configPath, "block-replacement"), "occupied")

    try {
      await expect(
        configManager.setApp({ title: "Unpersisted title" }),
      ).rejects.toThrow("Config not loaded. Run onboarding first.")
      expect(
        readdirSync(dirname(configPath)).filter(
          (entry) => entry.startsWith("config.json.") && entry.endsWith(".tmp"),
        ),
      ).toEqual([])
    } finally {
      rmSync(configPath, { recursive: true })
      renameSync(backupPath, configPath)
    }

    expect(readFileSync(configPath, "utf-8")).toBe(originalPayload)
    expect(configManager.app.title).toBe("Original title")
  })
})
