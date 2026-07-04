import type { ProfileDto } from "@/lib/api/contracts/admin"
import { type ProfileFormValues } from "@/lib/schemas"
import {
  DEFAULT_SEERR_PERMISSIONS,
  SEERR_PERMISSION_TREE,
  SeerrPermission,
  type SeerrPermissionOption,
  type SeerrPermissionRequirement,
} from "@/lib/seerr-permissions"

export type SeerrQuotaMode = "unlimited" | "limited"

export const defaultFormValues: ProfileFormValues = {
  name: "",
  enableAllFolders: true,
  enabledFolders: [],
  showInLoginScreen: false,
  bitrateMbps: "0",
  allowVideoTranscoding: true,
  allowAudioTranscoding: true,
  allowMediaRemuxing: true,
  seerrPermissions: DEFAULT_SEERR_PERMISSIONS,
  seerrMovieQuotaOverride: false,
  seerrMovieQuotaMode: "unlimited",
  seerrMovieQuotaLimit: "",
  seerrMovieQuotaDays: "",
  seerrTvQuotaOverride: false,
  seerrTvQuotaMode: "unlimited",
  seerrTvQuotaLimit: "",
  seerrTvQuotaDays: "",
}

function isPositiveQuotaValue(value: number | undefined): boolean {
  return typeof value === "number" && value > 0
}

function parseBitrateMbps(value: string): number {
  const parsed = Number.parseFloat(value || "0")
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return Math.round(parsed * 1000000)
}

function parseQuotaValue(value: string): number | undefined {
  const parsed = Number.parseInt(value || "0", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
}

export function normalizeQuotaInput(value: string): string {
  const parsed = Number.parseInt(value || "0", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return ""
  }

  return String(parsed)
}

export function getApiErrorCodeValue(error: unknown): string {
  const payload =
    error && typeof error === "object" && "value" in error ? error.value : error
  return payload &&
    typeof payload === "object" &&
    "code" in payload &&
    typeof payload.code === "string"
    ? payload.code
    : "internal_error"
}

export function buildProfilePolicy(data: ProfileFormValues) {
  const movieQuotaLimit = parseQuotaValue(data.seerrMovieQuotaLimit)
  const movieQuotaDays = parseQuotaValue(data.seerrMovieQuotaDays)
  const tvQuotaLimit = parseQuotaValue(data.seerrTvQuotaLimit)
  const tvQuotaDays = parseQuotaValue(data.seerrTvQuotaDays)
  const movieQuotaSettings =
    data.seerrMovieQuotaMode === "limited"
      ? {
          ...(movieQuotaLimit !== undefined && { movieQuotaLimit }),
          ...(movieQuotaDays !== undefined && { movieQuotaDays }),
        }
      : { movieQuotaLimit: 0 }
  const tvQuotaSettings =
    data.seerrTvQuotaMode === "limited"
      ? {
          ...(tvQuotaLimit !== undefined && { tvQuotaLimit }),
          ...(tvQuotaDays !== undefined && { tvQuotaDays }),
        }
      : { tvQuotaLimit: 0 }
  const seerrQuotas =
    data.seerrMovieQuotaOverride || data.seerrTvQuotaOverride
      ? {
          ...(data.seerrMovieQuotaOverride && movieQuotaSettings),
          ...(data.seerrTvQuotaOverride && tvQuotaSettings),
        }
      : undefined

  return {
    enableAllFolders: data.enableAllFolders,
    enabledFolders: data.enableAllFolders ? [] : data.enabledFolders,
    showInLoginScreen: data.showInLoginScreen,
    remoteClientBitrateLimit: parseBitrateMbps(data.bitrateMbps),
    allowVideoTranscoding: data.allowVideoTranscoding,
    allowAudioTranscoding: data.allowAudioTranscoding,
    allowMediaRemuxing: data.allowMediaRemuxing,
    seerrPermissions: data.seerrPermissions,
    seerrQuotas,
  }
}

function getQuotaMode(
  limit: number | undefined,
  days: number | undefined,
): SeerrQuotaMode {
  return limit !== undefined || days !== undefined ? "limited" : "unlimited"
}

function hasOwnQuotaValue(
  quotas: ProfileDto["policy"] extends { seerrQuotas?: infer T }
    ? T | undefined
    : never,
  key: "movieQuotaLimit" | "movieQuotaDays" | "tvQuotaLimit" | "tvQuotaDays",
): boolean {
  return (
    typeof quotas === "object" && quotas !== null && Object.hasOwn(quotas, key)
  )
}

export function toProfileFormValues(
  profile: ProfileDto | null | undefined,
): ProfileFormValues {
  if (!profile) {
    return defaultFormValues
  }

  const seerrQuotas = profile.policy?.seerrQuotas
  const movieQuotaLimit = isPositiveQuotaValue(
    profile.policy?.seerrQuotas?.movieQuotaLimit,
  )
    ? profile.policy?.seerrQuotas?.movieQuotaLimit
    : undefined
  const movieQuotaDays = isPositiveQuotaValue(
    profile.policy?.seerrQuotas?.movieQuotaDays,
  )
    ? profile.policy?.seerrQuotas?.movieQuotaDays
    : undefined
  const tvQuotaLimit = isPositiveQuotaValue(
    profile.policy?.seerrQuotas?.tvQuotaLimit,
  )
    ? profile.policy?.seerrQuotas?.tvQuotaLimit
    : undefined
  const tvQuotaDays = isPositiveQuotaValue(
    profile.policy?.seerrQuotas?.tvQuotaDays,
  )
    ? profile.policy?.seerrQuotas?.tvQuotaDays
    : undefined
  const seerrMovieQuotaOverride =
    hasOwnQuotaValue(seerrQuotas, "movieQuotaLimit") ||
    hasOwnQuotaValue(seerrQuotas, "movieQuotaDays")
  const seerrTvQuotaOverride =
    hasOwnQuotaValue(seerrQuotas, "tvQuotaLimit") ||
    hasOwnQuotaValue(seerrQuotas, "tvQuotaDays")

  return {
    name: profile.name,
    enableAllFolders: profile.policy?.enableAllFolders ?? true,
    enabledFolders: profile.policy?.enabledFolders ?? [],
    showInLoginScreen: profile.policy?.showInLoginScreen ?? false,
    bitrateMbps: (
      (profile.policy?.remoteClientBitrateLimit ?? 0) / 1000000
    ).toString(),
    allowVideoTranscoding: profile.policy?.allowVideoTranscoding ?? true,
    allowAudioTranscoding: profile.policy?.allowAudioTranscoding ?? true,
    allowMediaRemuxing: profile.policy?.allowMediaRemuxing ?? true,
    seerrPermissions:
      profile.policy?.seerrPermissions ?? DEFAULT_SEERR_PERMISSIONS,
    seerrMovieQuotaOverride,
    seerrMovieQuotaMode: getQuotaMode(movieQuotaLimit, movieQuotaDays),
    seerrMovieQuotaLimit:
      movieQuotaLimit === undefined ? "" : String(movieQuotaLimit),
    seerrMovieQuotaDays:
      movieQuotaDays === undefined ? "" : String(movieQuotaDays),
    seerrTvQuotaOverride,
    seerrTvQuotaMode: getQuotaMode(tvQuotaLimit, tvQuotaDays),
    seerrTvQuotaLimit: tvQuotaLimit === undefined ? "" : String(tvQuotaLimit),
    seerrTvQuotaDays: tvQuotaDays === undefined ? "" : String(tvQuotaDays),
  }
}

export function hasSeerrPermission(
  permission: SeerrPermission,
  value: number,
): boolean {
  if (permission === SeerrPermission.NONE) {
    return true
  }

  return Boolean(value & SeerrPermission.ADMIN) || Boolean(value & permission)
}

export function requirementsMet(
  requirements: SeerrPermissionRequirement[] | undefined,
  value: number,
): boolean {
  if (!requirements || requirements.length === 0) {
    return true
  }

  return requirements.every((requirement) => {
    const type = requirement.type ?? "and"
    if (type === "or") {
      return requirement.permissions.some((permission) =>
        hasSeerrPermission(permission, value),
      )
    }
    return requirement.permissions.every((permission) =>
      hasSeerrPermission(permission, value),
    )
  })
}

export function sanitizeSeerrPermissions(
  value: number,
  options: SeerrPermissionOption[] = SEERR_PERMISSION_TREE,
): number {
  let next = value
  let changed = true

  while (changed) {
    const current = next

    function visit(option: SeerrPermissionOption): void {
      const meetsRequirements = requirementsMet(option.requires, next)
      const autoGranted = (option.autoGrantedBy ?? []).some((permission) =>
        hasSeerrPermission(permission, next),
      )

      if (!meetsRequirements && !autoGranted) {
        next = next & ~option.value
      }

      if (option.children) {
        for (const child of option.children) {
          visit(child)
        }
      }
    }

    for (const option of options) {
      visit(option)
    }

    changed = next !== current
  }

  return next
}
