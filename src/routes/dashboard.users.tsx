import { createFileRoute } from "@tanstack/react-router"

import { DashboardPageShell } from "@/components/dashboard/dashboard-page-shell"
import type { UsersPageInputDto } from "@/lib/api/contracts/admin"
import { getDashboardPageDataFn } from "@/lib/dashboard-page-fns"
import { parse } from "@/lib/validation"
import { usersPageInputSchema } from "@/server/api/schemas/admin-schemas"

export const Route = createFileRoute("/dashboard/users")({
  validateSearch: (search): UsersPageInputDto =>
    parse(usersPageInputSchema, search),
  loader: ({ location }) =>
    getDashboardPageDataFn({
      data: {
        activeTab: "users",
        users: location.search,
      },
    }),
  component: DashboardUsersPage,
})

function DashboardUsersPage() {
  return <DashboardPageShell {...Route.useLoaderData()} />
}
