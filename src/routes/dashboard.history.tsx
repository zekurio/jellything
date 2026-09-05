import { createFileRoute } from "@tanstack/react-router"

import { DashboardPageShell } from "@/components/dashboard/dashboard-page-shell"
import type { InviteHistoryPageInputDto } from "@/lib/api/contracts/admin"
import { getDashboardPageDataFn } from "@/lib/dashboard-page-fns"
import { parse } from "@/lib/validation"
import { inviteHistoryPageInputSchema } from "@/server/api/schemas/admin-schemas"

export const Route = createFileRoute("/dashboard/history")({
  validateSearch: (search): InviteHistoryPageInputDto =>
    parse(inviteHistoryPageInputSchema, search),
  loader: ({ location }) =>
    getDashboardPageDataFn({
      data: {
        activeTab: "history",
        history: location.search,
      },
    }),
  component: DashboardHistoryPage,
})

function DashboardHistoryPage() {
  return <DashboardPageShell {...Route.useLoaderData()} />
}
