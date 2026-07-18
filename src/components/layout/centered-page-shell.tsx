import type { ComponentProps } from "react"

import { BrandWordmark } from "@/components/shared/brand"
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
        "bg-background flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:min-h-screen sm:p-6",
        className,
      )}
      {...props}
    >
      <div className="flex w-full flex-col items-center gap-8">
        <BrandWordmark
          aria-label="Inviterr"
          markClassName="size-10"
          textClassName="text-2xl"
        />
        {children}
      </div>
    </div>
  )
}
