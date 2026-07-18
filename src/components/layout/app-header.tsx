"use client"

import { Link } from "@tanstack/react-router"

import { HeaderUserNav } from "@/components/layout/header-user-nav"
import { BrandWordmark } from "@/components/shared/brand"

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
          aria-label={`${title} home`}
          className="flex min-w-0 flex-1 items-center gap-3 pr-2"
        >
          <BrandWordmark textClassName="text-lg" />
          {title.toLocaleLowerCase() !== "inviterr" ? (
            <>
              <span className="bg-border h-5 w-px" aria-hidden="true" />
              <span className="text-muted-foreground truncate text-sm font-medium">
                {title}
              </span>
            </>
          ) : null}
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
