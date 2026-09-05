"use client"

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
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
import { useSession } from "@/hooks/use-session"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { enforcePageAccessFn } from "@/lib/page-access-fns"
import { loginSchema, type LoginFormValues } from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

export const Route = createFileRoute("/login")({
  loader: async () => enforcePageAccessFn({ data: "login" }),
  component: LoginPage,
})

function LoginPage() {
  const t = useTranslations()
  const navigate = useNavigate()
  const router = useRouter()
  const { setSession } = useSession()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: standardSchemaResolver(standardSchema(loginSchema)),
    defaultValues: {
      username: "",
      password: "",
    },
  })

  async function onSubmit(data: LoginFormValues): Promise<void> {
    const client = getBrowserORPCClient()
    const result = await runApiEffect(client.auth.login(data))

    if (result.error !== null) {
      setError("root", { message: getApiErrorMessage(result.error, t) })
      return
    }

    setSession(result.data)
    await navigate({ to: "/", replace: true })
    await router.invalidate()
  }

  return (
    <CenteredPageShell>
      <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {t("auth.signInTitle")}
          </CardTitle>
          <CardDescription>{t("auth.signInDescription")}</CardDescription>
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

              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder={t("auth.passwordPlaceholder")}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                {errors.password && <FieldError errors={[errors.password]} />}
              </Field>

              {errors.root && <FieldError errors={[errors.root]} />}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("auth.signingIn") : t("auth.signInButton")}
              </Button>

              <Link
                to="/forgot-password"
                className="text-muted-foreground hover:text-foreground block text-center text-sm"
              >
                {t("auth.forgotPassword")}
              </Link>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </CenteredPageShell>
  )
}
