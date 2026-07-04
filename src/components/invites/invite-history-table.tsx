"use client"

import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useCallback, useEffect, useMemo } from "react"
import { toast } from "sonner"

import { DashboardTabSearch } from "@/components/dashboard/dashboard-tab-search"
import { DashboardTabToolbar } from "@/components/dashboard/dashboard-tab-toolbar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import { RelativeTime } from "@/components/ui/relative-time"
import { Spinner } from "@/components/ui/spinner"
import { createAppStore } from "@/hooks/store-utils"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type {
  InviteHistoryItemDto,
  PagedInviteHistoryDto,
} from "@/lib/api/contracts/admin"
import { useLocale, useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { getInitials } from "@/lib/utils"

interface InviteHistoryTableProps {
  initialPage: PagedInviteHistoryDto
  initialQuery: string
  initialError?: string | null
}

interface InviteHistoryTableState {
  page: PagedInviteHistoryDto
  error: string | null
  isLoading: boolean
  query: string
  setPage: (page: PagedInviteHistoryDto) => void
  setError: (error: string | null) => void
  setIsLoading: (isLoading: boolean) => void
  setQuery: (query: string) => void
}

type TranslationFn = ReturnType<typeof useTranslations>

function createInviteHistoryColumns(
  t: TranslationFn,
  locale: string,
): ColumnDef<InviteHistoryItemDto>[] {
  return [
    {
      accessorKey: "userName",
      header: t("nav.users"),
      size: 220,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            {row.original.avatarUrl && (
              <AvatarImage
                src={row.original.avatarUrl}
                alt={row.original.userName}
              />
            )}
            <AvatarFallback>
              {getInitials(row.original.userName)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate font-medium">{row.original.userName}</span>
        </div>
      ),
    },
    {
      accessorKey: "invite",
      header: t("invites.title"),
      size: 280,
      cell: ({ row }) => (
        <span className="truncate font-mono">{row.original.inviteCode}</span>
      ),
    },
    {
      accessorKey: "usedAt",
      header: t("invites.used"),
      size: 160,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          <RelativeTime date={row.original.usedAt} locale={locale} />
        </span>
      ),
    },
  ]
}

export function InviteHistoryTable({
  initialPage,
  initialQuery,
  initialError = null,
}: InviteHistoryTableProps) {
  const navigate = useNavigate()
  const locale = useLocale()
  const t = useTranslations()
  const scopedStore = useScopedStore(() =>
    createAppStore<InviteHistoryTableState>((set) => ({
      page: initialPage,
      error: initialError,
      isLoading: false,
      query: initialQuery,
      setPage: (page) => set({ page }),
      setError: (error) => set({ error }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setQuery: (query) => set({ query }),
    })),
  )
  const page = useStore(scopedStore, (state) => state.page)
  const error = useStore(scopedStore, (state) => state.error)
  const loading = useStore(scopedStore, (state) => state.isLoading)
  const query = useStore(scopedStore, (state) => state.query)

  useEffect(() => {
    scopedStore.getState().setPage(initialPage)
    scopedStore.getState().setQuery(initialQuery)
    scopedStore.getState().setError(initialError)
  }, [initialError, initialPage, initialQuery, scopedStore])

  const loadHistory = useCallback(
    async (showToast: boolean): Promise<void> => {
      scopedStore.getState().setIsLoading(true)
      scopedStore.getState().setError(null)

      try {
        const client = getBrowserORPCClient()
        const currentPage = scopedStore.getState().page
        const currentQuery = scopedStore.getState().query
        const result = await runApiEffect(
          client.admin.invites.history({
            page: currentPage.page,
            pageSize: currentPage.pageSize,
            query: currentQuery || undefined,
            sort: "usedAt",
            direction: "desc",
          }),
        )
        if (result.error !== null || !result.data) {
          const message = t("invites.historyFetchFailed")
          scopedStore.getState().setError(message)
          if (showToast) {
            toast.error(message)
          }
          return
        }
        scopedStore.getState().setPage(result.data)
      } finally {
        scopedStore.getState().setIsLoading(false)
      }
    },
    [scopedStore, t],
  )

  const columns = useMemo(
    () => createInviteHistoryColumns(t, locale),
    [locale, t],
  )

  const navigateToHistoryPage = useCallback(
    (nextPage: number, nextQuery: string) => {
      scopedStore.getState().setQuery(nextQuery)
      void navigate({
        to: "/dashboard/history",
        search: {
          page: nextPage,
          pageSize: scopedStore.getState().page.pageSize,
          query: nextQuery || undefined,
          sort: "usedAt",
          direction: "desc",
        },
        replace: true,
      })
    },
    [navigate, scopedStore],
  )

  const handleSearchChange = useCallback(
    (nextQuery: string) => {
      navigateToHistoryPage(1, nextQuery)
    },
    [navigateToHistoryPage],
  )

  const handlePreviousPage = useCallback(() => {
    navigateToHistoryPage(Math.max(page.page - 1, 1), query)
  }, [navigateToHistoryPage, page.page, query])

  const handleNextPage = useCallback(() => {
    navigateToHistoryPage(Math.min(page.page + 1, page.pageCount), query)
  }, [navigateToHistoryPage, page.page, page.pageCount, query])

  const items = page.items
  const pageCount = Math.max(page.pageCount, 1)
  const canGoPrevious = page.page > 1
  const canGoNext = page.page < page.pageCount
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  const rows = table.getRowModel().rows

  if (loading && items.length === 0) {
    return <Spinner centered />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button variant="outline" onClick={() => void loadHistory(true)}>
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
            placeholder={t("invites.searchHistoryPlaceholder")}
            value={query}
            onChange={handleSearchChange}
          />
        }
      />

      <div className="space-y-2 md:hidden">
        {rows.length ? (
          rows.map((row) => {
            const usage = row.original

            return (
              <div
                key={usage.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {usage.avatarUrl && (
                    <AvatarImage src={usage.avatarUrl} alt={usage.userName} />
                  )}
                  <AvatarFallback>{getInitials(usage.userName)}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-none font-medium">
                    {usage.userName}
                  </p>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                    <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
                      {usage.inviteCode}
                    </span>
                  </div>
                </div>

                <span className="text-muted-foreground shrink-0 text-xs">
                  <RelativeTime date={usage.usedAt} locale={locale} />
                </span>
              </div>
            )
          })
        ) : (
          <div className="text-muted-foreground rounded-md border p-6 text-center text-sm">
            {t("invites.noHistoryFound")}
          </div>
        )}
      </div>

      <DataTable table={table} emptyLabel={t("invites.noHistoryFound")} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          {page.total === 1
            ? t("invites.usageCountSingle", { count: page.total })
            : t("invites.usageCountPlural", { count: page.total })}
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
            {page.page} / {pageCount}
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
    </div>
  )
}
