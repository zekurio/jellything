"use client"

import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import {
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from "@tanstack/react-table"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { DashboardTabSearch } from "@/components/dashboard/dashboard-tab-search"
import { DashboardTabToolbar } from "@/components/dashboard/dashboard-tab-toolbar"
import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { UserEditDialog } from "@/components/users/user-edit-dialog"
import { UserEmailDialog } from "@/components/users/user-email-dialog"
import {
  UsersBulkActionBar,
  type BulkOperation,
  type BulkEditPayload,
} from "@/components/users/users-bulk-action-bar"
import { UsersDesktopTable } from "@/components/users/users-desktop-table"
import { UsersMobileList } from "@/components/users/users-mobile-list"
import { buildUsersTableColumns } from "@/components/users/users-table-columns"
import { createAppStore } from "@/hooks/store-utils"
import { useDialogAction } from "@/hooks/use-dialog-action"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type {
  BulkManagedUserResultDto,
  DeleteManagedUserDto as DeleteUserResult,
  ManagedUserListItemDto as ManagedUserListItem,
  PagedUsersWithProfilesDto,
  UpdateManagedUserDto as UpdateUserResult,
  UserProfileOptionDto as UserProfileOption,
} from "@/lib/api/contracts/admin"
import { toErrorCode } from "@/lib/api/error-code"
import { getApiErrorCode } from "@/lib/api/error-message"
import { reportClientError } from "@/lib/client-error"
import { DASHBOARD_PROFILES_CHANGED_EVENT } from "@/lib/dashboard-events"
import { useTranslations, resolveErrorKey } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { cn } from "@/lib/utils"

export type UsersPayload = PagedUsersWithProfilesDto

interface UsersTableProps {
  initialData: UsersPayload
  initialQuery: string
  initialError?: string | null
}

interface UsersTableState {
  users: UsersPayload["users"]
  profiles: UserProfileOption[]
  seerrConfigured: boolean
  error: string | null
  isLoading: boolean
  query: string
  dialogUser: ManagedUserListItem | null
  isDialogOpen: boolean
  selectedProfileId: string
  editExpiresAt: Date | null
  isSaving: boolean
  setUsers: (users: UsersPayload["users"]) => void
  setProfiles: (profiles: UserProfileOption[]) => void
  setError: (error: string | null) => void
  setIsLoading: (isLoading: boolean) => void
  setQuery: (query: string) => void
  openDialog: (user: ManagedUserListItem) => void
  closeDialog: () => void
  setSelectedProfileId: (selectedProfileId: string) => void
  setEditExpiresAt: (editExpiresAt: Date | null) => void
  setIsSaving: (isSaving: boolean) => void
}

type UserListUpdater = (users: ManagedUserListItem[]) => ManagedUserListItem[]
type GlobalFilterUpdater = string | ((currentFilter: string) => string)
type BulkOperationSuccessResult = Extract<
  BulkManagedUserResultDto,
  { ok: true }
>

function patchUserFromUpdateResult(
  user: ManagedUserListItem,
  result: UpdateUserResult,
): ManagedUserListItem {
  return {
    ...user,
    assignedProfileId: user.isAdmin ? null : result.profileId,
    effectiveProfileId: user.isAdmin ? null : result.profileId,
    effectiveProfileName: user.isAdmin ? null : result.profileName,
    email: result.email,
    emailVerified: result.emailVerified,
    isDisabled: result.isDisabled,
    expiresAt: result.expiresAt,
  }
}

function applyUserUpdateResult(
  users: ManagedUserListItem[],
  result: UpdateUserResult,
): ManagedUserListItem[] {
  return users.map((user) =>
    user.userId === result.userId
      ? patchUserFromUpdateResult(user, result)
      : user,
  )
}

function patchUserById(
  users: ManagedUserListItem[],
  userId: string,
  patch: Partial<ManagedUserListItem>,
): ManagedUserListItem[] {
  return users.map((user) =>
    user.userId === userId ? { ...user, ...patch } : user,
  )
}

function removeUserById(
  users: ManagedUserListItem[],
  userId: string,
): ManagedUserListItem[] {
  return users.filter((user) => user.userId !== userId)
}

export function UsersTable({
  initialData,
  initialQuery,
  initialError = null,
}: UsersTableProps) {
  const navigate = useNavigate()
  const t = useTranslations()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const emailDialog = useDialogAction<ManagedUserListItem>()

  const scopedStore = useScopedStore(() =>
    createAppStore<UsersTableState>((set) => ({
      users: initialData.users,
      profiles: initialData.profiles,
      seerrConfigured: initialData.seerrConfigured,
      error: initialError,
      isLoading: false,
      query: initialQuery,
      dialogUser: null,
      isDialogOpen: false,
      selectedProfileId: "",
      editExpiresAt: null,
      isSaving: false,
      setUsers: (users) => set({ users }),
      setProfiles: (profiles) => set({ profiles }),
      setError: (error) => set({ error }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setQuery: (query) => set({ query }),
      openDialog: (user) =>
        set({
          dialogUser: user,
          isDialogOpen: true,
          selectedProfileId: user.isAdmin ? "" : (user.assignedProfileId ?? ""),
          editExpiresAt: user.expiresAt ? new Date(user.expiresAt) : null,
        }),
      closeDialog: () => set({ isDialogOpen: false }),
      setSelectedProfileId: (selectedProfileId) => set({ selectedProfileId }),
      setEditExpiresAt: (editExpiresAt) => set({ editExpiresAt }),
      setIsSaving: (isSaving) => set({ isSaving }),
    })),
  )
  const users = useStore(scopedStore, (state) => state.users)
  const profiles = useStore(scopedStore, (state) => state.profiles)
  const seerrConfigured = useStore(
    scopedStore,
    (state) => state.seerrConfigured,
  )
  const error = useStore(scopedStore, (state) => state.error)
  const isLoading = useStore(scopedStore, (state) => state.isLoading)
  const query = useStore(scopedStore, (state) => state.query)
  const dialogUser = useStore(scopedStore, (state) => state.dialogUser)
  const isDialogOpen = useStore(scopedStore, (state) => state.isDialogOpen)
  const selectedProfileId = useStore(
    scopedStore,
    (state) => state.selectedProfileId,
  )
  const editExpiresAt = useStore(scopedStore, (state) => state.editExpiresAt)
  const isSaving = useStore(scopedStore, (state) => state.isSaving)

  const refetch = useCallback(async () => {
    scopedStore.getState().setIsLoading(true)
    scopedStore.getState().setError(null)

    try {
      const client = getBrowserORPCClient()
      const currentUsers = scopedStore.getState().users
      const currentQuery = scopedStore.getState().query
      const result = await runApiEffect(
        client.admin.users.page({
          page: currentUsers.page,
          pageSize: currentUsers.pageSize,
          query: currentQuery || undefined,
          sort: "name",
          direction: "asc",
        }),
      )
      if (result.error !== null || !result.data) {
        scopedStore.getState().setError(t("users.usersLoadFailed"))
        return
      }

      const data = result.data
      scopedStore.getState().setUsers(data.users)
      scopedStore.getState().setProfiles(Array.from(data.profiles))
      scopedStore.setState((s) => ({
        ...s,
        seerrConfigured: data.seerrConfigured,
      }))
    } finally {
      scopedStore.getState().setIsLoading(false)
    }
  }, [scopedStore, t])

  useEffect(() => {
    scopedStore.getState().setUsers(initialData.users)
    scopedStore.getState().setProfiles(initialData.profiles)
    scopedStore.setState((s) => ({
      ...s,
      seerrConfigured: initialData.seerrConfigured,
    }))
    scopedStore.getState().setQuery(initialQuery)
    scopedStore.getState().setError(initialError)
  }, [initialData, initialError, initialQuery, scopedStore])

  useEffect(() => {
    function handleProfilesChanged(): void {
      void refetch()
    }

    window.addEventListener(
      DASHBOARD_PROFILES_CHANGED_EVENT,
      handleProfilesChanged,
    )
    return () => {
      window.removeEventListener(
        DASHBOARD_PROFILES_CHANGED_EVENT,
        handleProfilesChanged,
      )
    }
  }, [refetch])

  const openEditDialog = useCallback(
    (user: ManagedUserListItem) => {
      scopedStore.getState().openDialog(user)
    },
    [scopedStore],
  )

  const closeEditDialog = useCallback(() => {
    scopedStore.getState().closeDialog()
  }, [scopedStore])

  const updateUsers = useCallback(
    (updater: UserListUpdater) => {
      const currentUsers = scopedStore.getState().users
      scopedStore.getState().setUsers({
        ...currentUsers,
        items: updater(currentUsers.items),
      })
    },
    [scopedStore],
  )

  const refetchUsersAfterMutation = useCallback(() => {
    void refetch()
  }, [refetch])

  const deleteDialog = useDialogAction<ManagedUserListItem, DeleteUserResult>({
    onSuccess: refetchUsersAfterMutation,
    successMessage: (result) =>
      result.deletedFromJellyfin
        ? t("users.userDeleted")
        : t("users.staleUserDeleted"),
    errorMessage: t("users.userDeleteFailed"),
  })

  const disableDialog = useDialogAction<ManagedUserListItem, UpdateUserResult>({
    onSuccess: refetchUsersAfterMutation,
    successMessage: (result) =>
      result.isDisabled ? t("users.userDisabled") : t("users.userEnabled"),
    errorMessage: t("users.userDisableFailed"),
  })

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !isSaving) {
        closeEditDialog()
      }
    },
    [closeEditDialog, isSaving],
  )

  const saveUserChanges = useCallback(async (): Promise<void> => {
    if (!dialogUser) {
      return
    }

    if (
      !dialogUser.isAdmin &&
      !dialogUser.missingInJellyfin &&
      !selectedProfileId
    ) {
      toast.error(t("users.selectProfileError"))
      return
    }

    scopedStore.getState().setIsSaving(true)
    try {
      const client = getBrowserORPCClient()

      const originalProfileId = dialogUser.isAdmin
        ? ""
        : (dialogUser.assignedProfileId ?? "")
      const originalExpiresAt = dialogUser.expiresAt
        ? new Date(dialogUser.expiresAt)
        : null
      const updates: {
        profileId?: string
        expiresAt?: string | null
      } = {}

      if (
        !dialogUser.isAdmin &&
        !dialogUser.missingInJellyfin &&
        selectedProfileId !== originalProfileId
      ) {
        updates.profileId = selectedProfileId
      }

      if (!dialogUser.isAdmin) {
        const editExpiresAtTime = editExpiresAt?.getTime() ?? null
        const originalExpiresAtTime = originalExpiresAt?.getTime() ?? null
        if (editExpiresAtTime !== originalExpiresAtTime) {
          updates.expiresAt = editExpiresAt?.toISOString() ?? null
        }
      }

      if (Object.keys(updates).length === 0) {
        closeEditDialog()
        return
      }

      const result = await runApiEffect(
        client.admin.users.update({ userId: dialogUser.userId, updates }),
      )
      if (result.error !== null || !result.data) {
        const code = getApiErrorCode(result.error) ?? "internal_error"
        toast.error(t(resolveErrorKey(toErrorCode(code))))
        return
      }
      const updateResult = result.data

      toast.success(t("users.userUpdated", { name: dialogUser.name }))
      updateUsers((currentUsers) =>
        applyUserUpdateResult(currentUsers, updateResult),
      )
      closeEditDialog()
      void refetch()
    } catch (err) {
      reportClientError(err)
      toast.error(t("users.userUpdateFailed"))
    } finally {
      scopedStore.getState().setIsSaving(false)
    }
  }, [
    closeEditDialog,
    dialogUser,
    editExpiresAt,
    refetch,
    scopedStore,
    selectedProfileId,
    t,
    updateUsers,
  ])

  const handleSyncUserToSeerr = useCallback(
    async (user: ManagedUserListItem): Promise<void> => {
      try {
        const client = getBrowserORPCClient()
        const result = await runApiEffect(
          client.admin.users.syncSeerr({ userId: user.userId }),
        )
        if (result.error !== null) {
          const code = getApiErrorCode(result.error) ?? "internal_error"
          toast.error(t(resolveErrorKey(toErrorCode(code))))
          return
        }
        if (result.data?.synced) {
          updateUsers((currentUsers) =>
            patchUserById(currentUsers, user.userId, {
              seerrSyncedAt: new Date().toISOString(),
            }),
          )
        }
        toast.success(t("users.seerrSyncSuccess"))
        void refetch()
      } catch (err) {
        reportClientError(err)
        toast.error(t("users.seerrSyncFailed"))
      }
    },
    [refetch, t, updateUsers],
  )

  const columns = useMemo(
    () =>
      buildUsersTableColumns({
        t,
        seerrConfigured,
        onEditUser: openEditDialog,
        onEditEmail: emailDialog.open,
        onToggleUserDisabled: disableDialog.open,
        onDeleteUser: deleteDialog.open,
        onSyncUserToSeerr: handleSyncUserToSeerr,
      }),
    [
      deleteDialog.open,
      disableDialog.open,
      emailDialog.open,
      handleSyncUserToSeerr,
      openEditDialog,
      seerrConfigured,
      t,
    ],
  )

  const handleToggleUserDisabled = useCallback(async (): Promise<void> => {
    const user = disableDialog.item
    if (!user) {
      return
    }

    await disableDialog.execute(async () => {
      const previousUsers = scopedStore.getState().users
      updateUsers((currentUsers) =>
        patchUserById(currentUsers, user.userId, {
          isDisabled: !user.isDisabled,
        }),
      )

      try {
        const client = getBrowserORPCClient()
        const result = await runApiEffect(
          client.admin.users.update({
            userId: user.userId,
            updates: { isDisabled: !user.isDisabled },
          }),
        )

        if (result.error !== null || !result.data) {
          throw new Error(
            t(
              resolveErrorKey(
                toErrorCode(getApiErrorCode(result.error) ?? "internal_error"),
              ),
            ),
          )
        }
        const updateResult = result.data

        updateUsers((currentUsers) =>
          applyUserUpdateResult(currentUsers, updateResult),
        )
        return updateResult
      } catch (err) {
        scopedStore.getState().setUsers(previousUsers)
        throw err
      }
    })
  }, [disableDialog, scopedStore, t, updateUsers])

  const handleDeleteUser = useCallback(async (): Promise<void> => {
    const user = deleteDialog.item
    if (!user) {
      return
    }

    await deleteDialog.execute(async () => {
      const previousUsers = scopedStore.getState().users
      updateUsers((currentUsers) => removeUserById(currentUsers, user.userId))

      try {
        const client = getBrowserORPCClient()
        const result = await runApiEffect(
          client.admin.users.delete({ userId: user.userId }),
        )

        if (result.error !== null || !result.data) {
          throw new Error(
            t(
              resolveErrorKey(
                toErrorCode(getApiErrorCode(result.error) ?? "internal_error"),
              ),
            ),
          )
        }

        return result.data
      } catch (err) {
        scopedStore.getState().setUsers(previousUsers)
        throw err
      }
    })
  }, [deleteDialog, scopedStore, t, updateUsers])

  const handleBulkOperation = useCallback(
    async (
      operation: BulkOperation,
      targetUsers: ManagedUserListItem[],
      payload?: BulkEditPayload,
    ): Promise<void> => {
      const client = getBrowserORPCClient()
      const userIds = targetUsers.map((user) => user.userId)
      const result =
        operation === "assignProfile"
          ? await runApiEffect(
              client.admin.users.bulk({
                operation,
                userIds,
                updates: {
                  ...(payload?.profileId
                    ? { profileId: payload.profileId }
                    : {}),
                  ...(payload && "expiresAt" in payload
                    ? { expiresAt: payload.expiresAt ?? null }
                    : {}),
                },
              }),
            )
          : await runApiEffect(
              client.admin.users.bulk({
                operation,
                userIds,
              }),
            )

      if (result.error !== null || !result.data) {
        toast.error(t("users.bulkOperationFailed"))
        setRowSelection({})
        void refetch()
        return
      }

      const successResults = result.data.results.filter(
        (result) => result.ok && !("skipped" in result),
      ) as BulkOperationSuccessResult[]
      const success = successResults.length
      const failed = result.data.results.filter((result) => !result.ok).length

      if (success > 0) {
        updateUsers((currentUsers) =>
          successResults.reduce<ManagedUserListItem[]>((nextUsers, result) => {
            if (!result.ok || "skipped" in result) {
              return nextUsers
            }

            switch (result.operation) {
              case "assignProfile":
              case "disable":
              case "enable":
                return applyUserUpdateResult(nextUsers, result.result)
              case "delete":
                return removeUserById(nextUsers, result.result.userId)
              case "syncSeerr":
                return patchUserById(nextUsers, result.userId, {
                  seerrSyncedAt: new Date().toISOString(),
                })
            }
          }, currentUsers),
        )
      }

      if (failed === 0 && success > 0) {
        toast.success(t("users.bulkOperationComplete", { success, failed }))
      }
      if (failed > 0 && success > 0) {
        toast.warning(t("users.bulkOperationComplete", { success, failed }))
      }
      if (success === 0) {
        toast.error(t("users.bulkOperationFailed"))
      }

      setRowSelection({})
      void refetch()
    },
    [refetch, t, updateUsers],
  )

  const handleGlobalFilterChange = useCallback(
    (nextFilter: GlobalFilterUpdater) => {
      const currentQuery = scopedStore.getState().query
      const nextQuery =
        typeof nextFilter === "function" ? nextFilter(currentQuery) : nextFilter
      scopedStore.getState().setQuery(nextQuery)
      setRowSelection({})
      void navigate({
        to: "/dashboard/users",
        search: {
          page: 1,
          pageSize: scopedStore.getState().users.pageSize,
          query: nextQuery || undefined,
          sort: "name",
          direction: "asc",
        },
        replace: true,
      })
    },
    [navigate, scopedStore],
  )

  const handlePreviousPage = useCallback(() => {
    setRowSelection({})
    void navigate({
      to: "/dashboard/users",
      search: {
        page: Math.max(users.page - 1, 1),
        pageSize: users.pageSize,
        query: query || undefined,
        sort: "name",
        direction: "asc",
      },
      replace: true,
    })
  }, [navigate, query, users.page, users.pageSize])

  const handleNextPage = useCallback(() => {
    setRowSelection({})
    void navigate({
      to: "/dashboard/users",
      search: {
        page: Math.min(users.page + 1, users.pageCount),
        pageSize: users.pageSize,
        query: query || undefined,
        sort: "name",
        direction: "asc",
      },
      replace: true,
    })
  }, [navigate, query, users.page, users.pageCount, users.pageSize])

  const clearRowSelection = useCallback(() => {
    setRowSelection({})
  }, [])

  const getUserRowClassName = useCallback(
    (user: ManagedUserListItem) => cn(user.missingInJellyfin && "bg-muted/20"),
    [],
  )

  const getUserCellClassName = useCallback(
    (user: ManagedUserListItem, columnId: string) =>
      columnId !== "actions" && columnId !== "select"
        ? cn(
            user.missingInJellyfin && "text-muted-foreground",
            user.isDisabled &&
              !user.missingInJellyfin &&
              "text-muted-foreground",
          )
        : undefined,
    [],
  )

  const handleSelectedProfileIdChange = useCallback(
    (nextProfileId: string) => {
      scopedStore.getState().setSelectedProfileId(nextProfileId)
    },
    [scopedStore],
  )

  const handleEditExpiresAtChange = useCallback(
    (nextDate: Date | null) => {
      scopedStore.getState().setEditExpiresAt(nextDate)
    },
    [scopedStore],
  )

  const handleEmailSaved = useCallback(
    (result: UpdateUserResult) => {
      updateUsers((currentUsers) => applyUserUpdateResult(currentUsers, result))
      void refetch()
    },
    [refetch, updateUsers],
  )

  const table = useReactTable({
    data: users.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onGlobalFilterChange: handleGlobalFilterChange,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.userId,
    state: {
      rowSelection,
    },
  })
  const visibleUsers = table.getRowModel().rows.map((row) => row.original)
  const visibleUserCount = users.total
  const pageCount = Math.max(users.pageCount, 1)
  const canGoPrevious = users.page > 1
  const canGoNext = users.page < users.pageCount

  const selectedUserIds = useMemo(
    () =>
      new Set(
        Object.entries(rowSelection).flatMap(([userId, isSelected]) =>
          isSelected ? [userId] : [],
        ),
      ),
    [rowSelection],
  )
  const selectedUsers = useMemo(
    () => users.items.filter((user) => selectedUserIds.has(user.userId)),
    [selectedUserIds, users.items],
  )

  const isProfileLocked = Boolean(
    dialogUser?.missingInJellyfin || dialogUser?.isAdmin,
  )
  const isExpiryLocked = Boolean(dialogUser?.isAdmin)
  const profileDescription = dialogUser?.missingInJellyfin
    ? t("users.missingUserProfileLocked")
    : dialogUser?.isAdmin
      ? t("users.adminProfileLocked")
      : t("users.selectProfileDescription")

  if (isLoading && users.items.length === 0) {
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
            placeholder={t("users.searchPlaceholder")}
            value={query}
            onChange={handleGlobalFilterChange}
          />
        }
      />

      {selectedUsers.length > 0 && (
        <UsersBulkActionBar
          selectedUsers={selectedUsers}
          profiles={profiles}
          seerrConfigured={seerrConfigured}
          t={t}
          onBulkOperation={handleBulkOperation}
          onClearSelection={clearRowSelection}
        />
      )}

      <UsersMobileList
        users={visibleUsers}
        t={t}
        seerrConfigured={seerrConfigured}
        onEditUser={openEditDialog}
        onEditEmail={emailDialog.open}
        onToggleUserDisabled={disableDialog.open}
        onDeleteUser={deleteDialog.open}
        onSyncUserToSeerr={handleSyncUserToSeerr}
      />

      <UsersDesktopTable
        table={table}
        emptyLabel={t("users.noUsersFound")}
        getRowClassName={getUserRowClassName}
        getCellClassName={getUserCellClassName}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          {visibleUserCount === 1
            ? t("users.userCountSingle", { count: visibleUserCount })
            : t("users.userCountPlural", { count: visibleUserCount })}
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={handlePreviousPage}
            disabled={!canGoPrevious}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground min-w-16 text-center text-xs tabular-nums">
            {users.page} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={handleNextPage}
            disabled={!canGoNext}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <UserEditDialog
        open={isDialogOpen}
        title={`${t("users.editUserTitle")} - ${dialogUser?.name ?? ""}`}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        editExpiresAt={editExpiresAt}
        isProfileLocked={isProfileLocked}
        isExpiryLocked={isExpiryLocked}
        profileDescription={profileDescription}
        isSaving={isSaving}
        t={t}
        onOpenChange={handleDialogOpenChange}
        onSelectedProfileIdChange={handleSelectedProfileIdChange}
        onEditExpiresAtChange={handleEditExpiresAtChange}
        onCancel={closeEditDialog}
        onSave={() => {
          void saveUserChanges()
        }}
      />

      <UserEmailDialog
        open={emailDialog.isOpen}
        user={emailDialog.item}
        onClose={emailDialog.close}
        onSaved={handleEmailSaved}
      />

      <AlertDialog
        open={disableDialog.isOpen}
        onOpenChange={(open) => !open && disableDialog.close()}
      >
        <ConfirmAlertShell
          title={
            disableDialog.item?.isDisabled
              ? t("users.enableUserTitle")
              : t("users.disableUserTitle")
          }
          description={
            disableDialog.item?.isDisabled
              ? t("users.enableUserDescription", {
                  name: disableDialog.item?.name ?? "",
                })
              : t("users.disableUserDescription", {
                  name: disableDialog.item?.name ?? "",
                })
          }
          cancelLabel={t("common.cancel")}
          confirmLabel={
            disableDialog.isLoading
              ? t("common.saving")
              : disableDialog.item?.isDisabled
                ? t("users.enableUser")
                : t("users.disableUser")
          }
          isLoading={disableDialog.isLoading}
          onConfirm={() => {
            void handleToggleUserDisabled()
          }}
        />
      </AlertDialog>

      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && deleteDialog.close()}
      >
        <ConfirmAlertShell
          title={t("users.deleteUserTitle")}
          description={
            deleteDialog.item?.missingInJellyfin
              ? t("users.deleteStaleUserDescription", {
                  name: deleteDialog.item?.name ?? "",
                })
              : t("users.deleteUserDescription", {
                  name: deleteDialog.item?.name ?? "",
                })
          }
          cancelLabel={t("common.cancel")}
          confirmLabel={
            deleteDialog.isLoading ? t("common.deleting") : t("common.delete")
          }
          isLoading={deleteDialog.isLoading}
          onConfirm={() => {
            void handleDeleteUser()
          }}
          destructive
        />
      </AlertDialog>
    </div>
  )
}
