"use client";

import type { ReactNode } from "react";
import { SessionProvider as BaseSessionProvider, type SessionData } from "@/lib/hooks";

interface SessionProviderWrapperProps {
  children: ReactNode;
  session: SessionData | null;
}

export function SessionProviderWrapper({ children, session }: SessionProviderWrapperProps) {
  return <BaseSessionProvider initialSession={session}>{children}</BaseSessionProvider>;
}
