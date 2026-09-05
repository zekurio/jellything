import "@tanstack/react-start/server-only"
import { randomBytes, timingSafeEqual } from "node:crypto"
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import type { FileHandle } from "node:fs/promises"
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises"
import { dirname } from "node:path"

import { Type, type StaticDecode } from "typebox"

import { env } from "@/env"
import {
  BRANDING_IMAGE_MAX_BASE64_LENGTH,
  BRANDING_IMAGE_MIME_TYPES,
  HEX_COLOR_PATTERN,
} from "@/lib/branding"
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from "@/lib/i18n"
import {
  defaulted,
  enumValues,
  parse,
  trimmedString,
  ValidationError,
} from "@/lib/validation"
import { logger } from "@/server/logger"

const DEFAULT_APP_CONFIG = {
  title: "Inviterr",
  description: "A companion app for Jellyfin",
  defaultLocale: DEFAULT_LOCALE as Locale,
  url: undefined as string | undefined,
}

const AUTH_SECRET_BYTES = 32

function generateConfigSecret(): string {
  return randomBytes(AUTH_SECRET_BYTES).toString("base64url")
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

const DEFAULT_AUTH_CONFIG = {
  sessionSecret: generateConfigSecret(),
  encryptionKey: generateConfigSecret(),
}

const memberOnboardingPageSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  title: trimmedString({ minLength: 1, maxLength: 100 }),
  markdown: trimmedString({ minLength: 1, maxLength: 8000 }),
})

const seerrConfigSchema = Type.Object({
  internalUrl: Type.String({ format: "uri" }),
  externalUrl: Type.Optional(Type.String({ format: "uri" })),
  apiKey: Type.String({ minLength: 1 }),
})

const brandingImageSchema = Type.Object({
  mimeType: enumValues(BRANDING_IMAGE_MIME_TYPES),
  base64: Type.String({
    minLength: 1,
    maxLength: BRANDING_IMAGE_MAX_BASE64_LENGTH,
  }),
  width: Type.Integer({ minimum: 1 }),
  height: Type.Integer({ minimum: 1 }),
})

const emailBrandingSchema = Type.Object({
  accentColor: Type.Optional(
    Type.String({ pattern: HEX_COLOR_PATTERN.source }),
  ),
  pageBackgroundColor: Type.Optional(
    Type.String({ pattern: HEX_COLOR_PATTERN.source }),
  ),
  logo: Type.Optional(brandingImageSchema),
})

const DEFAULT_MEMBER_ONBOARDING_CONFIG = {
  enabled: false,
  pages: [],
}

declare global {
  var __inviterrSetupKey: string | undefined
}

const configSchema = Type.Object({
  app: defaulted(
    Type.Object({
      title: defaulted(Type.String(), DEFAULT_APP_CONFIG.title),
      description: defaulted(Type.String(), DEFAULT_APP_CONFIG.description),
      defaultLocale: defaulted(
        enumValues(SUPPORTED_LOCALES),
        DEFAULT_APP_CONFIG.defaultLocale,
      ),
      url: Type.Optional(Type.String({ format: "uri" })),
    }),
    DEFAULT_APP_CONFIG,
  ),
  auth: defaulted(
    Type.Object({
      sessionSecret: Type.String({ minLength: 32 }),
      encryptionKey: Type.String({ minLength: 32 }),
    }),
    DEFAULT_AUTH_CONFIG,
  ),
  memberOnboarding: defaulted(
    Type.Object({
      enabled: defaulted(
        Type.Boolean(),
        DEFAULT_MEMBER_ONBOARDING_CONFIG.enabled,
      ),
      pages: defaulted(
        Type.Array(memberOnboardingPageSchema),
        DEFAULT_MEMBER_ONBOARDING_CONFIG.pages,
      ),
    }),
    DEFAULT_MEMBER_ONBOARDING_CONFIG,
  ),
  jellyfin: Type.Object({
    internalUrl: Type.String({ format: "uri" }),
    externalUrl: Type.Optional(Type.String({ format: "uri" })),
    apiKey: Type.String({ minLength: 1 }),
    configPath: Type.Optional(Type.String()),
    displayName: Type.Optional(Type.String({ minLength: 1 })),
  }),
  seerr: Type.Optional(seerrConfigSchema),
  email: Type.Optional(
    Type.Object({
      from: defaulted(Type.String(), "Inviterr <noreply@example.com>"),
      smtp: Type.Optional(
        Type.Object({
          host: Type.String({ minLength: 1 }),
          port: Type.Integer({ minimum: 1, maximum: 65535 }),
          secure: defaulted(Type.Boolean(), false),
          username: Type.Optional(Type.String({ minLength: 1 })),
          password: Type.Optional(Type.String({ minLength: 1 })),
        }),
      ),
      branding: Type.Optional(emailBrandingSchema),
    }),
  ),
})

export type Config = StaticDecode<typeof configSchema>
export type JellyfinConfig = Config["jellyfin"]
export type SeerrConfig = NonNullable<Config["seerr"]>
export type AppConfig = Config["app"]
export type AuthConfig = Config["auth"]
export type EmailConfig = NonNullable<Config["email"]>
export type EmailBrandingConfig = NonNullable<EmailConfig["branding"]>
export type BrandingImageConfig = StaticDecode<typeof brandingImageSchema>
export type MemberOnboardingConfig = Config["memberOnboarding"]
const CONFIG_DIRECTORY_MODE = 0o700
const CONFIG_FILE_MODE = 0o600

function getTemporaryConfigPath(configPath: string): string {
  return `${configPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
}

function ensureConfigDirectorySync(configPath: string): void {
  const configDirectory = dirname(configPath)
  mkdirSync(configDirectory, {
    recursive: true,
    mode: CONFIG_DIRECTORY_MODE,
  })
  chmodSync(configDirectory, CONFIG_DIRECTORY_MODE)
}

async function ensureConfigDirectory(configPath: string): Promise<void> {
  const configDirectory = dirname(configPath)
  await mkdir(configDirectory, {
    recursive: true,
    mode: CONFIG_DIRECTORY_MODE,
  })
  await chmod(configDirectory, CONFIG_DIRECTORY_MODE)
}

function removeTemporaryConfigSync(temporaryPath: string): void {
  try {
    unlinkSync(temporaryPath)
  } catch (cleanupError) {
    if (
      cleanupError instanceof Error &&
      "code" in cleanupError &&
      cleanupError.code === "ENOENT"
    ) {
      return
    }
    logger.error(
      { err: cleanupError },
      "Failed to clean up temporary Inviterr config",
    )
  }
}

async function removeTemporaryConfig(temporaryPath: string): Promise<void> {
  try {
    await unlink(temporaryPath)
  } catch (cleanupError) {
    if (
      cleanupError instanceof Error &&
      "code" in cleanupError &&
      cleanupError.code === "ENOENT"
    ) {
      return
    }
    logger.error(
      { err: cleanupError },
      "Failed to clean up temporary Inviterr config",
    )
  }
}

function writeConfigAtomicallySync(configPath: string, payload: string): void {
  ensureConfigDirectorySync(configPath)
  const temporaryPath = getTemporaryConfigPath(configPath)
  let fileDescriptor: number | null = null
  let renamed = false

  try {
    fileDescriptor = openSync(temporaryPath, "wx", CONFIG_FILE_MODE)
    writeFileSync(fileDescriptor, payload, "utf-8")
    fsyncSync(fileDescriptor)
    closeSync(fileDescriptor)
    fileDescriptor = null
    renameSync(temporaryPath, configPath)
    renamed = true
  } finally {
    if (fileDescriptor !== null) {
      try {
        closeSync(fileDescriptor)
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError },
          "Failed to close temporary Inviterr config",
        )
      }
    }
    if (!renamed) {
      removeTemporaryConfigSync(temporaryPath)
    }
  }
}

async function writeConfigAtomically(
  configPath: string,
  payload: string,
): Promise<void> {
  await ensureConfigDirectory(configPath)
  const temporaryPath = getTemporaryConfigPath(configPath)
  let fileHandle: FileHandle | null = null
  let renamed = false

  try {
    fileHandle = await open(temporaryPath, "wx", CONFIG_FILE_MODE)
    await fileHandle.writeFile(payload, "utf-8")
    await fileHandle.sync()
    await fileHandle.close()
    fileHandle = null
    await rename(temporaryPath, configPath)
    renamed = true
  } finally {
    if (fileHandle !== null) {
      try {
        await fileHandle.close()
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError },
          "Failed to close temporary Inviterr config",
        )
      }
    }
    if (!renamed) {
      await removeTemporaryConfig(temporaryPath)
    }
  }
}

class ConfigManager {
  private config: Config | null = null
  private configPath: string
  private setupKey: string | null = null
  private error: string | null = null
  private loaded = false
  private loadedMtimeMs: number | null = null

  private persistLoadedConfig(config: Config, logMessage: string): void {
    try {
      const payload = JSON.stringify(config, null, "\t")
      writeConfigAtomicallySync(this.configPath, payload)
      this.loadedMtimeMs = this.getConfigMtimeMs()
      logger.info(logMessage)
    } catch (saveError) {
      logger.error(
        { err: saveError },
        "Failed to persist normalized Inviterr config",
      )
      throw saveError
    }
  }

  constructor() {
    this.configPath = env.CONFIG_PATH
  }

  private loadSetupKey(): void {
    if (this.setupKey) {
      return
    }

    const globalSetupKey = globalThis.__inviterrSetupKey
    if (!globalSetupKey) {
      this.generateSetupKey()
      return
    }

    this.setupKey = globalSetupKey
    logger.info({ setupKey: this.setupKey }, "Loaded setup key for onboarding")
  }

  private getConfigMtimeMs(): number | null {
    if (!existsSync(this.configPath)) {
      return null
    }

    try {
      return statSync(this.configPath).mtimeMs
    } catch {
      return null
    }
  }

  load(): void {
    const currentMtimeMs = this.getConfigMtimeMs()
    if (this.loaded && currentMtimeMs === this.loadedMtimeMs) {
      if (currentMtimeMs === null && this.setupKey === null) {
        this.loadSetupKey()
      }
      return
    }

    this.loaded = true
    this.loadedMtimeMs = currentMtimeMs
    this.error = null
    this.config = null

    if (currentMtimeMs === null) {
      this.loadSetupKey()
      return
    }

    try {
      const raw = readFileSync(this.configPath, "utf-8")
      const parsed = JSON.parse(raw)
      const parsedConfig = parse(configSchema, parsed)

      const parsedAuth = (
        parsed as {
          auth?: { sessionSecret?: unknown; encryptionKey?: unknown }
        }
      ).auth
      const hasSessionSecret =
        typeof parsedAuth?.sessionSecret === "string" &&
        parsedAuth.sessionSecret.length >= 32
      const hasEncryptionKey =
        typeof parsedAuth?.encryptionKey === "string" &&
        parsedAuth.encryptionKey.length >= 32

      const updatedConfig =
        !hasSessionSecret || !hasEncryptionKey
          ? {
              ...parsedConfig,
              auth: {
                sessionSecret: hasSessionSecret
                  ? (parsedAuth?.sessionSecret as string)
                  : generateConfigSecret(),
                encryptionKey: hasEncryptionKey
                  ? (parsedAuth?.encryptionKey as string)
                  : generateConfigSecret(),
              },
            }
          : parsedConfig

      if (!hasSessionSecret || !hasEncryptionKey) {
        this.persistLoadedConfig(
          updatedConfig,
          "Generated and persisted missing Inviterr auth settings in config",
        )
      }
      this.config = updatedConfig

      this.clearSetupKey()
    } catch (e) {
      if (e instanceof ValidationError) {
        this.error = `Config validation error: ${e.issues.map((err) => `${err.path.join(".")}: ${err.message}`).join(", ")}`
      } else if (e instanceof SyntaxError) {
        this.error = `Config JSON parse error: ${e.message}`
      } else {
        this.error = e instanceof Error ? e.message : "Unknown config error"
      }
    }
  }

  private generateSetupKey(): void {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    this.setupKey = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")
    globalThis.__inviterrSetupKey = this.setupKey
    logger.info(
      { setupKey: this.setupKey },
      "Generated setup key for onboarding",
    )
  }

  private async save(config: Config): Promise<void> {
    const payload = JSON.stringify(config, null, "\t")
    await writeConfigAtomically(this.configPath, payload)
    this.loadedMtimeMs = this.getConfigMtimeMs()
  }

  isConfigured(): boolean {
    this.load()
    return this.config !== null
  }

  hasError(): boolean {
    this.load()
    return this.error !== null
  }

  getError(): string | null {
    this.load()
    return this.error
  }

  needsOnboarding(): boolean {
    this.load()
    return !this.config && !this.error
  }

  validateSetupKey(key: string): boolean {
    this.load()
    return this.setupKey !== null && constantTimeStringEqual(key, this.setupKey)
  }

  private clearSetupKey(): void {
    this.setupKey = null
    globalThis.__inviterrSetupKey = undefined
  }

  get(): Config {
    this.load()
    if (!this.config) {
      throw new Error("Config not loaded. Run onboarding first.")
    }
    return this.config
  }

  get jellyfin(): JellyfinConfig {
    return this.get().jellyfin
  }

  get app(): AppConfig {
    return this.get().app
  }

  get auth(): AuthConfig {
    return this.get().auth
  }

  get memberOnboarding(): MemberOnboardingConfig {
    return this.get().memberOnboarding
  }

  get email(): EmailConfig | undefined {
    return this.get().email
  }

  get jellyfinExternalUrl(): string {
    return this.jellyfin.externalUrl ?? this.jellyfin.internalUrl
  }

  get jellyfinInternalUrl(): string {
    return this.jellyfin.internalUrl
  }

  get jellyfinConfigPath(): string | undefined {
    return this.jellyfin.configPath
  }

  get seerr(): SeerrConfig | undefined {
    return this.get().seerr
  }

  get seerrExternalUrl(): string | undefined {
    const config = this.seerr
    if (!config) return undefined
    return config.externalUrl ?? config.internalUrl
  }

  get seerrInternalUrl(): string | undefined {
    return this.seerr?.internalUrl
  }

  get defaultLocale(): Locale {
    return this.app.defaultLocale
  }

  get appUrl(): string | undefined {
    return this.app.url
  }

  async initialize(
    jellyfinConfig: JellyfinConfig,
    options?: {
      app?: Partial<AppConfig>
      seerr?: SeerrConfig
      email?: EmailConfig
    },
  ): Promise<void> {
    const newConfig: Config = {
      app: {
        ...DEFAULT_APP_CONFIG,
        ...options?.app,
      },
      auth: { ...DEFAULT_AUTH_CONFIG },
      memberOnboarding: DEFAULT_MEMBER_ONBOARDING_CONFIG,
      jellyfin: jellyfinConfig,
    }

    if (options?.seerr) {
      newConfig.seerr = options.seerr
    }

    if (options?.email) {
      newConfig.email = options.email
    }

    const validatedConfig = parse(configSchema, newConfig)
    await this.save(validatedConfig)
    this.config = validatedConfig
    this.clearSetupKey()
    this.error = null
    this.loaded = true
  }

  async setJellyfin(values: Partial<JellyfinConfig>): Promise<void> {
    const current = this.get()
    const updatedConfig = {
      ...current,
      jellyfin: { ...current.jellyfin, ...values },
    }
    await this.save(updatedConfig)
    this.config = updatedConfig
  }

  async setApp(values: Partial<AppConfig>): Promise<void> {
    const current = this.get()
    const updatedConfig = {
      ...current,
      app: { ...current.app, ...values },
    }
    await this.save(updatedConfig)
    this.config = updatedConfig
  }

  async setMemberOnboarding(values: MemberOnboardingConfig): Promise<void> {
    const current = this.get()
    const updatedConfig = {
      ...current,
      memberOnboarding: values,
    }
    await this.save(updatedConfig)
    this.config = updatedConfig
  }

  async setEmail(values: EmailConfig | undefined): Promise<void> {
    const current = this.get()
    const updatedConfig = {
      ...current,
      email: values,
    }
    await this.save(updatedConfig)
    this.config = updatedConfig
  }

  async setSeerr(values: SeerrConfig | undefined): Promise<void> {
    const current = this.get()
    const updatedConfig = {
      ...current,
      seerr: values,
    }
    await this.save(updatedConfig)
    this.config = updatedConfig
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __INVITERR_CONFIG_MANAGER__: ConfigManager | undefined
}

const globalConfigManager = globalThis.__INVITERR_CONFIG_MANAGER__

export const configManager = globalConfigManager ?? new ConfigManager()

if (!globalConfigManager) {
  globalThis.__INVITERR_CONFIG_MANAGER__ = configManager
}
