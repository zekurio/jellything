"use client"

import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { createAppStore, type AppStore } from "@/hooks/store-utils"
import { reportClientError } from "@/lib/client-error"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import type { SessionData } from "@/lib/session"

interface SessionContextValue {
  session: SessionData | null
  isAdmin: boolean
  isLoading: boolean
  refresh: () => Promise<void>
  setSession: (session: SessionData | null) => void
}

interface SessionStoreState {
  session: SessionData | null
  isLoading: boolean
  setSession: (session: SessionData | null) => void
  setIsLoading: (isLoading: boolean) => void
}

type SessionStore = AppStore<SessionStoreState>

const SessionStoreContext = createContext<SessionStore | null>(null)

function createSessionStore(initialSession: SessionData | null): SessionStore {
  return createAppStore<SessionStoreState>((set) => ({
    session: initialSession,
    isLoading: false,
    setSession: (session) => set({ session }),
    setIsLoading: (isLoading) => set({ isLoading }),
  }))
}

export function SessionProvider({
  children,
  initialSession,
}: {
  children: ReactNode
  initialSession: SessionData | null
}) {
  const storeRef = useRef<SessionStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createSessionStore(initialSession)
  }

  return (
    <SessionStoreContext.Provider value={storeRef.current}>
      {children}
    </SessionStoreContext.Provider>
  )
}

function useSessionStoreApi(): SessionStore {
  const store = useContext(SessionStoreContext)

  if (!store) {
    throw new Error("useSession must be used within a SessionProvider")
  }

  return store
}

export function useSession(): SessionContextValue {
  const store = useSessionStoreApi()
  const session = useStore(store, (state) => state.session)
  const isLoading = useStore(store, (state) => state.isLoading)
  const t = useTranslations()

  const setSession = useCallback(
    (nextSession: SessionData | null) => {
      store.getState().setSession(nextSession)
    },
    [store],
  )

  const refresh = useCallback(async () => {
    store.getState().setIsLoading(true)

    try {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(client.app.bootstrap({}))

      if (result.error === null) {
        const nextSession = result.data?.session ?? null
        store.getState().setSession(nextSession)

        if (nextSession === null) {
          toast.error(t("auth.sessionExpired"))
        }

        return
      }

      store.getState().setSession(null)
      toast.error(t("errors.tryAgain"))
    } catch (err) {
      reportClientError(err)
      store.getState().setSession(null)
      toast.error(t("errors.tryAgain"))
    } finally {
      store.getState().setIsLoading(false)
    }
  }, [store, t])

  return useMemo(
    () => ({
      session,
      isAdmin: session?.isAdmin ?? false,
      isLoading,
      refresh,
      setSession,
    }),
    [isLoading, refresh, session, setSession],
  )
}

export function useRequireSession(options?: {
  redirectTo?: string
}): SessionData | null {
  const { session, isLoading } = useSession()
  const navigate = useNavigate()
  const redirectTo = options?.redirectTo ?? "/login"

  useEffect(() => {
    if (!isLoading && !session) {
      void navigate({ to: redirectTo, replace: true })
    }
  }, [isLoading, navigate, redirectTo, session])

  return session
}

export function useRequireAdmin(options?: {
  redirectTo?: string
}): SessionData | null {
  const session = useRequireSession(options)
  const navigate = useNavigate()
  const redirectTo = options?.redirectTo ?? "/"

  useEffect(() => {
    if (session && !session.isAdmin) {
      void navigate({ to: redirectTo, replace: true })
    }
  }, [navigate, redirectTo, session])

  return session?.isAdmin ? session : null
}
