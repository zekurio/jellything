"use client"

import { useStore } from "@tanstack/react-store"
import { Edit, ListChecks, Plus, Star, Trash } from "lucide-react"
import { memo, useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { DashboardTabSearch } from "@/components/dashboard/dashboard-tab-search"
import { DashboardTabToolbar } from "@/components/dashboard/dashboard-tab-toolbar"
import { ProfileFormDialog } from "@/components/profiles/profile-form-dialog"
import { BulkActionBar } from "@/components/shared/bulk-action-bar"
import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { createAppStore } from "@/hooks/store-utils"
import { useBulkSelection } from "@/hooks/use-bulk-selection"
import { useDialogAction, useSimpleDialog } from "@/hooks/use-dialog-action"
import { useProfilesTableStore } from "@/hooks/use-profiles-table-store"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type { MediaLibraryDto, ProfileDto } from "@/lib/api/contracts/admin"
import { reportClientError } from "@/lib/client-error"
import { notifyProfilesChanged } from "@/lib/dashboard-events"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { cn } from "@/lib/utils"

interface ProfilesGridProps {
  initialProfiles: ProfileDto[]
  initialLibraries: MediaLibraryDto[]
  isSeerrConfigured: boolean
  initialError?: string | null
}

interface ProfilesGridState {
  profiles: ProfileDto[]
  libraries: MediaLibraryDto[]
  isSeerrConfigured: boolean
  error: string | null
  isLoading: boolean
  setProfiles: (profiles: ProfileDto[]) => void
  setLibraries: (libraries: MediaLibraryDto[]) => void
  setIsSeerrConfigured: (isSeerrConfigured: boolean) => void
  setError: (error: string | null) => void
  setIsLoading: (isLoading: boolean) => void
}

function sortProfilesByName(profiles: ProfileDto[]): ProfileDto[] {
  return profiles.toSorted((a, b) => a.name.localeCompare(b.name))
}

function upsertProfile(
  profiles: ProfileDto[],
  nextProfile: ProfileDto,
): ProfileDto[] {
  const found = profiles.some((profile) => profile.id === nextProfile.id)
  const nextProfiles = found
    ? profiles.map((profile) =>
        profile.id === nextProfile.id ? nextProfile : profile,
      )
    : [...profiles, nextProfile]

  return sortProfilesByName(nextProfiles)
}

const ProfileCard = memo(function ProfileCard({
  profile,
  defaultLoading,
  t,
  isSelecting,
  isSelected,
  onToggleSelected,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  profile: ProfileDto
  defaultLoading: boolean
  t: ReturnType<typeof useTranslations>
  isSelecting: boolean
  isSelected: boolean
  onToggleSelected: (id: string) => void
  onEdit: (id: string) => void
  onSetDefault: (profile: ProfileDto) => void
  onDelete: (profile: ProfileDto) => void
}) {
  // Default profiles cannot be bulk-deleted, so they are not selectable.
  const isSelectable = isSelecting && !profile.isDefault

  return (
    <div
      className={cn(
        "flex min-h-[3.75rem] items-center justify-between gap-3 rounded-lg border p-4",
        isSelectable && "cursor-pointer select-none",
        isSelecting && profile.isDefault && "opacity-60",
        isSelected && "border-primary/60 ring-primary/60 ring-1",
      )}
      onClick={isSelectable ? () => onToggleSelected(profile.id) : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isSelecting && (
          <Checkbox
            checked={isSelected}
            disabled={profile.isDefault}
            onCheckedChange={() => onToggleSelected(profile.id)}
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            aria-label={t("profiles.selectProfile", { name: profile.name })}
          />
        )}
        {profile.isDefault && (
          <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" />
        )}
        <p className="truncate text-sm font-medium">{profile.name}</p>
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-1",
          isSelecting && "hidden",
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(profile.id)}
          aria-label={t("profiles.editProfile")}
          title={t("profiles.editProfile")}
        >
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onSetDefault(profile)}
          disabled={profile.isDefault || defaultLoading}
          aria-label={
            profile.isDefault
              ? t("profiles.alreadyDefault")
              : t("profiles.setDefault")
          }
          title={
            profile.isDefault
              ? t("profiles.alreadyDefault")
              : t("profiles.setDefault")
          }
        >
          <Star
            className={
              profile.isDefault
                ? "h-3.5 w-3.5 fill-current text-amber-500"
                : "h-3.5 w-3.5"
            }
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 w-7"
          onClick={() => onDelete(profile)}
          disabled={profile.isDefault}
          aria-label={
            profile.isDefault
              ? t("profiles.cannotDeleteDefault")
              : t("common.delete")
          }
          title={
            profile.isDefault
              ? t("profiles.cannotDeleteDefault")
              : t("common.delete")
          }
        >
          <Trash className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
})

export function ProfilesGrid({
  initialProfiles,
  initialLibraries,
  isSeerrConfigured,
  initialError = null,
}: ProfilesGridProps) {
  const t = useTranslations()
  // This route has no server-side pagination or search (filtering is
  // client-side), so loader props seed the store once at creation and the
  // store is the single client-side owner thereafter. Post-mutation reconcile
  // goes through refetch(); there is deliberately no prop->store re-sync
  // effect.
  const scopedStore = useScopedStore(() =>
    createAppStore<ProfilesGridState>((set) => ({
      profiles: initialProfiles,
      libraries: initialLibraries,
      isSeerrConfigured,
      error: initialError,
      isLoading: false,
      setProfiles: (profiles) => set({ profiles }),
      setLibraries: (libraries) => set({ libraries }),
      setIsSeerrConfigured: (nextConfigured) =>
        set({ isSeerrConfigured: nextConfigured }),
      setError: (error) => set({ error }),
      setIsLoading: (isLoading) => set({ isLoading }),
    })),
  )
  const profiles = useStore(scopedStore, (state) => state.profiles)
  const libraries = useStore(scopedStore, (state) => state.libraries)
  const seerrConfigured = useStore(
    scopedStore,
    (state) => state.isSeerrConfigured,
  )
  const error = useStore(scopedStore, (state) => state.error)
  const isLoading = useStore(scopedStore, (state) => state.isLoading)

  const bulkSelection = useBulkSelection()
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const globalFilter = useProfilesTableStore((state) => state.globalFilter)
  const setGlobalFilter = useProfilesTableStore(
    (state) => state.setGlobalFilter,
  )
  const createDialog = useSimpleDialog()
  const editProfileId = useProfilesTableStore((state) => state.editProfileId)
  const setEditProfileId = useProfilesTableStore(
    (state) => state.setEditProfileId,
  )
  const defaultLoading = useProfilesTableStore((state) => state.defaultLoading)
  const setDefaultLoading = useProfilesTableStore(
    (state) => state.setDefaultLoading,
  )
  const deleteDialog = useDialogAction<ProfileDto>({
    onSuccess: () => {
      void refetch()
      notifyProfilesChanged()
    },
  })

  const editingProfile = useMemo(
    () => profiles.find((profile) => profile.id === editProfileId) ?? null,
    [editProfileId, profiles],
  )

  const refetch = useCallback(async () => {
    scopedStore.getState().setIsLoading(true)
    scopedStore.getState().setError(null)

    try {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(client.admin.profiles.page({}))

      if (result.error !== null || !result.data) {
        scopedStore.getState().setError(t("profiles.profileLoadFailed"))
        return
      }

      scopedStore.getState().setProfiles(Array.from(result.data.profiles))
      scopedStore.getState().setLibraries(Array.from(result.data.libraries))
      scopedStore
        .getState()
        .setIsSeerrConfigured(Boolean(result.data.isSeerrConfigured))
    } finally {
      scopedStore.getState().setIsLoading(false)
    }
  }, [scopedStore, t])

  const setProfilesState = useCallback(
    (updater: (current: ProfileDto[]) => ProfileDto[]): ProfileDto[] => {
      const previousProfiles = scopedStore.getState().profiles
      scopedStore.getState().setProfiles(updater(previousProfiles))
      return previousProfiles
    },
    [scopedStore],
  )

  const handleProfileSaved = useCallback(
    (savedProfile: ProfileDto) => {
      setProfilesState((current) => upsertProfile(current, savedProfile))
      void refetch()
      notifyProfilesChanged()
    },
    [refetch, setProfilesState],
  )

  const handleEditProfile = useCallback(
    (profileId: string) => {
      setEditProfileId(profileId)
    },
    [setEditProfileId],
  )

  const handleSetDefault = useCallback(
    async (profile: ProfileDto) => {
      setDefaultLoading(true)
      const previousProfiles = setProfilesState((current) =>
        current.map((currentProfile) => ({
          ...currentProfile,
          isDefault: currentProfile.id === profile.id,
        })),
      )
      try {
        const client = getBrowserORPCClient()
        const result = await runApiEffect(
          client.admin.profiles.update({
            profileId: profile.id,
            updates: { isDefault: true },
          }),
        )
        if (result.error !== null || !result.data) {
          scopedStore.getState().setProfiles(previousProfiles)
          toast.error(t("profiles.profileUpdateFailed"))
          return
        }

        const updatedProfile = result.data
        setProfilesState((current) =>
          sortProfilesByName(
            current.map((currentProfile) =>
              currentProfile.id === updatedProfile.id
                ? updatedProfile
                : { ...currentProfile, isDefault: false },
            ),
          ),
        )
        const syncFailedCount = result.data.syncFailedCount ?? 0
        if (syncFailedCount > 0) {
          toast.warning(
            t("profiles.setDefaultWithSyncWarnings", {
              name: profile.name,
              count: syncFailedCount,
            }),
          )
        }
        if (syncFailedCount === 0) {
          toast.success(t("profiles.setDefaultSuccess", { name: profile.name }))
        }
        void refetch()
        notifyProfilesChanged()
      } catch (err) {
        reportClientError(err)
        scopedStore.getState().setProfiles(previousProfiles)
        toast.error(t("profiles.profileUpdateFailed"))
      } finally {
        setDefaultLoading(false)
      }
    },
    [refetch, scopedStore, setDefaultLoading, setProfilesState, t],
  )

  const handleSetDefaultClick = useCallback(
    (profile: ProfileDto) => {
      void handleSetDefault(profile)
    },
    [handleSetDefault],
  )

  const filterLower = globalFilter.toLowerCase()
  const filteredProfiles = useMemo(
    () =>
      filterLower
        ? profiles.filter((p) => p.name.toLowerCase().includes(filterLower))
        : profiles,
    [profiles, filterLower],
  )

  const selectedProfiles = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          !profile.isDefault && bulkSelection.selectedIds.has(profile.id),
      ),
    [bulkSelection.selectedIds, profiles],
  )

  const handleBulkDelete = useCallback(async (): Promise<void> => {
    setIsBulkDeleting(true)
    try {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(
        client.admin.profiles.bulk({
          operation: "delete",
          profileIds: selectedProfiles.map((profile) => profile.id),
        }),
      )

      if (result.error !== null || !result.data) {
        toast.error(t("profiles.bulkOperationFailed"))
        return
      }

      const results = result.data.results
      const deletedIds = new Set(
        results.flatMap((operationResult) =>
          operationResult.ok && !("skipped" in operationResult)
            ? [operationResult.profileId]
            : [],
        ),
      )
      if (deletedIds.size > 0) {
        setProfilesState((current) =>
          current.filter((profile) => !deletedIds.has(profile.id)),
        )
      }

      // Skipped items were already in the requested state, so they count
      // neither as changed nor as failed.
      const succeeded = deletedIds.size
      const failed = results.filter(
        (operationResult) => !operationResult.ok,
      ).length
      if (failed === 0 && succeeded > 0) {
        toast.success(
          t("profiles.bulkOperationComplete", { success: succeeded, failed }),
        )
      }
      if (failed > 0 && succeeded > 0) {
        toast.warning(
          t("profiles.bulkOperationComplete", { success: succeeded, failed }),
        )
      }
      if (failed > 0 && succeeded === 0) {
        toast.error(t("profiles.bulkOperationFailed"))
      }
      if (failed === 0 && succeeded === 0) {
        toast.info(t("profiles.bulkOperationNoChanges"))
      }

      void refetch()
      notifyProfilesChanged()
    } catch (err) {
      reportClientError(err)
      toast.error(t("profiles.bulkOperationFailed"))
    } finally {
      setIsBulkDeleting(false)
      setIsBulkDeleteOpen(false)
      bulkSelection.stopSelecting()
    }
  }, [bulkSelection, refetch, selectedProfiles, setProfilesState, t])

  const openBulkDeleteConfirm = useCallback(() => {
    setIsBulkDeleteOpen(true)
  }, [])

  const bulkBarActions = useMemo(
    () => [
      {
        key: "delete",
        label: t("common.delete"),
        icon: Trash,
        onClick: openBulkDeleteConfirm,
        destructive: true,
      },
    ],
    [openBulkDeleteConfirm, t],
  )

  const handleDelete = () => {
    const profile = deleteDialog.item
    if (!profile) {
      return
    }

    void deleteDialog.execute(async () => {
      const previousProfiles = setProfilesState((current) =>
        current.filter((currentProfile) => currentProfile.id !== profile.id),
      )
      const client = getBrowserORPCClient()
      try {
        const result = await runApiEffect(
          client.admin.profiles.delete({ profileId: profile.id }),
        )
        if (result.error !== null) {
          throw new Error(t("profiles.profileDeleteFailed"))
        }
        toast.success(t("profiles.profileDeleted", { name: profile.name }))
      } catch (err) {
        scopedStore.getState().setProfiles(previousProfiles)
        throw err
      }
    })
  }

  if (isLoading && profiles.length === 0) {
    return <Spinner centered />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t("common.tryAgain")}
        </Button>
      </div>
    )
  }

  return (
    // Bottom padding keeps the last cards clear of the fixed mobile bulk bar.
    <div
      className={cn(
        "space-y-4",
        selectedProfiles.length > 0 && "pb-16 md:pb-0",
      )}
    >
      <DashboardTabToolbar
        search={
          <DashboardTabSearch
            placeholder={t("profiles.searchPlaceholder")}
            value={globalFilter}
            onChange={setGlobalFilter}
          />
        }
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {profiles.length > 0 && (
              <Button
                variant="outline"
                onClick={bulkSelection.toggleSelecting}
                className="flex-1 sm:flex-none"
              >
                <ListChecks className="mr-2 h-4 w-4" />
                {bulkSelection.isSelecting
                  ? t("common.done")
                  : t("common.select")}
              </Button>
            )}
            <Button onClick={createDialog.open} className="flex-1 sm:flex-none">
              <Plus className="mr-2 h-4 w-4" />
              {t("profiles.createProfile")}
            </Button>
          </div>
        }
      />

      {selectedProfiles.length > 0 && (
        <BulkActionBar
          label={t("common.selectedCount", { count: selectedProfiles.length })}
          actions={bulkBarActions}
          clearLabel={t("common.close")}
          onClear={bulkSelection.clearSelection}
        />
      )}

      {filteredProfiles.length === 0 ? (
        <div className="text-muted-foreground rounded-md border p-6 text-center text-sm">
          {t("profiles.noProfilesFound")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProfiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              defaultLoading={defaultLoading}
              t={t}
              isSelecting={bulkSelection.isSelecting}
              isSelected={bulkSelection.selectedIds.has(profile.id)}
              onToggleSelected={bulkSelection.toggleSelected}
              onEdit={handleEditProfile}
              onSetDefault={handleSetDefaultClick}
              onDelete={deleteDialog.open}
            />
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {filteredProfiles.length === 1
          ? t("profiles.profileCountSingle", { count: filteredProfiles.length })
          : t("profiles.profileCountPlural", {
              count: filteredProfiles.length,
            })}
      </p>

      <ProfileFormDialog
        key={`create-${createDialog.isOpen ? "open" : "closed"}`}
        open={createDialog.isOpen}
        onOpenChange={(open) => !open && createDialog.close()}
        libraries={libraries}
        isSeerrConfigured={seerrConfigured}
        onSaveComplete={(savedProfile) => {
          createDialog.close()
          handleProfileSaved(savedProfile)
        }}
      />

      <ProfileFormDialog
        key={`edit-${editProfileId ?? "none"}-${editProfileId ? "open" : "closed"}`}
        open={Boolean(editProfileId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditProfileId(null)
          }
        }}
        profile={editingProfile}
        libraries={libraries}
        isSeerrConfigured={seerrConfigured}
        onSaveComplete={(savedProfile) => {
          setEditProfileId(null)
          handleProfileSaved(savedProfile)
        }}
      />

      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && deleteDialog.close()}
      >
        <ConfirmAlertShell
          title={t("profiles.deleteProfileTitle")}
          description={t("profiles.deleteProfileDescription", {
            name: deleteDialog.item?.name || "",
          })}
          cancelLabel={t("common.cancel")}
          confirmLabel={
            deleteDialog.isLoading ? t("common.deleting") : t("common.delete")
          }
          isLoading={deleteDialog.isLoading}
          onConfirm={handleDelete}
          destructive
        />
      </AlertDialog>

      <AlertDialog
        open={isBulkDeleteOpen}
        onOpenChange={(open) => !open && setIsBulkDeleteOpen(false)}
      >
        <ConfirmAlertShell
          title={t("profiles.bulkDeleteTitle")}
          description={t("profiles.bulkDeleteDescription", {
            count: selectedProfiles.length,
          })}
          cancelLabel={t("common.cancel")}
          confirmLabel={
            isBulkDeleting ? t("common.deleting") : t("common.delete")
          }
          isLoading={isBulkDeleting}
          onConfirm={() => void handleBulkDelete()}
          destructive
        />
      </AlertDialog>
    </div>
  )
}
