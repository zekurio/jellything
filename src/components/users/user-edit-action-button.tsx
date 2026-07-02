import { Edit } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ManagedUserListItemDto as ManagedUserListItem } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type TranslationFn = ReturnType<typeof useTranslations>

type UserEditActionButtonProps = {
  user: ManagedUserListItem
  t: TranslationFn
  onEditUser: (user: ManagedUserListItem) => void
  disabled?: boolean
  disabledLabel?: string
  showLabel?: boolean
}

export function UserEditActionButton({
  user,
  t,
  onEditUser,
  disabled = false,
  disabledLabel,
  showLabel = false,
}: UserEditActionButtonProps) {
  const label = disabled
    ? (disabledLabel ?? t("users.editUser"))
    : t("users.editUser")

  return (
    <Button
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      className={cn(showLabel && "h-8")}
      disabled={disabled}
      onClick={() => onEditUser(user)}
      aria-label={label}
      title={label}
    >
      <Edit className="h-4 w-4" />
      {showLabel ? <span>{label}</span> : null}
    </Button>
  )
}
