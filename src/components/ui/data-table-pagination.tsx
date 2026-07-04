"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTranslations } from "@/lib/i18n"

interface DataTablePaginationProps {
  page: number
  pageCount: number
  canPrevious: boolean
  canNext: boolean
  onPrevious: () => void
  onNext: () => void
}

export function DataTablePagination({
  page,
  pageCount,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
}: DataTablePaginationProps) {
  const t = useTranslations()

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={onPrevious}
        disabled={!canPrevious}
        aria-label={t("common.previousPage")}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-muted-foreground min-w-16 text-center text-xs tabular-nums">
        {page} / {pageCount}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={onNext}
        disabled={!canNext}
        aria-label={t("common.nextPage")}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
