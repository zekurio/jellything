import { ErrorCode } from "@/lib/api/contracts/errors"

import type { MessageKey } from "./messages/types"

const ERROR_CODE_LOCALE_KEYS: Record<ErrorCode, MessageKey> = {
  [ErrorCode.UNAUTHORIZED]: "errors.unauthorized",
  [ErrorCode.FORBIDDEN]: "errors.forbidden",
  [ErrorCode.INVALID_CREDENTIALS]: "errors.invalidCredentials",
  [ErrorCode.ACCOUNT_EXPIRED]: "errors.accountExpired",
  [ErrorCode.SESSION_EXPIRED]: "auth.sessionExpired",
  [ErrorCode.VALIDATION_FAILED]: "errors.validationFailed",
  [ErrorCode.NOT_FOUND]: "errors.notFound",
  [ErrorCode.ALREADY_EXISTS]: "errors.alreadyExists",
  [ErrorCode.CONFLICT]: "errors.operationFailed",
  [ErrorCode.INVITE_INVALID]: "invites.invalidInviteDescription",
  [ErrorCode.INVITE_DISABLED]: "invites.inviteDisabled",
  [ErrorCode.INVITE_EXPIRED]: "invites.inviteExpired",
  [ErrorCode.INVITE_EXHAUSTED]: "invites.inviteExhausted",
  [ErrorCode.USERNAME_TAKEN]: "errors.usernameTaken",
  [ErrorCode.EMAIL_TAKEN]: "errors.emailTaken",
  [ErrorCode.EMAIL_NOT_VERIFIED]: "errors.emailNotVerified",
  [ErrorCode.EMAIL_ALREADY_VERIFIED]: "errors.emailAlreadyVerified",
  [ErrorCode.EMAIL_NOT_CONFIGURED]: "errors.emailNotConfigured",
  [ErrorCode.PASSWORD_RESET_NOT_CONFIGURED]: "auth.resetNotConfigured",
  [ErrorCode.PASSWORD_RESET_PIN_INVALID]: "auth.resetPinInvalid",
  [ErrorCode.RATE_LIMITED]: "errors.rateLimited",
  [ErrorCode.JELLYFIN_ERROR]: "errors.jellyfinError",
  [ErrorCode.LAST_ADMIN_REQUIRED]: "errors.lastAdminRequired",
  [ErrorCode.SEERR_ERROR]: "errors.seerrError",
  [ErrorCode.EMAIL_SERVICE_ERROR]: "errors.emailServiceError",
  [ErrorCode.CONFIG_NOT_INITIALIZED]: "errors.operationFailed",
  [ErrorCode.CONFIG_ALREADY_EXISTS]: "errors.operationFailed",
  [ErrorCode.INVALID_SETUP_KEY]: "onboarding.invalidSetupKey",
  [ErrorCode.INTERNAL_ERROR]: "errors.internalError",
  [ErrorCode.OPERATION_FAILED]: "errors.operationFailed",
}

export function resolveErrorKey(
  code: ErrorCode,
  overrides?: Partial<Record<ErrorCode, MessageKey>>,
): MessageKey {
  return (
    overrides?.[code] ??
    ERROR_CODE_LOCALE_KEYS[code] ??
    "errors.operationFailed"
  )
}
