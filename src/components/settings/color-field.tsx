"use client"

import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { isHexColor, normalizeHexColor } from "@/lib/branding"
import { useTranslations } from "@/lib/i18n"

interface ColorFieldProps {
  id: string
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
}

export function ColorField({
  id,
  label,
  description,
  value,
  onChange,
}: ColorFieldProps) {
  const t = useTranslations()
  const valid = isHexColor(value)

  return (
    <Field data-invalid={!valid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          className="border-input h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
          value={valid ? normalizeHexColor(value) : "#000000"}
          onChange={(event) => onChange(normalizeHexColor(event.target.value))}
        />
        <Input
          id={id}
          value={value}
          className="max-w-[140px] font-mono"
          aria-invalid={!valid}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {description && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
      {!valid && (
        <p className="text-destructive text-xs">
          {t("settings.emailInvalidColor")}
        </p>
      )}
    </Field>
  )
}
