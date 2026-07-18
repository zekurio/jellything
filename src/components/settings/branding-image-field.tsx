"use client"

import { useRef, type ChangeEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  BRANDING_IMAGE_MAX_BYTES,
  type BrandingImageMimeType,
  type BrandingImageUpdate,
} from "@/lib/branding"
import { useTranslations } from "@/lib/i18n"

export interface CurrentBrandingImage {
  mimeType: BrandingImageMimeType
  width: number
  height: number
  url: string
}

interface BrandingImageFieldProps {
  label: string
  description: string
  draft: BrandingImageUpdate
  current: CurrentBrandingImage | undefined
  onChange: (update: BrandingImageUpdate) => void
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result
      if (typeof dataUrl !== "string") {
        reject(new Error("Failed to read file"))
        return
      }
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1))
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

export function BrandingImageField({
  label,
  description,
  draft,
  current,
  onChange,
}: BrandingImageFieldProps) {
  const t = useTranslations()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasImage =
    draft.action === "replace" || (draft.action === "keep" && Boolean(current))
  const previewUrl =
    draft.action === "replace"
      ? `data:${draft.mimeType};base64,${draft.base64}`
      : draft.action === "keep"
        ? current?.url
        : undefined
  const dimensions =
    draft.action === "keep" && current
      ? { width: current.width, height: current.height }
      : null

  async function handleFileSelected(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) {
      return
    }
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      toast.error(t("settings.brandingImageInvalidType"))
      return
    }
    if (file.size > BRANDING_IMAGE_MAX_BYTES) {
      toast.error(t("settings.brandingImageTooLarge"))
      return
    }

    const base64 = await readFileAsBase64(file)
    onChange({
      action: "replace",
      mimeType: file.type as BrandingImageMimeType,
      base64,
    })
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-3">
        {previewUrl && (
          <img
            src={previewUrl}
            alt=""
            className="bg-background h-10 w-auto max-w-48 rounded border object-contain p-1"
          />
        )}
        {dimensions && (
          <span className="text-muted-foreground font-mono text-xs">
            {dimensions.width}×{dimensions.height}
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleFileSelected}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          {hasImage
            ? t("settings.brandingImageReplace")
            : t("settings.brandingImageUpload")}
        </Button>
        {hasImage && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onChange({ action: "remove" })}
          >
            {t("settings.brandingImageRemove")}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
    </Field>
  )
}
