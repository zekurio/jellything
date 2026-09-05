import { watch, type FSWatcher } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { Type } from "typebox"

import { configManager } from "@/lib/server/config.server"
import { parse, stringSchema } from "@/lib/validation"
import { logger } from "@/server/logger"

const pinFileSchema = Type.Object({
  Pin: stringSchema({ minLength: 1 }),
  UserName: stringSchema({ minLength: 1 }),
  PinFile: stringSchema({ minLength: 1 }),
  ExpirationDate: stringSchema({ minLength: 1 }),
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
    const validated = parse(pinFileSchema, parsed)
    const expirationDate = new Date(validated.ExpirationDate)

    if (Number.isNaN(expirationDate.getTime())) {
      return null
    }

    return {
      pin: validated.Pin,
      userName: validated.UserName,
      pinFile: validated.PinFile,
      expirationDate,
    }
  } catch (error) {
    logger.debug({ error, filePath }, "Failed to parse PIN file")
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

export function getPasswordResetPinDirectory(): string | null {
  return configManager.jellyfinConfigPath ?? null
}

export async function listPasswordResetPins(): Promise<PasswordResetPin[]> {
  const configPath = getPasswordResetPinDirectory()
  if (!configPath) {
    return []
  }

  try {
    const files = await readdir(configPath)
    const pins: PasswordResetPin[] = []

    for (const file of files) {
      if (!isPinFile(file)) continue

      const pin = await parsePinFile(join(configPath, file))
      if (pin && isPinValid(pin)) {
        pins.push(pin)
      }
    }

    return pins
  } catch (error) {
    logger.error({ error, configPath }, "Failed to scan for PIN files")
    return []
  }
}

async function findPin(
  predicate: (pin: PasswordResetPin) => boolean,
): Promise<PasswordResetPin | null> {
  const pins = await listPasswordResetPins()
  return pins.find(predicate) ?? null
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

export function watchPasswordResetPinDirectory(
  configPath: string,
  onChange: () => void,
): FSWatcher {
  return watch(configPath, { persistent: false }, onChange)
}
