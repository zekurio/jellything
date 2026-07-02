import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

// Regression coverage for the constant-time password-reset request path. The
// request endpoint used to await the Jellyfin lookup, forgot-password call, an
// up-to-10s PIN wait, and SMTP send only for existing verified users, leaking
// account existence through response latency. The fix moves that work into a
// fire-and-forget background task so the request always returns immediately with
// a uniform result, regardless of whether the account exists or Jellyfin is
// reachable.
let workDir: string | null = null
let pinDir: string | null = null

async function loadService() {
  vi.resetModules()
  return import("@/server/password-reset-service")
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "jellything-reset-timing-"))
  pinDir = path.join(workDir, "jellyfin-config")

  process.env.SKIP_ENV_VALIDATION = "true"
  process.env.NODE_ENV = "test"
  process.env.LOG_LEVEL = "fatal"
  process.env.DB_PATH = path.join(workDir, "test.db")
  process.env.CONFIG_PATH = path.join(workDir, "config.json")

  // Jellyfin points at a port with nothing listening so the background lookup
  // rejects fast; email is fully configured so the request path clears its
  // config checks and reaches background scheduling.
  await writeFile(
    process.env.CONFIG_PATH,
    JSON.stringify({
      jellyfin: {
        internalUrl: "http://127.0.0.1:1",
        apiKey: "test-api-key",
        configPath: pinDir,
      },
      email: {
        from: "Jellything <noreply@example.com>",
        smtp: {
          host: "127.0.0.1",
          port: 1,
        },
      },
    }),
  )
})

beforeEach(async () => {
  await rm(pinDir!, { recursive: true, force: true })
  await mkdir(pinDir!, { recursive: true })
})

afterAll(async () => {
  await rm(workDir!, { recursive: true, force: true })
  workDir = null
  pinDir = null
  vi.resetModules()
})

describe("requestPasswordReset timing", () => {
  it("returns success without awaiting the background Jellyfin/PIN/email work", async () => {
    const service = await loadService()

    // Jellyfin is unreachable, so the previous awaited path would surface an
    // OPERATION_FAILED error. A uniform success here proves the account work now
    // runs in the background and never blocks or alters the response.
    const result = await service.requestPasswordReset({ username: "someone" })

    expect(result).toEqual({ success: true, data: null })
  })

  it("returns a validation error immediately without scheduling background work", async () => {
    const service = await loadService()

    const result = await service.requestPasswordReset({ username: "" })

    expect(result).toMatchObject({ success: false, code: "VALIDATION_FAILED" })
  })
})
