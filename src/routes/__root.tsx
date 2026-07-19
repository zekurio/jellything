import { QueryClient } from "@tanstack/react-query"
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { useEffect } from "react"

import { LocaleProviderWrapper } from "@/components/shared/locale-provider"
import { SessionProviderWrapper } from "@/components/shared/session-provider"
import { ThemeProvider } from "@/components/shared/theme-provider"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { HydratedProvider } from "@/hooks/use-hydrated"
import { useTranslations } from "@/lib/i18n"
import { getPageAccessFn } from "@/lib/page-access-fns"

import appCss from "@/styles/globals.css?url"

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: async () => getPageAccessFn(),
  head: ({ loaderData }) => {
    const appTitle = loaderData?.bootstrap.app?.title ?? "inviterr"
    const appDescription =
      loaderData?.bootstrap.app?.description ??
      "User management and invitation system for Jellyfin"

    return {
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        {
          title: appTitle,
        },
        {
          name: "description",
          content: appDescription,
        },
        {
          name: "theme-color",
          content: "#3a64f2",
        },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "/favicon.svg?v=2",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "192x192",
          href: "/logo-192.png?v=2",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "256x256",
          href: "/logo-256.png?v=2",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "512x512",
          href: "/logo-512.png?v=2",
        },
        {
          rel: "apple-touch-icon",
          sizes: "192x192",
          href: "/logo-192.png?v=2",
        },
      ],
    }
  },
  notFoundComponent: RootNotFound,
  component: RootLayout,
})

function RootLayout() {
  const { bootstrap, locale } = Route.useLoaderData()

  // The app used to register a PWA service worker; unregister any leftover
  // workers so returning clients stop serving stale cached assets.
  useEffect(() => {
    navigator.serviceWorker
      ?.getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister()
        }
      })
      .catch(() => {})
  }, [])

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans">
        <HydratedProvider>
          <LocaleProviderWrapper locale={locale}>
            <SessionProviderWrapper session={bootstrap.session}>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <Outlet />
                <Toaster richColors={true} />
              </ThemeProvider>
            </SessionProviderWrapper>
          </LocaleProviderWrapper>
        </HydratedProvider>
        <Scripts />
      </body>
    </html>
  )
}

function RootNotFound() {
  const t = useTranslations()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-8xl font-bold">404</h1>
      <p className="text-muted-foreground text-xl">
        {t("errors.notFoundTitle")}
      </p>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t("errors.notFoundDescription")}
      </p>
      <Button asChild className="mt-2">
        <Link to="/">{t("errors.goBackHome")}</Link>
      </Button>
    </div>
  )
}
