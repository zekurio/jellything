import { ORPCError } from "@orpc/server"

import {
  ErrorCode,
  getErrorMessage,
  type ActionResult,
} from "@/lib/api/contracts/errors"

const ERROR_STATUS_BY_CODE: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.ACCOUNT_EXPIRED]: 403,
  [ErrorCode.SESSION_EXPIRED]: 401,
  [ErrorCode.VALIDATION_FAILED]: 422,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INVITE_INVALID]: 404,
  [ErrorCode.INVITE_DISABLED]: 409,
  [ErrorCode.INVITE_EXPIRED]: 409,
  [ErrorCode.INVITE_EXHAUSTED]: 409,
  [ErrorCode.USERNAME_TAKEN]: 409,
  [ErrorCode.EMAIL_TAKEN]: 409,
  [ErrorCode.EMAIL_NOT_VERIFIED]: 403,
  [ErrorCode.EMAIL_ALREADY_VERIFIED]: 409,
  [ErrorCode.EMAIL_NOT_CONFIGURED]: 409,
  [ErrorCode.PASSWORD_RESET_NOT_CONFIGURED]: 409,
  [ErrorCode.PASSWORD_RESET_PIN_INVALID]: 422,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.JELLYFIN_ERROR]: 502,
  [ErrorCode.LAST_ADMIN_REQUIRED]: 409,
  [ErrorCode.SEERR_ERROR]: 502,
  [ErrorCode.EMAIL_SERVICE_ERROR]: 502,
  [ErrorCode.CONFIG_NOT_INITIALIZED]: 409,
  [ErrorCode.CONFIG_ALREADY_EXISTS]: 409,
  [ErrorCode.INVALID_SETUP_KEY]: 403,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.OPERATION_FAILED]: 500,
}

interface ORPCErrorData {
  appCode: ErrorCode
  messageKey?: string
}

export function throwAppError(
  code: ErrorCode,
  message?: string,
  options?: {
    messageKey?: string
    status?: number
  },
): never {
  throw new ORPCError(code, {
    status: options?.status ?? ERROR_STATUS_BY_CODE[code],
    message: message ?? getErrorMessage(code),
    data: {
      appCode: code,
      messageKey: options?.messageKey,
    } satisfies ORPCErrorData,
  })
}

export function unwrapActionResultOrThrow<T>(result: ActionResult<T>): T {
  if (result.success) {
    return result.data
  }

  throwAppError(result.code, result.error, {
    messageKey: result.messageKey,
  })
}
