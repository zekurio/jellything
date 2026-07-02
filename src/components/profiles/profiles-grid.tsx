"use client"

import { useStore } from "@tanstack/react-store"
import { Edit, Plus, Star, Trash } from "lucide-react"
import { memo, useCallback, useMemo } from "react"
import { toast } from "sonner"

import { DashboardTabSearch } from "@/components/dashboard/dashboard-tab-search"
import { DashboardTabToolbar } from "@/components/dashboard/dashboard-tab-toolbar"
import { ProfileFormDialog } from "@/components/profiles/profile-form-dialog"
import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { createAppStore } from "@/hooks/store-utils"
import { useDialogAction, useSimpleDialog } from "@/hooks/use-dialog-action"
import { useProfilesTableStore } from "@/hooks/use-profiles-table-store"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type {
  MediaLibraryDto as MediaLibrary,
  ProfileDto as Profile,
} from "@/lib/api/contracts/admin"
import { reportClientError } from "@/lib/client-error"
import { notifyProfilesChanged } from "@/lib/dashboard-events"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"

interface ProfilesGridProps {
  initialProfiles: Profile[]
  initialLibraries: MediaLibrary[]
  isSeerrConfigured: boolean
  initialError?: string | null
}

interface ProfilesGridState {
  profiles: Profile[]
  libraries: MediaLibrary[]
  isSeerrConfigured: boolean
  error: string | null
  isLoading: boolean
  setProfiles: (profiles: Profile[]) => void
  setLibraries: (libraries: MediaLibrary[]) => void
  setIsSeerrConfigured: (isSeerrConfigured: boolean) => void
  setError: (error: string | null) => void
  setIsLoading: (isLoading: boolean) => void
}

function sortProfilesByName(profiles: Profile[]): Profile[] {
  return profiles.toSorted((a, b) => a.name.localeCompare(b.name))
}

function upsertProfile(profiles: Profile[], nextProfile: Profile): Profile[] {
  let found = false
  const nextProfiles = profiles.map((profile) => {
    if (profile.id !== nextProfile.id) {
      return profile
    }
    found = true
    return nextProfile
  })

  return sortProfilesByName(found ? nextProfiles : [...profiles, nextProfile])
}

const ProfileCard = memo(function ProfileCard({
  profile,
  defaultLoading,
  t,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  profile: Profile
  defaultLoading: boolean
  t: ReturnType<typeof useTranslations>
  onEdit: (id: string) => void
  onSetDefault: (profile: Profile) => void
  onDelete: (profile: Profile) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
      <div className="flex min-w-0 items-center gap-2">
        {profile.isDefault && (
          <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" />
        )}
        <p className="truncate text-sm font-medium">{profile.name}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
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
  const deleteDialog = useDialogAction<Profile>({
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

      scopedStore
        .getState()
        .setProfiles(Array.from(result.data.profiles as Profile[]))
      scopedStore
        .getState()
        .setLibraries(Array.from(result.data.libraries as MediaLibrary[]))
      scopedStore
        .getState()
        .setIsSeerrConfigured(Boolean(result.data.isSeerrConfigured))
    } finally {
      scopedStore.getState().setIsLoading(false)
    }
  }, [scopedStore, t])

  const setProfilesState = useCallback(
    (updater: (current: Profile[]) => Profile[]): Profile[] => {
      const previousProfiles = scopedStore.getState().profiles
      scopedStore.getState().setProfiles(updater(previousProfiles))
      return previousProfiles
    },
    [scopedStore],
  )

  const handleProfileSaved = useCallback(
    (savedProfile: Profile) => {
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
    async (profile: Profile) => {
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
        } else {
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
          if ((result.data.syncFailedCount ?? 0) > 0) {
            toast.warning(
              t("profiles.setDefaultWithSyncWarnings", {
                name: profile.name,
                count: result.data.syncFailedCount ?? 0,
              }),
            )
          } else {
            toast.success(
              t("profiles.setDefaultSuccess", { name: profile.name }),
            )
          }
          void refetch()
          notifyProfilesChanged()
        }
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
    (profile: Profile) => {
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
    <div className="space-y-4">
      <DashboardTabToolbar
        search={
          <DashboardTabSearch
            placeholder={t("profiles.searchPlaceholder")}
            value={globalFilter}
            onChange={setGlobalFilter}
          />
        }
        actions={
          <Button onClick={createDialog.open} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            {t("profiles.createProfile")}
          </Button>
        }
      />

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
    </div>
  )
}
