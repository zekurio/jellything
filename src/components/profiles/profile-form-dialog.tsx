"use client"

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { useEffect, useId, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { MediaLibraryDto, ProfileDto } from "@/lib/api/contracts/admin"
import { ErrorCode } from "@/lib/api/contracts/errors"
import { toErrorCode } from "@/lib/api/error-code"
import { useTranslations, resolveErrorKey } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { profileFormSchema, type ProfileFormValues } from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

import {
  buildProfilePolicy,
  defaultFormValues,
  getApiErrorCodeValue,
  sanitizeSeerrPermissions,
  toProfileFormValues,
} from "./profile-form-utils"
import { ProfileGeneralFields } from "./profile-general-fields"
import { ProfileSeerrPermissionFields } from "./profile-seerr-permission-fields"
import { ProfileSeerrQuotaFields } from "./profile-seerr-quota-fields"
import { ProfileStreamingFields } from "./profile-streaming-fields"

interface ProfileFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile?: ProfileDto | null
  libraries: MediaLibraryDto[]
  isSeerrConfigured: boolean
  onSaveComplete?: (profile: ProfileDto) => void
}

export function ProfileFormDialog({
  open,
  onOpenChange,
  profile,
  libraries,
  isSeerrConfigured,
  onSaveComplete,
}: ProfileFormDialogProps) {
  const t = useTranslations()

  const id = useId()
  const isEditMode = Boolean(profile)

  const form = useForm<ProfileFormValues>({
    resolver: standardSchemaResolver(standardSchema(profileFormSchema)),
    defaultValues: toProfileFormValues(profile),
  })

  const { control, handleSubmit, reset, setValue, watch, formState } = form
  const enableAllFolders = watch("enableAllFolders")
  const seerrPermissions = watch("seerrPermissions")
  const seerrMovieQuotaOverride = watch("seerrMovieQuotaOverride")
  const seerrMovieQuotaMode = watch("seerrMovieQuotaMode")
  const seerrTvQuotaOverride = watch("seerrTvQuotaOverride")
  const seerrTvQuotaMode = watch("seerrTvQuotaMode")
  const mediaServerName = "Jellyfin"

  useEffect(() => {
    const sanitizedPermissions = sanitizeSeerrPermissions(seerrPermissions)
    if (sanitizedPermissions !== seerrPermissions) {
      setValue("seerrPermissions", sanitizedPermissions, {
        shouldDirty: formState.isDirty,
      })
    }
  }, [formState.isDirty, seerrPermissions, setValue])

  async function onSubmit(data: ProfileFormValues): Promise<void> {
    const policy = buildProfilePolicy(data)

    try {
      const client = getBrowserORPCClient()
      if (profile) {
        const res = await runApiEffect(
          client.admin.profiles.update({
            profileId: profile.id,
            updates: { name: data.name, policy },
          }),
        )

        if (res.error === null && res.data) {
          const syncFailedCount = res.data.syncFailedCount ?? 0
          if (syncFailedCount > 0) {
            toast.warning(
              t("profiles.profileUpdatedWithSyncWarnings", {
                count: syncFailedCount,
              }),
            )
          }
          if (syncFailedCount === 0) {
            toast.success(t("profiles.profileUpdated"))
          }
          onOpenChange(false)
          onSaveComplete?.(res.data)
          return
        }

        const code = getApiErrorCodeValue(res.error)
        toast.error(
          t(
            resolveErrorKey(toErrorCode(code), {
              [ErrorCode.ALREADY_EXISTS]: "profiles.profileNameAlreadyExists",
            }),
          ),
        )
        return
      }

      const res = await runApiEffect(
        client.admin.profiles.create({ name: data.name, policy }),
      )

      if (res.error === null && res.data) {
        toast.success(t("profiles.profileCreated"))
        onOpenChange(false)
        reset(defaultFormValues)
        onSaveComplete?.(res.data)
        return
      }

      const code = getApiErrorCodeValue(res.error)
      toast.error(
        t(
          resolveErrorKey(toErrorCode(code), {
            [ErrorCode.ALREADY_EXISTS]: "profiles.profileNameAlreadyExists",
          }),
        ),
      )
    } catch {
      toast.error(t("profiles.profileSaveFailed"))
    }
  }

  const [activeTab, setActiveTab] = useState("general")

  useEffect(() => {
    if (!open) setActiveTab("general")
  }, [open])

  const title = isEditMode
    ? `${t("profiles.formTitleEdit")} - ${profile?.name ?? ""}`
    : t("profiles.formTitleCreate")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="py-4">
            <div className="md:hidden">
              <Select value={activeTab} onValueChange={setActiveTab}>
                <SelectTrigger className="w-full" aria-label={title}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">
                    {t("profiles.generalTabLabel")}
                  </SelectItem>
                  <SelectItem value="streaming">
                    {t("profiles.streamingTabLabel")}
                  </SelectItem>
                  {isSeerrConfigured && (
                    <SelectItem value="seerr">
                      {t("profiles.seerrTabLabel")}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <TabsList className="hidden md:inline-flex">
              <TabsTrigger value="general">
                {t("profiles.generalTabLabel")}
              </TabsTrigger>
              <TabsTrigger value="streaming">
                {t("profiles.streamingTabLabel")}
              </TabsTrigger>
              {isSeerrConfigured && (
                <TabsTrigger value="seerr">
                  {t("profiles.seerrTabLabel")}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent
              value="general"
              className="max-h-[50vh] overflow-x-hidden overflow-y-auto px-2 pt-4"
            >
              <ProfileGeneralFields
                control={control}
                id={id}
                t={t}
                libraries={libraries}
                enableAllFolders={enableAllFolders}
              />
            </TabsContent>

            <TabsContent
              value="streaming"
              className="max-h-[50vh] overflow-x-hidden overflow-y-auto px-2 pt-4"
            >
              <ProfileStreamingFields control={control} id={id} t={t} />
            </TabsContent>

            {isSeerrConfigured && (
              <TabsContent
                value="seerr"
                className="max-h-[50vh] overflow-x-hidden overflow-y-auto px-2 pt-4"
              >
                <ProfileSeerrPermissionFields
                  control={control}
                  id={id}
                  t={t}
                  mediaServerName={mediaServerName}
                />

                <ProfileSeerrQuotaFields
                  control={control}
                  id={id}
                  t={t}
                  seerrMovieQuotaOverride={seerrMovieQuotaOverride}
                  seerrMovieQuotaMode={seerrMovieQuotaMode}
                  seerrTvQuotaOverride={seerrTvQuotaOverride}
                  seerrTvQuotaMode={seerrTvQuotaMode}
                />
              </TabsContent>
            )}
          </Tabs>

          <DialogFooter>
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
                  : t("profiles.createProfile")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
