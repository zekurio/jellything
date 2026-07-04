"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useId, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  MediaLibraryDto as MediaLibrary,
  ProfileDto as Profile,
} from "@/lib/api/contracts/admin"
import { ErrorCode } from "@/lib/api/contracts/errors"
import { toErrorCode } from "@/lib/api/error-code"
import { useTranslations, resolveErrorKey } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { profileFormSchema, type ProfileFormValues } from "@/lib/schemas"
import {
  DEFAULT_SEERR_PERMISSIONS,
  SEERR_PERMISSION_TREE,
  SeerrPermission,
  type SeerrPermissionRequirement,
  type SeerrPermissionOption,
} from "@/lib/seerr-permissions"

interface ProfileFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile?: Profile | null
  libraries: MediaLibrary[]
  isSeerrConfigured: boolean
  onSaveComplete?: (profile: Profile) => void
}

type SeerrQuotaMode = "unlimited" | "limited"

const defaultFormValues: ProfileFormValues = {
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

function normalizeQuotaInput(value: string): string {
  const parsed = Number.parseInt(value || "0", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return ""
  }

  return String(parsed)
}

function getApiErrorCodeValue(error: unknown): string {
  const payload =
    error && typeof error === "object" && "value" in error ? error.value : error
  return payload &&
    typeof payload === "object" &&
    "code" in payload &&
    typeof payload.code === "string"
    ? payload.code
    : "internal_error"
}

function buildProfilePolicy(data: ProfileFormValues) {
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

function fieldModeClass(active: boolean): string {
  return active ? "text-foreground" : "text-muted-foreground"
}

function hasOwnQuotaValue(
  quotas: Profile["policy"] extends { seerrQuotas?: infer T }
    ? T | undefined
    : never,
  key: "movieQuotaLimit" | "movieQuotaDays" | "tvQuotaLimit" | "tvQuotaDays",
): boolean {
  return (
    typeof quotas === "object" && quotas !== null && Object.hasOwn(quotas, key)
  )
}

function toProfileFormValues(
  profile: Profile | null | undefined,
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

function hasSeerrPermission(
  permission: SeerrPermission,
  value: number,
): boolean {
  if (permission === SeerrPermission.NONE) {
    return true
  }

  return Boolean(value & SeerrPermission.ADMIN) || Boolean(value & permission)
}

function requirementsMet(
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

function sanitizeSeerrPermissions(
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

export function ProfileFormDialog({
  open,
  onOpenChange,
  profile,
  libraries,
  isSeerrConfigured,
  onSaveComplete,
}: ProfileFormDialogProps) {
  const t = useTranslations()

  const id = useId()
  const isEditMode = Boolean(profile)

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: toProfileFormValues(profile),
  })

  const { control, handleSubmit, reset, setValue, watch, formState } = form
  const enableAllFolders = watch("enableAllFolders")
  const seerrPermissions = watch("seerrPermissions")
  const seerrMovieQuotaOverride = watch("seerrMovieQuotaOverride")
  const seerrMovieQuotaMode = watch("seerrMovieQuotaMode")
  const seerrTvQuotaOverride = watch("seerrTvQuotaOverride")
  const seerrTvQuotaMode = watch("seerrTvQuotaMode")
  const mediaServerName = "Jellyfin"

  useEffect(() => {
    const sanitizedPermissions = sanitizeSeerrPermissions(seerrPermissions)
    if (sanitizedPermissions !== seerrPermissions) {
      setValue("seerrPermissions", sanitizedPermissions, {
        shouldDirty: formState.isDirty,
      })
    }
  }, [formState.isDirty, seerrPermissions, setValue])

  async function onSubmit(data: ProfileFormValues): Promise<void> {
    const policy = buildProfilePolicy(data)

    try {
      const client = getBrowserORPCClient()
      if (profile) {
        const res = await runApiEffect(
          client.admin.profiles.update({
            profileId: profile.id,
            updates: { name: data.name, policy },
          }),
        )

        if (res.error === null && res.data) {
          const syncFailedCount = res.data.syncFailedCount ?? 0
          if (syncFailedCount > 0) {
            toast.warning(
              t("profiles.profileUpdatedWithSyncWarnings", {
                count: syncFailedCount,
              }),
            )
          }
          if (syncFailedCount === 0) {
            toast.success(t("profiles.profileUpdated"))
          }
          onOpenChange(false)
          onSaveComplete?.(res.data)
          return
        }

        const code = getApiErrorCodeValue(res.error)
        toast.error(
          t(
            resolveErrorKey(toErrorCode(code), {
              [ErrorCode.ALREADY_EXISTS]: "profiles.profileNameAlreadyExists",
            }),
          ),
        )
        return
      }

      const res = await runApiEffect(
        client.admin.profiles.create({ name: data.name, policy }),
      )

      if (res.error === null && res.data) {
        toast.success(t("profiles.profileCreated"))
        onOpenChange(false)
        reset(defaultFormValues)
        onSaveComplete?.(res.data)
        return
      }

      const code = getApiErrorCodeValue(res.error)
      toast.error(
        t(
          resolveErrorKey(toErrorCode(code), {
            [ErrorCode.ALREADY_EXISTS]: "profiles.profileNameAlreadyExists",
          }),
        ),
      )
    } catch {
      toast.error(t("profiles.profileSaveFailed"))
    }
  }

  const [activeTab, setActiveTab] = useState("general")

  useEffect(() => {
    if (!open) setActiveTab("general")
  }, [open])

  const title = isEditMode
    ? `${t("profiles.formTitleEdit")} - ${profile?.name ?? ""}`
    : t("profiles.formTitleCreate")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="py-4">
            <div className="md:hidden">
              <Select value={activeTab} onValueChange={setActiveTab}>
                <SelectTrigger className="w-full" aria-label={title}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">
                    {t("profiles.generalTabLabel")}
                  </SelectItem>
                  <SelectItem value="streaming">
                    {t("profiles.streamingTabLabel")}
                  </SelectItem>
                  {isSeerrConfigured && (
                    <SelectItem value="seerr">
                      {t("profiles.seerrTabLabel")}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <TabsList className="hidden md:inline-flex">
              <TabsTrigger value="general">
                {t("profiles.generalTabLabel")}
              </TabsTrigger>
              <TabsTrigger value="streaming">
                {t("profiles.streamingTabLabel")}
              </TabsTrigger>
              {isSeerrConfigured && (
                <TabsTrigger value="seerr">
                  {t("profiles.seerrTabLabel")}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent
              value="general"
              className="max-h-[50vh] overflow-x-hidden overflow-y-auto px-2 pt-4"
            >
              <FieldGroup className="gap-6">
                <Controller
                  name="name"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${id}-profile-name`}>
                        {t("profiles.profileNameLabel")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`${id}-profile-name`}
                        aria-invalid={fieldState.invalid}
                        placeholder={t("profiles.profileNamePlaceholder")}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <FieldSet>
                  <div className="mb-2">
                    <h3 className="text-base font-medium">
                      {t("profiles.libraryAccess")}
                    </h3>
                  </div>
                  <FieldGroup data-slot="checkbox-group">
                    <Controller
                      name="enableAllFolders"
                      control={control}
                      render={({ field }) => (
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`${id}-profile-all-folders`}
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <div>
                            <FieldLabel
                              htmlFor={`${id}-profile-all-folders`}
                              className="cursor-pointer font-normal"
                            >
                              {t("profiles.accessAllLibraries")}
                            </FieldLabel>
                          </div>
                        </Field>
                      )}
                    />

                    {!enableAllFolders && (
                      <Controller
                        name="enabledFolders"
                        control={control}
                        render={({ field }) => (
                          <div className="ml-1 space-y-2 border-l-2 pl-4">
                            {libraries.map((library) => (
                              <Field key={library.id} orientation="horizontal">
                                <Checkbox
                                  id={`${id}-profile-lib-${library.id}`}
                                  checked={field.value.includes(library.id)}
                                  onCheckedChange={(checked) => {
                                    const newValue = checked
                                      ? [...field.value, library.id]
                                      : field.value.filter(
                                          (folderId) => folderId !== library.id,
                                        )
                                    field.onChange(newValue)
                                  }}
                                />
                                <FieldLabel
                                  htmlFor={`${id}-profile-lib-${library.id}`}
                                  className="cursor-pointer font-normal"
                                >
                                  {library.name}
                                </FieldLabel>
                              </Field>
                            ))}
                          </div>
                        )}
                      />
                    )}
                  </FieldGroup>
                </FieldSet>

                <FieldSet>
                  <h3 className="mb-1 text-base font-medium">
                    {t("profiles.loginVisibility")}
                  </h3>
                  <FieldGroup data-slot="checkbox-group">
                    <Controller
                      name="showInLoginScreen"
                      control={control}
                      render={({ field }) => (
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`${id}-profile-show-in-login`}
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <div>
                            <FieldLabel
                              htmlFor={`${id}-profile-show-in-login`}
                              className="cursor-pointer font-normal"
                            >
                              {t("profiles.showInLoginScreen")}
                            </FieldLabel>
                          </div>
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </TabsContent>

            <TabsContent
              value="streaming"
              className="max-h-[50vh] overflow-x-hidden overflow-y-auto px-2 pt-4"
            >
              <FieldGroup className="gap-6">
                <FieldSet>
                  <div className="mb-2">
                    <h3 className="text-base font-medium">
                      {t("profiles.transcodingOptions")}
                    </h3>
                  </div>
                  <FieldGroup data-slot="checkbox-group">
                    <Controller
                      name="allowVideoTranscoding"
                      control={control}
                      render={({ field }) => (
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`${id}-profile-video-transcoding`}
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <div>
                            <FieldLabel
                              htmlFor={`${id}-profile-video-transcoding`}
                              className="cursor-pointer font-normal"
                            >
                              {t("profiles.allowVideoTranscoding")}
                            </FieldLabel>
                          </div>
                        </Field>
                      )}
                    />
                    <Controller
                      name="allowAudioTranscoding"
                      control={control}
                      render={({ field }) => (
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`${id}-profile-audio-transcoding`}
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <div>
                            <FieldLabel
                              htmlFor={`${id}-profile-audio-transcoding`}
                              className="cursor-pointer font-normal"
                            >
                              {t("profiles.allowAudioTranscoding")}
                            </FieldLabel>
                          </div>
                        </Field>
                      )}
                    />
                    <Controller
                      name="allowMediaRemuxing"
                      control={control}
                      render={({ field }) => (
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`${id}-profile-remuxing`}
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <div>
                            <FieldLabel
                              htmlFor={`${id}-profile-remuxing`}
                              className="cursor-pointer font-normal"
                            >
                              {t("profiles.allowRemuxing")}
                            </FieldLabel>
                          </div>
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </FieldSet>

                <Controller
                  name="bitrateMbps"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${id}-profile-bitrate`}>
                        {t("profiles.remoteBitrate")}
                      </FieldLabel>
                      <div className="flex items-center gap-2">
                        <Input
                          {...field}
                          id={`${id}-profile-bitrate`}
                          type="number"
                          aria-invalid={fieldState.invalid}
                          placeholder="0"
                          min={0}
                          step={1}
                          className="w-20"
                        />
                        <span className="text-muted-foreground text-sm">
                          {t("profiles.bitrateHelp")}
                        </span>
                      </div>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </TabsContent>

            {isSeerrConfigured && (
              <TabsContent
                value="seerr"
                className="max-h-[50vh] overflow-x-hidden overflow-y-auto px-2 pt-4"
              >
                <Controller
                  name="seerrPermissions"
                  control={control}
                  render={({ field }) => {
                    const currentValue =
                      typeof field.value === "number"
                        ? field.value
                        : DEFAULT_SEERR_PERMISSIONS

                    function toggle(value: number, checked: boolean): void {
                      const next = checked
                        ? currentValue | value
                        : currentValue & ~value
                      field.onChange(next)
                    }

                    function toggleParent(
                      option: SeerrPermissionOption,
                      checked: boolean,
                    ): void {
                      let next = checked
                        ? currentValue | option.value
                        : currentValue & ~option.value

                      if (option.children) {
                        for (const child of option.children) {
                          next = checked
                            ? next | child.value
                            : next & ~child.value
                        }
                      }

                      field.onChange(next)
                    }

                    function renderOption(
                      option: SeerrPermissionOption,
                      parentChecked?: boolean,
                    ): React.ReactNode {
                      const meetsRequirements = requirementsMet(
                        option.requires,
                        currentValue,
                      )
                      const autoGranted = (option.autoGrantedBy ?? []).some(
                        (permission) =>
                          hasSeerrPermission(permission, currentValue),
                      )
                      const isChecked = hasSeerrPermission(
                        option.value,
                        currentValue,
                      )
                      const isDisabled =
                        parentChecked === true ||
                        autoGranted ||
                        !meetsRequirements
                      const isVisibleChecked =
                        (isChecked && meetsRequirements) ||
                        parentChecked === true ||
                        autoGranted
                      const label =
                        option.key === "watchlistView"
                          ? t(option.labelKey, { mediaServerName })
                          : t(option.labelKey)
                      return (
                        <div key={option.key}>
                          <Field orientation="horizontal">
                            <Checkbox
                              id={`${id}-jsr-${option.key}`}
                              checked={isVisibleChecked}
                              disabled={isDisabled}
                              onCheckedChange={(c) => {
                                const on = Boolean(c)
                                if (option.children) {
                                  toggleParent(option, on)
                                  return
                                }
                                toggle(option.value, on)
                              }}
                            />
                            <div>
                              <FieldLabel
                                htmlFor={`${id}-jsr-${option.key}`}
                                className="cursor-pointer font-medium"
                              >
                                {label}
                              </FieldLabel>
                            </div>
                          </Field>
                          {option.children && (
                            <div className="mt-2 ml-2 space-y-3 border-l-2 pl-4">
                              {option.children.map((child) =>
                                renderOption(child, isChecked),
                              )}
                            </div>
                          )}
                        </div>
                      )
                    }

                    return (
                      <div className="space-y-4">
                        {SEERR_PERMISSION_TREE.map((option) =>
                          renderOption(option),
                        )}
                      </div>
                    )
                  }}
                />

                <div className="mt-6 border-t pt-6">
                  <h4 className="mb-4 text-sm font-medium">
                    {t("profiles.jsrQuotasTitle")}
                  </h4>

                  <div className="space-y-5">
                    <div>
                      <div className="space-y-3">
                        <Controller
                          name="seerrMovieQuotaOverride"
                          control={control}
                          render={({ field }) => (
                            <Field orientation="horizontal">
                              <Checkbox
                                id={`${id}-jsr-movie-quota-override`}
                                checked={field.value}
                                onCheckedChange={(checked) =>
                                  field.onChange(Boolean(checked))
                                }
                              />
                              <FieldContent>
                                <FieldLabel
                                  htmlFor={`${id}-jsr-movie-quota-override`}
                                  className="cursor-pointer font-medium"
                                >
                                  {t("profiles.jsrMovieQuotaOverride")}
                                </FieldLabel>
                              </FieldContent>
                            </Field>
                          )}
                        />
                        {seerrMovieQuotaOverride ? (
                          <FieldGroup className="gap-3 border-l-2 pr-2 pl-3">
                            <Controller
                              name="seerrMovieQuotaMode"
                              control={control}
                              render={({ field }) => {
                                const checked = field.value === "unlimited"

                                return (
                                  <Field orientation="horizontal">
                                    <FieldContent>
                                      <FieldLabel
                                        htmlFor={`${id}-jsr-movie-quota-mode`}
                                        className={fieldModeClass(checked)}
                                      >
                                        {t("profiles.jsrQuotaUnlimited")}
                                      </FieldLabel>
                                      {!checked ? (
                                        <FieldDescription>
                                          {t("validation.seerrQuotaRange")}
                                        </FieldDescription>
                                      ) : null}
                                    </FieldContent>
                                    <Switch
                                      id={`${id}-jsr-movie-quota-mode`}
                                      checked={checked}
                                      onCheckedChange={(nextChecked) =>
                                        field.onChange(
                                          nextChecked ? "unlimited" : "limited",
                                        )
                                      }
                                      className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
                                      aria-label={t(
                                        "profiles.jsrQuotaUnlimited",
                                      )}
                                    />
                                  </Field>
                                )
                              }}
                            />
                            {seerrMovieQuotaMode === "limited" ? (
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                <Controller
                                  name="seerrMovieQuotaLimit"
                                  control={control}
                                  render={({ field, fieldState }) => (
                                    <Field
                                      data-invalid={fieldState.invalid}
                                      className="min-w-0"
                                    >
                                      <FieldLabel
                                        htmlFor={`${id}-jsr-movie-limit`}
                                        className="text-sm font-medium"
                                      >
                                        {t("profiles.jsrQuotaRequests")}
                                      </FieldLabel>
                                      <Input
                                        {...field}
                                        id={`${id}-jsr-movie-limit`}
                                        type="number"
                                        min={1}
                                        max={100}
                                        step={1}
                                        inputMode="numeric"
                                        placeholder="10"
                                        aria-invalid={fieldState.invalid}
                                        onBlur={(event) => {
                                          field.onBlur()
                                          field.onChange(
                                            normalizeQuotaInput(
                                              event.target.value,
                                            ),
                                          )
                                        }}
                                      />
                                      {fieldState.invalid && (
                                        <FieldError
                                          errors={[fieldState.error]}
                                        />
                                      )}
                                    </Field>
                                  )}
                                />
                                <Controller
                                  name="seerrMovieQuotaDays"
                                  control={control}
                                  render={({ field, fieldState }) => (
                                    <Field
                                      data-invalid={fieldState.invalid}
                                      className="min-w-0"
                                    >
                                      <FieldLabel
                                        htmlFor={`${id}-jsr-movie-days`}
                                        className="text-sm font-medium"
                                      >
                                        {t("profiles.jsrQuotaDays")}
                                      </FieldLabel>
                                      <Input
                                        {...field}
                                        id={`${id}-jsr-movie-days`}
                                        type="number"
                                        min={1}
                                        max={100}
                                        step={1}
                                        inputMode="numeric"
                                        placeholder="30"
                                        aria-invalid={fieldState.invalid}
                                        onBlur={(event) => {
                                          field.onBlur()
                                          field.onChange(
                                            normalizeQuotaInput(
                                              event.target.value,
                                            ),
                                          )
                                        }}
                                      />
                                      {fieldState.invalid && (
                                        <FieldError
                                          errors={[fieldState.error]}
                                        />
                                      )}
                                    </Field>
                                  )}
                                />
                              </div>
                            ) : null}
                          </FieldGroup>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <div className="space-y-3">
                        <Controller
                          name="seerrTvQuotaOverride"
                          control={control}
                          render={({ field }) => (
                            <Field orientation="horizontal">
                              <Checkbox
                                id={`${id}-jsr-tv-quota-override`}
                                checked={field.value}
                                onCheckedChange={(checked) =>
                                  field.onChange(Boolean(checked))
                                }
                              />
                              <FieldContent>
                                <FieldLabel
                                  htmlFor={`${id}-jsr-tv-quota-override`}
                                  className="cursor-pointer font-medium"
                                >
                                  {t("profiles.jsrTvQuotaOverride")}
                                </FieldLabel>
                              </FieldContent>
                            </Field>
                          )}
                        />
                        {seerrTvQuotaOverride ? (
                          <FieldGroup className="gap-3 border-l-2 pr-2 pl-3">
                            <Controller
                              name="seerrTvQuotaMode"
                              control={control}
                              render={({ field }) => {
                                const checked = field.value === "unlimited"

                                return (
                                  <Field orientation="horizontal">
                                    <FieldContent>
                                      <FieldLabel
                                        htmlFor={`${id}-jsr-tv-quota-mode`}
                                        className={fieldModeClass(checked)}
                                      >
                                        {t("profiles.jsrQuotaUnlimited")}
                                      </FieldLabel>
                                      {!checked ? (
                                        <FieldDescription>
                                          {t("validation.seerrQuotaRange")}
                                        </FieldDescription>
                                      ) : null}
                                    </FieldContent>
                                    <Switch
                                      id={`${id}-jsr-tv-quota-mode`}
                                      checked={checked}
                                      onCheckedChange={(nextChecked) =>
                                        field.onChange(
                                          nextChecked ? "unlimited" : "limited",
                                        )
                                      }
                                      className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
                                      aria-label={t(
                                        "profiles.jsrQuotaUnlimited",
                                      )}
                                    />
                                  </Field>
                                )
                              }}
                            />
                            {seerrTvQuotaMode === "limited" ? (
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                <Controller
                                  name="seerrTvQuotaLimit"
                                  control={control}
                                  render={({ field, fieldState }) => (
                                    <Field
                                      data-invalid={fieldState.invalid}
                                      className="min-w-0"
                                    >
                                      <FieldLabel
                                        htmlFor={`${id}-jsr-tv-limit`}
                                        className="text-sm font-medium"
                                      >
                                        {t("profiles.jsrQuotaRequests")}
                                      </FieldLabel>
                                      <Input
                                        {...field}
                                        id={`${id}-jsr-tv-limit`}
                                        type="number"
                                        min={1}
                                        max={100}
                                        step={1}
                                        inputMode="numeric"
                                        placeholder="10"
                                        aria-invalid={fieldState.invalid}
                                        onBlur={(event) => {
                                          field.onBlur()
                                          field.onChange(
                                            normalizeQuotaInput(
                                              event.target.value,
                                            ),
                                          )
                                        }}
                                      />
                                      {fieldState.invalid && (
                                        <FieldError
                                          errors={[fieldState.error]}
                                        />
                                      )}
                                    </Field>
                                  )}
                                />
                                <Controller
                                  name="seerrTvQuotaDays"
                                  control={control}
                                  render={({ field, fieldState }) => (
                                    <Field
                                      data-invalid={fieldState.invalid}
                                      className="min-w-0"
                                    >
                                      <FieldLabel
                                        htmlFor={`${id}-jsr-tv-days`}
                                        className="text-sm font-medium"
                                      >
                                        {t("profiles.jsrQuotaDays")}
                                      </FieldLabel>
                                      <Input
                                        {...field}
                                        id={`${id}-jsr-tv-days`}
                                        type="number"
                                        min={1}
                                        max={100}
                                        step={1}
                                        inputMode="numeric"
                                        placeholder="30"
                                        aria-invalid={fieldState.invalid}
                                        onBlur={(event) => {
                                          field.onBlur()
                                          field.onChange(
                                            normalizeQuotaInput(
                                              event.target.value,
                                            ),
                                          )
                                        }}
                                      />
                                      {fieldState.invalid && (
                                        <FieldError
                                          errors={[fieldState.error]}
                                        />
                                      )}
                                    </Field>
                                  )}
                                />
                              </div>
                            ) : null}
                          </FieldGroup>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting
                ? t("common.saving")
                : isEditMode
                  ? t("common.save")
                  : t("profiles.createProfile")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
