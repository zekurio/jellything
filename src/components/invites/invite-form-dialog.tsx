"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangleIcon } from "lucide-react"
import { useId } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { InviteDto, ProfileDto } from "@/lib/api/contracts/admin"
import { reportClientError } from "@/lib/client-error"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { inviteFormSchema, type InviteFormValues } from "@/lib/schemas"

interface InviteFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invite?: InviteDto | null
  availableProfiles: ProfileDto[]
  onSaveComplete?: (invite: InviteDto) => void
}

const defaultFormValues: InviteFormValues = {
  profileId: "",
  code: "",
  useLimit: "",
  expiresAt: null,
}

export function InviteFormDialog({
  open,
  onOpenChange,
  invite,
  availableProfiles,
  onSaveComplete,
}: InviteFormDialogProps) {
  const id = useId()
  const isEditMode = Boolean(invite)
  const t = useTranslations()
  const defaultProfile = availableProfiles.find((profile) => profile.isDefault)

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: invite
      ? {
          profileId: invite.profileId,
          code: invite.code,
          useLimit: invite.useLimit?.toString() ?? "",
          expiresAt: invite.expiresAt ? new Date(invite.expiresAt) : null,
        }
      : {
          ...defaultFormValues,
          profileId: defaultProfile?.id ?? availableProfiles[0]?.id ?? "",
        },
  })

  const { control, handleSubmit, reset, setValue, watch, formState } = form
  const useLimit = watch("useLimit")
  const expiresAt = watch("expiresAt")
  const showWarning = !isEditMode && !useLimit && !expiresAt

  async function onSubmit(data: InviteFormValues): Promise<void> {
    if (!data.profileId) {
      toast.error(t("invites.selectProfileError"))
      return
    }

    try {
      const client = getBrowserORPCClient()
      if (invite) {
        const result = await runApiEffect(
          client.admin.invites.update({
            inviteId: invite.id,
            updates: {
              profileId: data.profileId,
              code: data.code || undefined,
              useLimit: data.useLimit
                ? Number.parseInt(data.useLimit, 10)
                : null,
              expiresAt: data.expiresAt?.toISOString() ?? null,
            },
          }),
        )

        if (result.error === null && result.data) {
          toast.success(t("invites.inviteUpdated"))
          onOpenChange(false)
          onSaveComplete?.(result.data)
          return
        }

        toast.error(t("invites.inviteSaveFailed"))
        return
      }

      const result = await runApiEffect(
        client.admin.invites.create({
          profileId: data.profileId,
          code: data.code || undefined,
          useLimit: data.useLimit ? Number.parseInt(data.useLimit, 10) : null,
          expiresAt: data.expiresAt?.toISOString() ?? null,
        }),
      )

      if (result.error === null && result.data) {
        toast.success(t("invites.inviteCreated"))
        onOpenChange(false)
        reset(defaultFormValues)
        onSaveComplete?.(result.data)
        return
      }

      toast.error(t("invites.inviteSaveFailed"))
    } catch (err) {
      reportClientError(err)
      toast.error(t("invites.inviteSaveFailed"))
    }
  }

  const title = isEditMode
    ? `${t("invites.editInvite")} - ${invite?.code ?? ""}`
    : t("invites.createInvite")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Tabs defaultValue="details" className="py-4">
            <TabsList>
              <TabsTrigger value="details">
                {t("invites.inviteDetails")}
              </TabsTrigger>
              <TabsTrigger value="restrictions">
                {t("invites.restrictions")}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="details"
              className="max-h-[50vh] overflow-x-hidden overflow-y-auto px-2 pt-4"
            >
              <FieldGroup>
                <Controller
                  name="profileId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${id}-profile`}>
                        {t("invites.profileLabel")}
                      </FieldLabel>
                      <Select
                        name={field.name}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id={`${id}-profile`}
                          aria-invalid={fieldState.invalid}
                        >
                          <SelectValue
                            placeholder={t("invites.selectProfilePlaceholder")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {availableProfiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.name}
                              {profile.isDefault &&
                                ` (${t("profiles.defaultLabel")})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  name="code"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${id}-code`}>
                        {t("invites.codeOptional")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`${id}-code`}
                        value={field.value || ""}
                        aria-invalid={fieldState.invalid}
                        placeholder={t("invites.codePlaceholder")}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <FieldDescription>
                        {isEditMode
                          ? t("invites.codeDescription")
                          : t("invites.codeDescriptionAuto")}
                      </FieldDescription>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </TabsContent>

            <TabsContent
              value="restrictions"
              className="max-h-[50vh] overflow-x-hidden overflow-y-auto px-2 pt-4"
            >
              <FieldGroup>
                <Controller
                  name="useLimit"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${id}-use-limit`}>
                        {t("invites.useLimitOptional")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`${id}-use-limit`}
                        type="number"
                        value={field.value || ""}
                        aria-invalid={fieldState.invalid}
                        placeholder={t("invites.useLimitPlaceholder")}
                        min={1}
                      />
                      <FieldDescription>
                        {t("invites.useLimitDescription")}
                      </FieldDescription>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="expiresAt"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>{t("invites.expiresOnOptional")}</FieldLabel>
                      <DateTimePicker
                        value={field.value}
                        onChange={(date) =>
                          setValue("expiresAt", date, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        minMinutesFromNow={0}
                      />
                      <FieldDescription>
                        {t("invites.expiresDescription")}
                      </FieldDescription>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                {showWarning && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                    <div className="flex items-start gap-2 text-amber-600 dark:text-amber-500">
                      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="text-xs">{t("invites.unlimitedWarning")}</p>
                    </div>
                  </div>
                )}
              </FieldGroup>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting
                ? t("common.saving")
                : isEditMode
                  ? t("common.save")
                  : t("invites.createInvite")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
