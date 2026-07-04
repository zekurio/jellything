import { version } from "../../package.json"

function normalizeAppVersion(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export const appVersion =
  normalizeAppVersion(process.env.APP_VERSION) ?? version
