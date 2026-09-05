"use client"

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { useStore } from "@tanstack/react-store"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { FormShell } from "@/components/shared/form-shell"
import { PasswordInput } from "@/components/shared/password-input"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createAppStore } from "@/hooks/store-utils"
import { useDashboardSettingsTabDirty } from "@/hooks/use-dashboard-settings-dirty"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type { JellyfinConfigDto } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import {
  jellyfinSettingsFormSchema,
  type JellyfinSettingsFormValues,
} from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

interface JellyfinSettingsTabProps {
  initialConfig: JellyfinConfigDto
}

interface JellyfinSettingsStoreState {
  configState: JellyfinConfigDto
  setConfigState: (configState: JellyfinConfigDto) => void
}

function resetApiKeyField(
  setValue: ReturnType<typeof useForm<JellyfinSettingsFormValues>>["setValue"],
): void {
  setValue("apiKey", "", {
    shouldDirty: false,
    shouldTouch: false,
    shouldValidate: false,
  })
}

function SettingsActionButtons({
  isDirty,
  isSubmitting,
  onReset,
}: {
  isDirty: boolean
  isSubmitting: boolean
  onReset: () => void
}) {
  const t = useTranslations()

  return (
    <>
      <Button
        type="submit"
        disabled={!isDirty || isSubmitting}
        className="w-full sm:w-auto"
      >
        {isSubmitting ? t("common.saving") : t("common.save")}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!isDirty || isSubmitting}
        onClick={onReset}
        className="w-full sm:w-auto"
      >
        {t("common.reset")}
      </Button>
    </>
  )
}

function toJellyfinFormValues(
  configState: JellyfinConfigDto,
): JellyfinSettingsFormValues {
  return {
    internalUrl: configState.internalUrl,
    externalUrl: configState.externalUrl ?? "",
    apiKey: "",
    configPath: configState.configPath ?? "",
    displayName: configState.displayName ?? "",
  }
}

function buildJellyfinSettingsUpdate(
  data: JellyfinSettingsFormValues,
  configState: JellyfinConfigDto,
): {
  internalUrl?: string
  externalUrl?: string | null
  apiKey?: string
  configPath?: string | null
  displayName?: string | null
} {
  const updates: {
    internalUrl?: string
    externalUrl?: string | null
    apiKey?: string
    configPath?: string | null
    displayName?: string | null
  } = {}

  if (data.internalUrl !== configState.internalUrl) {
    updates.internalUrl = data.internalUrl
  }
  if (data.externalUrl !== (configState.externalUrl ?? "")) {
    updates.externalUrl = data.externalUrl || null
  }
  if (data.apiKey) {
    updates.apiKey = data.apiKey
  }
  if (data.configPath !== (configState.configPath ?? "")) {
    updates.configPath = data.configPath || null
  }
  if (data.displayName !== (configState.displayName ?? "")) {
    updates.displayName = data.displayName || null
  }

  return updates
}

function toNextJellyfinConfig(
  updates: ReturnType<typeof buildJellyfinSettingsUpdate>,
  configState: JellyfinConfigDto,
): JellyfinConfigDto {
  return {
    internalUrl: updates.internalUrl ?? configState.internalUrl,
    externalUrl:
      updates.externalUrl !== undefined
        ? (updates.externalUrl ?? undefined)
        : configState.externalUrl,
    apiKeySet: Boolean(updates.apiKey) || configState.apiKeySet,
    configPath:
      updates.configPath !== undefined
        ? (updates.configPath ?? undefined)
        : configState.configPath,
    displayName:
      updates.displayName !== undefined
        ? (updates.displayName ?? undefined)
        : configState.displayName,
  }
}

function JellyfinSettingsFields({
  apiKey,
  configState,
  errors,
  register,
  setValue,
}: {
  apiKey: string
  configState: JellyfinConfigDto
  errors: ReturnType<
    typeof useForm<JellyfinSettingsFormValues>
  >["formState"]["errors"]
  register: ReturnType<typeof useForm<JellyfinSettingsFormValues>>["register"]
  setValue: ReturnType<typeof useForm<JellyfinSettingsFormValues>>["setValue"]
}) {
  const t = useTranslations()

  return (
    <FieldGroup>
      <Field data-invalid={!!errors.internalUrl}>
        <FieldLabel htmlFor="internalUrl">
          {t("settings.internalUrl")}
        </FieldLabel>
        <Input
          id="internalUrl"
          type="url"
          placeholder={t("settings.internalUrlPlaceholderJellyfin")}
          aria-invalid={!!errors.internalUrl}
          {...register("internalUrl")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.internalUrlDescriptionJellyfin")}
        </p>
        {errors.internalUrl && <FieldError errors={[errors.internalUrl]} />}
      </Field>

      <Field data-invalid={!!errors.externalUrl}>
        <FieldLabel htmlFor="externalUrl">
          {t("settings.externalUrlOptional")}
        </FieldLabel>
        <Input
          id="externalUrl"
          type="url"
          placeholder={t("settings.externalUrlPlaceholderJellyfin")}
          aria-invalid={!!errors.externalUrl}
          {...register("externalUrl")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.externalUrlDescriptionJellyfin")}
        </p>
        {errors.externalUrl && <FieldError errors={[errors.externalUrl]} />}
      </Field>

      <Field data-invalid={!!errors.displayName}>
        <FieldLabel htmlFor="displayName">
          {t("settings.displayNameOptional")}
        </FieldLabel>
        <Input
          id="displayName"
          type="text"
          placeholder={t("settings.displayNamePlaceholderJellyfin")}
          aria-invalid={!!errors.displayName}
          {...register("displayName")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.displayNameDescriptionJellyfin")}
        </p>
        {errors.displayName && <FieldError errors={[errors.displayName]} />}
      </Field>

      <JellyfinSecretFields
        apiKey={apiKey}
        configState={configState}
        errors={errors}
        register={register}
        setValue={setValue}
      />
    </FieldGroup>
  )
}

function JellyfinSecretFields({
  apiKey,
  configState,
  errors,
  register,
  setValue,
}: {
  apiKey: string
  configState: JellyfinConfigDto
  errors: ReturnType<
    typeof useForm<JellyfinSettingsFormValues>
  >["formState"]["errors"]
  register: ReturnType<typeof useForm<JellyfinSettingsFormValues>>["register"]
  setValue: ReturnType<typeof useForm<JellyfinSettingsFormValues>>["setValue"]
}) {
  const t = useTranslations()

  return (
    <>
      <Field data-invalid={!!errors.apiKey}>
        <FieldLabel htmlFor="apiKey">{t("settings.apiKey")}</FieldLabel>
        <PasswordInput
          id="apiKey"
          placeholder={
            configState.apiKeySet
              ? t("settings.apiKeyPlaceholderSet")
              : t("settings.apiKeyPlaceholder")
          }
          value={apiKey}
          onChange={(value) =>
            setValue("apiKey", value, {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            })
          }
        />
        <p className="text-muted-foreground text-xs">
          {configState.apiKeySet
            ? t("settings.apiKeyUpdateHint")
            : t("settings.apiKeyGenerateJellyfin")}
        </p>
        {errors.apiKey && <FieldError errors={[errors.apiKey]} />}
      </Field>

      <Field data-invalid={!!errors.configPath}>
        <FieldLabel htmlFor="configPath">
          {t("settings.configPathOptional")}
        </FieldLabel>
        <Input
          id="configPath"
          type="text"
          placeholder={t("settings.configPathPlaceholder")}
          aria-invalid={!!errors.configPath}
          {...register("configPath")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.configPathDescription")}
        </p>
        {errors.configPath && <FieldError errors={[errors.configPath]} />}
      </Field>
    </>
  )
}

export function JellyfinSettingsTab({
  initialConfig,
}: JellyfinSettingsTabProps) {
  const t = useTranslations()
  const store = useScopedStore(() =>
    createAppStore<JellyfinSettingsStoreState>((set) => ({
      configState: initialConfig,
      setConfigState: (configState) => set({ configState }),
    })),
  )
  const configState = useStore(store, (state) => state.configState)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<JellyfinSettingsFormValues>({
    resolver: standardSchemaResolver(
      standardSchema(jellyfinSettingsFormSchema),
    ),
    defaultValues: toJellyfinFormValues(initialConfig),
  })

  const apiKey = watch("apiKey")

  useDashboardSettingsTabDirty("jellyfin", isDirty)

  async function onSubmit(data: JellyfinSettingsFormValues): Promise<void> {
    const updates = buildJellyfinSettingsUpdate(data, configState)
    if (Object.keys(updates).length === 0) {
      toast.info(t("settings.noChanges"))
      return
    }

    const client = getBrowserORPCClient()
    const saveResult = await runApiEffect(
      client.admin.settings.updateJellyfin(updates),
    )
    if (saveResult.error !== null) {
      toast.error(t("settings.savedError"))
      return
    }

    const nextConfig = toNextJellyfinConfig(updates, configState)
    store.getState().setConfigState(nextConfig)
    reset(toJellyfinFormValues(nextConfig))
    resetApiKeyField(setValue)
    toast.success(t("settings.jellyfinSaved"))
  }

  function handleReset(): void {
    reset(toJellyfinFormValues(configState))
    resetApiKeyField(setValue)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormShell
        title={t("settings.jellyfinConnectionTitle")}
        description={t("settings.jellyfinConnectionDescription")}
        actions={
          <SettingsActionButtons
            isDirty={isDirty}
            isSubmitting={isSubmitting}
            onReset={handleReset}
          />
        }
      >
        <JellyfinSettingsFields
          apiKey={apiKey}
          configState={configState}
          errors={errors}
          register={register}
          setValue={setValue}
        />
      </FormShell>
    </form>
  )
}
