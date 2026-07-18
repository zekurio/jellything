"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight } from "lucide-react"
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
  onboardingAppFormSchema,
  onboardingEmailFormSchema,
  onboardingJellyfinFormSchema,
  onboardingSeerrFormSchema,
  setupKeyFormSchema,
  type OnboardingAppFormValues,
  type OnboardingEmailFormValues,
  type OnboardingJellyfinFormValues,
  type OnboardingSeerrFormValues,
  type SetupKeyFormValues,
} from "@/lib/schemas"
import { cn } from "@/lib/utils"

type Step = "key" | "app" | "jellyfin" | "seerr" | "email"

const STEP_ORDER: Step[] = ["key", "app", "jellyfin", "seerr", "email"]

export const Route = createFileRoute("/onboarding")({
  loader: async () => enforcePageAccessFn({ data: "onboarding" }),
  component: OnboardingPage,
})

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

function OnboardingStepIndicator({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEP_ORDER.map((step, i) => (
        <div
          key={step}
          className={cn(
            "h-1.5 rounded-full transition-colors duration-200",
            i === currentIndex ? "w-6 bg-primary" : "w-1.5",
            i < currentIndex
              ? "bg-primary/40"
              : i > currentIndex
                ? "bg-muted-foreground/20"
                : "",
          )}
        />
      ))}
    </div>
  )
}

function OnboardingStepButtons({
  submitLabel,
  submitIcon = true,
  isSubmitting,
  onBack,
}: {
  submitLabel: string
  submitIcon?: boolean
  isSubmitting: boolean
  onBack?: () => void
}) {
  const t = useTranslations()

  return (
    <div className="mt-2 flex flex-col gap-2">
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {submitLabel}
        {submitIcon && !isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={onBack}
          disabled={isSubmitting}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("common.back")}
        </Button>
      )}
    </div>
  )
}

function OnboardingSeerrSubmitButton({
  control,
  isSubmitting,
  onBack,
}: {
  control: ReturnType<typeof useForm<OnboardingSeerrFormValues>>["control"]
  isSubmitting: boolean
  onBack: () => void
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
    <OnboardingStepButtons
      submitLabel={
        isSubmitting
          ? t("common.validating")
          : hasSeerrInput
            ? t("onboarding.continue")
            : t("onboarding.skip")
      }
      isSubmitting={isSubmitting}
      onBack={onBack}
    />
  )
}

function OnboardingEmailSubmitButton({
  control,
  isSubmitting,
  onBack,
}: {
  control: ReturnType<typeof useForm<OnboardingEmailFormValues>>["control"]
  isSubmitting: boolean
  onBack: () => void
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
    <OnboardingStepButtons
      submitLabel={
        isSubmitting
          ? t("common.saving")
          : hasEmailInput
            ? t("onboarding.completeSetup")
            : t("onboarding.skip")
      }
      submitIcon={false}
      isSubmitting={isSubmitting}
      onBack={onBack}
    />
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

  const appForm = useForm<OnboardingAppFormValues>({
    resolver: zodResolver(onboardingAppFormSchema),
    defaultValues: {
      appUrl: "",
    },
  })

  const jellyfinForm = useForm<OnboardingJellyfinFormValues>({
    resolver: zodResolver(onboardingJellyfinFormSchema),
    defaultValues: {
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

  function goToStep(target: Step): void {
    dispatch({ type: "setStep", step: target })
  }

  async function handleKeySubmit(data: SetupKeyFormValues): Promise<void> {
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.onboarding.validateSetupKey({ setupKey: data.setupKey }),
    )
    if (result.error === null && result.data) {
      dispatch({ type: "setSetupKey", setupKey: data.setupKey })
      goToStep("app")
    } else {
      toast.error(
        getApiErrorMessage(result.error, t, "onboarding.invalidSetupKey"),
      )
    }
  }

  async function handleEmailSubmit(
    data: OnboardingEmailFormValues,
  ): Promise<void> {
    const appValues = appForm.getValues()
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
          url: appValues.appUrl,
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

  const stepTitle =
    step === "key"
      ? t("onboarding.title")
      : step === "app"
        ? t("onboarding.appStepTitle")
        : step === "jellyfin"
          ? t("settings.jellyfinConnectionTitle")
          : step === "seerr"
            ? t("settings.seerrConnectionTitle")
            : t("settings.emailSettingsTitle")
  const stepDescription =
    step === "key"
      ? t("onboarding.keyDescription")
      : step === "app"
        ? t("onboarding.appStepDescription")
        : step === "jellyfin"
          ? t("settings.jellyfinConnectionDescription")
          : step === "seerr"
            ? t("settings.seerrConnectionDescription")
            : t("settings.emailSettingsDescription")

  return (
    <CenteredPageShell>
      <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-4">
          <OnboardingStepIndicator currentIndex={STEP_ORDER.indexOf(step)} />
          <div className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {stepTitle}
            </CardTitle>
            <CardDescription>{stepDescription}</CardDescription>
          </div>
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
                    <FieldError errors={[keyForm.formState.errors.setupKey]} />
                  )}
                </Field>

                <OnboardingStepButtons
                  submitLabel={
                    keyForm.formState.isSubmitting
                      ? t("onboarding.validateKey")
                      : t("onboarding.continue")
                  }
                  isSubmitting={keyForm.formState.isSubmitting}
                />
              </FieldGroup>
            </form>
          ) : step === "app" ? (
            <form onSubmit={appForm.handleSubmit(() => goToStep("jellyfin"))}>
              <FieldGroup className="gap-4">
                <Field data-invalid={!!appForm.formState.errors.appUrl}>
                  <FieldLabel htmlFor="appUrl">
                    {t("settings.appUrl")}
                  </FieldLabel>
                  <Input
                    id="appUrl"
                    type="url"
                    placeholder={t("settings.appUrlPlaceholder")}
                    aria-invalid={!!appForm.formState.errors.appUrl}
                    {...appForm.register("appUrl")}
                  />
                  <FieldDescription>
                    {t("settings.appUrlDescription")}
                  </FieldDescription>
                  {appForm.formState.errors.appUrl && (
                    <FieldError errors={[appForm.formState.errors.appUrl]} />
                  )}
                </Field>

                <OnboardingStepButtons
                  submitLabel={t("onboarding.continue")}
                  isSubmitting={appForm.formState.isSubmitting}
                  onBack={() => goToStep("key")}
                />
              </FieldGroup>
            </form>
          ) : step === "jellyfin" ? (
            <form onSubmit={jellyfinForm.handleSubmit(() => goToStep("seerr"))}>
              <FieldGroup className="gap-4">
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
                    <FieldError
                      errors={[jellyfinForm.formState.errors.internalUrl]}
                    />
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
                    <FieldError
                      errors={[jellyfinForm.formState.errors.externalUrl]}
                    />
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
                    <FieldError
                      errors={[jellyfinForm.formState.errors.apiKey]}
                    />
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
                    <FieldError
                      errors={[jellyfinForm.formState.errors.configPath]}
                    />
                  )}
                </Field>

                <OnboardingStepButtons
                  submitLabel={
                    jellyfinForm.formState.isSubmitting
                      ? t("common.validating")
                      : t("onboarding.continue")
                  }
                  isSubmitting={jellyfinForm.formState.isSubmitting}
                  onBack={() => goToStep("app")}
                />
              </FieldGroup>
            </form>
          ) : step === "seerr" ? (
            <form onSubmit={seerrForm.handleSubmit(() => goToStep("email"))}>
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
                    <FieldError
                      errors={[seerrForm.formState.errors.internalUrl]}
                    />
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
                    <FieldError
                      errors={[seerrForm.formState.errors.externalUrl]}
                    />
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
                    <FieldError errors={[seerrForm.formState.errors.apiKey]} />
                  )}
                </Field>

                <OnboardingSeerrSubmitButton
                  control={seerrForm.control}
                  isSubmitting={seerrForm.formState.isSubmitting}
                  onBack={() => goToStep("jellyfin")}
                />
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
                    <FieldError errors={[emailForm.formState.errors.from]} />
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
                    <FieldError
                      errors={[emailForm.formState.errors.smtpHost]}
                    />
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
                    <FieldError
                      errors={[emailForm.formState.errors.smtpPort]}
                    />
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
                    <FieldError
                      errors={[emailForm.formState.errors.smtpUsername]}
                    />
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
                    <FieldError
                      errors={[emailForm.formState.errors.smtpPassword]}
                    />
                  )}
                </Field>

                <OnboardingEmailSubmitButton
                  control={emailForm.control}
                  isSubmitting={emailForm.formState.isSubmitting}
                  onBack={() => goToStep("seerr")}
                />
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </CenteredPageShell>
  )
}
