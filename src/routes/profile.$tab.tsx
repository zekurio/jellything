import { createFileRoute, redirect } from "@tanstack/react-router"

import { ProfilePageShell } from "@/components/profile/profile-page-shell"
import { getProfilePageDataFn } from "@/lib/profile-page-fns"
import { DEFAULT_PROFILE_TAB, isProfileTab } from "@/lib/profile-tabs"

export const Route = createFileRoute("/profile/$tab")({
  loader: async ({ params }) => {
    if (!isProfileTab(params.tab)) {
      throw redirect({ to: "/profile/$tab", params: { tab: "general" } })
    }

    return getProfilePageDataFn()
  },
  component: ProfileTabPage,
})

function ProfileTabPage() {
  const { tab } = Route.useParams()
  const { emailConfigured, expiry } = Route.useLoaderData()
  return (
    <ProfilePageShell
      activeTab={isProfileTab(tab) ? tab : DEFAULT_PROFILE_TAB}
      emailConfigured={emailConfigured}
      expiry={expiry}
    />
  )
}
