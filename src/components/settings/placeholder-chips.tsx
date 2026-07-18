"use client"

import { Button } from "@/components/ui/button"
import { useTranslations, type Messages } from "@/lib/i18n"
import { formatPlaceholder } from "@/lib/placeholders"

export type PlaceholderKey = keyof Messages["placeholders"] & string

interface PlaceholderChipsProps {
  placeholderKeys: readonly PlaceholderKey[]
  onInsert: (token: string) => void
}

export function PlaceholderChips({
  placeholderKeys,
  onInsert,
}: PlaceholderChipsProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">
        {t("settings.emailMessagePlaceholders")}
      </span>
      {placeholderKeys.map((key) => (
        <Button
          key={key}
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 font-mono text-xs"
          title={t(`placeholders.${key}`)}
          tabIndex={-1}
          onClick={() => onInsert(formatPlaceholder(key))}
        >
          {formatPlaceholder(key)}
        </Button>
      ))}
    </div>
  )
}
