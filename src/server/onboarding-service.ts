import {
  ErrorCode,
  error,
  getErrorMessage,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import type { MessageKey } from "@/lib/i18n/messages"
import {
  configManager,
  type EmailConfig,
  type JellyfinConfig,
  type SeerrConfig,
} from "@/lib/server/config.server"
import type { InitializeConfigInput } from "@/server/api/schemas/public-schemas"
import {
  assertEmailConnection,
  assertJellyfinConnection,
  assertSeerrConnection,
} from "@/server/config-validation"
import { logger } from "@/server/logger"
import { getTrustedRequestOrigin } from "@/server/request-origin"

class AppError extends Error {
  readonly code: ErrorCode
  readonly messageKey?: MessageKey
  override readonly cause?: unknown

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      readonly messageKey?: MessageKey
      readonly cause?: unknown
    },
  ) {
    super(message ?? getErrorMessage(code))
    this.name = "AppError"
    this.code = code
    this.messageKey = options?.messageKey
    this.cause = options?.cause
  }
}

function appError(
  code: ErrorCode,
  message?: string,
  options?: {
    readonly messageKey?: MessageKey
    readonly cause?: unknown
  },
): AppError {
  return new AppError(code, message, options)
}

function toActionResult<A>(
  caught: unknown,
  fallbackCode: ErrorCode,
): ActionResult<A> {
  if (caught instanceof AppError) {
    return error(caught.code, caught.message, caught.messageKey)
  }

  return error(fallbackCode)
}

async function assertJellyfinConnectionOrThrow(config: JellyfinConfig) {
  try {
    await assertJellyfinConnection(config.internalUrl, config.apiKey)
  } catch (cause) {
    throw appError(
      ErrorCode.JELLYFIN_ERROR,
      "Failed to connect to Jellyfin with provided settings",
      {
        cause,
      },
    )
  }
}

async function assertSeerrConnectionOrThrow(config: SeerrConfig) {
  try {
    await assertSeerrConnection(config)
  } catch (cause) {
    throw appError(
      ErrorCode.SEERR_ERROR,
      "Failed to connect to Seerr with provided settings",
      {
        cause,
      },
    )
  }
}

async function assertEmailConnectionOrThrow(config: EmailConfig) {
  try {
    await assertEmailConnection(config)
  } catch (cause) {
    throw appError(
      ErrorCode.EMAIL_NOT_CONFIGURED,
      "Failed to connect to SMTP with provided settings",
      {
        cause,
      },
    )
  }
}

export async function validateSetupKey(
  key: string,
): Promise<ActionResult<boolean>> {
  try {
    return success(configManager.validateSetupKey(key))
  } catch (caught) {
    return toActionResult(caught, ErrorCode.INVALID_SETUP_KEY)
  }
}

export async function initializeConfig(
  input: InitializeConfigInput,
  request: Request,
): Promise<ActionResult<void>> {
  try {
    if (configManager.isConfigured()) {
      throw appError(ErrorCode.CONFIG_ALREADY_EXISTS)
    }

    if (!configManager.validateSetupKey(input.setupKey)) {
      throw appError(ErrorCode.INVALID_SETUP_KEY)
    }

    // Prefer the operator-provided canonical URL. Fall back to the request
    // origin only when it is implicit; that fallback is trust-gated so a
    // spoofed x-forwarded-host cannot poison the persisted app.url.
    const appUrl = input.app?.url ?? getTrustedRequestOrigin(request)
    if (!appUrl) {
      throw appError(
        ErrorCode.OPERATION_FAILED,
        "Failed to detect application URL",
        {
          messageKey: "errors.applicationUrlNotConfigured",
        },
      )
    }

    const jellyfinConfig: JellyfinConfig = {
      internalUrl: input.jellyfin.internalUrl,
      externalUrl: input.jellyfin.externalUrl,
      apiKey: input.jellyfin.apiKey,
      configPath: input.jellyfin.configPath,
    }

    await assertJellyfinConnectionOrThrow(jellyfinConfig)

    const seerrConfig: SeerrConfig | undefined = input.seerr
      ? {
          internalUrl: input.seerr.internalUrl,
          externalUrl: input.seerr.externalUrl,
          apiKey: input.seerr.apiKey,
        }
      : undefined

    const emailConfig: EmailConfig | undefined = input.email
      ? {
          from: input.email.from,
          smtp: input.email.smtp
            ? {
                host: input.email.smtp.host,
                port: input.email.smtp.port,
                secure: input.email.smtp.secure ?? false,
                username: input.email.smtp.username,
                password: input.email.smtp.password,
              }
            : undefined,
        }
      : undefined

    if (seerrConfig) {
      await assertSeerrConnectionOrThrow(seerrConfig)
    }

    if (emailConfig) {
      await assertEmailConnectionOrThrow(emailConfig)
    }

    try {
      await configManager.initialize(jellyfinConfig, {
        seerr: seerrConfig,
        email: emailConfig,
        app: {
          url: appUrl,
        },
      })
    } catch (cause) {
      throw appError(
        ErrorCode.OPERATION_FAILED,
        "Failed to initialize config",
        {
          cause,
        },
      )
    }

    logger.info(
      { hasSeerr: !!seerrConfig, hasEmail: !!emailConfig },
      "Application configuration initialized",
    )

    return success(undefined)
  } catch (caught) {
    return toActionResult(caught, ErrorCode.OPERATION_FAILED)
  }
}
