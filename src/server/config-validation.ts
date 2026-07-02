import nodemailer from "nodemailer"

import type { EmailConfig, SeerrConfig } from "@/lib/server/config.server"
import { getJellyfinAuthorizationHeader } from "@/server/jellyfin/client"
import { createChildLogger } from "@/server/logger"

const CONNECTION_TEST_TIMEOUT_MS = 8000
const log = createChildLogger({ module: "config-validation" })

export class JellyfinConnectionValidationError extends Error {
  constructor() {
    super("Failed to connect to Jellyfin with provided settings")
    this.name = "JellyfinConnectionValidationError"
  }
}

export class SeerrConnectionValidationError extends Error {
  constructor() {
    super("Failed to connect to Seerr with provided settings")
    this.name = "SeerrConnectionValidationError"
  }
}

export class EmailConnectionValidationError extends Error {
  constructor() {
    super("Failed to connect to SMTP with provided settings")
    this.name = "EmailConnectionValidationError"
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`
}

function buildJellyfinInfoUrl(internalUrl: string): string {
  return new URL("System/Info/Public", normalizeBaseUrl(internalUrl)).toString()
}

function buildSeerrStatusUrl(internalUrl: string): string {
  return new URL("api/v1/status", normalizeBaseUrl(internalUrl)).toString()
}

export async function assertJellyfinConnection(
  internalUrl: string,
  apiKey: string,
): Promise<void> {
  try {
    const response = await fetch(buildJellyfinInfoUrl(internalUrl), {
      headers: {
        Accept: "application/json",
        Authorization: getJellyfinAuthorizationHeader(apiKey),
      },
      signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new JellyfinConnectionValidationError()
    }
  } catch {
    throw new JellyfinConnectionValidationError()
  }
}

export async function assertSeerrConnection(
  config: SeerrConfig,
): Promise<void> {
  try {
    const response = await fetch(buildSeerrStatusUrl(config.internalUrl), {
      headers: {
        Accept: "application/json",
        "X-Api-Key": config.apiKey,
      },
      signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new SeerrConnectionValidationError()
    }
  } catch {
    throw new SeerrConnectionValidationError()
  }
}

export async function assertEmailConnection(
  config: EmailConfig,
): Promise<void> {
  const smtp = config.smtp

  if (!config.from || !smtp?.host || !smtp.port) {
    throw new EmailConnectionValidationError()
  }

  if (smtp.username && !smtp.password) {
    throw new EmailConnectionValidationError()
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure ?? false,
    auth: smtp.username
      ? {
          user: smtp.username,
          pass: smtp.password ?? "",
        }
      : undefined,
    connectionTimeout: CONNECTION_TEST_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TEST_TIMEOUT_MS,
    socketTimeout: CONNECTION_TEST_TIMEOUT_MS,
  })

  try {
    await transporter.verify()
  } catch (err) {
    log.warn(
      {
        err,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpSecure: smtp.secure ?? false,
      },
      "Failed to verify SMTP connection",
    )
    throw new EmailConnectionValidationError()
  } finally {
    transporter.close()
  }
}
