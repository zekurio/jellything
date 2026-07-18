import "@tanstack/react-start/server-only"
import { render } from "@react-email/render"
import type { ReactElement } from "react"

import type { EmailMessageType } from "@/lib/email"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import { configManager } from "@/lib/server/config.server"
import { getBrandingImageDataUrl } from "@/server/branding"
import {
  resolveEmailBranding,
  type EmailBrandingOverride,
} from "@/server/email/branding"
import { sendEmail, type SendEmailOptions } from "@/server/email/index"
import {
  AccountDeletedEmailTemplate,
  getAccountDeletedEmailSubject,
} from "@/server/email/templates/account-deleted"
import {
  AccountDisabledEmailTemplate,
  getAccountDisabledEmailSubject,
} from "@/server/email/templates/account-disabled"
import {
  AccountRenewedEmailTemplate,
  getAccountRenewedEmailSubject,
} from "@/server/email/templates/account-renewed"
import {
  ExpiryWarningEmailTemplate,
  getExpiryWarningEmailSubject,
} from "@/server/email/templates/expiry-warning"
import {
  getPasswordResetEmailSubject,
  PasswordResetEmailTemplate,
} from "@/server/email/templates/password-reset"
import {
  getVerifyEmailSubject,
  VerifyEmailTemplate,
} from "@/server/email/templates/verify-email"

const EMAIL_LOGO_CID = "inviterr-email-logo"

interface VerifyEmailMessage {
  type: "verifyEmail"
  payload: {
    username: string
    verifyUrl: string
    locale: Locale
  }
}

interface PasswordResetEmailMessage {
  type: "passwordReset"
  payload: {
    username: string
    pin: string
    resetUrl: string
    expiresInMinutes: number
    locale: Locale
  }
}

interface ExpiryWarningEmailMessage {
  type: "expiryWarning"
  payload: {
    username: string
    expiryDate: string
    manageUrl: string
    locale: Locale
  }
}

interface AccountDisabledEmailMessage {
  type: "accountDisabled"
  payload: {
    username: string
    locale: Locale
  }
}

interface AccountDeletedEmailMessage {
  type: "accountDeleted"
  payload: {
    username: string
    locale: Locale
  }
}

interface AccountRenewedEmailMessage {
  type: "accountRenewed"
  payload: {
    username: string
    expiryDate: string
    manageUrl: string
    locale: Locale
  }
}

export type EmailMessageRequest =
  | VerifyEmailMessage
  | PasswordResetEmailMessage
  | ExpiryWarningEmailMessage
  | AccountDisabledEmailMessage
  | AccountDeletedEmailMessage
  | AccountRenewedEmailMessage

interface BuildEmailMessageOptions {
  delivery: "preview" | "smtp"
  brandingOverride?: EmailBrandingOverride
}

interface SyntheticEmailMessageOptions extends BuildEmailMessageOptions {
  locale?: Locale
  now?: Date
}

export interface BuiltEmailMessage {
  subject: string
  html: string
  text: string
  attachments?: SendEmailOptions["attachments"]
}

interface MessageBuildContext {
  serverName: string
  logoSrc?: string
  logoWidth?: number
  logoHeight?: number
  showBrandName: boolean
  theme: ReturnType<typeof resolveEmailBranding>["theme"]
}

interface EmailMessageDefinition {
  createSynthetic: (input: {
    baseUrl: string
    locale: Locale
    now: Date
  }) => EmailMessageRequest
}

function formatSyntheticExpiryDate(locale: Locale, date: Date): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date)
}

export const emailMessageRegistry = {
  verifyEmail: {
    createSynthetic: ({ baseUrl, locale }) => ({
      type: "verifyEmail",
      payload: {
        username: "Test User",
        verifyUrl: new URL("/verify-email/test-token", baseUrl).toString(),
        locale,
      },
    }),
  },
  passwordReset: {
    createSynthetic: ({ baseUrl, locale }) => ({
      type: "passwordReset",
      payload: {
        username: "Test User",
        pin: "123456",
        resetUrl: new URL(
          "/reset-password?username=test-user",
          baseUrl,
        ).toString(),
        expiresInMinutes: 15,
        locale,
      },
    }),
  },
  expiryWarning: {
    createSynthetic: ({ baseUrl, locale, now }) => ({
      type: "expiryWarning",
      payload: {
        username: "Test User",
        expiryDate: formatSyntheticExpiryDate(
          locale,
          new Date(now.getTime() + 48 * 60 * 60 * 1000),
        ),
        manageUrl: new URL("/profile/general", baseUrl).toString(),
        locale,
      },
    }),
  },
  accountDisabled: {
    createSynthetic: ({ locale }) => ({
      type: "accountDisabled",
      payload: {
        username: "Test User",
        locale,
      },
    }),
  },
  accountDeleted: {
    createSynthetic: ({ locale }) => ({
      type: "accountDeleted",
      payload: {
        username: "Test User",
        locale,
      },
    }),
  },
  accountRenewed: {
    createSynthetic: ({ baseUrl, locale, now }) => ({
      type: "accountRenewed",
      payload: {
        username: "Test User",
        expiryDate: formatSyntheticExpiryDate(
          locale,
          new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        ),
        manageUrl: new URL("/profile/general", baseUrl).toString(),
        locale,
      },
    }),
  },
} satisfies Record<EmailMessageType, EmailMessageDefinition>

function getMessageElement(
  request: EmailMessageRequest,
  context: MessageBuildContext,
): { subject: string; element: ReactElement } {
  const shared = {
    serverName: context.serverName,
    theme: context.theme,
    logoSrc: context.logoSrc,
    logoWidth: context.logoWidth,
    logoHeight: context.logoHeight,
    showBrandName: context.showBrandName,
  }
  const subjectInput = {
    serverName: context.serverName,
    locale: request.payload.locale,
  }

  switch (request.type) {
    case "verifyEmail":
      return {
        subject: getVerifyEmailSubject({ locale: request.payload.locale }),
        element: <VerifyEmailTemplate {...shared} {...request.payload} />,
      }
    case "passwordReset":
      return {
        subject: getPasswordResetEmailSubject(subjectInput),
        element: (
          <PasswordResetEmailTemplate {...shared} {...request.payload} />
        ),
      }
    case "expiryWarning":
      return {
        subject: getExpiryWarningEmailSubject(subjectInput),
        element: (
          <ExpiryWarningEmailTemplate {...shared} {...request.payload} />
        ),
      }
    case "accountDisabled":
      return {
        subject: getAccountDisabledEmailSubject(subjectInput),
        element: (
          <AccountDisabledEmailTemplate {...shared} {...request.payload} />
        ),
      }
    case "accountDeleted":
      return {
        subject: getAccountDeletedEmailSubject(subjectInput),
        element: (
          <AccountDeletedEmailTemplate {...shared} {...request.payload} />
        ),
      }
    case "accountRenewed":
      return {
        subject: getAccountRenewedEmailSubject(subjectInput),
        element: (
          <AccountRenewedEmailTemplate {...shared} {...request.payload} />
        ),
      }
  }
}

export async function buildEmailMessage(
  request: EmailMessageRequest,
  options: BuildEmailMessageOptions,
): Promise<BuiltEmailMessage> {
  const branding = resolveEmailBranding(
    configManager.email,
    options.brandingOverride,
  )
  const logo = branding.logo
  let logoSrc: string | undefined
  let attachments: SendEmailOptions["attachments"]

  if (logo) {
    if (options.delivery === "preview") {
      logoSrc = getBrandingImageDataUrl(logo)
    } else {
      logoSrc = `cid:${EMAIL_LOGO_CID}`
      attachments = [
        {
          filename: logo.mimeType === "image/png" ? "logo.png" : "logo.jpg",
          content: Buffer.from(logo.base64, "base64"),
          contentType: logo.mimeType,
          cid: EMAIL_LOGO_CID,
          contentDisposition: "inline",
        },
      ]
    }
  } else if (configManager.app.url) {
    logoSrc = new URL("/logo-192.png", configManager.app.url).toString()
  }

  const serverName = configManager.app.title
  const { subject, element } = getMessageElement(request, {
    serverName,
    theme: branding.theme,
    logoSrc,
    logoWidth: logo?.width ?? 28,
    logoHeight: logo?.height ?? 28,
    showBrandName: !logo,
  })

  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])

  return { subject, html, text, attachments }
}

export async function buildSyntheticEmailMessage(
  type: EmailMessageType,
  options: SyntheticEmailMessageOptions,
): Promise<BuiltEmailMessage> {
  const locale =
    options.locale ?? configManager.app.defaultLocale ?? DEFAULT_LOCALE
  const request = emailMessageRegistry[type].createSynthetic({
    baseUrl: configManager.app.url ?? "https://example.invalid",
    locale,
    now: options.now ?? new Date(),
  })
  return await buildEmailMessage(request, options)
}

export async function sendConfiguredEmail(
  to: string,
  request: EmailMessageRequest,
): Promise<void> {
  const message = await buildEmailMessage(request, { delivery: "smtp" })
  await sendEmail({ to, ...message })
}
