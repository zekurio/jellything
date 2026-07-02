"use client"

import { Ban, CheckCircle2, Edit, RefreshCw, Trash, X } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { UserEditDialog } from "@/components/users/user-edit-dialog"
import type {
  ManagedUserListItemDto as ManagedUserListItem,
  UserProfileOptionDto as UserProfileOption,
} from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"

type TranslationFn = ReturnType<typeof useTranslations>

type BulkOperation =
  | "assignProfile"
  | "disable"
  | "enable"
  | "delete"
  | "syncSeerr"

type BulkEditPayload = {
  profileId?: string
  expiresAt?: string | null
}

type UsersBulkActionBarProps = {
  selectedUsers: ManagedUserListItem[]
  profiles: UserProfileOption[]
  seerrConfigured: boolean
  t: TranslationFn
  onBulkOperation: (
    operation: BulkOperation,
    users: ManagedUserListItem[],
    payload?: BulkEditPayload,
  ) => Promise<void>
  onClearSelection: () => void
}

export type { BulkOperation, BulkEditPayload }

export function UsersBulkActionBar({
  selectedUsers,
  profiles,
  seerrConfigured,
  t,
  onBulkOperation,
  onClearSelection,
}: UsersBulkActionBarProps) {
  const [activeConfirm, setActiveConfirm] = useState<BulkOperation | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState("")
  const [editExpiresAt, setEditExpiresAt] = useState<Date | null>(null)

  const count = selectedUsers.length

  const eligibleForEdit = useMemo(
    () => selectedUsers.filter((u) => !u.isAdmin && !u.missingInJellyfin),
    [selectedUsers],
  )
  const eligibleForDisable = useMemo(
    () => selectedUsers.filter((u) => !u.isDisabled && !u.missingInJellyfin),
    [selectedUsers],
  )
  const eligibleForEnable = useMemo(
    () => selectedUsers.filter((u) => u.isDisabled && !u.missingInJellyfin),
    [selectedUsers],
  )

  const executeConfirm = useCallback(
    async (op: BulkOperation) => {
      setIsLoading(true)
      try {
        await onBulkOperation(op, selectedUsers)
      } finally {
        setIsLoading(false)
        setActiveConfirm(null)
      }
    },
    [onBulkOperation, selectedUsers],
  )

  const executeBulkEdit = useCallback(async () => {
    setIsLoading(true)
    try {
      const payload: BulkEditPayload = {}
      if (selectedProfileId) {
        payload.profileId = selectedProfileId
      }
      // Always send expiresAt so it can be set or cleared
      payload.expiresAt = editExpiresAt?.toISOString() ?? null

      await onBulkOperation("assignProfile", eligibleForEdit, payload)
    } finally {
      setIsLoading(false)
      setEditDialogOpen(false)
      setSelectedProfileId("")
      setEditExpiresAt(null)
    }
  }, [editExpiresAt, eligibleForEdit, onBulkOperation, selectedProfileId])

  const openEditDialog = useCallback(() => {
    setSelectedProfileId("")
    setEditExpiresAt(null)
    setEditDialogOpen(true)
  }, [])

  const closeEditDialog = useCallback(() => {
    setEditDialogOpen(false)
  }, [])

  const closeConfirmIfClosed = useCallback((open: boolean) => {
    if (!open) {
      setActiveConfirm(null)
    }
  }, [])

  const handleEditDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditDialogOpen(false)
    }
  }, [])

  const openDisableConfirm = useCallback(() => {
    setActiveConfirm("disable")
  }, [])

  const openEnableConfirm = useCallback(() => {
    setActiveConfirm("enable")
  }, [])

  const openDeleteConfirm = useCallback(() => {
    setActiveConfirm("delete")
  }, [])

  const openSyncSeerrConfirm = useCallback(() => {
    setActiveConfirm("syncSeerr")
  }, [])

  if (count === 0) return null

  return (
    <>
      <div className="bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2">
        <span className="mr-1 text-sm font-medium">
          {t("users.bulkSelectedCount", { count })}
        </span>

        <div className="flex items-center gap-1">
          {eligibleForEdit.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={openEditDialog}
            >
              <Edit className="h-3.5 w-3.5" />
              {t("users.editUser")}
            </Button>
          )}
          {eligibleForDisable.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={openDisableConfirm}
            >
              <Ban className="h-3.5 w-3.5" />
              {t("users.bulkDisable")}
            </Button>
          )}
          {eligibleForEnable.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={openEnableConfirm}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("users.bulkEnable")}
            </Button>
          )}
          {seerrConfigured && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={openSyncSeerrConfirm}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("users.bulkSyncSeerr")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 gap-1.5 text-xs"
            onClick={openDeleteConfirm}
          >
            <Trash className="h-3.5 w-3.5" />
            {t("users.bulkDelete")}
          </Button>
        </div>

        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClearSelection}
            aria-label={t("common.close")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Bulk edit dialog (profile + expiry) */}
      <UserEditDialog
        open={editDialogOpen}
        title={t("users.editUserTitle") + ` (${eligibleForEdit.length})`}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        editExpiresAt={editExpiresAt}
        isProfileLocked={false}
        isExpiryLocked={false}
        profileDescription={t("users.bulkAssignProfileDescription", {
          count: eligibleForEdit.length,
        })}
        isSaving={isLoading}
        t={t}
        onOpenChange={handleEditDialogOpenChange}
        onSelectedProfileIdChange={setSelectedProfileId}
        onEditExpiresAtChange={setEditExpiresAt}
        onCancel={closeEditDialog}
        onSave={() => void executeBulkEdit()}
      />

      {/* Disable confirm */}
      <AlertDialog
        open={activeConfirm === "disable"}
        onOpenChange={closeConfirmIfClosed}
      >
        <ConfirmAlertShell
          title={t("users.bulkDisableTitle")}
          description={t("users.bulkDisableDescription", {
            count: eligibleForDisable.length,
          })}
          cancelLabel={t("common.cancel")}
          confirmLabel={isLoading ? t("common.saving") : t("users.bulkDisable")}
          isLoading={isLoading}
          onConfirm={() => void executeConfirm("disable")}
        />
      </AlertDialog>

      {/* Enable confirm */}
      <AlertDialog
        open={activeConfirm === "enable"}
        onOpenChange={closeConfirmIfClosed}
      >
        <ConfirmAlertShell
          title={t("users.bulkEnableTitle")}
          description={t("users.bulkEnableDescription", {
            count: eligibleForEnable.length,
          })}
          cancelLabel={t("common.cancel")}
          confirmLabel={isLoading ? t("common.saving") : t("users.bulkEnable")}
          isLoading={isLoading}
          onConfirm={() => void executeConfirm("enable")}
        />
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={activeConfirm === "delete"}
        onOpenChange={closeConfirmIfClosed}
      >
        <ConfirmAlertShell
          title={t("users.bulkDeleteTitle")}
          description={t("users.bulkDeleteDescription", { count })}
          cancelLabel={t("common.cancel")}
          confirmLabel={
            isLoading ? t("common.deleting") : t("users.bulkDelete")
          }
          isLoading={isLoading}
          onConfirm={() => void executeConfirm("delete")}
          destructive
        />
      </AlertDialog>

      {/* Sync seerr confirm */}
      <AlertDialog
        open={activeConfirm === "syncSeerr"}
        onOpenChange={closeConfirmIfClosed}
      >
        <ConfirmAlertShell
          title={t("users.bulkSyncSeerr")}
          description={t("users.bulkAssignProfileDescription", { count })}
          cancelLabel={t("common.cancel")}
          confirmLabel={
            isLoading ? t("common.saving") : t("users.bulkSyncSeerr")
          }
          isLoading={isLoading}
          onConfirm={() => void executeConfirm("syncSeerr")}
        />
      </AlertDialog>
    </>
  )
}
