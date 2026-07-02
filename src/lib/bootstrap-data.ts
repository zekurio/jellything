import type {
  AppSettingsDto,
  EmailConfigDto,
  JellyfinConfigDto,
  MemberOnboardingConfigDto,
  SeerrConfigDto,
} from "@/lib/api/contracts/admin"
import type { Locale } from "@/lib/i18n"
import type { SessionData } from "@/lib/session"

export interface DashboardSettingsBootstrap {
  app: AppSettingsDto
  email: EmailConfigDto
  jellyfin: JellyfinConfigDto
  seerr: SeerrConfigDto
  memberOnboarding: MemberOnboardingConfigDto
}

export interface PageAccessResult {
  bootstrap: AppBootstrapData
  locale: Locale
}

export interface AppBootstrapData {
  configured: boolean
  needsOnboarding: boolean
  configError: string | null
  app: AppSettingsDto | null
  emailConfigured: boolean
  session: SessionData | null
  shouldClearAuthCookies: boolean
}
