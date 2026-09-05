"use client"

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { useStore } from "@tanstack/react-store"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { EmailBrandingFields } from "@/components/settings/email-branding-fields"
import { EmailPreviewSection } from "@/components/settings/email-preview"
import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { FormShell } from "@/components/shared/form-shell"
import { PasswordInput } from "@/components/shared/password-input"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { createAppStore } from "@/hooks/store-utils"
import { useDashboardSettingsTabDirty } from "@/hooks/use-dashboard-settings-dirty"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type { EmailConfigDto } from "@/lib/api/contracts/admin"
import { isHexColor } from "@/lib/branding"
import type { EmailBrandingDraft } from "@/lib/email"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import {
  emailSettingsFormSchema,
  type EmailSettingsFormValues,
} from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

interface EmailSettingsTabProps {
  initialConfig: EmailConfigDto
}

interface EmailSettingsStoreState {
  configState: EmailConfigDto
  branding: EmailBrandingDraft
  setConfigState: (configState: EmailConfigDto) => void
  setBranding: (branding: EmailBrandingDraft) => void
}

function toEmailFormValues(
  configState: EmailConfigDto,
): EmailSettingsFormValues {
  return {
    from: configState.from ?? "",
    smtpHost: configState.smtp?.host ?? "",
    smtpPort: configState.smtp?.port ? configState.smtp.port.toString() : "",
    smtpSecure: configState.smtp?.secure ?? false,
    smtpUsername: configState.smtp?.username ?? "",
    smtpPassword: "",
  }
}

function toBrandingDraft(configState: EmailConfigDto): EmailBrandingDraft {
  return {
    accentColor: configState.branding.accentColor,
    pageBackgroundColor: configState.branding.pageBackgroundColor,
    logo: { action: "keep" },
  }
}

function hasEmailSettingsInput(data: EmailSettingsFormValues): boolean {
  return (
    Boolean(data.from) ||
    Boolean(data.smtpHost) ||
    Boolean(data.smtpPort) ||
    Boolean(data.smtpUsername) ||
    Boolean(data.smtpPassword)
  )
}

function buildEmailSettingsUpdate(
  data: EmailSettingsFormValues,
  branding: EmailBrandingDraft,
): {
  from: string
  smtp?: {
    host: string
    port: number
    secure: boolean
    username?: string
    password?: string
  }
  branding: EmailBrandingDraft
} {
  const updates: ReturnType<typeof buildEmailSettingsUpdate> = {
    from: data.from || "Inviterr <noreply@example.com>",
    branding,
  }

  // Only actual SMTP field input produces an smtp payload; cleared fields
  // drop the SMTP section instead of sending empty host/NaN port.
  if (
    data.smtpHost ||
    data.smtpPort ||
    data.smtpUsername ||
    data.smtpPassword
  ) {
    updates.smtp = {
      host: data.smtpHost,
      port: Number.parseInt(data.smtpPort, 10),
      secure: data.smtpSecure,
      username: data.smtpUsername || undefined,
      password: data.smtpPassword || undefined,
    }
  }

  return updates
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

function EmailIdentityFields({
  errors,
  register,
}: {
  errors: ReturnType<
    typeof useForm<EmailSettingsFormValues>
  >["formState"]["errors"]
  register: ReturnType<typeof useForm<EmailSettingsFormValues>>["register"]
}) {
  const t = useTranslations()

  return (
    <>
      <Field data-invalid={!!errors.from}>
        <FieldLabel htmlFor="from">{t("settings.emailFrom")}</FieldLabel>
        <Input
          id="from"
          type="text"
          placeholder={t("settings.emailFromPlaceholder")}
          aria-invalid={!!errors.from}
          {...register("from")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.emailFromDescription")}
        </p>
        {errors.from && <FieldError errors={[errors.from]} />}
      </Field>
      <Field data-invalid={!!errors.smtpHost}>
        <FieldLabel htmlFor="smtpHost">{t("settings.smtpHost")}</FieldLabel>
        <Input
          id="smtpHost"
          type="text"
          placeholder={t("settings.smtpHostPlaceholder")}
          aria-invalid={!!errors.smtpHost}
          {...register("smtpHost")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.smtpHostDescription")}
        </p>
        {errors.smtpHost && <FieldError errors={[errors.smtpHost]} />}
      </Field>
    </>
  )
}

function EmailSmtpFields({
  control,
  errors,
  register,
}: {
  control: ReturnType<typeof useForm<EmailSettingsFormValues>>["control"]
  errors: ReturnType<
    typeof useForm<EmailSettingsFormValues>
  >["formState"]["errors"]
  register: ReturnType<typeof useForm<EmailSettingsFormValues>>["register"]
}) {
  const t = useTranslations()

  return (
    <>
      <Field data-invalid={!!errors.smtpPort}>
        <FieldLabel htmlFor="smtpPort">{t("settings.smtpPort")}</FieldLabel>
        <Input
          id="smtpPort"
          type="number"
          min={1}
          max={65535}
          placeholder={t("settings.smtpPortPlaceholder")}
          aria-invalid={!!errors.smtpPort}
          {...register("smtpPort")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.smtpPortDescription")}
        </p>
        {errors.smtpPort && <FieldError errors={[errors.smtpPort]} />}
      </Field>

      <Controller
        name="smtpSecure"
        control={control}
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox
              id="smtpSecure"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <div className="grid gap-0.5">
              <FieldLabel
                htmlFor="smtpSecure"
                className="cursor-pointer font-normal"
              >
                {t("settings.smtpSecure")}
              </FieldLabel>
              <p className="text-muted-foreground text-xs">
                {t("settings.smtpSecureDescription")}
              </p>
            </div>
          </Field>
        )}
      />
    </>
  )
}

function EmailCredentialFields({
  configState,
  errors,
  register,
  setValue,
  smtpPassword,
}: {
  configState: EmailConfigDto
  errors: ReturnType<
    typeof useForm<EmailSettingsFormValues>
  >["formState"]["errors"]
  register: ReturnType<typeof useForm<EmailSettingsFormValues>>["register"]
  setValue: ReturnType<typeof useForm<EmailSettingsFormValues>>["setValue"]
  smtpPassword: string
}) {
  const t = useTranslations()

  return (
    <>
      <Field data-invalid={!!errors.smtpUsername}>
        <FieldLabel htmlFor="smtpUsername">
          {t("settings.smtpUsername")}
        </FieldLabel>
        <Input
          id="smtpUsername"
          type="text"
          placeholder={t("settings.smtpUsernamePlaceholder")}
          aria-invalid={!!errors.smtpUsername}
          {...register("smtpUsername")}
        />
        <p className="text-muted-foreground text-xs">
          {t("settings.smtpUsernameDescription")}
        </p>
        {errors.smtpUsername && <FieldError errors={[errors.smtpUsername]} />}
      </Field>

      <Field data-invalid={!!errors.smtpPassword}>
        <FieldLabel htmlFor="smtpPassword">
          {t("settings.smtpPassword")}
        </FieldLabel>
        <PasswordInput
          id="smtpPassword"
          placeholder={
            configState.smtpPasswordSet
              ? t("settings.smtpPasswordPlaceholderSet")
              : t("settings.smtpPasswordPlaceholder")
          }
          value={smtpPassword}
          onChange={(value) =>
            setValue("smtpPassword", value, {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            })
          }
        />
        <p className="text-muted-foreground text-xs">
          {configState.smtpPasswordSet
            ? t("settings.smtpPasswordKeepCurrent")
            : t("settings.smtpPasswordDescription")}
        </p>
        {errors.smtpPassword && <FieldError errors={[errors.smtpPassword]} />}
      </Field>
    </>
  )
}

export function EmailSettingsTab({ initialConfig }: EmailSettingsTabProps) {
  const t = useTranslations()
  const store = useScopedStore(() =>
    createAppStore<EmailSettingsStoreState>((set) => ({
      configState: initialConfig,
      branding: toBrandingDraft(initialConfig),
      setConfigState: (configState) => set({ configState }),
      setBranding: (branding) => set({ branding }),
    })),
  )
  const configState = useStore(store, (state) => state.configState)
  const branding = useStore(store, (state) => state.branding)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<EmailSettingsFormValues>({
    resolver: standardSchemaResolver(standardSchema(emailSettingsFormSchema)),
    defaultValues: toEmailFormValues(initialConfig),
  })

  const smtpPassword = watch("smtpPassword")
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  const brandingDirty =
    branding.logo.action !== "keep" ||
    branding.accentColor !== configState.branding.accentColor ||
    branding.pageBackgroundColor !== configState.branding.pageBackgroundColor
  const anyDirty = isDirty || brandingDirty

  useDashboardSettingsTabDirty("email", anyDirty)

  function applySavedConfig(nextConfig: EmailConfigDto): void {
    const state = store.getState()
    state.setConfigState(nextConfig)
    state.setBranding(toBrandingDraft(nextConfig))
    reset(toEmailFormValues(nextConfig))
    setValue("smtpPassword", "", {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    })
  }

  async function performClear(): Promise<void> {
    setIsClearing(true)
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.admin.settings.updateEmail(undefined),
    )
    setIsClearing(false)
    setConfirmClearOpen(false)

    if (result.error !== null || !result.data) {
      toast.error(t("settings.savedError"))
      return
    }

    applySavedConfig(result.data)
    toast.success(t("settings.emailSettingsCleared"))
  }

  async function onSubmit(data: EmailSettingsFormValues): Promise<void> {
    if (!hasEmailSettingsInput(data) && !brandingDirty) {
      setConfirmClearOpen(true)
      return
    }

    const client = getBrowserORPCClient()

    if (
      !isHexColor(branding.accentColor) ||
      !isHexColor(branding.pageBackgroundColor)
    ) {
      toast.error(t("settings.emailInvalidColor"))
      return
    }

    const updates = buildEmailSettingsUpdate(data, branding)
    const result = await runApiEffect(
      client.admin.settings.updateEmail(updates),
    )
    if (result.error !== null || !result.data) {
      toast.error(t("settings.savedError"))
      return
    }

    applySavedConfig(result.data)
    toast.success(t("settings.emailSettingsSaved"))
  }

  function handleReset(): void {
    const state = store.getState()
    state.setBranding(toBrandingDraft(configState))
    reset(toEmailFormValues(configState))
    setValue("smtpPassword", "", {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    })
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormShell
          title={t("settings.emailSettingsTitle")}
          description={t("settings.emailSettingsDescription")}
          actions={
            <SettingsActionButtons
              isDirty={anyDirty}
              isSubmitting={isSubmitting}
              onReset={handleReset}
            />
          }
        >
          <FieldGroup>
            <EmailIdentityFields errors={errors} register={register} />
            <EmailSmtpFields
              control={control}
              errors={errors}
              register={register}
            />
            <EmailCredentialFields
              configState={configState}
              errors={errors}
              register={register}
              setValue={setValue}
              smtpPassword={smtpPassword}
            />

            <Separator />

            <EmailBrandingFields
              branding={branding}
              currentLogo={configState.branding.logo}
              onChange={(nextBranding) =>
                store.getState().setBranding(nextBranding)
              }
            />

            <Separator />

            <EmailPreviewSection
              branding={branding}
              emailConfigured={configState.configured}
            />
          </FieldGroup>
        </FormShell>
      </form>

      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <ConfirmAlertShell
          title={t("settings.emailClearConfirmTitle")}
          description={t("settings.emailClearConfirmDescription")}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("settings.emailClearConfirmAction")}
          isLoading={isClearing}
          destructive
          onConfirm={() => void performClear()}
        />
      </AlertDialog>
    </>
  )
}
