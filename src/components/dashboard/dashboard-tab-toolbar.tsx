import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type DashboardTabToolbarProps = {
  search: ReactNode
  actions?: ReactNode
  className?: string
}

export function DashboardTabToolbar({
  search,
  actions,
  className,
}: DashboardTabToolbarProps) {
  const hasActions = actions !== undefined && actions !== null

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:min-h-9 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 sm:flex-1">{search}</div>
      {hasActions ? (
        <div className="flex min-h-9 w-full items-center justify-stretch sm:w-auto sm:flex-none sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
