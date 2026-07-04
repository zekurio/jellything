import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

type CenteredPageShellProps = ComponentProps<"div">

export function CenteredPageShell({
  className,
  children,
  ...props
}: CenteredPageShellProps) {
  return (
    <div
      className={cn(
        "bg-background flex min-h-dvh items-center justify-center px-4 py-3 sm:min-h-screen sm:p-6",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
