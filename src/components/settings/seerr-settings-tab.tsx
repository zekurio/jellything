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
import type { SeerrConfigDto } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import {
  seerrSettingsFormSchema,
  type SeerrSettingsFormValues,
} from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

interface SeerrSettingsTabProps {
  initialConfig: SeerrConfigDto
}

interface SeerrSettingsStoreState {
  configState: SeerrConfigDto
  setConfigState: (configState: SeerrConfigDto) => void
}

function resetApiKeyField(
  setValue: ReturnType<typeof useForm<SeerrSettingsFormValues>>["setValue"],
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

function toSeerrFormValues(
  configState: SeerrConfigDto,
): SeerrSettingsFormValues {
  return {
    internalUrl: configState.internalUrl ?? "",
    externalUrl: configState.externalUrl ?? "",
    apiKey: "",
  }
}

function buildSeerrSettingsUpdate(
  data: SeerrSettingsFormValues,
  configState: SeerrConfigDto,
): {
  internalUrl?: string
  externalUrl?: string | null
  apiKey?: string
} {
  const updates: {
    internalUrl?: string
    externalUrl?: string | null
    apiKey?: string
  } = {}

  if (data.internalUrl !== (configState.internalUrl ?? "")) {
    updates.internalUrl = data.internalUrl || undefined
  }
  if (data.externalUrl !== (configState.externalUrl ?? "")) {
    updates.externalUrl = data.externalUrl || null
  }
  if (data.apiKey) {
    updates.apiKey = data.apiKey
  }

  return updates
}

function toNextSeerrConfig(
  updates: ReturnType<typeof buildSeerrSettingsUpdate>,
  configState: SeerrConfigDto,
): SeerrConfigDto {
  return {
    internalUrl:
      updates.internalUrl !== undefined
        ? updates.internalUrl
        : configState.internalUrl,
    externalUrl:
      updates.externalUrl !== undefined
        ? (updates.externalUrl ?? undefined)
        : configState.externalUrl,
    apiKeySet: Boolean(updates.apiKey) || configState.apiKeySet,
  }
}

function SeerrSettingsFields({
  apiKey,
  configState,
  errors,
  register,
  setValue,
}: {
  apiKey: string
  configState: SeerrConfigDto
  errors: ReturnType<
    typeof useForm<SeerrSettingsFormValues>
  >["formState"]["errors"]
  register: ReturnType<typeof useForm<SeerrSettingsFormValues>>["register"]
  setValue: ReturnType<typeof useForm<SeerrSettingsFormValues>>["setValue"]
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
          placeholder={t("settings.internalUrlPlaceholderSeerr")}
          aria-invalid={!!errors.internalUrl}
          {...register("internalUrl")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.internalUrlDescriptionSeerr")}
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
          placeholder={t("settings.externalUrlPlaceholderSeerr")}
          aria-invalid={!!errors.externalUrl}
          {...register("externalUrl")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.externalUrlDescriptionSeerr")}
        </p>
        {errors.externalUrl && <FieldError errors={[errors.externalUrl]} />}
      </Field>

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
            : t("settings.apiKeyGenerateSeerr")}
        </p>
        {errors.apiKey && <FieldError errors={[errors.apiKey]} />}
      </Field>
    </FieldGroup>
  )
}

export function SeerrSettingsTab({ initialConfig }: SeerrSettingsTabProps) {
  const t = useTranslations()
  const store = useScopedStore(() =>
    createAppStore<SeerrSettingsStoreState>((set) => ({
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
  } = useForm<SeerrSettingsFormValues>({
    resolver: standardSchemaResolver(standardSchema(seerrSettingsFormSchema)),
    defaultValues: toSeerrFormValues(initialConfig),
  })

  const apiKey = watch("apiKey")

  useDashboardSettingsTabDirty("seerr", isDirty)

  async function onSubmit(data: SeerrSettingsFormValues): Promise<void> {
    const updates = buildSeerrSettingsUpdate(data, configState)
    if (Object.keys(updates).length === 0) {
      toast.info(t("settings.noChanges"))
      return
    }

    const client = getBrowserORPCClient()
    const saveResult = await runApiEffect(
      client.admin.settings.updateSeerr(updates),
    )
    if (saveResult.error !== null) {
      toast.error(t("settings.seerrTestFailed"))
      return
    }

    const nextConfig = toNextSeerrConfig(updates, configState)
    store.getState().setConfigState(nextConfig)
    reset(toSeerrFormValues(nextConfig))
    resetApiKeyField(setValue)
    toast.success(t("settings.seerrSaved"))
  }

  function handleReset(): void {
    reset(toSeerrFormValues(configState))
    resetApiKeyField(setValue)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormShell
        title={t("settings.seerrConnectionTitle")}
        description={t("settings.seerrConnectionDescription")}
        actions={
          <SettingsActionButtons
            isDirty={isDirty}
            isSubmitting={isSubmitting}
            onReset={handleReset}
          />
        }
      >
        <SeerrSettingsFields
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
