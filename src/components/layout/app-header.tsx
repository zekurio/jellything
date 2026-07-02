"use client"

import { Link } from "@tanstack/react-router"

import { HeaderUserNav } from "@/components/layout/header-user-nav"

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
          className="flex min-w-0 flex-1 items-center gap-2 pr-2 font-semibold"
        >
          <span className="text-foreground font-sans text-lg">{title}</span>
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
