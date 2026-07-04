"use client"

import type { ReactNode } from "react"

import { SessionProvider } from "@/hooks/use-session"
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
    <SessionProvider key={sessionKey} initialSession={session}>
      {children}
    </SessionProvider>
  )
}
