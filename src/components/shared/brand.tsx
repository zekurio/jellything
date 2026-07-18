import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

interface BrandMarkProps extends ComponentProps<"svg"> {
  title?: string
}

export function BrandMark({ className, title, ...props }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect width="64" height="64" className="fill-primary" />
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
        className="text-primary-foreground"
      >
        <path d="m11.5 24.5 28-12.7a5 5 0 0 1 6.6 2.5l4.4 9.7" opacity=".62" />
        <path d="M18 27v-5" opacity=".62" />
        <path d="M18 39v3" />
        <path d="M18 50v4" />
        <path d="M10 24h44a4 4 0 0 1 4 4v7c-4 0-4 8 0 8v7a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-7c4 0 4-8 0-8v-7a4 4 0 0 1 4-4Z" />
      </g>
    </svg>
  )
}

interface BrandWordmarkProps extends ComponentProps<"div"> {
  markClassName?: string
  textClassName?: string
}

export function BrandWordmark({
  className,
  markClassName,
  textClassName,
  ...props
}: BrandWordmarkProps) {
  return (
    <div
      className={cn("inline-flex items-center gap-2.5", className)}
      {...props}
    >
      <BrandMark className={cn("size-8", markClassName)} />
      <span
        className={cn(
          "text-foreground font-sans text-xl font-semibold tracking-[-0.045em]",
          textClassName,
        )}
      >
        inviterr
      </span>
    </div>
  )
}
