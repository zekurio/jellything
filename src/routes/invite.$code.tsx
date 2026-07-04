"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { Loader2, LogOut, ArrowLeft, ArrowRight, Check } from "lucide-react"
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { CenteredPageShell } from "@/components/layout/centered-page-shell"
import {
  AvatarUploadButton,
  type AvatarFile,
} from "@/components/shared/avatar-upload"
import { PasswordInput } from "@/components/shared/password-input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useSession } from "@/hooks/use-session"
import type { ErrorCode } from "@/lib/api/contracts/errors"
import { toErrorCode } from "@/lib/api/error-code"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useTranslations, resolveErrorKey } from "@/lib/i18n"
import { renderMarkdown } from "@/lib/markdown"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { enforcePageAccessFn } from "@/lib/page-access-fns"
import {
  inviteRedemptionFormSchema,
  normalizeEmail,
  type InviteRedemptionFormValues,
} from "@/lib/schemas"
import { cn } from "@/lib/utils"

const REGISTRATION_STEP_COUNT = 3

export const Route = createFileRoute("/invite/$code")({
  loader: async () => enforcePageAccessFn({ data: "public" }),
  component: InviteRedeemPage,
})

interface InviteOnboardingStep {
  id: string
  title: string
}

interface InviteOnboardingPage {
  id: string
  title: string
  markdown: string
}

interface InviteWizardStep {
  title: string
  description: string
}

interface InviteRedeemState {
  validating: boolean
  valid: boolean
  profileName: string
  errorMessage: string
  isLoggedIn: boolean
  userEmail: string | null
  avatarFile: AvatarFile | null
  currentStep: number
  registrationComplete: boolean
  onboardingStepTitles: InviteOnboardingStep[]
  onboardingPages: InviteOnboardingPage[]
}

type InviteRedeemEvent =
  | { type: "reset" }
  | { type: "setValidating"; validating: boolean }
  | { type: "setValid"; valid: boolean }
  | { type: "setProfileName"; profileName: string }
  | { type: "setErrorMessage"; errorMessage: string }
  | { type: "setIsLoggedIn"; isLoggedIn: boolean }
  | { type: "setUserEmail"; userEmail: string | null }
  | { type: "setAvatarFile"; avatarFile: AvatarFile | null }
  | {
      type: "setCurrentStep"
      currentStep: number | ((currentStep: number) => number)
    }
  | { type: "setRegistrationComplete"; registrationComplete: boolean }
  | {
      type: "setOnboardingStepTitles"
      onboardingStepTitles: InviteOnboardingStep[]
    }
  | { type: "setOnboardingPages"; onboardingPages: InviteOnboardingPage[] }

const initialInviteRedeemState: InviteRedeemState = {
  validating: true,
  valid: false,
  profileName: "",
  errorMessage: "",
  isLoggedIn: false,
  userEmail: null,
  avatarFile: null,
  currentStep: 0,
  registrationComplete: false,
  onboardingStepTitles: [],
  onboardingPages: [],
}

function inviteRedeemReducer(
  state: InviteRedeemState,
  event: InviteRedeemEvent,
): InviteRedeemState {
  switch (event.type) {
    case "reset":
      return initialInviteRedeemState
    case "setValidating":
      return state.validating === event.validating
        ? state
        : { ...state, validating: event.validating }
    case "setValid":
      return state.valid === event.valid
        ? state
        : { ...state, valid: event.valid }
    case "setProfileName":
      return state.profileName === event.profileName
        ? state
        : { ...state, profileName: event.profileName }
    case "setErrorMessage":
      return state.errorMessage === event.errorMessage
        ? state
        : { ...state, errorMessage: event.errorMessage }
    case "setIsLoggedIn":
      return state.isLoggedIn === event.isLoggedIn
        ? state
        : { ...state, isLoggedIn: event.isLoggedIn }
    case "setUserEmail":
      return state.userEmail === event.userEmail
        ? state
        : { ...state, userEmail: event.userEmail }
    case "setAvatarFile":
      return state.avatarFile === event.avatarFile
        ? state
        : { ...state, avatarFile: event.avatarFile }
    case "setCurrentStep": {
      const nextStep =
        typeof event.currentStep === "function"
          ? event.currentStep(state.currentStep)
          : event.currentStep
      return state.currentStep === nextStep
        ? state
        : { ...state, currentStep: nextStep }
    }
    case "setRegistrationComplete":
      return state.registrationComplete === event.registrationComplete
        ? state
        : { ...state, registrationComplete: event.registrationComplete }
    case "setOnboardingStepTitles":
      return state.onboardingStepTitles === event.onboardingStepTitles
        ? state
        : { ...state, onboardingStepTitles: event.onboardingStepTitles }
    case "setOnboardingPages":
      return state.onboardingPages === event.onboardingPages
        ? state
        : { ...state, onboardingPages: event.onboardingPages }
  }
}

function InviteRedeemPage() {
  const navigate = useNavigate()
  const router = useRouter()
  const { refresh, setSession } = useSession()
  const { code: rawCode } = Route.useParams()
  const code = rawCode?.toUpperCase()
  const t = useTranslations()
  const [
    {
      validating,
      valid,
      profileName,
      errorMessage,
      isLoggedIn,
      userEmail,
      avatarFile,
      currentStep,
      registrationComplete,
      onboardingStepTitles,
      onboardingPages,
    },
    dispatch,
  ] = useReducer(inviteRedeemReducer, initialInviteRedeemState)
  const reset = useCallback(() => {
    dispatch({ type: "reset" })
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    clearErrors,
    formState: { errors, isSubmitting, touchedFields, submitCount },
  } = useForm<InviteRedemptionFormValues>({
    resolver: zodResolver(inviteRedemptionFormSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const username = watch("username")
  const password = watch("password")
  const confirmPassword = watch("confirmPassword")
  const email = watch("email")

  const emailHasTypedValue = email.trim().length > 0
  const confirmPasswordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword
  const usernameErrorMessage = errors.username?.message
  const passwordErrorMessage = errors.password?.message
  const confirmPasswordErrorMessage = errors.confirmPassword?.message
  const emailErrorMessage = errors.email?.message
  const emailShouldShowInvalidState =
    Boolean(errors.email) &&
    (emailHasTypedValue || touchedFields.email || submitCount > 0)
  const confirmPasswordShouldShowInvalidState =
    Boolean(errors.confirmPassword) &&
    errors.confirmPassword?.message !== "validation.passwordsDoNotMatch"

  // Build the unified step list: 3 registration steps + N onboarding steps
  const wizardOnboardingSteps = useMemo(() => {
    const sourceSteps = registrationComplete
      ? onboardingPages
      : onboardingStepTitles
    return sourceSteps.map((step) => ({
      title: step.title,
      description: "",
    }))
  }, [onboardingPages, onboardingStepTitles, registrationComplete])

  const STEPS = useMemo<InviteWizardStep[]>(() => {
    const registrationSteps: InviteWizardStep[] = [
      {
        title: t("invites.stepProfile"),
        description: t("invites.stepProfileDescription"),
      },
      {
        title: t("invites.stepPassword"),
        description: t("invites.stepPasswordDescription"),
      },
      {
        title: t("invites.stepEmail"),
        description: t("invites.stepEmailDescription"),
      },
    ]
    return [...registrationSteps, ...wizardOnboardingSteps]
  }, [t, wizardOnboardingSteps])

  const STEP_FIELDS: (keyof InviteRedemptionFormValues)[][] = [
    ["username"],
    ["password", "confirmPassword"],
    ["email"],
  ]

  const isRegistrationStep = currentStep < REGISTRATION_STEP_COUNT
  const isFormSubmitStep = currentStep === REGISTRATION_STEP_COUNT - 1
  const isOnboardingStep = currentStep >= REGISTRATION_STEP_COUNT
  const onboardingPageIndex = currentStep - REGISTRATION_STEP_COUNT
  const isLastStep = isOnboardingStep
    ? onboardingPageIndex === onboardingPages.length - 1
    : currentStep === STEPS.length - 1
  // Current onboarding page (only valid when isOnboardingStep is true)
  const currentOnboardingPage = isOnboardingStep
    ? onboardingPages[onboardingPageIndex]
    : undefined

  const hydrateInvitePage = useCallback(
    async (isCancelled?: () => boolean): Promise<void> => {
      if (!code) {
        dispatch({ type: "setValidating", validating: false })
        dispatch({
          type: "setErrorMessage",
          errorMessage: t("invites.inviteInvalidLink"),
        })
        return
      }

      const client = getBrowserORPCClient()
      const inviteResult = await runApiEffect(
        client.invites.redeemPage({ code }),
      )

      if (isCancelled?.()) {
        return
      }

      if (inviteResult.data?.session) {
        setSession(inviteResult.data.session)
        dispatch({ type: "setIsLoggedIn", isLoggedIn: true })
        dispatch({
          type: "setUserEmail",
          userEmail: inviteResult.data.session.email,
        })
      }
      if (!inviteResult.data?.session && inviteResult.error === null) {
        setSession(null)
      }

      if (inviteResult.error !== null || !inviteResult.data) {
        const payload =
          inviteResult.error &&
          typeof inviteResult.error === "object" &&
          "value" in inviteResult.error
            ? inviteResult.error.value
            : inviteResult.error
        const codeValue =
          payload &&
          typeof payload === "object" &&
          "code" in payload &&
          typeof payload.code === "string"
            ? payload.code
            : "internal_error"
        dispatch({
          type: "setErrorMessage",
          errorMessage: t(resolveErrorKey(toErrorCode(codeValue))),
        })
        dispatch({ type: "setValidating", validating: false })
        return
      }

      const data = inviteResult.data
      if (data.valid) {
        dispatch({ type: "setValid", valid: true })
        dispatch({
          type: "setProfileName",
          profileName: data.profileName || "",
        })
        if (data.onboardingSteps && data.onboardingSteps.length > 0) {
          dispatch({
            type: "setOnboardingStepTitles",
            onboardingStepTitles: Array.from(data.onboardingSteps),
          })
        }
        dispatch({ type: "setValidating", validating: false })
        return
      }

      const errorKey = data.error
        ? resolveErrorKey(data.error as ErrorCode)
        : "invites.invalidInviteDescription"
      dispatch({ type: "setErrorMessage", errorMessage: t(errorKey) })
      dispatch({ type: "setValidating", validating: false })
    },
    [code, setSession, t],
  )

  useEffect(() => {
    reset()

    if (!code) {
      dispatch({ type: "setValidating", validating: false })
      dispatch({
        type: "setErrorMessage",
        errorMessage: t("invites.inviteInvalidLink"),
      })
      return
    }

    const abortController = new AbortController()

    void hydrateInvitePage(() => abortController.signal.aborted).catch(() => {
      if (abortController.signal.aborted) return
      dispatch({
        type: "setErrorMessage",
        errorMessage: t("errors.internalError"),
      })
      dispatch({ type: "setValidating", validating: false })
    })

    return () => {
      abortController.abort()
    }
  }, [code, hydrateInvitePage, reset, t])

  async function onSubmit(data: InviteRedemptionFormValues): Promise<void> {
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.invites.redeem({
        code,
        username: data.username.trim(),
        email: normalizeEmail(data.email),
        password: data.password,
        avatar: avatarFile?.base64 || undefined,
      }),
    )

    if (result.error !== null || !result.data) {
      const payload =
        result.error &&
        typeof result.error === "object" &&
        "value" in result.error
          ? result.error.value
          : result.error
      const codeValue =
        payload &&
        typeof payload === "object" &&
        "code" in payload &&
        typeof payload.code === "string"
          ? payload.code
          : "internal_error"
      toast.error(
        getApiErrorMessage(
          result.error,
          t,
          resolveErrorKey(toErrorCode(codeValue)),
        ),
      )
      return
    }

    if (!result.data.success) {
      return
    }

    const pages = result.data.onboardingPages ?? []
    if (result.data.session) {
      setSession(result.data.session)
    }
    if (!result.data.session) {
      await refresh()
    }
    toast.success(t("invites.verificationSent"))
    if (pages.length === 0) {
      await navigate({ to: "/" })
      return
    }
    dispatch({
      type: "setOnboardingStepTitles",
      onboardingStepTitles: pages.map(
        (page: { id: string; title: string }) => ({
          id: page.id,
          title: page.title,
        }),
      ),
    })
    dispatch({
      type: "setOnboardingPages",
      onboardingPages: Array.from(pages),
    })
    dispatch({ type: "setRegistrationComplete", registrationComplete: true })
    dispatch({ type: "setCurrentStep", currentStep: REGISTRATION_STEP_COUNT })
  }

  const handleLogout = useCallback(async () => {
    const client = getBrowserORPCClient()
    const result = await runApiEffect(client.auth.logout({}))

    if (result.error !== null) {
      toast.error(t("errors.internalError"))
      return
    }

    reset()
    setSession(null)
    await hydrateInvitePage()
    await router.invalidate()
  }, [hydrateInvitePage, reset, router, setSession, t])

  const handleNext = async () => {
    if (isRegistrationStep) {
      // Form step: validate fields before advancing
      const fields = STEP_FIELDS[currentStep]
      if (!fields) return
      const isValid = await trigger(fields)
      if (!isValid) return
      const nextStep = currentStep + 1
      const nextFields = STEP_FIELDS[nextStep]
      if (nextFields) clearErrors(nextFields)
      dispatch({ type: "setCurrentStep", currentStep: nextStep })
      return
    }

    // Onboarding step: just advance
    if (isLastStep) {
      void navigate({ to: "/" })
      return
    }
    dispatch({ type: "setCurrentStep", currentStep: currentStep + 1 })
  }

  const handleBack = () => {
    // Can't go back from the first onboarding step (account already created)
    if (isOnboardingStep && onboardingPageIndex === 0) return
    if (currentStep > 0) {
      dispatch({ type: "setCurrentStep", currentStep: currentStep - 1 })
    }
  }

  const handleRegistrationSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!isFormSubmitStep) {
      event.preventDefault()
      void handleNext()
      return
    }

    void handleSubmit(onSubmit)(event)
  }

  if (validating) {
    return (
      <CenteredPageShell>
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-8">
            <Spinner size="lg" />
            <span className="text-muted-foreground text-sm">
              {t("invites.validatingInvite")}
            </span>
          </CardContent>
        </Card>
      </CenteredPageShell>
    )
  }

  if (!valid) {
    return (
      <CenteredPageShell>
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {t("invites.invalidInviteTitle")}
            </CardTitle>
            <CardDescription>
              {errorMessage || t("invites.invalidInviteDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void navigate({ to: "/" })}
            >
              {t("invites.goHome")}
            </Button>
          </CardContent>
        </Card>
      </CenteredPageShell>
    )
  }

  if (isLoggedIn) {
    return (
      <CenteredPageShell>
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {t("invites.alreadyLoggedInTitle")}
            </CardTitle>
            <CardDescription>
              {t("invites.alreadyLoggedInDescription", {
                email: userEmail ?? "",
                profile: profileName,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {t("invites.alreadyLoggedInHint")}
            </p>
            <Button className="w-full" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              {t("invites.logOutToContinue")}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void navigate({ to: "/" })}
            >
              {t("invites.continueToDashboard")}
            </Button>
          </CardContent>
        </Card>
      </CenteredPageShell>
    )
  }

  // Determine whether to show the back button
  const showBackButton = isRegistrationStep
    ? currentStep > 0
    : onboardingPageIndex > 0

  // Current onboarding page HTML
  const onboardingContent = currentOnboardingPage
    ? renderMarkdown(currentOnboardingPage.markdown)
    : null

  return (
    <CenteredPageShell>
      <Card
        className={cn(
          "w-full border-0 bg-transparent shadow-none transition-[max-width] duration-300 ease-in-out",
          isOnboardingStep ? "max-w-xl" : "max-w-sm",
        )}
      >
        <CardHeader className="space-y-4">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={`step-${i}`}
                className={cn(
                  "h-1.5 rounded-full transition-colors duration-200",
                  i === currentStep ? "w-6 bg-primary" : "w-1.5",
                  i < currentStep
                    ? "bg-primary/40"
                    : i > currentStep
                      ? "bg-muted-foreground/20"
                      : "",
                )}
              />
            ))}
          </div>

          {/* Title and description */}
          <div className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {STEPS[currentStep]?.title}
            </CardTitle>
            {isRegistrationStep && STEPS[currentStep]?.description && (
              <CardDescription>
                {STEPS[currentStep]?.description}
              </CardDescription>
            )}
            {isOnboardingStep && onboardingPages.length > 0 && (
              <CardDescription>
                {t("invites.onboardingPageOf", {
                  current: onboardingPageIndex + 1,
                  total: onboardingPages.length,
                })}
              </CardDescription>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Registration form steps */}
          {isRegistrationStep && (
            <form onSubmit={handleRegistrationSubmit}>
              {/* Step 0: Profile */}
              <div
                className={cn(
                  "transition-opacity duration-200",
                  currentStep === 0
                    ? "opacity-100"
                    : "pointer-events-none hidden opacity-0",
                )}
              >
                <FieldGroup className="gap-5">
                  <div className="flex justify-center">
                    <AvatarUploadButton
                      name={username}
                      displayUrl={avatarFile?.base64}
                      onFileSelect={(file) =>
                        dispatch({ type: "setAvatarFile", avatarFile: file })
                      }
                      onRemove={() =>
                        dispatch({ type: "setAvatarFile", avatarFile: null })
                      }
                      disabled={isSubmitting}
                      size="lg"
                      showHint
                    />
                  </div>

                  <Field data-invalid={!!errors.username}>
                    <FieldLabel htmlFor="username">
                      {t("auth.username")}
                    </FieldLabel>
                    <Input
                      id="username"
                      placeholder={t("invites.usernamePlaceholder")}
                      disabled={isSubmitting}
                      autoComplete="username"
                      aria-invalid={!!errors.username}
                      {...register("username")}
                    />
                    {errors.username && (
                      <FieldError>{usernameErrorMessage}</FieldError>
                    )}
                  </Field>
                </FieldGroup>
              </div>

              {/* Step 1: Password */}
              <div
                className={cn(
                  "transition-opacity duration-200",
                  currentStep === 1
                    ? "opacity-100"
                    : "pointer-events-none hidden opacity-0",
                )}
              >
                <FieldGroup className="gap-4">
                  <Field data-invalid={!!errors.password}>
                    <PasswordInput
                      id="password"
                      value={password}
                      onChange={(value) => setValue("password", value)}
                      label={t("invites.passwordLabel")}
                      placeholder={t("invites.passwordPlaceholder")}
                      disabled={isSubmitting}
                      showStrengthIndicator
                      showRequirements
                      autoComplete="new-password"
                      error={passwordErrorMessage}
                    />
                  </Field>

                  <Field data-invalid={confirmPasswordShouldShowInvalidState}>
                    <PasswordInput
                      id="confirm-password"
                      value={confirmPassword}
                      onChange={(value) => setValue("confirmPassword", value)}
                      label={t("invites.confirmPasswordLabel")}
                      placeholder={t("invites.confirmPasswordPlaceholder")}
                      disabled={isSubmitting}
                      autoComplete="new-password"
                      error={
                        confirmPasswordShouldShowInvalidState
                          ? confirmPasswordErrorMessage
                          : undefined
                      }
                    />
                    {confirmPasswordMismatch && (
                      <p className="text-destructive text-xs">
                        {t("auth.passwordsDoNotMatch")}
                      </p>
                    )}
                    {confirmPassword.length > 0 && !confirmPasswordMismatch && (
                      <p className="flex items-center gap-1 text-xs text-green-500">
                        <Check className="h-3 w-3" />
                        {t("auth.passwordsMatch")}
                      </p>
                    )}
                  </Field>
                </FieldGroup>
              </div>

              {/* Step 2: Email */}
              <div
                className={cn(
                  "transition-opacity duration-200",
                  currentStep === 2
                    ? "opacity-100"
                    : "pointer-events-none hidden opacity-0",
                )}
              >
                <FieldGroup className="gap-4">
                  <Field data-invalid={emailShouldShowInvalidState}>
                    <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t("invites.emailPlaceholder")}
                      disabled={isSubmitting}
                      autoComplete="email"
                      aria-invalid={emailShouldShowInvalidState}
                      {...register("email")}
                    />
                    {emailShouldShowInvalidState && (
                      <FieldError>{emailErrorMessage}</FieldError>
                    )}
                  </Field>
                </FieldGroup>
              </div>

              {/* Navigation buttons (registration steps) */}
              <div className="mt-6 flex flex-col gap-2">
                {isFormSubmitStep ? (
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("invites.creatingAccount")}
                      </>
                    ) : (
                      t("invites.createAccount")
                    )}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleNext}
                    disabled={isSubmitting}
                  >
                    {t("invites.stepNext")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}

                {currentStep > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={handleBack}
                    disabled={isSubmitting}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t("invites.stepBack")}
                  </Button>
                )}
              </div>
            </form>
          )}

          {/* Onboarding page content */}
          {isOnboardingStep && (
            <div className="space-y-6">
              <div className="space-y-2">
                {!onboardingContent ? (
                  <p className="text-muted-foreground text-sm">
                    {t("invites.onboardingEmptyPreview")}
                  </p>
                ) : (
                  <div className="space-y-2">{onboardingContent}</div>
                )}
              </div>

              {/* Navigation buttons (onboarding steps) */}
              <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
                <Button className="w-full" onClick={handleNext}>
                  {isLastStep ? (
                    t("invites.onboardingFinish")
                  ) : (
                    <>
                      {t("invites.onboardingNext")}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                {showBackButton && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={handleBack}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t("invites.onboardingBack")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </CenteredPageShell>
  )
}
