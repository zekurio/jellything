import "@tanstack/react-start/server-only"
import { redirect } from "@tanstack/react-router"

import type { PageAccessResult } from "@/lib/bootstrap-data"
import { DEFAULT_LOCALE, resolveLocale } from "@/lib/i18n"
import { clearAuthCookies } from "@/server/auth-service"
import { getAppBootstrap } from "@/server/bootstrap-data"

type PageAccessMode =
  | "public"
  | "login"
  | "onboarding"
  | "protected"
  | "admin"
  | "config-error"

export async function getPageAccess(): Promise<PageAccessResult> {
  const bootstrap = await getAppBootstrap()

  if (bootstrap.shouldClearAuthCookies) {
    clearAuthCookies()
  }

  const locale = resolveLocale(
    bootstrap.session?.locale ?? null,
    bootstrap.app?.defaultLocale ?? DEFAULT_LOCALE,
  )

  return { bootstrap, locale }
}

export async function enforcePageAccess(
  mode: PageAccessMode,
): Promise<PageAccessResult> {
  const access = await getPageAccess()
  const { bootstrap } = access

  if (bootstrap.configError) {
    if (mode !== "config-error") {
      throw redirect({ to: "/config-error" })
    }

    return access
  }

  if (bootstrap.needsOnboarding) {
    if (mode !== "onboarding") {
      throw redirect({ to: "/onboarding" })
    }

    return access
  }

  if (mode === "config-error") {
    throw redirect({ to: "/login" })
  }

  if (mode === "onboarding") {
    throw redirect({ to: bootstrap.session ? "/" : "/login" })
  }

  if (mode === "login" && bootstrap.session) {
    throw redirect({ to: "/" })
  }

  if ((mode === "protected" || mode === "admin") && !bootstrap.session) {
    throw redirect({ to: "/login" })
  }

  if (mode === "admin" && bootstrap.session && !bootstrap.session.isAdmin) {
    throw redirect({ to: "/profile/$tab", params: { tab: "general" } })
  }

  return access
}
