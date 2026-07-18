import type { EmailConfigDto } from "@/lib/api/contracts/admin"
import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import {
  BRANDING_LOGO_MAX_HEIGHT,
  BRANDING_LOGO_MAX_WIDTH,
} from "@/lib/branding"
import { DEFAULT_EMAIL_BRANDING } from "@/lib/email"
import {
  configManager,
  type EmailBrandingConfig,
  type EmailConfig,
} from "@/lib/server/config.server"
import type {
  EmailBrandingDraftInput,
  PreviewEmailInput,
  SendTestEmailInput,
  UpdateEmailConfigInput,
} from "@/server/api/schemas/common-schemas"
import {
  BrandingImageValidationError,
  getBrandingImageVersion,
  normalizeBrandingImage,
} from "@/server/branding"
import {
  assertEmailConnection,
  EmailConnectionValidationError,
} from "@/server/config-validation"
import {
  EmailApiError,
  isEmailConfigured,
  resetEmailClient,
  sendEmail,
} from "@/server/email"
import type { EmailBrandingOverride } from "@/server/email/branding"
import { buildSyntheticEmailMessage } from "@/server/email/messages"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "admin-email" })

export function projectEmailConfigDto(
  emailConfig = configManager.email,
): EmailConfigDto {
  const branding = emailConfig?.branding
  const logo = branding?.logo

  return {
    from: emailConfig?.from,
    smtp: emailConfig?.smtp
      ? {
          host: emailConfig.smtp.host,
          port: emailConfig.smtp.port,
          secure: emailConfig.smtp.secure ?? false,
          username: emailConfig.smtp.username,
        }
      : undefined,
    smtpPasswordSet: Boolean(emailConfig?.smtp?.password),
    configured: isEmailConfigured(),
    branding: {
      accentColor: branding?.accentColor ?? DEFAULT_EMAIL_BRANDING.accentColor,
      pageBackgroundColor:
        branding?.pageBackgroundColor ??
        DEFAULT_EMAIL_BRANDING.pageBackgroundColor,
      logo: logo
        ? {
            mimeType: logo.mimeType,
            width: logo.width,
            height: logo.height,
            url: `/branding/email-logo?v=${getBrandingImageVersion(logo)}`,
          }
        : undefined,
    },
  }
}

async function resolveDraftBranding(
  draft: EmailBrandingDraftInput,
  existing = configManager.email?.branding,
): Promise<EmailBrandingConfig> {
  let logo = existing?.logo

  switch (draft.logo.action) {
    case "keep":
      break
    case "remove":
      logo = undefined
      break
    case "replace":
      logo = await normalizeBrandingImage(
        { mimeType: draft.logo.mimeType, base64: draft.logo.base64 },
        {
          maxWidth: BRANDING_LOGO_MAX_WIDTH,
          maxHeight: BRANDING_LOGO_MAX_HEIGHT,
        },
      )
      break
  }

  return {
    accentColor: draft.accentColor,
    pageBackgroundColor: draft.pageBackgroundColor,
    logo,
  }
}

function smtpConfigsEqual(
  left: EmailConfig["smtp"],
  right: EmailConfig["smtp"],
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function toBrandingOverride(
  branding: EmailBrandingConfig,
): EmailBrandingOverride {
  return {
    accentColor: branding.accentColor,
    pageBackgroundColor: branding.pageBackgroundColor,
    logo: branding.logo,
  }
}

export async function updateEmailConfigService(
  data: UpdateEmailConfigInput,
): Promise<ActionResult<EmailConfigDto>> {
  try {
    if (!configManager.isConfigured()) {
      return error(ErrorCode.CONFIG_NOT_INITIALIZED)
    }

    if (!data) {
      await configManager.setEmail(undefined)
      resetEmailClient()
      return success(projectEmailConfigDto(undefined))
    }

    const existing = configManager.email
    const branding = await resolveDraftBranding(
      data.branding,
      existing?.branding,
    )
    let smtp: EmailConfig["smtp"]

    if (data.smtp) {
      const sameUsername = data.smtp.username === existing?.smtp?.username
      const password = data.smtp.username
        ? (data.smtp.password ??
          (sameUsername ? existing?.smtp?.password : undefined))
        : undefined

      smtp = {
        host: data.smtp.host,
        port: data.smtp.port,
        secure: data.smtp.secure ?? false,
        username: data.smtp.username,
        password,
      }
    }

    const nextEmail: EmailConfig = {
      from: data.from,
      smtp,
      branding,
    }
    const smtpChanged = !smtpConfigsEqual(existing?.smtp, nextEmail.smtp)

    if (smtpChanged && nextEmail.smtp) {
      await assertEmailConnection(nextEmail)
    }

    await configManager.setEmail(nextEmail)
    if (smtpChanged) {
      resetEmailClient()
    }

    return success(projectEmailConfigDto(nextEmail))
  } catch (err) {
    if (err instanceof EmailConnectionValidationError) {
      return error(ErrorCode.EMAIL_NOT_CONFIGURED, err.message)
    }
    if (err instanceof BrandingImageValidationError) {
      return error(ErrorCode.VALIDATION_FAILED, err.message)
    }

    log.error({ err }, "Failed to update email config")
    return error(ErrorCode.OPERATION_FAILED, "Failed to update email config")
  }
}

export async function previewEmailService(
  input: PreviewEmailInput,
): Promise<ActionResult<{ subject: string; html: string }>> {
  try {
    if (!configManager.isConfigured()) {
      return error(ErrorCode.CONFIG_NOT_INITIALIZED)
    }

    const branding = await resolveDraftBranding(input.branding)
    const message = await buildSyntheticEmailMessage(input.messageType, {
      delivery: "preview",
      brandingOverride: toBrandingOverride(branding),
    })

    return success({ subject: message.subject, html: message.html })
  } catch (err) {
    if (err instanceof BrandingImageValidationError) {
      return error(ErrorCode.VALIDATION_FAILED, err.message)
    }

    log.error({ err }, "Failed to render email preview")
    return error(ErrorCode.OPERATION_FAILED, "Failed to render email preview")
  }
}

export async function sendTestEmailService(
  input: SendTestEmailInput,
): Promise<ActionResult<void>> {
  try {
    if (!configManager.isConfigured()) {
      return error(ErrorCode.CONFIG_NOT_INITIALIZED)
    }
    if (!isEmailConfigured()) {
      return error(ErrorCode.EMAIL_NOT_CONFIGURED)
    }

    const branding = await resolveDraftBranding(input.branding)
    const message = await buildSyntheticEmailMessage(input.messageType, {
      delivery: "smtp",
      brandingOverride: toBrandingOverride(branding),
    })

    await sendEmail({
      to: input.recipient,
      ...message,
      subject: `[Test] ${message.subject}`,
    })
    return success(undefined)
  } catch (err) {
    if (err instanceof BrandingImageValidationError) {
      return error(ErrorCode.VALIDATION_FAILED, err.message)
    }
    if (err instanceof EmailApiError) {
      return error(ErrorCode.EMAIL_SERVICE_ERROR)
    }

    log.error({ err }, "Failed to send test email")
    return error(ErrorCode.OPERATION_FAILED, "Failed to send test email")
  }
}
