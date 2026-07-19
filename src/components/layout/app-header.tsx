"use client"

import { Link } from "@tanstack/react-router"

import { HeaderUserNav } from "@/components/layout/header-user-nav"
import { Separator } from "@/components/ui/separator"

export interface AppHeaderProps {
  title: string
  titleTo?: string
  user: {
    name: string
    avatarUrl?: string
    isAdmin: boolean
  }
}

export function AppHeader({ title, titleTo = "/", user }: AppHeaderProps) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="flex h-14 items-center justify-between px-4 lg:px-6">
        <Link
          to={titleTo}
          className="flex min-w-0 flex-1 items-center gap-3 pr-2 font-semibold"
        >
          <img
            src="/favicon.svg"
            alt=""
            className="size-7 shrink-0 rounded-md"
          />
          <Separator
            orientation="vertical"
            className="data-[orientation=vertical]:h-6"
          />
          <span className="text-foreground truncate font-sans text-lg lowercase">
            {title}
          </span>
        </Link>
        <HeaderUserNav
          name={user.name}
          avatarUrl={user.avatarUrl}
          isAdmin={user.isAdmin}
        />
      </div>
    </header>
  )
}
