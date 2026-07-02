import type { MessageKey } from "./messages"
import type { TranslationValues } from "./translator"

const MESSAGE_KEY_PREFIXES = [
  "common.",
  "auth.",
  "settings.",
  "profile.",
  "invites.",
  "profiles.",
  "users.",
  "onboarding.",
  "email.",
  "emailTemplates.",
  "config.",
  "nav.",
  "errors.",
  "validation.",
] as const

export function isMessageKey(value: string): value is MessageKey {
  return MESSAGE_KEY_PREFIXES.some((prefix) => value.startsWith(prefix))
}

export function translateMaybeMessageKey(
  t: (key: MessageKey, values?: TranslationValues) => string,
  value?: string,
): string | undefined {
  if (!value) {
    return value
  }

  return isMessageKey(value) ? t(value) : value
}
