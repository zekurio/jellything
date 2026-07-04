"use client"

import { useStore } from "@tanstack/react-store"
import { useCallback } from "react"
import { toast } from "sonner"

import { createAppStore, type StateUpdater } from "@/hooks/store-utils"
import { useDashboardSettingsTabDirty } from "@/hooks/use-dashboard-settings-dirty"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type { MemberOnboardingConfigDto } from "@/lib/api/contracts/admin"
import { translateMaybeMessageKey, useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import {
  memberOnboardingSettingsFormSchema,
  type MemberOnboardingPageFormValues,
  type MemberOnboardingSettingsFormValues,
} from "@/lib/schemas"

import {
  areMemberOnboardingValuesEqual,
  createId,
  mapConfigToFormValues,
  mapFormValuesToConfig,
  moveItem,
} from "./member-onboarding-utils"

interface MemberOnboardingSettingsStoreState {
  values: MemberOnboardingSettingsFormValues
  savedValues: MemberOnboardingSettingsFormValues
  activePageIndex: number
  isSaving: boolean
  isDirty: boolean
  setValues: (
    value:
      | MemberOnboardingSettingsFormValues
      | ((
          current: MemberOnboardingSettingsFormValues,
        ) => MemberOnboardingSettingsFormValues),
  ) => void
  setSavedValues: (savedValues: MemberOnboardingSettingsFormValues) => void
  setActivePageIndex: (activePageIndex: StateUpdater<number>) => void
  setIsSaving: (isSaving: boolean) => void
}

export function useMemberOnboardingStore(
  initialConfig: MemberOnboardingConfigDto,
) {
  const t = useTranslations()
  const initialValues = mapConfigToFormValues(initialConfig)
  const store = useScopedStore(() =>
    createAppStore<MemberOnboardingSettingsStoreState>((set) => ({
      values: initialValues,
      savedValues: initialValues,
      activePageIndex: 0,
      isSaving: false,
      isDirty: false,
      setValues: (value) =>
        set((state) => {
          const nextValues =
            typeof value === "function" ? value(state.values) : value
          return {
            values: nextValues,
            isDirty: !areMemberOnboardingValuesEqual(
              nextValues,
              state.savedValues,
            ),
          }
        }),
      setSavedValues: (savedValues) =>
        set({
          savedValues,
          isDirty: false,
        }),
      setActivePageIndex: (activePageIndex) =>
        set((state) => ({
          activePageIndex:
            typeof activePageIndex === "function"
              ? activePageIndex(state.activePageIndex)
              : activePageIndex,
        })),
      setIsSaving: (isSaving) => set({ isSaving }),
    })),
  )
  const values = useStore(store, (state) => state.values)
  const savedValues = useStore(store, (state) => state.savedValues)
  const activePageIndex = useStore(store, (state) => state.activePageIndex)
  const isSaving = useStore(store, (state) => state.isSaving)
  const isDirty = useStore(store, (state) => state.isDirty)

  const setValues = useCallback(
    (
      value:
        | MemberOnboardingSettingsFormValues
        | ((
            current: MemberOnboardingSettingsFormValues,
          ) => MemberOnboardingSettingsFormValues),
    ) => {
      store.getState().setValues(value)
    },
    [store],
  )
  useDashboardSettingsTabDirty("memberOnboarding", isDirty)

  const setActivePageIndex = useCallback(
    (activePageIndex: StateUpdater<number>) => {
      store.getState().setActivePageIndex(activePageIndex)
    },
    [store],
  )

  const addPage = useCallback(() => {
    setValues((prev) => {
      const newPages = [
        ...prev.pages,
        {
          id: createId(),
          title: `${t("settings.memberOnboardingDefaultPageTitle")} ${prev.pages.length + 1}`,
          markdown: t("settings.memberOnboardingDefaultPageMarkdown"),
        },
      ]
      store.getState().setActivePageIndex(newPages.length - 1)
      return {
        ...prev,
        pages: newPages,
      }
    })
  }, [setValues, store, t])

  const updatePage = useCallback(
    (
      pageIndex: number,
      updater: (
        page: MemberOnboardingPageFormValues,
      ) => MemberOnboardingPageFormValues,
    ) => {
      setValues((prev) => {
        const pages = [...prev.pages]
        const page = pages[pageIndex]
        if (!page) {
          return prev
        }

        pages[pageIndex] = updater(page)
        return {
          ...prev,
          pages,
        }
      })
    },
    [setValues],
  )

  const removePage = useCallback(
    (pageIndex: number) => {
      setValues((prev) => {
        const newPages = prev.pages.filter((_, index) => index !== pageIndex)
        const nextActivePageIndex =
          newPages.length === 0
            ? 0
            : Math.min(
                activePageIndex >= newPages.length
                  ? newPages.length - 1
                  : activePageIndex,
                newPages.length - 1,
              )
        store.getState().setActivePageIndex(nextActivePageIndex)
        return {
          ...prev,
          pages: newPages,
        }
      })
    },
    [activePageIndex, setValues, store],
  )

  const movePage = useCallback(
    (pageIndex: number, direction: "up" | "down") => {
      const targetIndex = direction === "up" ? pageIndex - 1 : pageIndex + 1
      setValues((prev) => ({
        ...prev,
        pages: moveItem(prev.pages, pageIndex, targetIndex),
      }))
      store.getState().setActivePageIndex(targetIndex)
    },
    [setValues, store],
  )

  const handleSave = useCallback(async (): Promise<void> => {
    if (!isDirty) {
      toast.info(t("settings.noChanges"))
      return
    }

    const parsed = memberOnboardingSettingsFormSchema.safeParse(values)
    if (!parsed.success) {
      toast.error(
        translateMaybeMessageKey(t, parsed.error.issues[0]?.message) ??
          t("settings.memberOnboardingSaveFailed"),
      )
      return
    }

    const payload = mapFormValuesToConfig(parsed.data)

    store.getState().setIsSaving(true)
    try {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(
        client.admin.settings.updateMemberOnboarding(payload),
      )
      if (result.error !== null) {
        toast.error(t("settings.memberOnboardingSaveFailed"))
        return
      }

      const nextValues = mapConfigToFormValues(payload)
      store.getState().setValues(nextValues)
      store.getState().setSavedValues(nextValues)
      toast.success(t("settings.memberOnboardingSaved"))
    } finally {
      store.getState().setIsSaving(false)
    }
  }, [isDirty, store, t, values])

  const handleReset = useCallback((): void => {
    store.getState().setValues(savedValues)
    store.getState().setActivePageIndex(0)
  }, [savedValues, store])

  return {
    values,
    activePageIndex,
    isSaving,
    isDirty,
    setValues,
    setActivePageIndex,
    addPage,
    updatePage,
    removePage,
    movePage,
    handleSave,
    handleReset,
  }
}
