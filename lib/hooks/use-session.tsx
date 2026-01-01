"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSession } from "@/lib/auth";

export interface SessionData {
  userId: string;
  isAdmin: boolean;
}

interface SessionContextValue {
  session: SessionData | null;
  isAdmin: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession?: SessionData | null;
}) {
  const [session, setSession] = useState<SessionData | null>(initialSession ?? null);
  const [isLoading, setIsLoading] = useState(!initialSession);

  const refresh = async () => {
    try {
      const result = await getSession();
      if (result) {
        setSession({ userId: result.userId, isAdmin: result.isAdmin });
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    }
  };

  useEffect(() => {
    if (!initialSession) {
      refresh().finally(() => setIsLoading(false));
    }
  }, [initialSession]);

  return (
    <SessionContext.Provider
      value={{
        session,
        isAdmin: session?.isAdmin ?? false,
        isLoading,
        refresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}

export function useIsAdmin() {
  const { isAdmin, isLoading } = useSession();
  return { isAdmin, isLoading };
}
