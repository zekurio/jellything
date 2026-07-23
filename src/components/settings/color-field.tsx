"use client"

import { useEffect, useRef } from "react"

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
  const swatchRef = useRef<HTMLInputElement>(null)
  const lastPickedRef = useRef<string | null>(null)
  const swatchValue = valid ? normalizeHexColor(value) : "#000000"

  // The swatch stays uncontrolled during picker sessions: writing its value
  // while Chrome's picker is open kills the session, which breaks the
  // eyedropper and leaves a stale modal popup. Only sync values that did not
  // originate from the picker itself (hex input, reset, save).
  useEffect(() => {
    const swatch = swatchRef.current
    if (swatch && lastPickedRef.current !== swatchValue) {
      swatch.value = swatchValue
    }
  }, [swatchValue])

  return (
    <Field data-invalid={!valid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          ref={swatchRef}
          type="color"
          aria-label={label}
          className="border-input h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
          defaultValue={swatchValue}
          onChange={(event) => {
            const picked = normalizeHexColor(event.target.value)
            lastPickedRef.current = picked
            onChange(picked)
          }}
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
