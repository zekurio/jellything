import { createFileRoute } from "@tanstack/react-router"

import { DashboardPageShell } from "@/components/dashboard/dashboard-page-shell"
import { getDashboardPageDataFn } from "@/lib/dashboard-page-fns"

export const Route = createFileRoute("/dashboard/profiles")({
  loader: () => getDashboardPageDataFn({ data: { activeTab: "profiles" } }),
  component: DashboardProfilesPage,
})

function DashboardProfilesPage() {
  return <DashboardPageShell {...Route.useLoaderData()} />
}
