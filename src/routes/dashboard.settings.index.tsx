import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/dashboard/settings/")({
  loader: () => {
    throw redirect({
      to: "/dashboard/settings/$settingsTab",
      params: { settingsTab: "jellyfin" },
    })
  },
  component: () => null,
})
