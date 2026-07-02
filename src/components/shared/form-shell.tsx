import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface FormShellProps {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
  actionsClassName?: string
}

export function FormShell({
  title,
  description,
  children,
  actions,
  className,
  headerClassName,
  bodyClassName,
  actionsClassName,
}: FormShellProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className={cn("space-y-1", headerClassName)}>
        <h3 className="text-lg font-medium">{title}</h3>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>

      <div className={cn("space-y-6", bodyClassName)}>{children}</div>

      {actions ? (
        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row sm:flex-wrap",
            actionsClassName,
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  )
}
