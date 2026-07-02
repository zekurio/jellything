import { watch, type FSWatcher } from "fs"
import { readdir, readFile } from "fs/promises"
import { join } from "path"

import { z } from "zod"

import { configManager } from "@/lib/server/config.server"
import { logger } from "@/server/logger"

// Jellyfin password reset PIN file content.
const pinFileSchema = z.object({
  Pin: z.string(),
  UserName: z.string(),
  PinFile: z.string(),
  ExpirationDate: z.string(),
})

export interface PasswordResetPin {
  pin: string
  userName: string
  pinFile: string
  expirationDate: Date
}

async function parsePinFile(
  filePath: string,
): Promise<PasswordResetPin | null> {
  try {
    const content = await readFile(filePath, "utf-8")
    const parsed = JSON.parse(content)
    const validated = pinFileSchema.parse(parsed)

    return {
      pin: validated.Pin,
      userName: validated.UserName,
      pinFile: validated.PinFile,
      expirationDate: new Date(validated.ExpirationDate),
    }
  } catch (error) {
    logger.warn({ error, filePath }, "Failed to parse PIN file")
    return null
  }
}

export function isPinValid(pin: PasswordResetPin): boolean {
  return pin.expirationDate > new Date()
}

const PIN_FILE_PREFIX = "passwordreset"
const PIN_FILE_SUFFIX = ".json"

function isPinFile(filename: string): boolean {
  return (
    filename.startsWith(PIN_FILE_PREFIX) && filename.endsWith(PIN_FILE_SUFFIX)
  )
}

function getConfigPath(): string | null {
  const configPath = configManager.jellyfinConfigPath
  if (!configPath) {
    logger.warn("Jellyfin config path not configured")
    return null
  }
  return configPath
}

async function findPin(
  predicate: (pin: PasswordResetPin) => boolean,
): Promise<PasswordResetPin | null> {
  const configPath = getConfigPath()
  if (!configPath) {
    return null
  }

  try {
    const files = await readdir(configPath)
    for (const file of files) {
      if (!isPinFile(file)) continue

      const filePath = join(configPath, file)
      const pin = await parsePinFile(filePath)
      if (!pin || !isPinValid(pin)) continue

      if (predicate(pin)) return pin
    }

    return null
  } catch (error) {
    logger.error({ error, configPath }, "Failed to scan for PIN files")
    return null
  }
}

export async function findPasswordResetPin(
  username: string,
): Promise<PasswordResetPin | null> {
  const normalized = username.toLowerCase()
  return findPin((pin) => pin.userName.toLowerCase() === normalized)
}

export async function findPasswordResetPinByCode(
  pinCode: string,
): Promise<PasswordResetPin | null> {
  return findPin((pin) => pin.pin === pinCode)
}

/**
 * Watch for a new password reset PIN file to appear.
 * Uses file system watching on the top level of the config folder.
 *
 * @param username - The username to watch for
 * @param timeoutMs - Maximum time to wait (default: 10 seconds)
 * @returns The PIN info if found within timeout, null otherwise
 */
export async function waitForPasswordResetPin(
  username: string,
  timeoutMs: number = 10000,
): Promise<PasswordResetPin | null> {
  const configPath = getConfigPath()
  if (!configPath) return null

  // First check if a PIN file already exists
  const existingPin = await findPasswordResetPin(username)
  if (existingPin) {
    return existingPin
  }

  return new Promise((resolve) => {
    let watcher: FSWatcher | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const cleanup = (): void => {
      if (watcher) {
        watcher.close()
        watcher = null
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const handleFileChange = async (
      eventType: string,
      filename: string | null,
    ): Promise<void> => {
      if (!filename) return

      if (!isPinFile(filename)) {
        return
      }

      logger.debug({ eventType, filename }, "Detected PIN file change")

      // Give Jellyfin a moment to finish writing the file
      await new Promise((r) => setTimeout(r, 100))

      const filePath = join(configPath, filename)
      const pin = await parsePinFile(filePath)

      if (
        pin &&
        pin.userName.toLowerCase() === username.toLowerCase() &&
        isPinValid(pin)
      ) {
        cleanup()
        resolve(pin)
      }
    }

    try {
      watcher = watch(
        configPath,
        { persistent: false },
        (eventType, filename) => {
          handleFileChange(eventType, filename).catch((err) => {
            logger.error({ err }, "Error handling file change")
          })
        },
      )

      watcher.on("error", (error) => {
        logger.error({ error }, "File watcher error")
        cleanup()
        resolve(null)
      })

      timeoutId = setTimeout(() => {
        logger.debug({ username, timeoutMs }, "PIN file watch timed out")
        cleanup()
        resolve(null)
      }, timeoutMs)
    } catch (error) {
      logger.error({ error }, "Failed to start file watcher")
      cleanup()
      resolve(null)
    }
  })
}
