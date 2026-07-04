import { Badge } from "@/components/ui/badge"
import type { ManagedUserListItemDto } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"

type TranslationFn = ReturnType<typeof useTranslations>

type UserBadgesProps = {
  user: ManagedUserListItemDto
  t: TranslationFn
}

export function UserBadges({ user, t }: UserBadgesProps) {
  return (
    <div className="flex min-h-5 flex-wrap items-center gap-1">
      {user.missingInJellyfin ? (
        <Badge variant="destructive">{t("users.missingInJellyfinBadge")}</Badge>
      ) : (
        <Badge variant={user.isAdmin ? "default" : "outline"}>
          {user.isAdmin ? t("users.adminBadge") : t("users.memberBadge")}
        </Badge>
      )}
      {user.isDisabled && !user.missingInJellyfin && (
        <Badge variant="secondary">{t("users.disabledBadge")}</Badge>
      )}
    </div>
  )
}
