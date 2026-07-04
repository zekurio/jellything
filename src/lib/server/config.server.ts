import "@tanstack/react-start/server-only"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"

import { z } from "zod"

import { env } from "@/env"
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from "@/lib/i18n"
import { logger } from "@/server/logger"

const DEFAULT_APP_CONFIG = {
  title: "Jellything",
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

const memberOnboardingPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  markdown: z.string().trim().min(1).max(8000),
})

const seerrConfigSchema = z.object({
  internalUrl: z.url(),
  externalUrl: z.url().optional(),
  apiKey: z.string().min(1),
})

const DEFAULT_MEMBER_ONBOARDING_CONFIG = {
  enabled: false,
  pages: [],
}

declare global {
  var __jellythingSetupKey: string | undefined
}

const configSchema = z.object({
  app: z
    .object({
      title: z.string().default(DEFAULT_APP_CONFIG.title),
      description: z.string().default(DEFAULT_APP_CONFIG.description),
      defaultLocale: z
        .enum(SUPPORTED_LOCALES)
        .default(DEFAULT_APP_CONFIG.defaultLocale),
      url: z.url().optional(),
    })
    .default(DEFAULT_APP_CONFIG),
  auth: z
    .object({
      sessionSecret: z.string().min(32),
      encryptionKey: z.string().min(32),
    })
    .default(DEFAULT_AUTH_CONFIG),
  memberOnboarding: z
    .object({
      enabled: z.boolean().default(DEFAULT_MEMBER_ONBOARDING_CONFIG.enabled),
      pages: z
        .array(memberOnboardingPageSchema)
        .default(DEFAULT_MEMBER_ONBOARDING_CONFIG.pages),
    })
    .default(DEFAULT_MEMBER_ONBOARDING_CONFIG),
  jellyfin: z.object({
    internalUrl: z.url(),
    externalUrl: z.url().optional(),
    apiKey: z.string().min(1),
    configPath: z.string().optional(),
  }),
  seerr: seerrConfigSchema.optional(),
  email: z
    .object({
      from: z.string().default("Jellything <noreply@example.com>"),
      smtp: z
        .object({
          host: z.string().min(1),
          port: z.number().int().min(1).max(65535),
          secure: z.boolean().default(false),
          username: z.string().min(1).optional(),
          password: z.string().min(1).optional(),
        })
        .optional(),
    })
    .optional(),
})

export type Config = z.infer<typeof configSchema>
export type JellyfinConfig = Config["jellyfin"]
export type SeerrConfig = NonNullable<Config["seerr"]>
export type AppConfig = Config["app"]
export type AuthConfig = Config["auth"]
export type EmailConfig = NonNullable<Config["email"]>
export type MemberOnboardingConfig = Config["memberOnboarding"]
class ConfigManager {
  private config: Config | null = null
  private configPath: string
  private setupKey: string | null = null
  private error: string | null = null
  private loaded = false
  private loadedMtimeMs: number | null = null

  private persistLoadedConfig(logMessage: string): void {
    if (!this.config) {
      return
    }

    try {
      const payload = JSON.stringify(this.config, null, "\t")
      writeFileSync(this.configPath, payload, "utf-8")
      this.loadedMtimeMs = this.getConfigMtimeMs()
      logger.info(logMessage)
    } catch (saveError) {
      logger.error(
        { err: saveError },
        "Failed to persist normalized Jellything config",
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

    const globalSetupKey = globalThis.__jellythingSetupKey
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
      this.config = configSchema.parse(parsed)

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
              ...this.config,
              auth: {
                sessionSecret: hasSessionSecret
                  ? (parsedAuth?.sessionSecret as string)
                  : generateConfigSecret(),
                encryptionKey: hasEncryptionKey
                  ? (parsedAuth?.encryptionKey as string)
                  : generateConfigSecret(),
              },
            }
          : this.config

      this.config = updatedConfig

      if (!hasSessionSecret || !hasEncryptionKey) {
        this.persistLoadedConfig(
          "Generated and persisted missing Jellything auth settings in config",
        )
      }

      this.clearSetupKey()
    } catch (e) {
      if (e instanceof z.ZodError) {
        this.error = `Config validation error: ${e.issues.map((err: z.ZodIssue) => `${err.path.join(".")}: ${err.message}`).join(", ")}`
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
    globalThis.__jellythingSetupKey = this.setupKey
    logger.info(
      { setupKey: this.setupKey },
      "Generated setup key for onboarding",
    )
  }

  private async save(): Promise<void> {
    if (!this.config) {
      throw new Error("Cannot save: no config loaded")
    }
    const payload = JSON.stringify(this.config, null, "\t")
    await writeFile(this.configPath, payload, "utf-8")
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
    globalThis.__jellythingSetupKey = undefined
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

    this.config = configSchema.parse(newConfig)
    await this.save()
    this.clearSetupKey()
    this.error = null
    this.loaded = true
  }

  async setJellyfin(values: Partial<JellyfinConfig>): Promise<void> {
    const current = this.get()
    this.config = {
      ...current,
      jellyfin: { ...current.jellyfin, ...values },
    }
    await this.save()
  }

  async setApp(values: Partial<AppConfig>): Promise<void> {
    const current = this.get()
    this.config = {
      ...current,
      app: { ...current.app, ...values },
    }
    await this.save()
  }

  async setMemberOnboarding(values: MemberOnboardingConfig): Promise<void> {
    const current = this.get()
    this.config = {
      ...current,
      memberOnboarding: values,
    }
    await this.save()
  }

  async setEmail(values: EmailConfig | undefined): Promise<void> {
    const current = this.get()
    this.config = {
      ...current,
      email: values,
    }
    await this.save()
  }

  async setSeerr(values: SeerrConfig | undefined): Promise<void> {
    const current = this.get()
    this.config = {
      ...current,
      seerr: values,
    }
    await this.save()
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __JELLYTHING_CONFIG_MANAGER__: ConfigManager | undefined
}

const globalConfigManager = globalThis.__JELLYTHING_CONFIG_MANAGER__

export const configManager = globalConfigManager ?? new ConfigManager()

if (!globalConfigManager) {
  globalThis.__JELLYTHING_CONFIG_MANAGER__ = configManager
}
