"use client"

import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { LogOut, ShieldCheck, SunMoon, User } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useHydrated } from "@/hooks/use-hydrated"
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
  const { theme, setTheme } = useTheme()
  const hydrated = useHydrated()

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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            <SunMoon className="mr-2 h-4 w-4" />
            {t("nav.theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              // next-themes only knows the stored theme after mount; render
              // "system" during SSR so the forceMount-ed menu hydrates cleanly.
              value={hydrated ? (theme ?? "system") : "system"}
              onValueChange={setTheme}
            >
              <DropdownMenuRadioItem value="light" className="cursor-pointer">
                {t("nav.themeLight")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="cursor-pointer">
                {t("nav.themeDark")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system" className="cursor-pointer">
                {t("nav.themeSystem")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
