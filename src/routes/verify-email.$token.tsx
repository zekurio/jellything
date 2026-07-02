"use client"

import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"

import { CenteredPageShell } from "@/components/layout/centered-page-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useSession } from "@/hooks/use-session"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { enforcePageAccessFn } from "@/lib/page-access-fns"

export const Route = createFileRoute("/verify-email/$token")({
  loader: async () => enforcePageAccessFn({ data: "public" }),
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const navigate = useNavigate()
  const router = useRouter()
  const { token } = Route.useParams()
  const t = useTranslations()
  const { setSession } = useSession()
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    "verifying",
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function verifyEmailAddress() {
      try {
        const client = getBrowserORPCClient()
        const result = await runApiEffect(client.email.verify({ token }))

        if (result.error !== null) {
          if (!isActive) {
            return
          }
          setStatus("error")
          setErrorMessage(
            getApiErrorMessage(result.error, t, "email.verificationFailedLink"),
          )
          return
        }

        if (!isActive) {
          return
        }
        if (result.data) {
          setSession(result.data)
        }
        setStatus("success")

        redirectTimeoutRef.current = setTimeout(() => {
          void navigate({ to: "/" })
          void router.invalidate()
        }, 2000)
      } catch {
        if (!isActive) {
          return
        }
        setStatus("error")
        setErrorMessage(t("email.verificationFailedGeneric"))
      }
    }

    verifyEmailAddress()

    return () => {
      isActive = false
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current)
      }
    }
  }, [navigate, router, setSession, t, token])

  if (status === "verifying") {
    return (
      <CenteredPageShell>
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <Spinner size="lg" />
            <span className="text-muted-foreground text-sm">
              {t("email.verifying")}
            </span>
          </CardContent>
        </Card>
      </CenteredPageShell>
    )
  }

  if (status === "error") {
    return (
      <CenteredPageShell>
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {t("email.verificationFailedTitle")}
            </CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            <Button asChild className="w-full">
              <Link to="/">{t("email.goToDashboard")}</Link>
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
            {t("email.verifiedTitle")}
          </CardTitle>
          <CardDescription>{t("email.verifiedDescription")}</CardDescription>
        </CardHeader>
      </Card>
    </CenteredPageShell>
  )
}
