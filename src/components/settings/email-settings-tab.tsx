"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useStore } from "@tanstack/react-store"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { FormShell } from "@/components/shared/form-shell"
import { PasswordInput } from "@/components/shared/password-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import type { EmailConfigDto } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import {
  emailSettingsFormSchema,
  type EmailSettingsFormValues,
} from "@/lib/schemas"

interface EmailSettingsTabProps {
  initialConfig: EmailConfigDto
}

interface EmailSettingsStoreState {
  configState: EmailConfigDto
  setConfigState: (configState: EmailConfigDto) => void
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
  configState: EmailConfigDto,
): {
  from: string
  smtp?: {
    host: string
    port: number
    secure: boolean
    username?: string
    password?: string
  }
} {
  const updates: {
    from: string
    smtp?: {
      host: string
      port: number
      secure: boolean
      username?: string
      password?: string
    }
  } = {
    from: data.from || "Jellything <noreply@example.com>",
  }

  if (
    data.smtpHost ||
    data.smtpPort ||
    data.smtpUsername ||
    data.smtpPassword ||
    configState.smtp
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

function toNextEmailConfig(
  updates: ReturnType<typeof buildEmailSettingsUpdate>,
  configState: EmailConfigDto,
): EmailConfigDto {
  return {
    from: updates.from,
    smtp: updates.smtp
      ? {
          host: updates.smtp.host,
          port: updates.smtp.port,
          secure: updates.smtp.secure,
          username: updates.smtp.username,
        }
      : undefined,
    smtpPasswordSet:
      Boolean(updates.smtp?.password) || configState.smtpPasswordSet,
  }
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
    control,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<EmailSettingsFormValues>({
    resolver: zodResolver(emailSettingsFormSchema),
    defaultValues: toEmailFormValues(initialConfig),
  })

  const smtpPassword = watch("smtpPassword")

  useDashboardSettingsTabDirty("email", isDirty)

  async function onSubmit(data: EmailSettingsFormValues): Promise<void> {
    if (!hasEmailSettingsInput(data)) {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(
        client.admin.settings.updateEmail(undefined),
      )
      if (result.error === null) {
        const clearedConfig: EmailConfigDto = {
          from: undefined,
          smtp: undefined,
          smtpPasswordSet: false,
        }
        store.getState().setConfigState(clearedConfig)
        reset(toEmailFormValues(clearedConfig))
        toast.success(t("settings.emailSettingsCleared"))
        return
      }

      toast.error(t("settings.savedError"))
      return
    }

    const updates = buildEmailSettingsUpdate(data, configState)
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.admin.settings.updateEmail(updates),
    )
    if (result.error !== null) {
      toast.error(t("settings.savedError"))
      return
    }

    const nextConfig = toNextEmailConfig(updates, configState)
    store.getState().setConfigState(nextConfig)
    reset(toEmailFormValues(nextConfig))
    setValue("smtpPassword", "", {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    })
    toast.success(t("settings.emailSettingsSaved"))
  }

  function handleReset(): void {
    reset(toEmailFormValues(configState))
    setValue("smtpPassword", "", {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormShell
        title={t("settings.emailSettingsTitle")}
        description={t("settings.emailSettingsDescription")}
        actions={
          <SettingsActionButtons
            isDirty={isDirty}
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
        </FieldGroup>
      </FormShell>
    </form>
  )
}
