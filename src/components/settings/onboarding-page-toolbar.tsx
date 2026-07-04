"use client"

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { StateUpdater } from "@/hooks/store-utils"
import { useTranslations } from "@/lib/i18n"

export function OnboardingPageToolbar({
  t,
  activePageIndex,
  pagesLength,
  setActivePageIndex,
  movePage,
  removePage,
  addPage,
}: {
  t: ReturnType<typeof useTranslations>
  activePageIndex: number
  pagesLength: number
  setActivePageIndex: (activePageIndex: StateUpdater<number>) => void
  movePage: (pageIndex: number, direction: "up" | "down") => void
  removePage: (pageIndex: number) => void
  addPage: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <h4 className="font-medium">{t("settings.memberOnboardingPages")}</h4>

      <div className="flex items-center gap-0.5">
        {pagesLength > 1 && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                setActivePageIndex((prev) => Math.max(0, prev - 1))
              }
              disabled={activePageIndex === 0}
              aria-label={t("invites.onboardingBack")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground min-w-[3ch] text-center text-xs tabular-nums">
              {activePageIndex + 1}/{pagesLength}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                setActivePageIndex((prev) =>
                  Math.min(pagesLength - 1, prev + 1),
                )
              }
              disabled={activePageIndex === pagesLength - 1}
              aria-label={t("invites.onboardingNext")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Separator orientation="vertical" className="mx-0.5 h-5" />

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => movePage(activePageIndex, "up")}
              disabled={activePageIndex === 0}
              aria-label={t("settings.memberOnboardingMoveUp")}
              title={t("settings.memberOnboardingMoveUp")}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => movePage(activePageIndex, "down")}
              disabled={activePageIndex === pagesLength - 1}
              aria-label={t("settings.memberOnboardingMoveDown")}
              title={t("settings.memberOnboardingMoveDown")}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>

            <Separator orientation="vertical" className="mx-0.5 h-5" />
          </>
        )}

        {pagesLength >= 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => removePage(activePageIndex)}
            aria-label={t("settings.memberOnboardingDeletePage")}
            title={t("settings.memberOnboardingDeletePage")}
          >
            <Trash2 className="text-destructive h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={addPage}
          aria-label={t("settings.memberOnboardingAddPage")}
          title={t("settings.memberOnboardingAddPage")}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
