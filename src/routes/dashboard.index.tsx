import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  DEFAULT_DASHBOARD_TAB,
  getDashboardTabPath,
} from "@/lib/dashboard-tabs"

export const Route = createFileRoute("/dashboard/")({
  loader: () => {
    throw redirect({ to: getDashboardTabPath(DEFAULT_DASHBOARD_TAB) })
  },
  component: () => null,
})
