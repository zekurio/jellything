"use client"

import { useRouter } from "@tanstack/react-router"
import { CalendarClock, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { FormShell } from "@/components/shared/form-shell"
import { Button } from "@/components/ui/button"
import { RelativeTime } from "@/components/ui/relative-time"
import { getApiErrorMessage } from "@/lib/api/error-message"
import { useLocale, useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import type { MyExpiryInfo } from "@/lib/renewal-types"
import { formatDateTime } from "@/lib/utils"

export function AccountAccessCard({ expiry }: { expiry: MyExpiryInfo }) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [current, setCurrent] = useState<MyExpiryInfo>(expiry)
  const [isRenewing, setIsRenewing] = useState(false)

  // The card only lands here for members with an expiry; admins and
  // never-expiring accounts are filtered out before render.
  if (!current.expiresAt) {
    return null
  }

  async function handleRenew() {
    setIsRenewing(true)

    try {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(client.me.renew({}))

      if (result.error === null && result.data) {
        setCurrent(result.data)
        void router.invalidate()
        toast.success(t("profile.accessExtended"))
        return
      }

      toast.error(getApiErrorMessage(result.error, t, "profile.extendFailed"))
    } finally {
      setIsRenewing(false)
    }
  }

  const isSelfServe = current.renewalMode === "self-serve"

  return (
    <FormShell title={t("profile.accountAccess")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CalendarClock className="text-muted-foreground mt-0.5 size-5 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm">
              {t("profile.accessExpires")}{" "}
              <RelativeTime date={current.expiresAt} locale={locale} />
            </p>
            <p className="text-muted-foreground text-xs">
              {formatDateTime(current.expiresAt, locale)}
            </p>
          </div>
        </div>

        {isSelfServe && (
          <Button
            type="button"
            className="sm:shrink-0"
            disabled={!current.canRenew || isRenewing}
            onClick={handleRenew}
          >
            {isRenewing && <Loader2 className="size-4 animate-spin" />}
            {isRenewing ? t("common.saving") : t("profile.extendAccess")}
          </Button>
        )}
      </div>

      {isSelfServe && !current.canRenew && current.reason === "cap-reached" && (
        <p className="text-muted-foreground text-xs">
          {t("profile.accessCapReached")}
        </p>
      )}

      {isSelfServe &&
        !current.canRenew &&
        current.reason === "outside-window" && (
          <p className="text-muted-foreground text-xs">
            {t("profile.renewalNotYetAvailable")}
          </p>
        )}
    </FormShell>
  )
}
