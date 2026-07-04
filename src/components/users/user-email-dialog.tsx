"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Input } from "@/components/ui/input"
import type {
  ManagedUserListItemDto,
  UpdateManagedUserDto,
} from "@/lib/api/contracts/admin"
import { toErrorCode } from "@/lib/api/error-code"
import { getApiErrorCode } from "@/lib/api/error-message"
import { reportClientError } from "@/lib/client-error"
import { resolveErrorKey, useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"

type UserEmailDialogProps = {
  open: boolean
  user: ManagedUserListItemDto | null
  onClose: () => void
  onSaved: (result: UpdateManagedUserDto) => void
}

export function UserEmailDialog({
  open,
  user,
  onClose,
  onSaved,
}: UserEmailDialogProps) {
  const t = useTranslations()
  const [email, setEmail] = useState("")
  const [emailVerified, setEmailVerified] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const userId = user?.userId
  const initialEmail = user?.email ?? ""
  const initialEmailVerified = user?.emailVerified ?? false

  useEffect(() => {
    if (!open || !userId) {
      return
    }

    setEmail(initialEmail)
    setEmailVerified(initialEmailVerified)
  }, [initialEmail, initialEmailVerified, open, userId])

  const hasEmail = email.trim().length > 0

  const handleSave = useCallback(async () => {
    if (!user) return

    const trimmedEmail = email.trim()
    const updates: { email?: string | null; emailVerified?: boolean } = {}

    if (trimmedEmail !== (user.email ?? "")) {
      updates.email = trimmedEmail || null
    }
    if (emailVerified !== user.emailVerified) {
      updates.emailVerified = emailVerified
    }

    if (Object.keys(updates).length === 0) {
      onClose()
      return
    }

    setIsSaving(true)
    try {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(
        client.admin.users.update({ userId: user.userId, updates }),
      )
      if (result.error !== null || !result.data) {
        const code = getApiErrorCode(result.error) ?? "internal_error"
        toast.error(t(resolveErrorKey(toErrorCode(code))))
        return
      }
      toast.success(t("users.userUpdated", { name: user.name }))
      onClose()
      onSaved(result.data)
    } catch (err) {
      reportClientError(err)
      toast.error(t("users.userUpdateFailed"))
    } finally {
      setIsSaving(false)
    }
  }, [email, emailVerified, onClose, onSaved, t, user])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isSaving && !next && onClose()}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("users.editEmailTitle")} - {user?.name ?? ""}
          </DialogTitle>
        </DialogHeader>

        <FieldGroup className="py-4">
          <Field>
            <FieldLabel htmlFor="user-email-input">
              {t("users.emailLabel")}
            </FieldLabel>
            <Input
              id="user-email-input"
              type="email"
              placeholder={t("users.emailPlaceholder")}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (event.target.value.trim().length === 0) {
                  setEmailVerified(false)
                }
              }}
              disabled={isSaving}
            />
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id="user-email-verified"
              checked={emailVerified}
              onCheckedChange={(checked) => setEmailVerified(checked === true)}
              disabled={isSaving || !hasEmail}
            />
            <div className="grid gap-0.5">
              <FieldLabel
                htmlFor="user-email-verified"
                className="cursor-pointer font-normal"
              >
                {t("users.emailVerifiedLabel")}
              </FieldLabel>
              <FieldDescription>
                {t("users.emailVerifiedDescription")}
              </FieldDescription>
            </div>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
