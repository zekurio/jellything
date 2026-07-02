"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

const HydratedContext = createContext(false)

export function HydratedProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <HydratedContext.Provider value={hydrated}>
      {children}
    </HydratedContext.Provider>
  )
}

export function useHydrated(): boolean {
  return useContext(HydratedContext)
}
