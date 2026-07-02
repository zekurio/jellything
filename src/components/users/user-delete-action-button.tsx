"use client"

import { Trash } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ManagedUserListItemDto as ManagedUserListItem } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type TranslationFn = ReturnType<typeof useTranslations>

type UserDeleteActionButtonProps = {
  user: ManagedUserListItem
  t: TranslationFn
  onDeleteUser: (user: ManagedUserListItem) => void
  showLabel?: boolean
}

export function UserDeleteActionButton({
  user,
  t,
  onDeleteUser,
  showLabel = false,
}: UserDeleteActionButtonProps) {
  const label = t("users.deleteUser")

  return (
    <Button
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      className={cn(
        showLabel && "h-8",
        "text-destructive hover:bg-destructive/10 hover:text-destructive",
      )}
      onClick={() => onDeleteUser(user)}
      aria-label={label}
      title={label}
    >
      <Trash className="h-4 w-4" />
      {showLabel ? <span>{label}</span> : null}
    </Button>
  )
}
