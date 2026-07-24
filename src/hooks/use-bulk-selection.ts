"use client"

import { useCallback, useState } from "react"

/**
 * Selection-mode state for card grids: an explicit "Select" toggle enters the
 * mode, tapping cards toggles membership, and leaving the mode clears it.
 */
export function useBulkSelection() {
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const toggleSelecting = useCallback(() => {
    setIsSelecting((current) => !current)
    setSelectedIds(new Set())
  }, [])

  const stopSelecting = useCallback(() => {
    setIsSelecting(false)
    setSelectedIds(new Set())
  }, [])

  return {
    isSelecting,
    selectedIds,
    toggleSelected,
    clearSelection,
    toggleSelecting,
    stopSelecting,
  }
}
