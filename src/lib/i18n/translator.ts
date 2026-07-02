import type { Locale } from "./locales"
import { getMessages, type MessageKey, type Messages } from "./messages"

/**
 * Interpolation values for translation strings.
 */
export type TranslationValues = Record<string, string | number>

export type MissingTranslationReporter = (key: MessageKey) => void

interface TranslatorOptions {
  onMissingTranslation?: MissingTranslationReporter
}

/**
 * Get a nested value from an object using a dot-notation path.
 */
function getNestedValue(obj: Messages, path: string): string | undefined {
  const keys = path.split(".")
  let current: unknown = obj

  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === "string" ? current : undefined
}

/**
 * Replace placeholders in a string with values.
 * Placeholders are in the format {key}.
 */
function interpolate(template: string, values?: TranslationValues): string {
  if (!values) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]
    return value !== undefined ? String(value) : match
  })
}

/**
 * Create a translator function for a specific locale.
 */
export function createTranslator(
  locale: Locale,
  options: TranslatorOptions = {},
): (key: MessageKey, values?: TranslationValues) => string {
  const messages = getMessages(locale)

  return function t(key: MessageKey, values?: TranslationValues): string {
    const template = getNestedValue(messages, key)

    if (!template) {
      options.onMissingTranslation?.(key)
      return key
    }

    return interpolate(template, values)
  }
}

/**
 * Translate a key using the given messages.
 * Useful for server-side translations where you already have the messages.
 */
export function translate(
  messages: Messages,
  key: MessageKey,
  values?: TranslationValues,
  options: TranslatorOptions = {},
): string {
  const template = getNestedValue(messages, key)

  if (!template) {
    options.onMissingTranslation?.(key)
    return key
  }

  return interpolate(template, values)
}
