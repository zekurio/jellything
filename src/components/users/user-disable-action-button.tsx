"use client"

import { Ban, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ManagedUserListItemDto } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type TranslationFn = ReturnType<typeof useTranslations>

type UserDisableActionButtonProps = {
  user: ManagedUserListItemDto
  t: TranslationFn
  onToggleUserDisabled: (user: ManagedUserListItemDto) => void
  disabled?: boolean
  disabledLabel?: string
  showLabel?: boolean
}

export function UserDisableActionButton({
  user,
  t,
  onToggleUserDisabled,
  disabled = false,
  disabledLabel,
  showLabel = false,
}: UserDisableActionButtonProps) {
  const label = disabled
    ? (disabledLabel ?? t("users.disableUser"))
    : user.isDisabled
      ? t("users.enableUser")
      : t("users.disableUser")
  const Icon = user.isDisabled ? CheckCircle2 : Ban

  return (
    <Button
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      className={cn(showLabel && "h-8")}
      disabled={disabled}
      onClick={() => onToggleUserDisabled(user)}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      {showLabel ? <span>{label}</span> : null}
    </Button>
  )
}
