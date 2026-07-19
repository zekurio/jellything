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

// A single stable config/pin directory for the whole file: the app's env layer
// caches CONFIG_PATH from its first evaluation, so per-test config paths would go
// stale. Tests isolate instead by clearing the shared PIN directory each time.
let workDir: string | null = null
let pinDir: string | null = null

// Writes a Jellyfin-shaped password reset PIN file that the real resolver scans.
async function writePinFile(pin: string, userName: string) {
  const expirationDate = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  await writeFile(
    path.join(pinDir!, `passwordreset_${userName}.json`),
    JSON.stringify({
      Pin: pin,
      UserName: userName,
      PinFile: `passwordreset_${userName}.json`,
      ExpirationDate: expirationDate,
    }),
  )
}

async function loadModules() {
  vi.resetModules()
  const service = await import("@/server/password-reset")
  const rateLimit = await import("@/server/rate-limit")
  return { service, rateLimit }
}

// Mirrors the confirm handler's limiter keying so the test locks in the actual
// security-relevant expression: key by resolved account identity, never by the
// guessed PIN, with a single fallback bucket for unresolved PINs.
function limiterKeyForPin(
  rateLimit: typeof import("@/server/rate-limit"),
  pinInfo: { userName: string } | null,
) {
  return rateLimit.buildRateLimitKey(
    "password_reset_pin",
    pinInfo?.userName ?? "invalid",
  )
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "inviterr-reset-"))
  pinDir = path.join(workDir, "jellyfin-config")

  process.env.SKIP_ENV_VALIDATION = "true"
  process.env.NODE_ENV = "test"
  process.env.LOG_LEVEL = "fatal"
  process.env.DB_PATH = path.join(workDir, "test.db")
  process.env.CONFIG_PATH = path.join(workDir, "config.json")

  await writeFile(
    process.env.CONFIG_PATH,
    JSON.stringify({
      jellyfin: {
        internalUrl: "http://localhost:8096",
        apiKey: "test-api-key",
        configPath: pinDir,
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

describe("password reset PIN limiter keying", () => {
  it("keys a resolved PIN by account identity, not the guessed PIN", async () => {
    const { service, rateLimit } = await loadModules()
    await writePinFile("111111", "alice")

    const pinInfo = await service.findPasswordResetPinForCode("111111")
    expect(pinInfo?.userName).toBe("alice")

    const key = limiterKeyForPin(rateLimit, pinInfo)
    expect(key).toBe(rateLimit.buildRateLimitKey("password_reset_pin", "alice"))
    // The raw PIN must never appear in the rate-limit key, otherwise every guess
    // would land in a fresh bucket (the vulnerability this fix closes).
    expect(key).not.toBe(
      rateLimit.buildRateLimitKey("password_reset_pin", "111111"),
    )
  })

  it("keys distinct resolved PINs by their own accounts", async () => {
    const { service, rateLimit } = await loadModules()
    await writePinFile("111111", "alice")
    await writePinFile("222222", "bob")

    const alice = limiterKeyForPin(
      rateLimit,
      await service.findPasswordResetPinForCode("111111"),
    )
    const bob = limiterKeyForPin(
      rateLimit,
      await service.findPasswordResetPinForCode("222222"),
    )

    expect(alice).toBe(
      rateLimit.buildRateLimitKey("password_reset_pin", "alice"),
    )
    expect(bob).toBe(rateLimit.buildRateLimitKey("password_reset_pin", "bob"))
    expect(alice).not.toBe(bob)
  })

  it("routes every unresolved PIN into one shared fallback bucket", async () => {
    const { service, rateLimit } = await loadModules()
    await writePinFile("111111", "alice")

    const firstGuess = await service.findPasswordResetPinForCode("999999")
    const secondGuess = await service.findPasswordResetPinForCode("888888")
    expect(firstGuess).toBeNull()
    expect(secondGuess).toBeNull()

    const fallback = rateLimit.buildRateLimitKey(
      "password_reset_pin",
      "invalid",
    )
    expect(limiterKeyForPin(rateLimit, firstGuess)).toBe(fallback)
    expect(limiterKeyForPin(rateLimit, secondGuess)).toBe(fallback)
  })

  it("exhausts a single bucket across many distinct invalid guesses", async () => {
    const { service, rateLimit } = await loadModules()

    // passwordResetPinLimiter allows 5 attempts; six distinct wrong guesses must
    // still exhaust one shared bucket rather than minting a fresh bucket each.
    const guesses = ["100001", "100002", "100003", "100004", "100005", "100006"]
    const outcomes: boolean[] = []
    for (const guess of guesses) {
      const pinInfo = await service.findPasswordResetPinForCode(guess)
      const result = await rateLimit.consumeRateLimit(
        rateLimit.passwordResetPinLimiter,
        limiterKeyForPin(rateLimit, pinInfo),
      )
      outcomes.push(result.allowed)
    }

    expect(outcomes).toEqual([true, true, true, true, true, false])
  })
})
