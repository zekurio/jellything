"use client"

import { useStore } from "@tanstack/react-store"

import { createAppStore, createFieldSetter } from "@/hooks/store-utils"

interface InvitesTableStore {
  globalFilter: string
  editInviteId: string | null
  setGlobalFilter: (value: string) => void
  setEditInviteId: (value: string | null) => void
}

const invitesTableStore = createAppStore<InvitesTableStore>((set) => ({
  globalFilter: "",
  editInviteId: null,
  setGlobalFilter: createFieldSetter(set, "globalFilter"),
  setEditInviteId: createFieldSetter(set, "editInviteId"),
}))

export function useInvitesTableStore<T>(
  selector: (state: InvitesTableStore) => T,
): T {
  return useStore(invitesTableStore, selector)
}
