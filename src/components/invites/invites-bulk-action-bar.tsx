"use client"

import { Ban, CheckCircle2, Trash } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { BulkActionBar } from "@/components/shared/bulk-action-bar"
import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { AlertDialog } from "@/components/ui/alert-dialog"
import type {
  BulkInviteOperationDto,
  InviteDto,
} from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"

type TranslationFn = ReturnType<typeof useTranslations>

type InvitesBulkActionBarProps = {
  selectedInvites: InviteDto[]
  t: TranslationFn
  onBulkOperation: (
    operation: BulkInviteOperationDto,
    invites: InviteDto[],
  ) => Promise<void>
  onClearSelection: () => void
}

export function InvitesBulkActionBar({
  selectedInvites,
  t,
  onBulkOperation,
  onClearSelection,
}: InvitesBulkActionBarProps) {
  const [activeConfirm, setActiveConfirm] =
    useState<BulkInviteOperationDto | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const count = selectedInvites.length

  const eligibleForDisable = useMemo(
    () => selectedInvites.filter((invite) => !invite.isDisabled),
    [selectedInvites],
  )
  const eligibleForEnable = useMemo(
    () => selectedInvites.filter((invite) => invite.isDisabled),
    [selectedInvites],
  )

  const executeConfirm = useCallback(
    async (operation: BulkInviteOperationDto) => {
      const targets =
        operation === "disable"
          ? eligibleForDisable
          : operation === "enable"
            ? eligibleForEnable
            : selectedInvites

      setIsLoading(true)
      try {
        await onBulkOperation(operation, targets)
      } finally {
        setIsLoading(false)
        setActiveConfirm(null)
      }
    },
    [eligibleForDisable, eligibleForEnable, onBulkOperation, selectedInvites],
  )

  const closeConfirmIfClosed = useCallback((open: boolean) => {
    if (!open) {
      setActiveConfirm(null)
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

  const barActions = useMemo(
    () => [
      ...(eligibleForDisable.length > 0
        ? [
            {
              key: "disable",
              label: t("invites.bulkDisable"),
              icon: Ban,
              onClick: openDisableConfirm,
            },
          ]
        : []),
      ...(eligibleForEnable.length > 0
        ? [
            {
              key: "enable",
              label: t("invites.bulkEnable"),
              icon: CheckCircle2,
              onClick: openEnableConfirm,
            },
          ]
        : []),
      {
        key: "delete",
        label: t("common.delete"),
        icon: Trash,
        onClick: openDeleteConfirm,
        destructive: true,
      },
    ],
    [
      eligibleForDisable.length,
      eligibleForEnable.length,
      openDeleteConfirm,
      openDisableConfirm,
      openEnableConfirm,
      t,
    ],
  )

  if (count === 0) return null

  return (
    <>
      <BulkActionBar
        label={t("common.selectedCount", { count })}
        actions={barActions}
        clearLabel={t("common.close")}
        onClear={onClearSelection}
      />

      <AlertDialog
        open={activeConfirm === "disable"}
        onOpenChange={closeConfirmIfClosed}
      >
        <ConfirmAlertShell
          title={t("invites.bulkDisableTitle")}
          description={t("invites.bulkDisableDescription", {
            count: eligibleForDisable.length,
          })}
          cancelLabel={t("common.cancel")}
          confirmLabel={
            isLoading ? t("common.saving") : t("invites.bulkDisable")
          }
          isLoading={isLoading}
          onConfirm={() => void executeConfirm("disable")}
        />
      </AlertDialog>

      <AlertDialog
        open={activeConfirm === "enable"}
        onOpenChange={closeConfirmIfClosed}
      >
        <ConfirmAlertShell
          title={t("invites.bulkEnableTitle")}
          description={t("invites.bulkEnableDescription", {
            count: eligibleForEnable.length,
          })}
          cancelLabel={t("common.cancel")}
          confirmLabel={
            isLoading ? t("common.saving") : t("invites.bulkEnable")
          }
          isLoading={isLoading}
          onConfirm={() => void executeConfirm("enable")}
        />
      </AlertDialog>

      <AlertDialog
        open={activeConfirm === "delete"}
        onOpenChange={closeConfirmIfClosed}
      >
        <ConfirmAlertShell
          title={t("invites.bulkDeleteTitle")}
          description={t("invites.bulkDeleteDescription", { count })}
          cancelLabel={t("common.cancel")}
          confirmLabel={isLoading ? t("common.deleting") : t("common.delete")}
          isLoading={isLoading}
          onConfirm={() => void executeConfirm("delete")}
          destructive
        />
      </AlertDialog>
    </>
  )
}
