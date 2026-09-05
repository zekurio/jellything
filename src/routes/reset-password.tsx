"use client"

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { Suspense, useEffect, useRef } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { CenteredPageShell } from "@/components/layout/centered-page-shell"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createAppStore } from "@/hooks/store-utils"
import { useScopedStore } from "@/hooks/use-scoped-store"
import { ErrorCode } from "@/lib/api/contracts/errors"
import { toErrorCode } from "@/lib/api/error-code"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { enforcePageAccessFn } from "@/lib/page-access-fns"
import {
  resetPasswordFormSchema,
  type ResetPasswordFormValues,
} from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

interface ResetPasswordStoreState {
  isSuccess: boolean
  setIsSuccess: (isSuccess: boolean) => void
}

export const Route = createFileRoute("/reset-password")({
  loader: async () => enforcePageAccessFn({ data: "public" }),
  component: ResetPasswordPage,
})

function ResetPasswordForm() {
  const navigate = useNavigate()
  const store = useScopedStore(() =>
    createAppStore<ResetPasswordStoreState>((set) => ({
      isSuccess: false,
      setIsSuccess: (isSuccess) => set({ isSuccess }),
    })),
  )
  const isSuccess = useStore(store, (state) => state.isSuccess)
  const t = useTranslations()
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: standardSchemaResolver(standardSchema(resetPasswordFormSchema)),
    defaultValues: {
      pin: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  const newPassword = watch("newPassword")
  const confirmPassword = watch("confirmPassword")

  // Pre-fill PIN from URL parameter
  useEffect(() => {
    const pinFromUrl = new URL(window.location.href).searchParams.get("pin")
    if (pinFromUrl) {
      setValue("pin", pinFromUrl)
      window.history.replaceState(window.history.state, "", "/reset-password")
    }
  }, [setValue])

  useEffect(
    () => () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current)
      }
    },
    [],
  )

  async function onSubmit(data: ResetPasswordFormValues): Promise<void> {
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.passwordReset.confirm({
        pin: data.pin,
        newPassword: data.newPassword,
      }),
    )

    if (result.error !== null) {
      const error = result.error
      const payload =
        error && typeof error === "object" && "value" in error
          ? error.value
          : error
      const code =
        payload &&
        typeof payload === "object" &&
        "code" in payload &&
        typeof payload.code === "string"
          ? toErrorCode(payload.code)
          : ErrorCode.INTERNAL_ERROR
      if (code === ErrorCode.PASSWORD_RESET_PIN_INVALID) {
        setError("pin", { message: t("auth.resetPinInvalid") })
        return
      }

      if (code === ErrorCode.OPERATION_FAILED) {
        setError("root", {
          message: getApiErrorMessage(result.error, t, "auth.resetFailed"),
        })
        return
      }

      setError("root", {
        message: getApiErrorMessage(result.error, t, "errors.tryAgain"),
      })
      return
    }

    store.getState().setIsSuccess(true)
    toast.success(t("auth.resetPasswordSuccessToast"))

    // Redirect to login after a short delay
    redirectTimeoutRef.current = setTimeout(() => {
      void navigate({ to: "/login" })
    }, 2000)
  }

  if (isSuccess) {
    return (
      <CenteredPageShell>
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {t("auth.resetPasswordSuccessTitle")}
            </CardTitle>
            <CardDescription>
              {t("auth.resetPasswordSuccessDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/login">{t("auth.goToSignIn")}</Link>
            </Button>
          </CardContent>
        </Card>
      </CenteredPageShell>
    )
  }

  return (
    <CenteredPageShell>
      <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {t("auth.resetPasswordTitle")}
          </CardTitle>
          <CardDescription>
            {t("auth.resetPasswordDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-4">
              <Field data-invalid={!!errors.pin}>
                <FieldLabel htmlFor="pin">{t("auth.resetCode")}</FieldLabel>
                <Input
                  id="pin"
                  type="text"
                  placeholder={t("auth.resetCodePlaceholder")}
                  autoComplete="off"
                  className="text-center font-mono tracking-widest"
                  aria-invalid={!!errors.pin}
                  {...register("pin")}
                />
                <FieldDescription>
                  {t("auth.resetCodeDescription")}
                </FieldDescription>
                {errors.pin && <FieldError errors={[errors.pin]} />}
              </Field>

              <Field data-invalid={!!errors.newPassword}>
                <FieldLabel htmlFor="newPassword">
                  {t("auth.newPassword")}
                </FieldLabel>
                <PasswordInput
                  id="newPassword"
                  value={newPassword}
                  onChange={(value) =>
                    setValue("newPassword", value, { shouldValidate: true })
                  }
                  placeholder={t("auth.newPasswordPlaceholder")}
                  showStrengthIndicator
                  showRequirements
                  autoComplete="new-password"
                />
                {errors.newPassword && (
                  <FieldError errors={[errors.newPassword]} />
                )}
              </Field>

              <Field data-invalid={!!errors.confirmPassword}>
                <FieldLabel htmlFor="confirmPassword">
                  {t("auth.confirmPassword")}
                </FieldLabel>
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(value) =>
                    setValue("confirmPassword", value, { shouldValidate: true })
                  }
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  autoComplete="new-password"
                />
                {errors.confirmPassword && (
                  <FieldError errors={[errors.confirmPassword]} />
                )}
              </Field>

              {errors.root && <FieldError errors={[errors.root]} />}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("auth.resetting") : t("auth.resetPassword")}
              </Button>

              <Link
                to="/login"
                className="text-muted-foreground hover:text-foreground block text-center text-sm"
              >
                {t("auth.backToSignIn")}
              </Link>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </CenteredPageShell>
  )
}

function ResetPasswordPage() {
  const t = useTranslations()

  return (
    <Suspense
      fallback={
        <CenteredPageShell className="px-4 py-3">
          <div className="text-muted-foreground">{t("common.loading")}</div>
        </CenteredPageShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
