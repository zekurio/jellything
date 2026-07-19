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

const ORIGINAL_CONFIG_PATH = process.env.CONFIG_PATH

let temporaryDirectory: string
let configPath: string

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "inviterr-config-"))
  configPath = join(temporaryDirectory, "private", "config.json")
  process.env.CONFIG_PATH = configPath
  globalThis.__INVITERR_CONFIG_MANAGER__ = undefined
  globalThis.__inviterrSetupKey = undefined
  vi.resetModules()
})

afterEach(() => {
  process.env.CONFIG_PATH = ORIGINAL_CONFIG_PATH
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
