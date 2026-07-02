import type { ReactNode } from "react"

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface DialogFormShellProps {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  bodyClassName?: string
  footerClassName?: string
}

export function DialogFormShell({
  title,
  description,
  children,
  footer,
  bodyClassName,
  footerClassName,
}: DialogFormShellProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
      </DialogHeader>

      <div
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden py-4 px-2",
          bodyClassName,
        )}
      >
        {children}
      </div>

      {footer ? (
        <DialogFooter className={footerClassName}>{footer}</DialogFooter>
      ) : null}
    </>
  )
}
