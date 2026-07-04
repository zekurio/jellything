import { type ColumnDef } from "@tanstack/react-table"
import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { UserDeleteActionButton } from "@/components/users/user-delete-action-button"
import { UserDisableActionButton } from "@/components/users/user-disable-action-button"
import { UserEditActionButton } from "@/components/users/user-edit-action-button"
import type { ManagedUserListItemDto } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"
import { cn, formatDateTime, getInitials } from "@/lib/utils"

type TranslationFn = ReturnType<typeof useTranslations>

type BuildUsersTableColumnsOptions = {
  t: TranslationFn
  locale: string
  seerrConfigured: boolean
  onEditUser: (user: ManagedUserListItemDto) => void
  onEditEmail: (user: ManagedUserListItemDto) => void
  onToggleUserDisabled: (user: ManagedUserListItemDto) => void
  onDeleteUser: (user: ManagedUserListItemDto) => void
  onSyncUserToSeerr: (user: ManagedUserListItemDto) => void
}

export function buildUsersTableColumns({
  t,
  locale,
  seerrConfigured,
  onEditUser,
  onEditEmail,
  onToggleUserDisabled,
  onDeleteUser,
  onSyncUserToSeerr,
}: BuildUsersTableColumnsOptions): ColumnDef<ManagedUserListItemDto>[] {
  const columns: ColumnDef<ManagedUserListItemDto>[] = [
    {
      id: "select",
      size: 40,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t("users.selectAll")}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t("users.selectRow", { name: row.original.name })}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: t("users.user"),
      size: 240,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar
            className={cn(
              "h-8 w-8 shrink-0",
              row.original.isDisabled &&
                !row.original.missingInJellyfin &&
                "grayscale opacity-50",
            )}
          >
            <AvatarImage
              src={row.original.avatarUrl || undefined}
              alt={row.original.name}
            />
            <AvatarFallback>{getInitials(row.original.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate font-medium">{row.original.name}</p>
            {row.original.isAdmin && (
              <ShieldCheck className="text-muted-foreground size-3.5 shrink-0" />
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: t("users.email"),
      size: 240,
      cell: ({ row }) => {
        if (row.original.missingInJellyfin) {
          return (
            <p className="text-muted-foreground text-xs">
              {t("users.missingInJellyfinDescription")}
            </p>
          )
        }
        const email = row.original.email
        return (
          <div className="group flex min-w-0 items-center gap-1.5">
            {email ? (
              <>
                {row.original.emailVerified ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                ) : (
                  <AlertCircle className="size-3.5 shrink-0 text-yellow-500" />
                )}
                <span className="text-muted-foreground min-w-0 truncate">
                  {email}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t("users.emailNotSet")}
              </span>
            )}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => onEditEmail(row.original)}
              aria-label={t("users.editEmail")}
              title={t("users.editEmail")}
            >
              <Pencil className="size-3" />
            </button>
          </div>
        )
      },
    },
    {
      accessorKey: "effectiveProfileName",
      header: t("users.profile"),
      size: 160,
      cell: ({ row }) => (
        <p
          className={
            row.original.isAdmin
              ? "text-muted-foreground font-medium"
              : "font-medium"
          }
        >
          {row.original.isAdmin
            ? t("users.profileExempt")
            : (row.original.effectiveProfileName ?? t("users.noProfile"))}
        </p>
      ),
    },
  ]

  if (seerrConfigured) {
    columns.push({
      accessorKey: "seerrSyncedAt",
      header: t("users.seerrSyncColumn"),
      size: 120,
      cell: ({ row }) => {
        const syncedAt = row.original.seerrSyncedAt
        if (syncedAt) {
          return (
            <div
              className="flex items-center gap-1.5"
              title={formatDateTime(syncedAt, locale)}
            >
              <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
              <span className="text-muted-foreground text-sm">
                {t("users.seerrSynced")}
              </span>
            </div>
          )
        }
        return (
          <div className="flex items-center gap-1.5">
            <AlertCircle className="size-3.5 shrink-0 text-yellow-500" />
            <span className="text-muted-foreground text-sm">
              {t("users.seerrNotSynced")}
            </span>
          </div>
        )
      },
    })
  }

  columns.push({
    id: "actions",
    header: "",
    size: seerrConfigured ? 152 : 120,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <UserEditActionButton
          user={row.original}
          t={t}
          onEditUser={onEditUser}
          disabled={false}
        />
        <UserDisableActionButton
          user={row.original}
          t={t}
          onToggleUserDisabled={onToggleUserDisabled}
          disabled={row.original.missingInJellyfin}
          disabledLabel={t("users.missingUserDisableLocked")}
        />
        {seerrConfigured && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSyncUserToSeerr(row.original)}
            aria-label={t("users.syncToSeerr")}
            title={t("users.syncToSeerr")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        <UserDeleteActionButton
          user={row.original}
          t={t}
          onDeleteUser={onDeleteUser}
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  })

  return columns
}
