import { createFileRoute } from "@tanstack/react-router"

import { DashboardPageShell } from "@/components/dashboard/dashboard-page-shell"
import type { InvitesPageInputDto } from "@/lib/api/contracts/admin"
import { getDashboardPageDataFn } from "@/lib/dashboard-page-fns"
import { parse } from "@/lib/validation"
import { invitesPageInputSchema } from "@/server/api/schemas/admin-schemas"

export const Route = createFileRoute("/dashboard/invites")({
  validateSearch: (search): InvitesPageInputDto =>
    parse(invitesPageInputSchema, search),
  loader: ({ location }) =>
    getDashboardPageDataFn({
      data: {
        activeTab: "invites",
        invites: location.search,
      },
    }),
  component: DashboardInvitesPage,
})

function DashboardInvitesPage() {
  return <DashboardPageShell {...Route.useLoaderData()} />
}
