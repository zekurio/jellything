import { Outlet, createFileRoute } from "@tanstack/react-router"

import { enforcePageAccessFn } from "@/lib/page-access-fns"

export const Route = createFileRoute("/profile")({
  loader: async () => enforcePageAccessFn({ data: "protected" }),
  component: ProfileLayout,
})

function ProfileLayout() {
  return <Outlet />
}
