import type { MessageKey } from "@/lib/i18n/messages"

/**
 * Error codes shared across action wrappers and HTTP APIs.
 */
export enum ErrorCode {
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  ACCOUNT_EXPIRED = "ACCOUNT_EXPIRED",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  CONFLICT = "CONFLICT",
  INVITE_INVALID = "INVITE_INVALID",
  INVITE_DISABLED = "INVITE_DISABLED",
  INVITE_EXPIRED = "INVITE_EXPIRED",
  INVITE_EXHAUSTED = "INVITE_EXHAUSTED",
  USERNAME_TAKEN = "USERNAME_TAKEN",
  EMAIL_TAKEN = "EMAIL_TAKEN",
  EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED",
  EMAIL_ALREADY_VERIFIED = "EMAIL_ALREADY_VERIFIED",
  EMAIL_NOT_CONFIGURED = "EMAIL_NOT_CONFIGURED",
  PASSWORD_RESET_NOT_CONFIGURED = "PASSWORD_RESET_NOT_CONFIGURED",
  PASSWORD_RESET_PIN_INVALID = "PASSWORD_RESET_PIN_INVALID",
  RATE_LIMITED = "RATE_LIMITED",
  JELLYFIN_ERROR = "JELLYFIN_ERROR",
  LAST_ADMIN_REQUIRED = "LAST_ADMIN_REQUIRED",
  SEERR_ERROR = "SEERR_ERROR",
  EMAIL_SERVICE_ERROR = "EMAIL_SERVICE_ERROR",
  CONFIG_NOT_INITIALIZED = "CONFIG_NOT_INITIALIZED",
  CONFIG_ALREADY_EXISTS = "CONFIG_ALREADY_EXISTS",
  INVALID_SETUP_KEY = "INVALID_SETUP_KEY",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  OPERATION_FAILED = "OPERATION_FAILED",
}

const ERROR_CODE_VALUES: ReadonlySet<string> = new Set(Object.values(ErrorCode))

export function isErrorCode(value: string): value is ErrorCode {
  return ERROR_CODE_VALUES.has(value)
}

const DEFAULT_ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.UNAUTHORIZED]: "Authentication required",
  [ErrorCode.FORBIDDEN]: "Access denied",
  [ErrorCode.INVALID_CREDENTIALS]: "Invalid username or password",
  [ErrorCode.ACCOUNT_EXPIRED]: "Account has expired",
  [ErrorCode.SESSION_EXPIRED]: "Session has expired",
  [ErrorCode.VALIDATION_FAILED]: "Validation failed",
  [ErrorCode.NOT_FOUND]: "Resource not found",
  [ErrorCode.ALREADY_EXISTS]: "Resource already exists",
  [ErrorCode.CONFLICT]: "Operation conflicts with current state",
  [ErrorCode.INVITE_INVALID]: "Invalid invite code",
  [ErrorCode.INVITE_DISABLED]: "Invite has been disabled",
  [ErrorCode.INVITE_EXPIRED]: "Invite has expired",
  [ErrorCode.INVITE_EXHAUSTED]: "Invite has reached its use limit",
  [ErrorCode.USERNAME_TAKEN]: "Username is already taken",
  [ErrorCode.EMAIL_TAKEN]: "Email is already registered",
  [ErrorCode.EMAIL_NOT_VERIFIED]: "Email address has not been verified",
  [ErrorCode.EMAIL_ALREADY_VERIFIED]: "Email is already verified",
  [ErrorCode.EMAIL_NOT_CONFIGURED]: "Email service is not configured",
  [ErrorCode.PASSWORD_RESET_NOT_CONFIGURED]: "Password reset is not configured",
  [ErrorCode.PASSWORD_RESET_PIN_INVALID]: "Invalid password reset PIN",
  [ErrorCode.RATE_LIMITED]: "Too many requests, please try again later",
  [ErrorCode.JELLYFIN_ERROR]: "Jellyfin server error",
  [ErrorCode.LAST_ADMIN_REQUIRED]:
    "At least one user with administrative access must remain in Jellyfin",
  [ErrorCode.SEERR_ERROR]: "Seerr server error",
  [ErrorCode.EMAIL_SERVICE_ERROR]: "Failed to send email",
  [ErrorCode.CONFIG_NOT_INITIALIZED]: "Configuration not initialized",
  [ErrorCode.CONFIG_ALREADY_EXISTS]: "Configuration already exists",
  [ErrorCode.INVALID_SETUP_KEY]: "Invalid setup key",
  [ErrorCode.INTERNAL_ERROR]: "An unexpected error occurred",
  [ErrorCode.OPERATION_FAILED]: "Operation failed",
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: ErrorCode; error: string; messageKey?: MessageKey }

export function success<T>(data: T): ActionResult<T> {
  return { success: true, data }
}

export function error<T = never>(
  code: ErrorCode,
  message?: string,
  messageKey?: MessageKey,
): ActionResult<T> {
  return {
    success: false,
    code,
    error: message ?? DEFAULT_ERROR_MESSAGES[code],
    messageKey,
  }
}

export function getErrorMessage(code: ErrorCode): string {
  return DEFAULT_ERROR_MESSAGES[code]
}
