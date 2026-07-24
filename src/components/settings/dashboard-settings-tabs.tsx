"use client"

import { useNavigate, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"

import { AppSettingsTab } from "@/components/settings/app-settings-tab"
import { EmailSettingsTab } from "@/components/settings/email-settings-tab"
import { JellyfinSettingsTab } from "@/components/settings/jellyfin-settings-tab"
import { MemberOnboardingSettingsTab } from "@/components/settings/member-onboarding-settings-tab"
import { SeerrSettingsTab } from "@/components/settings/seerr-settings-tab"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDashboardSettingsActiveTabDirty } from "@/hooks/use-dashboard-settings-dirty"
import type { DashboardSettingsBootstrap } from "@/lib/bootstrap-data"
import {
  getDashboardTabPath,
  isDashboardSettingsTab,
  type DashboardSettingsTab,
} from "@/lib/dashboard-tabs"
import { useTranslations } from "@/lib/i18n"

const SETTINGS_TABS_BASE_ID = "settings-tabs"
const DASHBOARD_SETTINGS_TABS: ReadonlyArray<{
  value: DashboardSettingsTab
  labelKey:
    | "settings.jellyfinTab"
    | "settings.seerrTab"
    | "settings.memberOnboardingTab"
    | "settings.appTab"
    | "settings.emailTab"
}> = [
  { value: "jellyfin", labelKey: "settings.jellyfinTab" },
  { value: "seerr", labelKey: "settings.seerrTab" },
  { value: "memberOnboarding", labelKey: "settings.memberOnboardingTab" },
  { value: "app", labelKey: "settings.appTab" },
  { value: "email", labelKey: "settings.emailTab" },
]

function getTabTriggerId(value: DashboardSettingsTab): string {
  return `${SETTINGS_TABS_BASE_ID}-trigger-${value}`
}

function getTabContentId(value: DashboardSettingsTab): string {
  return `${SETTINGS_TABS_BASE_ID}-content-${value}`
}

interface DashboardSettingsTabsProps {
  activeTab: DashboardSettingsTab
  initialData: DashboardSettingsBootstrap
}

function SettingsTabPicker({
  activeTab,
  onTabChange,
  onTabIntent,
}: {
  activeTab: DashboardSettingsTab
  onTabChange: (value: string) => void
  onTabIntent: (value: DashboardSettingsTab) => void
}) {
  const t = useTranslations()

  return (
    <div className="md:hidden">
      <Select value={activeTab} onValueChange={onTabChange}>
        <SelectTrigger className="w-full" aria-label={t("settings.title")}>
          <SelectValue placeholder={t("settings.title")} />
        </SelectTrigger>
        <SelectContent>
          {DASHBOARD_SETTINGS_TABS.map((tab) => (
            <SelectItem
              key={tab.value}
              value={tab.value}
              onFocus={() => onTabIntent(tab.value)}
              onPointerEnter={() => onTabIntent(tab.value)}
            >
              {t(tab.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function SettingsTabTriggers({
  onTabIntent,
}: {
  onTabIntent: (value: DashboardSettingsTab) => void
}) {
  const t = useTranslations()

  return (
    <TabsList className="hidden md:inline-flex">
      {DASHBOARD_SETTINGS_TABS.map((tab) => (
        <TabsTrigger
          key={tab.value}
          value={tab.value}
          id={getTabTriggerId(tab.value)}
          aria-controls={getTabContentId(tab.value)}
          onFocus={() => onTabIntent(tab.value)}
          onPointerEnter={() => onTabIntent(tab.value)}
        >
          {t(tab.labelKey)}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}

export function DashboardSettingsTabs({
  activeTab,
  initialData,
}: DashboardSettingsTabsProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const router = useRouter()
  const activeTabDirty = useDashboardSettingsActiveTabDirty(activeTab)

  function handleTabIntent(value: DashboardSettingsTab): void {
    if (value === activeTab || activeTabDirty) {
      return
    }

    void router.preloadRoute({
      to: "/dashboard/settings/$settingsTab",
      params: { settingsTab: value },
    })
  }

  function handleTabChange(value: string): void {
    if (!isDashboardSettingsTab(value)) {
      return
    }

    if (value === activeTab) {
      return
    }

    if (activeTabDirty) {
      toast.error(t("profile.saveOrResetToSwitchTabs"), {
        id: "dashboard-settings-tab-switch-blocked",
      })
      return
    }

    void navigate({
      to: getDashboardTabPath("settings", value),
      replace: true,
    })
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <SettingsTabPicker
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onTabIntent={handleTabIntent}
      />
      <SettingsTabTriggers onTabIntent={handleTabIntent} />

      <TabsContent
        value="jellyfin"
        id={getTabContentId("jellyfin")}
        aria-labelledby={getTabTriggerId("jellyfin")}
        className="mt-4"
      >
        <JellyfinSettingsTab initialConfig={initialData.jellyfin} />
      </TabsContent>
      <TabsContent
        value="seerr"
        id={getTabContentId("seerr")}
        aria-labelledby={getTabTriggerId("seerr")}
        className="mt-4"
      >
        <SeerrSettingsTab initialConfig={initialData.seerr} />
      </TabsContent>
      <TabsContent
        value="app"
        id={getTabContentId("app")}
        aria-labelledby={getTabTriggerId("app")}
        className="mt-4"
      >
        <AppSettingsTab initialConfig={initialData.app} />
      </TabsContent>
      <TabsContent
        value="memberOnboarding"
        id={getTabContentId("memberOnboarding")}
        aria-labelledby={getTabTriggerId("memberOnboarding")}
        className="mt-4"
      >
        <MemberOnboardingSettingsTab
          initialConfig={initialData.memberOnboarding}
          appSettings={initialData.app}
          jellyfinConfig={initialData.jellyfin}
          seerrConfig={initialData.seerr}
        />
      </TabsContent>
      <TabsContent
        value="email"
        id={getTabContentId("email")}
        aria-labelledby={getTabTriggerId("email")}
        className="mt-4"
      >
        <EmailSettingsTab initialConfig={initialData.email} />
      </TabsContent>
    </Tabs>
  )
}
