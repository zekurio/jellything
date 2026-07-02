"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useReducer } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { CenteredPageShell } from "@/components/layout/centered-page-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { enforcePageAccessFn } from "@/lib/page-access-fns"
import {
  onboardingConfigFormSchema,
  onboardingEmailFormSchema,
  onboardingSeerrFormSchema,
  setupKeyFormSchema,
  type OnboardingConfigFormValues,
  type OnboardingEmailFormValues,
  type OnboardingSeerrFormValues,
  type SetupKeyFormValues,
} from "@/lib/schemas"

type Step = "key" | "jellyfin" | "seerr" | "email"

export const Route = createFileRoute("/onboarding")({
  loader: async () => enforcePageAccessFn({ data: "onboarding" }),
  component: OnboardingPage,
})

const ONBOARDING_TOTAL_STEPS = 4

const STEP_INDEX: Record<Step, number> = {
  key: 1,
  jellyfin: 2,
  seerr: 3,
  email: 4,
}

function hasSeerrValuesInput(values: OnboardingSeerrFormValues): boolean {
  return (
    Boolean(values.internalUrl) ||
    Boolean(values.externalUrl) ||
    Boolean(values.apiKey)
  )
}

function hasEmailValuesInput(values: OnboardingEmailFormValues): boolean {
  return (
    Boolean(values.from) ||
    Boolean(values.smtpHost) ||
    Boolean(values.smtpPort) ||
    Boolean(values.smtpUsername) ||
    Boolean(values.smtpPassword)
  )
}

interface OnboardingFlowState {
  step: Step
  setupKey: string
}

type OnboardingFlowEvent =
  | { type: "setStep"; step: Step }
  | { type: "setSetupKey"; setupKey: string }

const initialOnboardingFlowState: OnboardingFlowState = {
  step: "key",
  setupKey: "",
}

function onboardingFlowReducer(
  state: OnboardingFlowState,
  event: OnboardingFlowEvent,
): OnboardingFlowState {
  switch (event.type) {
    case "setStep":
      return state.step === event.step ? state : { ...state, step: event.step }
    case "setSetupKey":
      return state.setupKey === event.setupKey
        ? state
        : { ...state, setupKey: event.setupKey }
  }
}

function OnboardingSeerrSubmitButton({
  control,
  isSubmitting,
}: {
  control: ReturnType<typeof useForm<OnboardingSeerrFormValues>>["control"]
  isSubmitting: boolean
}) {
  const t = useTranslations()
  const [internalUrl, externalUrl, apiKey] = useWatch({
    control,
    name: ["internalUrl", "externalUrl", "apiKey"],
  })
  const hasSeerrInput = hasSeerrValuesInput({
    internalUrl: internalUrl ?? "",
    externalUrl: externalUrl ?? "",
    apiKey: apiKey ?? "",
  })

  return (
    <Button type="submit" className="flex-1" disabled={isSubmitting}>
      {isSubmitting
        ? t("common.validating")
        : hasSeerrInput
          ? t("onboarding.continue")
          : t("onboarding.skip")}
    </Button>
  )
}

function OnboardingEmailSubmitButton({
  control,
  isSubmitting,
}: {
  control: ReturnType<typeof useForm<OnboardingEmailFormValues>>["control"]
  isSubmitting: boolean
}) {
  const t = useTranslations()
  const [from, smtpHost, smtpPort, smtpUsername, smtpPassword] = useWatch({
    control,
    name: ["from", "smtpHost", "smtpPort", "smtpUsername", "smtpPassword"],
  })
  const hasEmailInput = hasEmailValuesInput({
    from: from ?? "",
    smtpHost: smtpHost ?? "",
    smtpPort: smtpPort ?? "",
    smtpSecure: false,
    smtpUsername: smtpUsername ?? "",
    smtpPassword: smtpPassword ?? "",
  })

  return (
    <Button type="submit" className="flex-1" disabled={isSubmitting}>
      {isSubmitting
        ? t("common.saving")
        : hasEmailInput
          ? t("onboarding.completeSetup")
          : t("onboarding.skip")}
    </Button>
  )
}

function OnboardingPage() {
  const navigate = useNavigate()
  const [{ step, setupKey }, dispatch] = useReducer(
    onboardingFlowReducer,
    initialOnboardingFlowState,
  )
  const t = useTranslations()

  const keyForm = useForm<SetupKeyFormValues>({
    resolver: zodResolver(setupKeyFormSchema),
    defaultValues: {
      setupKey: "",
    },
  })

  const jellyfinForm = useForm<OnboardingConfigFormValues>({
    resolver: zodResolver(onboardingConfigFormSchema),
    defaultValues: {
      appUrl: "",
      internalUrl: "",
      externalUrl: "",
      apiKey: "",
      configPath: "",
    },
  })

  const seerrForm = useForm<OnboardingSeerrFormValues>({
    resolver: zodResolver(onboardingSeerrFormSchema),
    defaultValues: {
      internalUrl: "",
      externalUrl: "",
      apiKey: "",
    },
  })

  const emailForm = useForm<OnboardingEmailFormValues>({
    resolver: zodResolver(onboardingEmailFormSchema),
    defaultValues: {
      from: "",
      smtpHost: "",
      smtpPort: "",
      smtpSecure: false,
      smtpUsername: "",
      smtpPassword: "",
    },
  })

  async function handleKeySubmit(data: SetupKeyFormValues): Promise<void> {
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.onboarding.validateSetupKey({ setupKey: data.setupKey }),
    )
    if (result.error === null && result.data) {
      dispatch({ type: "setSetupKey", setupKey: data.setupKey })
      dispatch({ type: "setStep", step: "jellyfin" })
    } else {
      toast.error(
        getApiErrorMessage(result.error, t, "onboarding.invalidSetupKey"),
      )
    }
  }

  async function handleJellyfinSubmit(): Promise<void> {
    dispatch({ type: "setStep", step: "seerr" })
  }

  async function handleSeerrSubmit(): Promise<void> {
    dispatch({ type: "setStep", step: "email" })
  }

  async function handleEmailSubmit(
    data: OnboardingEmailFormValues,
  ): Promise<void> {
    const jellyfinValues = jellyfinForm.getValues()
    const seerrSubmissionValues = seerrForm.getValues()
    const hasSeerrInput = hasSeerrValuesInput(seerrSubmissionValues)
    const hasEmailInput = hasEmailValuesInput(data)

    const includesSmtpConfig =
      Boolean(data.smtpHost) ||
      Boolean(data.smtpPort) ||
      Boolean(data.smtpUsername) ||
      Boolean(data.smtpPassword)

    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.onboarding.initialize({
        setupKey,
        app: {
          url: jellyfinValues.appUrl,
        },
        jellyfin: {
          internalUrl: jellyfinValues.internalUrl,
          externalUrl: jellyfinValues.externalUrl || undefined,
          apiKey: jellyfinValues.apiKey,
          configPath: jellyfinValues.configPath || undefined,
        },
        seerr: hasSeerrInput
          ? {
              internalUrl: seerrSubmissionValues.internalUrl,
              externalUrl: seerrSubmissionValues.externalUrl || undefined,
              apiKey: seerrSubmissionValues.apiKey,
            }
          : undefined,
        email: hasEmailInput
          ? {
              from: data.from || "Jellything <noreply@example.com>",
              smtp: includesSmtpConfig
                ? {
                    host: data.smtpHost,
                    port: Number.parseInt(data.smtpPort, 10),
                    secure: data.smtpSecure,
                    username: data.smtpUsername || undefined,
                    password: data.smtpPassword || undefined,
                  }
                : undefined,
            }
          : undefined,
      }),
    )

    if (result.error === null) {
      toast.success(t("onboarding.configSaved"))
      await navigate({ to: "/login" })
    } else {
      toast.error(
        getApiErrorMessage(result.error, t, "onboarding.configSaveFailed"),
      )
    }
  }

  const description =
    step === "key"
      ? t("onboarding.keyDescription")
      : step === "jellyfin"
        ? t("settings.jellyfinConnectionDescription")
        : step === "seerr"
          ? t("settings.seerrConnectionDescription")
          : t("settings.emailSettingsDescription")
  const stepProgress = t("onboarding.stepProgress", {
    current: STEP_INDEX[step],
    total: ONBOARDING_TOTAL_STEPS,
  })

  return (
    <CenteredPageShell>
      <Card className="w-full max-w-md border-0 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl">{t("onboarding.title")}</CardTitle>
          <p className="text-muted-foreground text-xs">{stepProgress}</p>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "key" ? (
            <form onSubmit={keyForm.handleSubmit(handleKeySubmit)}>
              <FieldGroup className="gap-4">
                <Field data-invalid={!!keyForm.formState.errors.setupKey}>
                  <FieldLabel htmlFor="setupKey">
                    {t("onboarding.setupKeyLabel")}
                  </FieldLabel>
                  <Input
                    id="setupKey"
                    type="text"
                    className="font-mono"
                    aria-invalid={!!keyForm.formState.errors.setupKey}
                    {...keyForm.register("setupKey")}
                  />
                  {keyForm.formState.errors.setupKey && (
                    <FieldError>
                      {keyForm.formState.errors.setupKey.message}
                    </FieldError>
                  )}
                </Field>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={keyForm.formState.isSubmitting}
                >
                  {keyForm.formState.isSubmitting
                    ? t("onboarding.validateKey")
                    : t("onboarding.continue")}
                </Button>
              </FieldGroup>
            </form>
          ) : step === "jellyfin" ? (
            <form onSubmit={jellyfinForm.handleSubmit(handleJellyfinSubmit)}>
              <FieldGroup className="gap-4">
                <Field data-invalid={!!jellyfinForm.formState.errors.appUrl}>
                  <FieldLabel htmlFor="appUrl">
                    {t("settings.appUrl")}
                  </FieldLabel>
                  <Input
                    id="appUrl"
                    type="url"
                    placeholder={t("settings.appUrlPlaceholder")}
                    aria-invalid={!!jellyfinForm.formState.errors.appUrl}
                    {...jellyfinForm.register("appUrl")}
                  />
                  <FieldDescription>
                    {t("settings.appUrlDescription")}
                  </FieldDescription>
                  {jellyfinForm.formState.errors.appUrl && (
                    <FieldError>
                      {jellyfinForm.formState.errors.appUrl.message}
                    </FieldError>
                  )}
                </Field>

                <Field
                  data-invalid={!!jellyfinForm.formState.errors.internalUrl}
                >
                  <FieldLabel htmlFor="internalUrl">
                    {t("settings.internalUrl")}
                  </FieldLabel>
                  <Input
                    id="internalUrl"
                    type="url"
                    placeholder={t("settings.internalUrlPlaceholderJellyfin")}
                    aria-invalid={!!jellyfinForm.formState.errors.internalUrl}
                    {...jellyfinForm.register("internalUrl")}
                  />
                  <FieldDescription>
                    {t("settings.internalUrlDescriptionJellyfin")}
                  </FieldDescription>
                  {jellyfinForm.formState.errors.internalUrl && (
                    <FieldError>
                      {jellyfinForm.formState.errors.internalUrl.message}
                    </FieldError>
                  )}
                </Field>

                <Field
                  data-invalid={!!jellyfinForm.formState.errors.externalUrl}
                >
                  <FieldLabel htmlFor="externalUrl">
                    {t("settings.externalUrlOptional")}
                  </FieldLabel>
                  <Input
                    id="externalUrl"
                    type="url"
                    placeholder={t("settings.externalUrlPlaceholderJellyfin")}
                    aria-invalid={!!jellyfinForm.formState.errors.externalUrl}
                    {...jellyfinForm.register("externalUrl")}
                  />
                  <FieldDescription>
                    {t("settings.externalUrlDescriptionJellyfin")}
                  </FieldDescription>
                  {jellyfinForm.formState.errors.externalUrl && (
                    <FieldError>
                      {jellyfinForm.formState.errors.externalUrl.message}
                    </FieldError>
                  )}
                </Field>

                <Field data-invalid={!!jellyfinForm.formState.errors.apiKey}>
                  <FieldLabel htmlFor="apiKey">
                    {t("settings.apiKey")}
                  </FieldLabel>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder={t("settings.apiKeyPlaceholder")}
                    aria-invalid={!!jellyfinForm.formState.errors.apiKey}
                    {...jellyfinForm.register("apiKey")}
                  />
                  <FieldDescription>
                    {t("settings.apiKeyGenerateJellyfin")}
                  </FieldDescription>
                  {jellyfinForm.formState.errors.apiKey && (
                    <FieldError>
                      {jellyfinForm.formState.errors.apiKey.message}
                    </FieldError>
                  )}
                </Field>

                <Field
                  data-invalid={!!jellyfinForm.formState.errors.configPath}
                >
                  <FieldLabel htmlFor="configPath">
                    {t("settings.configPathOptional")}
                  </FieldLabel>
                  <Input
                    id="configPath"
                    type="text"
                    placeholder={t("settings.configPathPlaceholder")}
                    aria-invalid={!!jellyfinForm.formState.errors.configPath}
                    {...jellyfinForm.register("configPath")}
                  />
                  <FieldDescription>
                    {t("settings.configPathDescription")}
                  </FieldDescription>
                  {jellyfinForm.formState.errors.configPath && (
                    <FieldError>
                      {jellyfinForm.formState.errors.configPath.message}
                    </FieldError>
                  )}
                </Field>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => dispatch({ type: "setStep", step: "key" })}
                  >
                    {t("common.back")}
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={jellyfinForm.formState.isSubmitting}
                  >
                    {jellyfinForm.formState.isSubmitting
                      ? t("common.validating")
                      : t("onboarding.continue")}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          ) : step === "seerr" ? (
            <form onSubmit={seerrForm.handleSubmit(handleSeerrSubmit)}>
              <FieldGroup className="gap-4">
                <Field data-invalid={!!seerrForm.formState.errors.internalUrl}>
                  <FieldLabel htmlFor="seerrInternalUrl">
                    {t("settings.internalUrl")}
                  </FieldLabel>
                  <Input
                    id="seerrInternalUrl"
                    type="url"
                    placeholder={t("settings.internalUrlPlaceholderSeerr")}
                    aria-invalid={!!seerrForm.formState.errors.internalUrl}
                    {...seerrForm.register("internalUrl")}
                  />
                  <FieldDescription>
                    {t("settings.internalUrlDescriptionSeerr")}
                  </FieldDescription>
                  {seerrForm.formState.errors.internalUrl && (
                    <FieldError>
                      {seerrForm.formState.errors.internalUrl.message}
                    </FieldError>
                  )}
                </Field>

                <Field data-invalid={!!seerrForm.formState.errors.externalUrl}>
                  <FieldLabel htmlFor="seerrExternalUrl">
                    {t("settings.externalUrlOptional")}
                  </FieldLabel>
                  <Input
                    id="seerrExternalUrl"
                    type="url"
                    placeholder={t("settings.externalUrlPlaceholderSeerr")}
                    aria-invalid={!!seerrForm.formState.errors.externalUrl}
                    {...seerrForm.register("externalUrl")}
                  />
                  <FieldDescription>
                    {t("settings.externalUrlDescriptionSeerr")}
                  </FieldDescription>
                  {seerrForm.formState.errors.externalUrl && (
                    <FieldError>
                      {seerrForm.formState.errors.externalUrl.message}
                    </FieldError>
                  )}
                </Field>

                <Field data-invalid={!!seerrForm.formState.errors.apiKey}>
                  <FieldLabel htmlFor="seerrApiKey">
                    {t("settings.apiKey")}
                  </FieldLabel>
                  <Input
                    id="seerrApiKey"
                    type="password"
                    placeholder={t("settings.apiKeyPlaceholder")}
                    aria-invalid={!!seerrForm.formState.errors.apiKey}
                    {...seerrForm.register("apiKey")}
                  />
                  <FieldDescription>
                    {t("settings.apiKeyGenerateSeerr")}
                  </FieldDescription>
                  {seerrForm.formState.errors.apiKey && (
                    <FieldError>
                      {seerrForm.formState.errors.apiKey.message}
                    </FieldError>
                  )}
                </Field>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      dispatch({ type: "setStep", step: "jellyfin" })
                    }
                  >
                    {t("common.back")}
                  </Button>
                  <OnboardingSeerrSubmitButton
                    control={seerrForm.control}
                    isSubmitting={seerrForm.formState.isSubmitting}
                  />
                </div>
              </FieldGroup>
            </form>
          ) : (
            <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)}>
              <FieldGroup className="gap-4">
                <Field data-invalid={!!emailForm.formState.errors.from}>
                  <FieldLabel htmlFor="from">
                    {t("settings.emailFrom")}
                  </FieldLabel>
                  <Input
                    id="from"
                    type="text"
                    placeholder={t("settings.emailFromPlaceholder")}
                    aria-invalid={!!emailForm.formState.errors.from}
                    {...emailForm.register("from")}
                  />
                  <FieldDescription>
                    {t("settings.emailFromDescription")}
                  </FieldDescription>
                  {emailForm.formState.errors.from && (
                    <FieldError>
                      {emailForm.formState.errors.from.message}
                    </FieldError>
                  )}
                </Field>

                <Field data-invalid={!!emailForm.formState.errors.smtpHost}>
                  <FieldLabel htmlFor="smtpHost">
                    {t("settings.smtpHost")}
                  </FieldLabel>
                  <Input
                    id="smtpHost"
                    type="text"
                    placeholder={t("settings.smtpHostPlaceholder")}
                    aria-invalid={!!emailForm.formState.errors.smtpHost}
                    {...emailForm.register("smtpHost")}
                  />
                  <FieldDescription>
                    {t("settings.smtpHostDescription")}
                  </FieldDescription>
                  {emailForm.formState.errors.smtpHost && (
                    <FieldError>
                      {emailForm.formState.errors.smtpHost.message}
                    </FieldError>
                  )}
                </Field>

                <Field data-invalid={!!emailForm.formState.errors.smtpPort}>
                  <FieldLabel htmlFor="smtpPort">
                    {t("settings.smtpPort")}
                  </FieldLabel>
                  <Input
                    id="smtpPort"
                    type="number"
                    min={1}
                    max={65535}
                    placeholder={t("settings.smtpPortPlaceholder")}
                    aria-invalid={!!emailForm.formState.errors.smtpPort}
                    {...emailForm.register("smtpPort")}
                  />
                  <FieldDescription>
                    {t("settings.smtpPortDescription")}
                  </FieldDescription>
                  {emailForm.formState.errors.smtpPort && (
                    <FieldError>
                      {emailForm.formState.errors.smtpPort.message}
                    </FieldError>
                  )}
                </Field>

                <Controller
                  name="smtpSecure"
                  control={emailForm.control}
                  render={({ field }) => (
                    <Field>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="smtpSecure"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <FieldLabel
                          htmlFor="smtpSecure"
                          className="cursor-pointer font-normal"
                        >
                          {t("settings.smtpSecure")}
                        </FieldLabel>
                      </div>
                      <FieldDescription>
                        {t("settings.smtpSecureDescription")}
                      </FieldDescription>
                    </Field>
                  )}
                />

                <Field data-invalid={!!emailForm.formState.errors.smtpUsername}>
                  <FieldLabel htmlFor="smtpUsername">
                    {t("settings.smtpUsername")}
                  </FieldLabel>
                  <Input
                    id="smtpUsername"
                    type="text"
                    placeholder={t("settings.smtpUsernamePlaceholder")}
                    aria-invalid={!!emailForm.formState.errors.smtpUsername}
                    {...emailForm.register("smtpUsername")}
                  />
                  <FieldDescription>
                    {t("settings.smtpUsernameDescription")}
                  </FieldDescription>
                  {emailForm.formState.errors.smtpUsername && (
                    <FieldError>
                      {emailForm.formState.errors.smtpUsername.message}
                    </FieldError>
                  )}
                </Field>

                <Field data-invalid={!!emailForm.formState.errors.smtpPassword}>
                  <FieldLabel htmlFor="smtpPassword">
                    {t("settings.smtpPassword")}
                  </FieldLabel>
                  <Input
                    id="smtpPassword"
                    type="password"
                    placeholder={t("settings.smtpPasswordPlaceholder")}
                    aria-invalid={!!emailForm.formState.errors.smtpPassword}
                    {...emailForm.register("smtpPassword")}
                  />
                  <FieldDescription>
                    {t("settings.smtpPasswordDescription")}
                  </FieldDescription>
                  {emailForm.formState.errors.smtpPassword && (
                    <FieldError>
                      {emailForm.formState.errors.smtpPassword.message}
                    </FieldError>
                  )}
                </Field>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => dispatch({ type: "setStep", step: "seerr" })}
                  >
                    {t("common.back")}
                  </Button>
                  <OnboardingEmailSubmitButton
                    control={emailForm.control}
                    isSubmitting={emailForm.formState.isSubmitting}
                  />
                </div>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </CenteredPageShell>
  )
}
