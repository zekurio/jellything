import { createFileRoute, redirect } from "@tanstack/react-router"

import { enforcePageAccessFn } from "@/lib/page-access-fns"

export const Route = createFileRoute("/")({
  loader: async () => {
    const { bootstrap: data } = await enforcePageAccessFn({ data: "public" })
    const session = data?.session ?? null

    if (!session) {
      throw redirect({ to: "/login" })
    }

    if (!session.isAdmin) {
      throw redirect({ to: "/profile/$tab", params: { tab: "general" } })
    }

    throw redirect({ to: "/dashboard/invites" })
  },
  component: () => null,
})
