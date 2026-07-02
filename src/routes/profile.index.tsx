import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/profile/")({
  loader: () => {
    throw redirect({ to: "/profile/$tab", params: { tab: "general" } })
  },
  component: () => null,
})
