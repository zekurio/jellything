"use client"

import { Link } from "@tanstack/react-router"
import { ArrowRight, CalendarClock, Ticket, TicketX, Users } from "lucide-react"

import { StatTile } from "@/components/dashboard/stat-tile"
import { AppHeader } from "@/components/layout/app-header"
import { buttonVariants } from "@/components/ui/button"
import { RelativeTime } from "@/components/ui/relative-time"
import type { DashboardOverviewData } from "@/lib/dashboard-page-fns"
import { useLocale, useTranslations } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function DashboardOverview({
  appTitle,
  session,
  summary,
  error,
}: DashboardOverviewData) {
  const t = useTranslations()

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        title={appTitle}
        titleTo="/dashboard"
        user={{
          name: session.name,
          avatarUrl: session.avatarUrl,
          isAdmin: session.isAdmin,
        }}
      />
      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 pb-24 lg:p-6 lg:pb-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">{t("overview.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("overview.subtitle")}
            </p>
          </div>

          {error ? (
            <p className="text-muted-foreground text-sm">
              {t("overview.loadFailed")}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label={t("overview.activeUsers")}
              value={summary.usersAvailable ? summary.activeUsers : "—"}
              description={
                summary.usersAvailable
                  ? t("overview.activeUsersDescription")
                  : t("overview.usersUnavailable")
              }
              Icon={Users}
            />
            <StatTile
              label={t("overview.expiringSoon")}
              value={summary.expiringSoon}
              description={t("overview.expiringSoonDescription", {
                hours: summary.expiringSoonWindowHours,
              })}
              Icon={CalendarClock}
            />
            <StatTile
              label={t("overview.redemptions")}
              value={summary.redemptions}
              description={t("overview.redemptionsDescription", {
                days: summary.redemptionWindowDays,
              })}
            >
              <div className="mt-2 flex flex-col gap-1.5">
                <RedemptionSparkline data={summary.redemptionsByDay} />
                <LastRedemption date={summary.lastRedemptionAt} />
              </div>
            </StatTile>
            <StatTile
              label={t("overview.totalInvites")}
              value={summary.totalInvites}
              description={t("overview.totalInvitesDescription")}
              Icon={Ticket}
            />
            <StatTile
              label={t("overview.inactiveInvites")}
              value={summary.inactiveInvites}
              description={t("overview.inactiveInvitesDescription")}
              Icon={TicketX}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/dashboard/invites"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              {t("overview.manageInvites")}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/dashboard/users"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              {t("overview.viewUsers")}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

function RedemptionSparkline({
  data,
}: {
  data: Array<{ day: string; count: number }>
}) {
  const t = useTranslations()

  if (data.length === 0) {
    return null
  }

  const total = data.reduce((sum, point) => sum + point.count, 0)
  if (total === 0) {
    return (
      <span className="text-muted-foreground text-sm">
        {t("overview.noRedemptions")}
      </span>
    )
  }

  const max = Math.max(...data.map((point) => point.count))

  return (
    <div className="flex h-10 items-end gap-1" aria-hidden>
      {data.map((point) => (
        <div
          key={point.day}
          className="bg-primary/70 min-h-1 flex-1 rounded-sm"
          style={{ height: `${(point.count / max) * 100}%` }}
        />
      ))}
    </div>
  )
}

function LastRedemption({ date }: { date: string | null }) {
  const t = useTranslations()
  const locale = useLocale()

  if (!date) {
    return null
  }

  return (
    <span className="text-muted-foreground text-xs">
      {t("overview.lastRedemption")}{" "}
      <RelativeTime date={date} locale={locale} />
    </span>
  )
}
