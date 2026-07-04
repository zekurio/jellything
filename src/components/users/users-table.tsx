"use client"

import { DashboardTabSearch } from "@/components/dashboard/dashboard-tab-search"
import { DashboardTabToolbar } from "@/components/dashboard/dashboard-tab-toolbar"
import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { Spinner } from "@/components/ui/spinner"
import { UserEditDialog } from "@/components/users/user-edit-dialog"
import { UserEmailDialog } from "@/components/users/user-email-dialog"
import { UsersBulkActionBar } from "@/components/users/users-bulk-action-bar"
import { UsersDesktopTable } from "@/components/users/users-desktop-table"
import { UsersMobileList } from "@/components/users/users-mobile-list"

import { useUsersTable, type UsersPayload } from "./use-users-table"

export type { UsersPayload }

interface UsersTableProps {
  initialData: UsersPayload
  initialQuery: string
  initialError?: string | null
}

export function UsersTable({
  initialData,
  initialQuery,
  initialError = null,
}: UsersTableProps) {
  const {
    t,
    users,
    profiles,
    seerrConfigured,
    error,
    isLoading,
    query,
    dialogUser,
    isDialogOpen,
    selectedProfileId,
    editExpiresAt,
    isSaving,
    refetch,
    table,
    visibleUsers,
    visibleUserCount,
    pageCount,
    canGoPrevious,
    canGoNext,
    selectedUsers,
    isProfileLocked,
    isExpiryLocked,
    profileDescription,
    emailDialog,
    disableDialog,
    deleteDialog,
    openEditDialog,
    closeEditDialog,
    handleSyncUserToSeerr,
    handleDialogOpenChange,
    saveUserChanges,
    handleToggleUserDisabled,
    handleDeleteUser,
    handleBulkOperation,
    handleGlobalFilterChange,
    handlePreviousPage,
    handleNextPage,
    clearRowSelection,
    getUserRowClassName,
    getUserCellClassName,
    handleSelectedProfileIdChange,
    handleEditExpiresAtChange,
    handleEmailSaved,
  } = useUsersTable({ initialData, initialQuery, initialError })

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
        <DataTablePagination
          page={users.page}
          pageCount={pageCount}
          canPrevious={canGoPrevious}
          canNext={canGoNext}
          onPrevious={handlePreviousPage}
          onNext={handleNextPage}
        />
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
