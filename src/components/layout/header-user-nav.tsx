"use client"

import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { LogOut, ShieldCheck, User } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSession } from "@/hooks/use-session"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { getInitials } from "@/lib/utils"

export interface HeaderUserNavProps {
  name: string
  avatarUrl?: string
  isAdmin: boolean
}

export function HeaderUserNav({
  name,
  avatarUrl,
  isAdmin,
}: HeaderUserNavProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const router = useRouter()
  const { setSession } = useSession()

  async function handleLogout(): Promise<void> {
    const client = getBrowserORPCClient()
    const result = await runApiEffect(client.auth.logout({}))
    if (result.error !== null) {
      toast.error(t("errors.tryAgain"))
      return
    }

    setSession(null)
    await navigate({ to: "/login", replace: true })
    await router.invalidate()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-9 w-9 rounded-full"
          aria-label={name}
          title={name}
        >
          <Avatar className="h-9 w-9">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <div className="flex items-center gap-2 p-2">
          <div className="flex flex-col space-y-0.5">
            <p className="text-sm leading-none font-medium">{name}</p>
            {isAdmin && (
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                <ShieldCheck className="size-3" />
                {t("nav.administrator")}
              </p>
            )}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/profile/$tab"
            params={{ tab: "general" }}
            className="cursor-pointer"
          >
            <User className="mr-2 h-4 w-4" />
            {t("nav.profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("auth.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
