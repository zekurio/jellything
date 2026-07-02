"use client"

import type { ReactNode } from "react"

import { SessionProvider as BaseSessionProvider } from "@/hooks/use-session"
import type { SessionData } from "@/lib/session"

interface SessionProviderWrapperProps {
  children: ReactNode
  session: SessionData | null
}

export function SessionProviderWrapper({
  children,
  session,
}: SessionProviderWrapperProps) {
  const sessionKey = [
    session?.userId ?? "guest",
    session?.email ?? "",
    session?.locale ?? "",
    session?.avatarUrl ?? "",
    session?.emailVerified ? "verified" : "unverified",
  ].join(":")

  return (
    <BaseSessionProvider key={sessionKey} initialSession={session}>
      {children}
    </BaseSessionProvider>
  )
}
