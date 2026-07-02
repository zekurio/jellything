import {
  AlertCircle,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  Edit,
  EllipsisVertical,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash,
  Tv,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RelativeTime } from "@/components/ui/relative-time"
import type { ManagedUserListItemDto as ManagedUserListItem } from "@/lib/api/contracts/admin"
import { useLocale, useTranslations } from "@/lib/i18n"
import { cn, getInitials } from "@/lib/utils"

type TranslationFn = ReturnType<typeof useTranslations>

type UsersMobileListProps = {
  users: ManagedUserListItem[]
  t: TranslationFn
  seerrConfigured?: boolean
  onEditUser: (user: ManagedUserListItem) => void
  onEditEmail: (user: ManagedUserListItem) => void
  onToggleUserDisabled: (user: ManagedUserListItem) => void
  onDeleteUser: (user: ManagedUserListItem) => void
  onSyncUserToSeerr?: (user: ManagedUserListItem) => void
}

export function UsersMobileList({
  users,
  t,
  seerrConfigured = false,
  onEditUser,
  onEditEmail,
  onToggleUserDisabled,
  onDeleteUser,
  onSyncUserToSeerr,
}: UsersMobileListProps) {
  const locale = useLocale()

  return (
    <div className="space-y-2 md:hidden">
      {users.length ? (
        users.map((user) => (
          <div
            key={user.userId}
            className={cn(
              "rounded-lg border px-3 py-2.5",
              user.missingInJellyfin && "border-dashed bg-muted/20",
            )}
          >
            <div className="flex items-center gap-3">
              <Avatar
                className={cn(
                  "h-8 w-8 shrink-0",
                  user.isDisabled &&
                    !user.missingInJellyfin &&
                    "grayscale opacity-50",
                )}
              >
                <AvatarImage
                  src={user.avatarUrl || undefined}
                  alt={user.name}
                />
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>

              <div
                className={cn(
                  "min-w-0 flex-1",
                  user.isDisabled &&
                    !user.missingInJellyfin &&
                    "text-muted-foreground",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm leading-none font-medium">
                    {user.name}
                  </p>
                  {user.isAdmin && (
                    <ShieldCheck className="text-muted-foreground size-3.5 shrink-0" />
                  )}
                </div>
                {!user.missingInJellyfin && (
                  <div className="mt-0.5 flex min-w-0 items-center gap-1">
                    {user.email ? (
                      <>
                        {user.emailVerified ? (
                          <CheckCircle2 className="size-3 shrink-0 text-green-500" />
                        ) : (
                          <AlertCircle className="size-3 shrink-0 text-yellow-500" />
                        )}
                        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                          {user.email}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {t("users.emailNotSet")}
                      </span>
                    )}
                  </div>
                )}
                {user.missingInJellyfin && (
                  <div className="text-muted-foreground mt-0.5 space-y-0.5 text-xs">
                    <p className="truncate">
                      {t("users.missingInJellyfinDescription")}
                    </p>
                    <p className="truncate">
                      {t("users.missingUserDisableLocked")}
                    </p>
                  </div>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                    <span className="sr-only">{t("common.actions")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditUser(user)}>
                    <Edit className="h-4 w-4" />
                    {t("users.editUser")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEditEmail(user)}>
                    <Mail className="h-4 w-4" />
                    {t("users.editEmail")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onToggleUserDisabled(user)}
                    disabled={user.missingInJellyfin}
                  >
                    {user.isDisabled ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Ban className="h-4 w-4" />
                    )}
                    {user.isDisabled
                      ? t("users.enableUser")
                      : t("users.disableUser")}
                  </DropdownMenuItem>
                  {seerrConfigured && onSyncUserToSeerr && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onSyncUserToSeerr(user)}>
                        <RefreshCw className="h-4 w-4" />
                        {t("users.syncToSeerr")}
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeleteUser(user)}
                  >
                    <Trash className="h-4 w-4" />
                    {t("users.deleteUser")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Extra info row */}
            {!user.missingInJellyfin && (
              <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {/* Profile */}
                <span className="flex items-center gap-1">
                  <Tv className="size-3 shrink-0" />
                  {user.isAdmin
                    ? t("users.profileExempt")
                    : (user.effectiveProfileName ?? t("users.noProfile"))}
                </span>

                {/* Last active */}
                <span className="flex items-center gap-1">
                  <Clock className="size-3 shrink-0" />
                  {user.lastActivityDate ? (
                    <RelativeTime
                      date={user.lastActivityDate}
                      locale={locale}
                    />
                  ) : (
                    t("users.lastActiveNever")
                  )}
                </span>

                {/* Expiry */}
                {user.expiresAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3 shrink-0" />
                    <RelativeTime date={user.expiresAt} locale={locale} />
                  </span>
                )}

                {/* Seerr sync */}
                {seerrConfigured && (
                  <span className="flex items-center gap-1">
                    {user.seerrSyncedAt ? (
                      <CheckCircle2 className="size-3 shrink-0 text-green-500" />
                    ) : (
                      <AlertCircle className="size-3 shrink-0 text-yellow-500" />
                    )}
                    {user.seerrSyncedAt
                      ? t("users.seerrSynced")
                      : t("users.seerrNotSynced")}
                  </span>
                )}
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="text-muted-foreground rounded-md border p-6 text-center text-sm">
          {t("users.noUsersFound")}
        </div>
      )}
    </div>
  )
}
