import { Button } from "@/components/ui/button"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { UserProfileOptionDto as UserProfileOption } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"

type TranslationFn = ReturnType<typeof useTranslations>

type UserEditDialogProps = {
  open: boolean
  title: string
  profiles: UserProfileOption[]
  selectedProfileId: string
  editExpiresAt: Date | null
  isProfileLocked: boolean
  isExpiryLocked: boolean
  profileDescription: string
  isSaving: boolean
  t: TranslationFn
  onOpenChange: (open: boolean) => void
  onSelectedProfileIdChange: (profileId: string) => void
  onEditExpiresAtChange: (date: Date | null) => void
  onCancel: () => void
  onSave: () => void
}

export function UserEditDialog({
  open,
  title,
  profiles,
  selectedProfileId,
  editExpiresAt,
  isProfileLocked,
  isExpiryLocked,
  profileDescription,
  isSaving,
  t,
  onOpenChange,
  onSelectedProfileIdChange,
  onEditExpiresAtChange,
  onCancel,
  onSave,
}: UserEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <FieldGroup className="py-4">
          <Field>
            <FieldLabel htmlFor="user-profile-select">
              {t("users.selectProfile")}
            </FieldLabel>
            <Select
              value={selectedProfileId}
              onValueChange={onSelectedProfileIdChange}
              disabled={isProfileLocked || isSaving}
            >
              <SelectTrigger
                id="user-profile-select"
                aria-label={t("users.selectProfile")}
              >
                <SelectValue
                  placeholder={t("users.selectProfilePlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                    {profile.isDefault
                      ? ` (${t("profiles.defaultLabel")})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{profileDescription}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>{t("users.expiresAtLabel")}</FieldLabel>
            <DateTimePicker
              value={editExpiresAt}
              onChange={onEditExpiresAtChange}
              minMinutesFromNow={0}
              disabled={isSaving || isExpiryLocked}
            />
            <FieldDescription>
              {isExpiryLocked
                ? t("users.adminExpiryLocked")
                : t("users.expiresAtDescription")}
            </FieldDescription>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
          >
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
