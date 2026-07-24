"use client"

import { X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type BulkActionBarAction = {
  key: string
  label: string
  icon: LucideIcon
  onClick: () => void
  destructive?: boolean
}

type BulkActionBarProps = {
  label: string
  actions: BulkActionBarAction[]
  clearLabel: string
  onClear: () => void
}

// Inline bar on md+ viewports; floating bottom bar on mobile so bulk actions
// stay in thumb reach while scrolling a card list.
export function BulkActionBar({
  label,
  actions,
  clearLabel,
  onClear,
}: BulkActionBarProps) {
  return (
    <div
      className={cn(
        "bg-background/95 fixed inset-x-3 bottom-3 z-40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-lg backdrop-blur",
        "md:bg-muted/50 md:static md:inset-x-auto md:bottom-auto md:z-auto md:shadow-none md:backdrop-blur-none",
      )}
    >
      <span className="mr-1 text-sm font-medium">{label}</span>

      <div className="flex flex-wrap items-center gap-1">
        {actions.map((action) => (
          <Button
            key={action.key}
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1.5 text-xs",
              action.destructive &&
                "text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
            onClick={action.onClick}
          >
            <action.icon className="h-3.5 w-3.5" />
            {action.label}
          </Button>
        ))}
      </div>

      <div className="ml-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClear}
          aria-label={clearLabel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
