"use client"

import { useStore } from "@tanstack/react-store"

import { createAppStore, createFieldSetter } from "@/hooks/store-utils"

interface ProfilesTableStore {
  globalFilter: string
  editProfileId: string | null
  defaultLoading: boolean
  setGlobalFilter: (value: string) => void
  setEditProfileId: (value: string | null) => void
  setDefaultLoading: (value: boolean) => void
}

const profilesTableStore = createAppStore<ProfilesTableStore>((set) => ({
  globalFilter: "",
  editProfileId: null,
  defaultLoading: false,
  setGlobalFilter: createFieldSetter(set, "globalFilter"),
  setEditProfileId: createFieldSetter(set, "editProfileId"),
  setDefaultLoading: createFieldSetter(set, "defaultLoading"),
}))

export function useProfilesTableStore<T>(
  selector: (state: ProfilesTableStore) => T,
): T {
  return useStore(profilesTableStore, selector)
}
