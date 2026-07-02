import { Outlet, createFileRoute } from "@tanstack/react-router"

import { enforcePageAccessFn } from "@/lib/page-access-fns"

export const Route = createFileRoute("/dashboard")({
  loader: async () => enforcePageAccessFn({ data: "admin" }),
  component: DashboardLayout,
})

function DashboardLayout() {
  return <Outlet />
}
