import nodemailer, { type Transporter } from "nodemailer"

import { configManager, type EmailConfig } from "@/lib/server/config.server"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "email" })

// Stable error type for the email/SMTP integration boundary, mirroring
// JellyfinApiError/SeerrApiError. Callers translate this into
// ErrorCode.EMAIL_SERVICE_ERROR where an email failure is user-visible.
export class EmailApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "EmailApiError"
  }
}

let smtpTransporter: Transporter | null = null
let smtpTransportKey: string | null = null

type SmtpConfig = NonNullable<EmailConfig["smtp"]>

function getSmtpConfig(config: EmailConfig): SmtpConfig {
  const smtp = config.smtp
  if (!smtp?.host || !smtp.port) {
    throw new EmailApiError("SMTP settings are not configured")
  }
  if (smtp.username && !smtp.password) {
    throw new EmailApiError("SMTP password is not configured")
  }
  return {
    ...smtp,
    secure: smtp.secure ?? false,
  }
}

function getSmtpTransportKey(smtp: SmtpConfig): string {
  return JSON.stringify({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure ?? false,
    username: smtp.username ?? "",
    password: smtp.password ?? "",
  })
}

function getSmtpTransporter(smtp: SmtpConfig): Transporter {
  const key = getSmtpTransportKey(smtp)
  if (!smtpTransporter || smtpTransportKey !== key) {
    log.debug(
      { host: smtp.host, port: smtp.port, secure: smtp.secure ?? false },
      "Creating new SMTP transporter",
    )
    smtpTransporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure ?? false,
      auth: smtp.username
        ? {
            user: smtp.username,
            pass: smtp.password ?? "",
          }
        : undefined,
    })
    smtpTransportKey = key
  }
  return smtpTransporter
}

/**
 * Reset cached email clients.
 * Call this after updating email configuration to ensure new credentials are used.
 */
export function resetEmailClient(): void {
  log.debug("Resetting cached SMTP transporter")
  smtpTransporter = null
  smtpTransportKey = null
}

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const emailConfig = configManager.email
  if (!emailConfig?.from) {
    throw new EmailApiError("Email 'from' address is not configured")
  }

  if (!isSmtpConfigured(emailConfig)) {
    throw new EmailApiError("SMTP settings are not configured")
  }

  log.info({ to: options.to, subject: options.subject }, "Sending email")
  await sendSmtpEmail(options, emailConfig)
}

export function isEmailConfigured(): boolean {
  if (!configManager.isConfigured()) {
    return false
  }

  const config = configManager.email
  if (!config?.from) {
    return false
  }

  return isSmtpConfigured(config)
}

function isSmtpConfigured(config: EmailConfig | undefined): boolean {
  const smtp = config?.smtp
  if (!smtp?.host || !smtp.port) {
    return false
  }
  if (smtp.username && !smtp.password) {
    return false
  }
  return true
}

async function sendSmtpEmail(
  options: SendEmailOptions,
  config: EmailConfig,
): Promise<void> {
  const smtp = getSmtpConfig(config)
  const transporter = getSmtpTransporter(smtp)

  try {
    await transporter.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })
    log.info(
      { to: options.to, subject: options.subject },
      "Email sent successfully",
    )
  } catch (err) {
    log.error(
      {
        err,
        to: options.to,
        subject: options.subject,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
      },
      "Failed to send email via SMTP",
    )
    const message = err instanceof Error ? err.message : "Unknown SMTP error"
    throw new EmailApiError(`Failed to send email: ${message}`, { cause: err })
  }
}
