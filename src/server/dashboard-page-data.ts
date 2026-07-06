import type { ActionResult } from "@/lib/api/contracts/errors"
import {
  DEFAULT_DASHBOARD_SETTINGS_TAB,
  type DashboardSettingsTab,
  type DashboardTab,
} from "@/lib/dashboard-tabs"
import { createTranslator } from "@/lib/i18n"
import { getSeerrConfigService } from "@/server/admin/config"
import {
  getInviteHistoryPageService,
  listInvitesPageService,
} from "@/server/admin/invites"
import { getLibrariesService } from "@/server/admin/libraries"
import {
  ensureDefaultProfileService,
  listProfilesService,
} from "@/server/admin/profiles"
import { listUsersWithProfilesService } from "@/server/admin/users"
import { getDashboardSettingsBootstrap } from "@/server/bootstrap-data"
import { enforcePageAccess } from "@/server/page-access"

export interface DashboardPageLoaderInput {
  activeTab: DashboardTab
  activeSettingsTab?: DashboardSettingsTab
  invites?: Parameters<typeof listInvitesPageService>[0]
  history?: Parameters<typeof getInviteHistoryPageService>[0]
  users?: Parameters<typeof listUsersWithProfilesService>[0]
}

export interface DashboardPageData {
  activeTab: DashboardTab
  activeSettingsTab: DashboardSettingsTab
  appTitle: string
  session: {
    name: string
    avatarUrl: string
    isAdmin: boolean
  }
  settingsData: NonNullable<
    Awaited<ReturnType<typeof getDashboardSettingsBootstrap>>
  >
  invitesData: {
    invites: Awaited<
      ReturnType<typeof listInvitesPageService>
    > extends ActionResult<infer T>
      ? T
      : never
    profiles: Awaited<
      ReturnType<typeof listProfilesService>
    > extends ActionResult<infer T>
      ? T
      : never
    query: string
    error: string | null
  }
  profilesData: {
    profiles: Awaited<
      ReturnType<typeof listProfilesService>
    > extends ActionResult<infer T>
      ? T
      : never
    libraries: Awaited<
      ReturnType<typeof getLibrariesService>
    > extends ActionResult<infer T>
      ? T
      : never
    isSeerrConfigured: boolean
    error: string | null
  }
  usersData: {
    data: Awaited<
      ReturnType<typeof listUsersWithProfilesService>
    > extends ActionResult<infer T>
      ? T
      : never
    query: string
    error: string | null
  }
  historyData: {
    page: Awaited<
      ReturnType<typeof getInviteHistoryPageService>
    > extends ActionResult<infer T>
      ? T
      : never
    query: string
    error: string | null
  }
}

function unwrapActionResult<T>(
  result: ActionResult<T>,
  fallback: T,
): { data: T; hasError: boolean } {
  if (result.success) {
    return {
      data: result.data,
      hasError: false,
    }
  }

  return {
    data: fallback,
    hasError: true,
  }
}

export async function loadAdminInvitesPageServices(
  invites: Parameters<typeof listInvitesPageService>[0],
) {
  const [invitesPage, profileOptions] = await Promise.all([
    listInvitesPageService(invites),
    listProfilesService(),
  ])

  return {
    invites: invitesPage,
    profileOptions,
  }
}

export async function loadAdminProfilesPageServices() {
  const defaultProfile = await ensureDefaultProfileService()
  if (!defaultProfile.success) {
    return {
      defaultProfile,
      profiles: defaultProfile,
      libraries: defaultProfile,
      seerrConfig: defaultProfile,
    }
  }

  const [profiles, libraries, seerrConfig] = await Promise.all([
    listProfilesService(),
    getLibrariesService(),
    getSeerrConfigService(),
  ])

  return {
    defaultProfile,
    profiles,
    libraries,
    seerrConfig,
  }
}

export async function loadDashboardPageData({
  activeTab,
  activeSettingsTab = DEFAULT_DASHBOARD_SETTINGS_TAB,
  invites,
  history,
  users,
}: DashboardPageLoaderInput): Promise<DashboardPageData> {
  const { bootstrap, locale } = await enforcePageAccess("admin")
  const session = bootstrap.session

  if (!session || !session.isAdmin) {
    throw new Error("Dashboard data requires an admin session")
  }

  if (!bootstrap.configured || bootstrap.needsOnboarding) {
    throw new Error("Dashboard data requires completed onboarding")
  }

  const t = createTranslator(locale)
  const settingsDataPromise = getDashboardSettingsBootstrap()
  const invitesBootstrapPromise =
    activeTab === "invites" ? loadAdminInvitesPageServices(invites ?? {}) : null
  const profilesBootstrapPromise =
    activeTab === "profiles" ? loadAdminProfilesPageServices() : null
  const usersBootstrapPromise =
    activeTab === "users"
      ? listUsersWithProfilesService(users ?? {})
      : Promise.resolve(null)
  const historyBootstrapPromise =
    activeTab === "history"
      ? getInviteHistoryPageService(history ?? {})
      : Promise.resolve(null)

  const [
    settingsData,
    invitesBootstrap,
    profilesBootstrap,
    usersBootstrap,
    historyBootstrap,
  ] = await Promise.all([
    settingsDataPromise,
    invitesBootstrapPromise,
    profilesBootstrapPromise,
    usersBootstrapPromise,
    historyBootstrapPromise,
  ])

  if (!settingsData) {
    throw new Error("Dashboard data requires completed onboarding")
  }

  const initialInvites = invitesBootstrap
    ? unwrapActionResult(invitesBootstrap.invites, {
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
        pageCount: 0,
      })
    : {
        data: { items: [], page: 1, pageSize: 50, total: 0, pageCount: 0 },
        hasError: false,
      }
  const initialInviteProfiles = invitesBootstrap
    ? unwrapActionResult(invitesBootstrap.profileOptions, [])
    : { data: [], hasError: false }
  const initialProfiles = profilesBootstrap
    ? unwrapActionResult(profilesBootstrap.profiles, [])
    : { data: [], hasError: false }
  const initialLibraries = profilesBootstrap
    ? unwrapActionResult(profilesBootstrap.libraries, [])
    : { data: [], hasError: false }
  const initialUsers = usersBootstrap
    ? unwrapActionResult(usersBootstrap, {
        users: {
          items: [],
          page: 1,
          pageSize: 50,
          total: 0,
          pageCount: 0,
        },
        profiles: [],
        seerrConfigured: false,
      })
    : {
        data: {
          users: { items: [], page: 1, pageSize: 50, total: 0, pageCount: 0 },
          profiles: [],
          seerrConfigured: false,
        },
        hasError: false,
      }
  const initialHistory = historyBootstrap
    ? unwrapActionResult(historyBootstrap, {
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
        pageCount: 0,
      })
    : {
        data: { items: [], page: 1, pageSize: 50, total: 0, pageCount: 0 },
        hasError: false,
      }
  const initialSeerrConfig = profilesBootstrap
    ? unwrapActionResult(profilesBootstrap.seerrConfig, {
        internalUrl: undefined,
        externalUrl: undefined,
        apiKeySet: false,
      })
    : {
        data: {
          internalUrl: undefined,
          externalUrl: undefined,
          apiKeySet: false,
        },
        hasError: false,
      }

  return {
    activeTab,
    activeSettingsTab,
    appTitle: bootstrap.app?.title ?? "Jellything",
    session: {
      name: session.name,
      avatarUrl: session.avatarUrl,
      isAdmin: session.isAdmin,
    },
    settingsData,
    invitesData: {
      invites: initialInvites.data,
      profiles: initialInviteProfiles.data,
      query: invites?.query ?? "",
      error:
        initialInvites.hasError || initialInviteProfiles.hasError
          ? t("invites.inviteLoadFailed")
          : null,
    },
    profilesData: {
      profiles: initialProfiles.data,
      libraries: initialLibraries.data,
      isSeerrConfigured: Boolean(
        initialSeerrConfig.data.apiKeySet &&
        initialSeerrConfig.data.internalUrl,
      ),
      error:
        initialProfiles.hasError ||
        initialLibraries.hasError ||
        initialSeerrConfig.hasError
          ? t("profiles.dataLoadFailed")
          : null,
    },
    usersData: {
      data: initialUsers.data,
      query: users?.query ?? "",
      error: initialUsers.hasError ? t("users.usersLoadFailed") : null,
    },
    historyData: {
      page: initialHistory.data,
      query: history?.query ?? "",
      error: initialHistory.hasError ? t("invites.historyFetchFailed") : null,
    },
  }
}
