"use client"

import { useStore } from "@tanstack/react-store"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react"

import { createAppStore, type AppStore } from "@/hooks/store-utils"
import type { DashboardSettingsTab } from "@/lib/dashboard-tabs"

type DirtyStateByTab = Partial<Record<DashboardSettingsTab, boolean>>

interface DashboardSettingsDirtyContextValue {
  dirtyByTab: DirtyStateByTab
  setDirty: (tab: DashboardSettingsTab, isDirty: boolean) => void
}

interface DashboardSettingsDirtyStoreState {
  dirtyByTab: DirtyStateByTab
  setDirty: (tab: DashboardSettingsTab, isDirty: boolean) => void
}

type DashboardSettingsDirtyStore = AppStore<DashboardSettingsDirtyStoreState>

const DashboardSettingsDirtyContext =
  createContext<DashboardSettingsDirtyStore | null>(null)

function createDashboardSettingsDirtyStore(): DashboardSettingsDirtyStore {
  return createAppStore<DashboardSettingsDirtyStoreState>((set) => ({
    dirtyByTab: {},
    setDirty: (tab, isDirty) =>
      set((state) => {
        if (state.dirtyByTab[tab] === isDirty) {
          return state
        }

        return {
          dirtyByTab: {
            ...state.dirtyByTab,
            [tab]: isDirty,
          },
        }
      }),
  }))
}

export function DashboardSettingsDirtyProvider({
  children,
}: {
  children: ReactNode
}) {
  const storeRef = useRef<DashboardSettingsDirtyStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createDashboardSettingsDirtyStore()
  }

  return (
    <DashboardSettingsDirtyContext.Provider value={storeRef.current}>
      {children}
    </DashboardSettingsDirtyContext.Provider>
  )
}

export function useDashboardSettingsDirtyState(): DashboardSettingsDirtyContextValue {
  const context = useDashboardSettingsDirtyStore()
  const dirtyByTab = useStore(context, (state) => state.dirtyByTab)
  const setDirty = useStore(context, (state) => state.setDirty)

  return {
    dirtyByTab,
    setDirty,
  }
}

function useDashboardSettingsDirtyStore(): DashboardSettingsDirtyStore {
  const context = useContext(DashboardSettingsDirtyContext)

  if (!context) {
    throw new Error(
      "useDashboardSettingsDirtyState must be used within DashboardSettingsDirtyProvider",
    )
  }

  return context
}

export function useDashboardSettingsActiveTabDirty(
  tab: DashboardSettingsTab,
): boolean {
  const context = useDashboardSettingsDirtyStore()

  return useStore(context, (state) => state.dirtyByTab[tab] === true)
}

function useDashboardSettingsDirtySetter(): DashboardSettingsDirtyStoreState["setDirty"] {
  const context = useDashboardSettingsDirtyStore()

  return useStore(context, (state) => state.setDirty)
}

export function useDashboardSettingsTabDirty(
  tab: DashboardSettingsTab,
  isDirty: boolean,
): void {
  const setDirty = useDashboardSettingsDirtySetter()

  useEffect(() => {
    setDirty(tab, isDirty)

    return () => {
      setDirty(tab, false)
    }
  }, [isDirty, setDirty, tab])
}
