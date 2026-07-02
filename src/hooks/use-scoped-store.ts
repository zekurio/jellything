"use client"

import type { Store } from "@tanstack/store"
import { useRef } from "react"

export function useScopedStore<TStore extends Store<unknown>>(
  createStore: () => TStore,
): TStore {
  const storeRef = useRef<TStore | null>(null)

  if (storeRef.current === null) {
    storeRef.current = createStore()
  }

  return storeRef.current
}
