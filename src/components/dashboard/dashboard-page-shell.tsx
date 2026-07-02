import { DashboardTabsView } from "@/components/dashboard/dashboard-tabs-view"
import { AppHeader } from "@/components/layout/app-header"
import type { DashboardPageData } from "@/lib/dashboard-page-fns"
import { getDashboardTabPath } from "@/lib/dashboard-tabs"

export function DashboardPageShell({
  activeTab,
  activeSettingsTab,
  appTitle,
  session,
  settingsData,
  invitesData,
  profilesData,
  usersData,
  historyData,
}: DashboardPageData) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        title={appTitle}
        titleTo={getDashboardTabPath(activeTab, activeSettingsTab)}
        user={{
          name: session.name,
          avatarUrl: session.avatarUrl,
          isAdmin: session.isAdmin,
        }}
      />
      <main className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 p-4 pb-24 lg:p-6 lg:pb-6">
          <DashboardTabsView
            activeTab={activeTab}
            activeSettingsTab={activeSettingsTab}
            settingsData={settingsData}
            invitesData={invitesData}
            profilesData={profilesData}
            usersData={usersData}
            historyData={historyData}
          />
        </div>
      </main>
    </div>
  )
}
