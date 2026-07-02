import type * as React from "react"

import { cn } from "@/lib/utils"

type CardSlotProps = React.ComponentProps<"div"> & {
  slot: string
  slotClassName: string
}

function CardSlot({ slot, slotClassName, className, ...props }: CardSlotProps) {
  return (
    <div data-slot={slot} className={cn(slotClassName, className)} {...props} />
  )
}

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CardSlot
      slot="card"
      slotClassName="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm"
      className={className}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CardSlot
      slot="card-header"
      slotClassName="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6"
      className={className}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CardSlot
      slot="card-title"
      slotClassName="leading-none font-semibold"
      className={className}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CardSlot
      slot="card-description"
      slotClassName="text-muted-foreground text-sm"
      className={className}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CardSlot
      slot="card-action"
      slotClassName="col-start-2 row-span-2 row-start-1 self-start justify-self-end"
      className={className}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CardSlot
      slot="card-content"
      slotClassName="px-6"
      className={className}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CardSlot
      slot="card-footer"
      slotClassName="flex items-center px-6 [.border-t]:pt-6"
      className={className}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
