"use client"

import { Ban, CheckCircle2, Edit, RefreshCw, Trash } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { BulkActionBar } from "@/components/shared/bulk-action-bar"
import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { UserEditDialog } from "@/components/users/user-edit-dialog"
import type {
  ManagedUserListItemDto,
  UserProfileOptionDto,
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
  selectedUsers: ManagedUserListItemDto[]
  profiles: UserProfileOptionDto[]
  seerrConfigured: boolean
  t: TranslationFn
  onBulkOperation: (
    operation: BulkOperation,
    users: ManagedUserListItemDto[],
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

  const barActions = useMemo(
    () => [
      ...(eligibleForEdit.length > 0
        ? [
            {
              key: "edit",
              label: t("users.editUser"),
              icon: Edit,
              onClick: openEditDialog,
            },
          ]
        : []),
      ...(eligibleForDisable.length > 0
        ? [
            {
              key: "disable",
              label: t("users.bulkDisable"),
              icon: Ban,
              onClick: openDisableConfirm,
            },
          ]
        : []),
      ...(eligibleForEnable.length > 0
        ? [
            {
              key: "enable",
              label: t("users.bulkEnable"),
              icon: CheckCircle2,
              onClick: openEnableConfirm,
            },
          ]
        : []),
      ...(seerrConfigured
        ? [
            {
              key: "syncSeerr",
              label: t("users.bulkSyncSeerr"),
              icon: RefreshCw,
              onClick: openSyncSeerrConfirm,
            },
          ]
        : []),
      {
        key: "delete",
        label: t("users.bulkDelete"),
        icon: Trash,
        onClick: openDeleteConfirm,
        destructive: true,
      },
    ],
    [
      eligibleForDisable.length,
      eligibleForEdit.length,
      eligibleForEnable.length,
      openDeleteConfirm,
      openDisableConfirm,
      openEditDialog,
      openEnableConfirm,
      openSyncSeerrConfirm,
      seerrConfigured,
      t,
    ],
  )

  if (count === 0) return null

  return (
    <>
      <BulkActionBar
        label={t("users.bulkSelectedCount", { count })}
        actions={barActions}
        clearLabel={t("common.close")}
        onClear={onClearSelection}
      />

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
