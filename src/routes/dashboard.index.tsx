import { createFileRoute } from "@tanstack/react-router"

import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { getDashboardOverviewFn } from "@/lib/dashboard-page-fns"

export const Route = createFileRoute("/dashboard/")({
  loader: () => getDashboardOverviewFn(),
  component: DashboardOverviewPage,
})

function DashboardOverviewPage() {
  return <DashboardOverview {...Route.useLoaderData()} />
}
