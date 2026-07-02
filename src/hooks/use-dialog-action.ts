"use client"

import { useStore } from "@tanstack/react-store"
import { useCallback, useRef } from "react"
import { toast } from "sonner"

import { createAppStore, type AppStore } from "@/hooks/store-utils"

interface UseDialogActionOptions<T> {
  /** Callback when action completes successfully */
  onSuccess?: (result: T) => void
  /** Success message to show in toast */
  successMessage?: string | ((result: T) => string)
  /** Error message to show in toast */
  errorMessage?: string
}

interface UseDialogActionReturn<TItem, TResult> {
  /** Whether the dialog is open */
  isOpen: boolean
  /** The item being acted upon */
  item: TItem | null
  /** Whether the action is loading */
  isLoading: boolean
  /** Open the dialog with an item */
  open: (item: TItem) => void
  /** Close the dialog and reset state */
  close: () => void
  /** Execute the action */
  execute: (action: () => Promise<TResult>) => Promise<void>
}

/**
 * Hook for managing dialog state with async actions.
 * Handles open/close state, loading state, and toast notifications.
 */
export function useDialogAction<TItem = unknown, TResult = unknown>(
  options: UseDialogActionOptions<TResult> = {},
): UseDialogActionReturn<TItem, TResult> {
  const { onSuccess, successMessage, errorMessage = "Action failed" } = options

  type DialogActionStoreState = {
    isOpen: boolean
    item: TItem | null
    isLoading: boolean
    setIsOpen: (isOpen: boolean) => void
    setItem: (item: TItem | null) => void
    setIsLoading: (isLoading: boolean) => void
  }

  const storeRef = useRef<AppStore<DialogActionStoreState> | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createAppStore<DialogActionStoreState>((set) => ({
      isOpen: false,
      item: null,
      isLoading: false,
      setIsOpen: (isOpen) => set({ isOpen }),
      setItem: (item) => set({ item }),
      setIsLoading: (isLoading) => set({ isLoading }),
    }))
  }

  const store = storeRef.current
  const isOpen = useStore(store, (state) => state.isOpen)
  const item = useStore(store, (state) => state.item)
  const isLoading = useStore(store, (state) => state.isLoading)

  const open = useCallback(
    (newItem: TItem) => {
      store.getState().setItem(newItem)
      store.getState().setIsOpen(true)
    },
    [store],
  )

  const close = useCallback(() => {
    store.getState().setIsOpen(false)
    // Keep item in state to prevent content flashing during close animation
  }, [store])

  const execute = useCallback(
    async (action: () => Promise<TResult>) => {
      store.getState().setIsLoading(true)
      try {
        const result = await action()
        if (successMessage) {
          const message =
            typeof successMessage === "function"
              ? successMessage(result)
              : successMessage
          toast.success(message)
        }
        onSuccess?.(result)
        close()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : errorMessage)
      } finally {
        store.getState().setIsLoading(false)
      }
    },
    [close, errorMessage, onSuccess, store, successMessage],
  )

  return {
    isOpen,
    item,
    isLoading,
    open,
    close,
    execute,
  }
}

interface UseSimpleDialogReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

/**
 * Simple hook for managing dialog open/close state.
 */
export function useSimpleDialog(initialOpen = false): UseSimpleDialogReturn {
  type SimpleDialogStoreState = {
    isOpen: boolean
    setIsOpen: (value: boolean | ((current: boolean) => boolean)) => void
  }

  const storeRef = useRef<AppStore<SimpleDialogStoreState> | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createAppStore<SimpleDialogStoreState>((set) => ({
      isOpen: initialOpen,
      setIsOpen: (value) =>
        set((state) => ({
          isOpen: typeof value === "function" ? value(state.isOpen) : value,
        })),
    }))
  }

  const store = storeRef.current
  const isOpen = useStore(store, (state) => state.isOpen)

  return {
    isOpen,
    open: useCallback(() => store.getState().setIsOpen(true), [store]),
    close: useCallback(() => store.getState().setIsOpen(false), [store]),
    toggle: useCallback(
      () => store.getState().setIsOpen((prev) => !prev),
      [store],
    ),
  }
}
