import type { LucideIcon } from "lucide-react"
import type * as React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatTileProps {
  label: string
  value: React.ReactNode
  description?: React.ReactNode
  Icon?: LucideIcon
  className?: string
  children?: React.ReactNode
}

export function StatTile({
  label,
  value,
  description,
  Icon,
  className,
  children,
}: StatTileProps) {
  return (
    <Card className={cn("gap-0 py-5", className)}>
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm font-medium">
            {label}
          </span>
          {Icon ? (
            <Icon className="text-muted-foreground size-4" aria-hidden />
          ) : null}
        </div>
        <span className="text-3xl leading-tight font-semibold tabular-nums">
          {value}
        </span>
        {description ? (
          <span className="text-muted-foreground text-sm">{description}</span>
        ) : null}
        {children}
      </CardContent>
    </Card>
  )
}
