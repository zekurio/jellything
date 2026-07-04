"use client"

import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit,
  Plus,
  Trash,
  Tv,
  Users,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo } from "react"
import { toast } from "sonner"

import { DashboardTabSearch } from "@/components/dashboard/dashboard-tab-search"
import { DashboardTabToolbar } from "@/components/dashboard/dashboard-tab-toolbar"
import { InviteFormDialog } from "@/components/invites/invite-form-dialog"
import { ConfirmAlertShell } from "@/components/shared/confirm-alert-shell"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { RelativeTime } from "@/components/ui/relative-time"
import { Spinner } from "@/components/ui/spinner"
import { createAppStore } from "@/hooks/store-utils"
import { useDialogAction, useSimpleDialog } from "@/hooks/use-dialog-action"
import { useInvitesTableStore } from "@/hooks/use-invites-table-store"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type {
  InviteDto,
  PagedInvitesDto,
  ProfileDto,
} from "@/lib/api/contracts/admin"
import { toErrorCode } from "@/lib/api/error-code"
import { getApiErrorCode } from "@/lib/api/error-message"
import { reportClientError } from "@/lib/client-error"
import { resolveErrorKey, useLocale, useTranslations } from "@/lib/i18n"
import type { InviteGroup } from "@/lib/invite-status"
import { classifyInviteStatus, deriveInviteStatus } from "@/lib/invite-status"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { cn } from "@/lib/utils"

interface InvitesGridProps {
  initialInvites: PagedInvitesDto
  initialQuery: string
  availableProfiles: ProfileDto[]
  initialError?: string | null
}

interface InvitesGridState {
  invites: PagedInvitesDto
  availableProfiles: ProfileDto[]
  error: string | null
  isLoading: boolean
  query: string
  setInvites: (invites: PagedInvitesDto) => void
  setAvailableProfiles: (availableProfiles: ProfileDto[]) => void
  setError: (error: string | null) => void
  setIsLoading: (isLoading: boolean) => void
  setQuery: (query: string) => void
}

function getStatusAccent(status: InviteDto["status"]): string {
  switch (status) {
    case "active":
      return "border-l-emerald-500"
    case "expiring":
    case "depleting":
      return "border-l-amber-500"
    case "disabled":
    case "expired":
    case "exhausted":
      return "border-l-muted-foreground/40"
    default:
      return "border-l-muted-foreground/40"
  }
}

function sortInvitesByCreatedAtDesc(invites: InviteDto[]): InviteDto[] {
  return invites.toSorted(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

function upsertInvite(
  invites: InviteDto[],
  nextInvite: InviteDto,
): InviteDto[] {
  const found = invites.some((invite) => invite.id === nextInvite.id)
  const nextInvites = found
    ? invites.map((invite) =>
        invite.id === nextInvite.id ? nextInvite : invite,
      )
    : [nextInvite, ...invites]

  return sortInvitesByCreatedAtDesc(nextInvites)
}

const InviteCard = memo(function InviteCard({
  invite,
  locale,
  t,
  onCopy,
  onEdit,
  onDisable,
  onDelete,
}: {
  invite: InviteDto
  locale: string
  t: ReturnType<typeof useTranslations>
  onCopy: (code: string) => void
  onEdit: (id: string) => void
  onDisable: (invite: InviteDto) => void
  onDelete: (invite: InviteDto) => void
}) {
  const isInactive = classifyInviteStatus(invite.status) === "inactive"

  return (
    <div
      className={cn(
        "rounded-lg border border-l-[3px] p-4",
        getStatusAccent(invite.status),
        isInactive && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium">
            {invite.code}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onCopy(invite.code)}
            aria-label={t("invites.copyInviteLink")}
            title={t("invites.copyInviteLink")}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(invite.id)}
            aria-label={t("invites.editInvite")}
            title={t("invites.editInvite")}
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDisable(invite)}
            aria-label={
              invite.isDisabled
                ? t("invites.enableInvite")
                : t("invites.disableInvite")
            }
            title={
              invite.isDisabled
                ? t("invites.enableInvite")
                : t("invites.disableInvite")
            }
          >
            <Ban className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 w-7"
            onClick={() => onDelete(invite)}
            aria-label={t("invites.deleteInvite")}
            title={t("invites.deleteInvite")}
          >
            <Trash className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1 tabular-nums">
          <Users className="size-3 shrink-0" />
          {invite.useCount}
          {invite.useLimit !== null ? ` / ${invite.useLimit}` : " / \u221E"}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-3 shrink-0" />
          {invite.expiresAt ? (
            <RelativeTime date={invite.expiresAt} locale={locale} />
          ) : (
            t("common.never")
          )}
        </span>
        {invite.profileName && (
          <span className="flex min-w-0 items-center gap-1">
            <Tv className="size-3 shrink-0" />
            <span className="truncate">{invite.profileName}</span>
          </span>
        )}
      </div>
    </div>
  )
})

const InviteSection = memo(function InviteSection({
  title,
  invites,
  locale,
  t,
  onCopy,
  onEdit,
  onDisable,
  onDelete,
}: {
  title: string
  invites: InviteDto[]
  locale: string
  t: ReturnType<typeof useTranslations>
  onCopy: (code: string) => void
  onEdit: (id: string) => void
  onDisable: (invite: InviteDto) => void
  onDelete: (invite: InviteDto) => void
}) {
  if (invites.length === 0) return null

  return (
    <div>
      <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
        {title} ({invites.length})
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {invites.map((invite) => (
          <InviteCard
            key={invite.id}
            invite={invite}
            locale={locale}
            t={t}
            onCopy={onCopy}
            onEdit={onEdit}
            onDisable={onDisable}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
})

export function InvitesGrid({
  initialInvites,
  initialQuery,
  availableProfiles,
  initialError = null,
}: InvitesGridProps) {
  const navigate = useNavigate()
  const locale = useLocale()
  const t = useTranslations()
  const scopedStore = useScopedStore(() =>
    createAppStore<InvitesGridState>((set) => ({
      invites: initialInvites,
      availableProfiles,
      error: initialError,
      isLoading: false,
      query: initialQuery,
      setInvites: (invites) => set({ invites }),
      setAvailableProfiles: (nextProfiles) =>
        set({ availableProfiles: nextProfiles }),
      setError: (error) => set({ error }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setQuery: (query) => set({ query }),
    })),
  )
  const invitePage = useStore(scopedStore, (state) => state.invites)
  const profiles = useStore(scopedStore, (state) => state.availableProfiles)
  const error = useStore(scopedStore, (state) => state.error)
  const isLoading = useStore(scopedStore, (state) => state.isLoading)
  const query = useStore(scopedStore, (state) => state.query)

  const createDialog = useSimpleDialog()
  const editInviteId = useInvitesTableStore((state) => state.editInviteId)
  const setEditInviteId = useInvitesTableStore((state) => state.setEditInviteId)
  const deleteDialog = useDialogAction<InviteDto>({
    onSuccess: () => {
      void refetch()
    },
  })
  const disableDialog = useDialogAction<InviteDto, InviteDto>({
    onSuccess: () => {
      void refetch()
    },
    successMessage: (invite) =>
      invite.isDisabled
        ? t("invites.inviteDisabledSuccess")
        : t("invites.inviteEnabled"),
    errorMessage: t("invites.inviteDisableFailed"),
  })

  useEffect(() => {
    scopedStore.getState().setInvites(initialInvites)
    scopedStore.getState().setAvailableProfiles(availableProfiles)
    scopedStore.getState().setQuery(initialQuery)
    scopedStore.getState().setError(initialError)
  }, [
    availableProfiles,
    initialError,
    initialInvites,
    initialQuery,
    scopedStore,
  ])

  const invites = invitePage.items

  const editingInvite = useMemo(
    () => invites.find((invite) => invite.id === editInviteId) ?? null,
    [editInviteId, invites],
  )

  const refetch = useCallback(async () => {
    scopedStore.getState().setIsLoading(true)
    scopedStore.getState().setError(null)

    try {
      const client = getBrowserORPCClient()
      const currentInvites = scopedStore.getState().invites
      const currentQuery = scopedStore.getState().query
      const pageResult = await runApiEffect(
        client.admin.invites.page({
          page: currentInvites.page,
          pageSize: currentInvites.pageSize,
          query: currentQuery || undefined,
          sort: "createdAt",
          direction: "desc",
        }),
      )

      if (pageResult.error !== null || !pageResult.data) {
        scopedStore.getState().setError(t("invites.inviteLoadFailed"))
        return
      }

      scopedStore.getState().setInvites(pageResult.data.invites)
      scopedStore
        .getState()
        .setAvailableProfiles(
          Array.from(pageResult.data.profileOptions as ProfileDto[]),
        )
    } finally {
      scopedStore.getState().setIsLoading(false)
    }
  }, [scopedStore, t])

  const setInvitesState = useCallback(
    (updater: (current: InviteDto[]) => InviteDto[]): InviteDto[] => {
      const previousPage = scopedStore.getState().invites
      scopedStore
        .getState()
        .setInvites({ ...previousPage, items: updater(previousPage.items) })
      return previousPage.items
    },
    [scopedStore],
  )

  const handleInviteSaved = useCallback(
    (savedInvite: InviteDto) => {
      setInvitesState((current) => upsertInvite(current, savedInvite))
      void refetch()
    },
    [refetch, setInvitesState],
  )

  const copyInviteLink = useCallback(
    async (code: string) => {
      const url = `${window.location.origin}/invite/${code}`
      try {
        await navigator.clipboard.writeText(url)
        toast.success(t("invites.inviteLinkCopied"))
      } catch (err) {
        reportClientError(err)
        toast.error(t("invites.inviteLinkCopyFailed"))
      }
    },
    [t],
  )

  const handleCopyInviteLink = useCallback(
    (code: string) => {
      void copyInviteLink(code)
    },
    [copyInviteLink],
  )

  const handleEditInvite = useCallback(
    (id: string) => {
      setEditInviteId(id)
    },
    [setEditInviteId],
  )

  const navigateToInvitesPage = useCallback(
    (nextPage: number, nextQuery: string) => {
      scopedStore.getState().setQuery(nextQuery)
      void navigate({
        to: "/dashboard/invites",
        search: {
          page: nextPage,
          pageSize: scopedStore.getState().invites.pageSize,
          query: nextQuery || undefined,
          sort: "createdAt",
          direction: "desc",
        },
        replace: true,
      })
    },
    [navigate, scopedStore],
  )

  const handleSearchChange = useCallback(
    (nextQuery: string) => {
      navigateToInvitesPage(1, nextQuery)
    },
    [navigateToInvitesPage],
  )

  const handlePreviousPage = useCallback(() => {
    navigateToInvitesPage(Math.max(invitePage.page - 1, 1), query)
  }, [invitePage.page, navigateToInvitesPage, query])

  const handleNextPage = useCallback(() => {
    navigateToInvitesPage(
      Math.min(invitePage.page + 1, invitePage.pageCount),
      query,
    )
  }, [invitePage.page, invitePage.pageCount, navigateToInvitesPage, query])

  const pageCount = Math.max(invitePage.pageCount, 1)
  const canGoPrevious = invitePage.page > 1
  const canGoNext = invitePage.page < invitePage.pageCount

  const { active, attention, inactive } = useMemo(() => {
    const groups: Record<InviteGroup, InviteDto[]> = {
      active: [],
      attention: [],
      inactive: [],
    }
    for (const invite of invites) {
      groups[classifyInviteStatus(invite.status)].push(invite)
    }
    return groups
  }, [invites])

  const totalVisible = invitePage.total

  const handleDelete = () => {
    const invite = deleteDialog.item
    if (!invite) {
      return
    }

    void deleteDialog.execute(async () => {
      const previousInvites = setInvitesState((current) =>
        current.filter((currentInvite) => currentInvite.id !== invite.id),
      )
      const client = getBrowserORPCClient()
      try {
        const result = await runApiEffect(
          client.admin.invites.delete({ inviteId: invite.id }),
        )
        if (result.error !== null) {
          throw new Error(t("invites.inviteDeleteFailed"))
        }
        toast.success(t("invites.inviteDeleted"))
      } catch (err) {
        const currentPage = scopedStore.getState().invites
        scopedStore.getState().setInvites({
          ...currentPage,
          items: previousInvites,
        })
        throw err
      }
    })
  }

  if (isLoading && invites.length === 0) {
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

  const sharedCardProps = {
    locale,
    t,
    onCopy: handleCopyInviteLink,
    onEdit: handleEditInvite,
    onDisable: disableDialog.open,
    onDelete: deleteDialog.open,
  }

  return (
    <div className="space-y-4">
      <DashboardTabToolbar
        search={
          <DashboardTabSearch
            placeholder={t("invites.searchInvitesPlaceholder")}
            value={query}
            onChange={handleSearchChange}
          />
        }
        actions={
          <Button onClick={createDialog.open} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            {t("invites.createInvite")}
          </Button>
        }
      />

      {invites.length === 0 ? (
        <div className="text-muted-foreground rounded-md border p-6 text-center text-sm">
          {t("invites.noInvitesFound")}
        </div>
      ) : (
        <div className="space-y-6">
          <InviteSection
            title={t("invites.sectionActive")}
            invites={active}
            {...sharedCardProps}
          />
          <InviteSection
            title={t("invites.sectionAttention")}
            invites={attention}
            {...sharedCardProps}
          />
          <InviteSection
            title={t("invites.sectionInactive")}
            invites={inactive}
            {...sharedCardProps}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          {totalVisible === 1
            ? t("invites.inviteCountSingle", { count: totalVisible })
            : t("invites.inviteCountPlural", { count: totalVisible })}
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
            {invitePage.page} / {pageCount}
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

      <InviteFormDialog
        key={`create-${createDialog.isOpen ? "open" : "closed"}`}
        open={createDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            createDialog.close()
          }
        }}
        availableProfiles={profiles}
        onSaveComplete={(savedInvite) => {
          createDialog.close()
          handleInviteSaved(savedInvite)
        }}
      />

      <InviteFormDialog
        key={`edit-${editInviteId ?? "none"}-${editInviteId ? "open" : "closed"}`}
        open={Boolean(editInviteId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditInviteId(null)
          }
        }}
        invite={editingInvite}
        availableProfiles={profiles}
        onSaveComplete={(savedInvite) => {
          setEditInviteId(null)
          handleInviteSaved(savedInvite)
        }}
      />

      <AlertDialog
        open={disableDialog.isOpen}
        onOpenChange={(open) => !open && disableDialog.close()}
      >
        <ConfirmAlertShell
          title={
            disableDialog.item?.isDisabled
              ? t("invites.enableInviteTitle")
              : t("invites.disableInviteTitle")
          }
          description={
            disableDialog.item?.isDisabled
              ? t("invites.enableInviteDescription", {
                  label: disableDialog.item?.code || "",
                })
              : t("invites.disableInviteDescription", {
                  label: disableDialog.item?.code || "",
                })
          }
          cancelLabel={t("common.cancel")}
          confirmLabel={
            disableDialog.isLoading
              ? t("common.saving")
              : disableDialog.item?.isDisabled
                ? t("invites.enableInvite")
                : t("invites.disableInvite")
          }
          isLoading={disableDialog.isLoading}
          onConfirm={() => {
            const invite = disableDialog.item
            if (!invite) {
              return
            }

            void disableDialog.execute(async () => {
              const nextIsDisabled = !invite.isDisabled
              const previousInvites = setInvitesState((current) =>
                current.map((currentInvite) => {
                  if (currentInvite.id !== invite.id) {
                    return currentInvite
                  }

                  const nextInvite = {
                    ...currentInvite,
                    isDisabled: nextIsDisabled,
                  }

                  return {
                    ...nextInvite,
                    status: deriveInviteStatus(nextInvite),
                  }
                }),
              )
              const client = getBrowserORPCClient()
              try {
                const result = await runApiEffect(
                  client.admin.invites.update({
                    inviteId: invite.id,
                    updates: { isDisabled: nextIsDisabled },
                  }),
                )

                if (result.error !== null || !result.data) {
                  throw new Error(
                    t(
                      resolveErrorKey(
                        toErrorCode(
                          getApiErrorCode(result.error) ?? "internal_error",
                        ),
                      ),
                    ),
                  )
                }

                const updatedInvite = result.data
                setInvitesState((current) =>
                  upsertInvite(current, updatedInvite),
                )
                return updatedInvite
              } catch (err) {
                const currentPage = scopedStore.getState().invites
                scopedStore.getState().setInvites({
                  ...currentPage,
                  items: previousInvites,
                })
                throw err
              }
            })
          }}
        />
      </AlertDialog>

      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && deleteDialog.close()}
      >
        <ConfirmAlertShell
          title={t("invites.deleteInviteTitle")}
          description={t("invites.deleteInviteDescription", {
            label: deleteDialog.item?.code || "",
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
