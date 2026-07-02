import { toErrorCode } from "@/lib/api/error-code"
import {
  resolveErrorKey,
  type MessageKey,
  type TranslationValues,
} from "@/lib/i18n"
import { isMessageKey } from "@/lib/i18n/message-key"

type Translator = (key: MessageKey, values?: TranslationValues) => string

export function getApiErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "value" in error) {
    const value = error.value
    if (
      value &&
      typeof value === "object" &&
      "code" in value &&
      typeof value.code === "string"
    ) {
      return value.code
    }
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code
  }

  return null
}

export function getApiErrorMessage(
  error: unknown,
  t: Translator,
  fallbackKey: MessageKey = "errors.operationFailed",
): string {
  const payload =
    error && typeof error === "object" && "value" in error ? error.value : error

  if (payload && typeof payload === "object") {
    if (
      "messageKey" in payload &&
      typeof payload.messageKey === "string" &&
      isMessageKey(payload.messageKey)
    ) {
      return t(payload.messageKey)
    }

    if ("code" in payload && typeof payload.code === "string") {
      return t(resolveErrorKey(toErrorCode(payload.code)))
    }
  }

  const code = getApiErrorCode(error)
  if (code) {
    return t(resolveErrorKey(toErrorCode(code)))
  }

  return t(fallbackKey)
}
