"use client"

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { useForm } from "react-hook-form"

import { CenteredPageShell } from "@/components/layout/centered-page-shell"
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
import { createAppStore } from "@/hooks/store-utils"
import { useScopedStore } from "@/hooks/use-scoped-store"
import { ErrorCode } from "@/lib/api/contracts/errors"
import { toErrorCode } from "@/lib/api/error-code"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { enforcePageAccessFn } from "@/lib/page-access-fns"
import {
  forgotPasswordFormSchema,
  type ForgotPasswordFormValues,
} from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

interface ForgotPasswordPageStoreState {
  isSubmitted: boolean
  setIsSubmitted: (isSubmitted: boolean) => void
}

export const Route = createFileRoute("/forgot-password")({
  loader: async () => enforcePageAccessFn({ data: "public" }),
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const store = useScopedStore(() =>
    createAppStore<ForgotPasswordPageStoreState>((set) => ({
      isSubmitted: false,
      setIsSubmitted: (isSubmitted) => set({ isSubmitted }),
    })),
  )
  const isSubmitted = useStore(store, (state) => state.isSubmitted)
  const t = useTranslations()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: standardSchemaResolver(standardSchema(forgotPasswordFormSchema)),
    defaultValues: {
      username: "",
    },
  })

  async function onSubmit(data: ForgotPasswordFormValues): Promise<void> {
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.passwordReset.request({ username: data.username }),
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
      // Show specific errors for configuration issues
      if (code === ErrorCode.PASSWORD_RESET_NOT_CONFIGURED) {
        setError("root", {
          message: t("auth.resetNotConfigured"),
        })
        return
      }
      if (code === ErrorCode.EMAIL_NOT_CONFIGURED) {
        setError("root", { message: t("auth.emailNotConfigured") })
        return
      }

      if (code === ErrorCode.OPERATION_FAILED) {
        setError("root", {
          message: getApiErrorMessage(
            result.error,
            t,
            "auth.resetRequestFailed",
          ),
        })
        return
      }

      setError("root", {
        message: getApiErrorMessage(result.error, t, "errors.tryAgain"),
      })
      return
    }

    // Always show success to prevent user enumeration
    store.getState().setIsSubmitted(true)
  }

  if (isSubmitted) {
    return (
      <CenteredPageShell>
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {t("auth.checkEmailTitle")}
            </CardTitle>
            <CardDescription>{t("auth.checkEmailDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4 text-sm">
              {t("auth.checkEmailHelp")}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">{t("auth.backToSignIn")}</Link>
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
            {t("auth.forgotPasswordTitle")}
          </CardTitle>
          <CardDescription>
            {t("auth.forgotPasswordDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-4">
              <Field data-invalid={!!errors.username}>
                <FieldLabel htmlFor="username">{t("auth.username")}</FieldLabel>
                <Input
                  id="username"
                  type="text"
                  placeholder={t("auth.usernamePlaceholder")}
                  autoComplete="username"
                  aria-invalid={!!errors.username}
                  {...register("username")}
                />
                {errors.username && <FieldError errors={[errors.username]} />}
              </Field>

              {errors.root && <FieldError errors={[errors.root]} />}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting
                  ? t("auth.sendingReset")
                  : t("auth.sendResetCode")}
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
