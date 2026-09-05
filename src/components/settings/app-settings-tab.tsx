"use client"

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { useStore } from "@tanstack/react-store"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { FormShell } from "@/components/shared/form-shell"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createAppStore } from "@/hooks/store-utils"
import { useDashboardSettingsTabDirty } from "@/hooks/use-dashboard-settings-dirty"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type { AppSettingsDto } from "@/lib/api/contracts/admin"
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  useTranslations,
} from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import {
  appSettingsFormSchema,
  type AppSettingsFormValues,
} from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

interface AppSettingsTabProps {
  initialConfig: AppSettingsDto
}

function toAppSettingsFormValues(
  config: AppSettingsDto,
): AppSettingsFormValues {
  return {
    title: config.title,
    description: config.description,
    defaultLocale: config.defaultLocale ?? DEFAULT_LOCALE,
    url: config.url ?? "",
  }
}

interface AppSettingsTabStoreState {
  savedValues: AppSettingsFormValues
  setSavedValues: (savedValues: AppSettingsFormValues) => void
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

function AppSettingsFields({
  control,
  errors,
  register,
}: {
  control: ReturnType<typeof useForm<AppSettingsFormValues>>["control"]
  errors: ReturnType<
    typeof useForm<AppSettingsFormValues>
  >["formState"]["errors"]
  register: ReturnType<typeof useForm<AppSettingsFormValues>>["register"]
}) {
  const t = useTranslations()

  return (
    <FieldGroup>
      <Field data-invalid={!!errors.title}>
        <FieldLabel htmlFor="title">{t("settings.appTitle")}</FieldLabel>
        <Input
          id="title"
          type="text"
          placeholder={t("settings.appTitlePlaceholder")}
          aria-invalid={!!errors.title}
          {...register("title")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.appTitleDescription")}
        </p>
        {errors.title && <FieldError errors={[errors.title]} />}
      </Field>

      <Field data-invalid={!!errors.description}>
        <FieldLabel htmlFor="description">
          {t("settings.appDescription")}
        </FieldLabel>
        <Input
          id="description"
          type="text"
          placeholder={t("settings.appDescriptionPlaceholder")}
          aria-invalid={!!errors.description}
          {...register("description")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.appDescriptionHelp")}
        </p>
        {errors.description && <FieldError errors={[errors.description]} />}
      </Field>

      <Field data-invalid={!!errors.url}>
        <FieldLabel htmlFor="url">{t("settings.appUrl")}</FieldLabel>
        <Input
          id="url"
          type="url"
          placeholder={t("settings.appUrlPlaceholder")}
          aria-invalid={!!errors.url}
          {...register("url")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.appUrlDescription")}
        </p>
        {errors.url && <FieldError errors={[errors.url]} />}
      </Field>

      <Controller
        name="defaultLocale"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="defaultLocale">
              {t("settings.defaultLocale")}
            </FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="defaultLocale" className="w-full max-w-xs">
                <SelectValue placeholder={t("settings.languagePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {LOCALE_LABELS[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t("settings.defaultLocaleDescription")}
            </p>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </FieldGroup>
  )
}

export function AppSettingsTab({ initialConfig }: AppSettingsTabProps) {
  const t = useTranslations()
  const initialValues = toAppSettingsFormValues(initialConfig)
  const store = useScopedStore(() =>
    createAppStore<AppSettingsTabStoreState>((set) => ({
      savedValues: initialValues,
      setSavedValues: (savedValues) => set({ savedValues }),
    })),
  )
  const savedValues = useStore(store, (state) => state.savedValues)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AppSettingsFormValues>({
    resolver: standardSchemaResolver(standardSchema(appSettingsFormSchema)),
    defaultValues: initialValues,
  })
  const formValues = watch()
  const isDirty =
    formValues.title !== savedValues.title ||
    formValues.description !== savedValues.description ||
    formValues.defaultLocale !== savedValues.defaultLocale ||
    formValues.url !== savedValues.url

  useDashboardSettingsTabDirty("app", isDirty)

  async function onSubmit(data: AppSettingsFormValues): Promise<void> {
    if (!isDirty) {
      toast.info(t("settings.noChanges"))
      return
    }

    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.admin.settings.updateApp({
        title: data.title,
        description: data.description,
        defaultLocale: data.defaultLocale,
        url: data.url.trim() || null,
      }),
    )

    if (result.error === null && result.data) {
      const nextValues = toAppSettingsFormValues(result.data)
      store.getState().setSavedValues(nextValues)
      toast.success(
        `${t("settings.savedSuccess")} ${t("settings.refreshRequired")}`,
      )
      reset(nextValues)
      return
    }

    toast.error(t("settings.savedError"))
  }

  function handleReset(): void {
    reset(savedValues)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormShell
        title={t("settings.appSettings")}
        description={t("settings.appSettingsDescription")}
        actions={
          <SettingsActionButtons
            isDirty={isDirty}
            isSubmitting={isSubmitting}
            onReset={handleReset}
          />
        }
      >
        <AppSettingsFields
          control={control}
          errors={errors}
          register={register}
        />
      </FormShell>
    </form>
  )
}
