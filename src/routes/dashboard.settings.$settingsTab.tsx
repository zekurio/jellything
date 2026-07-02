import { createFileRoute, redirect } from "@tanstack/react-router"

import { DashboardPageShell } from "@/components/dashboard/dashboard-page-shell"
import { getDashboardPageDataFn } from "@/lib/dashboard-page-fns"
import { isDashboardSettingsTab } from "@/lib/dashboard-tabs"

export const Route = createFileRoute("/dashboard/settings/$settingsTab")({
  loader: async ({ params }) => {
    if (!isDashboardSettingsTab(params.settingsTab)) {
      throw redirect({
        to: "/dashboard/settings/$settingsTab",
        params: { settingsTab: "jellyfin" },
      })
    }

    return getDashboardPageDataFn({
      data: {
        activeTab: "settings",
        activeSettingsTab: params.settingsTab,
      },
    })
  },
  component: DashboardSettingsTabPage,
})

function DashboardSettingsTabPage() {
  return <DashboardPageShell {...Route.useLoaderData()} />
}
