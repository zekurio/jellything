import { createFileRoute } from "@tanstack/react-router"

import { CenteredPageShell } from "@/components/layout/centered-page-shell"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createTranslator } from "@/lib/i18n"
import { enforcePageAccessFn } from "@/lib/page-access-fns"

export const Route = createFileRoute("/config-error")({
  loader: async () => enforcePageAccessFn({ data: "config-error" }),
  component: ConfigErrorPage,
})

function ConfigErrorPage() {
  const { bootstrap, locale } = Route.useLoaderData()
  const error = bootstrap.configError ?? null
  const t = createTranslator(locale)
  const canViewDetails = Boolean(bootstrap.session?.isAdmin)

  return (
    <CenteredPageShell>
      <Card className="w-full max-w-lg border-0 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl text-red-600">
            {t("config.errorTitle")}
          </CardTitle>
          <CardDescription>{t("config.errorDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canViewDetails && error && (
            <div className="bg-destructive/10 text-destructive rounded-md p-4">
              <pre className="font-mono text-sm whitespace-pre-wrap">
                {error}
              </pre>
            </div>
          )}
          <div className="text-muted-foreground text-sm">
            <p>{t("config.errorCheck")}</p>
            {canViewDetails && (
              <p className="mt-2">
                {t("config.errorPathLabel")}{" "}
                <code className="bg-muted rounded px-1">
                  {process.env.CONFIG_PATH ?? "./data/config.json"}
                </code>
              </p>
            )}
            <p className="mt-2">{t("config.errorRestart")}</p>
          </div>
        </CardContent>
      </Card>
    </CenteredPageShell>
  )
}
