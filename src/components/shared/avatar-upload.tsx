"use client"

import { Camera, ImageUp, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslations } from "@/lib/i18n"
import { cn, getInitials } from "@/lib/utils"

export const AVATAR_CONFIG = {
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  acceptString: "image/jpeg,image/png,image/webp",
} as const

export type AcceptedMimeType = (typeof AVATAR_CONFIG.acceptedTypes)[number]

const ACCEPTED_MIME_TYPES: ReadonlySet<string> = new Set(
  AVATAR_CONFIG.acceptedTypes,
)

export function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return ACCEPTED_MIME_TYPES.has(value)
}

export interface AvatarFile {
  base64: string // Base64 data URL (data:image/...;base64,...)
  mimeType: AcceptedMimeType
  rawBase64: string // Base64 without data URL prefix
}

const sizeClasses = {
  sm: {
    avatar: "h-12 w-12",
    fallback: "text-sm",
    icon: "h-4 w-4",
    spinner: "h-4 w-4",
  },
  md: {
    avatar: "h-16 w-16",
    fallback: "text-lg",
    icon: "h-5 w-5",
    spinner: "h-5 w-5",
  },
  lg: {
    avatar: "h-24 w-24",
    fallback: "text-3xl",
    icon: "h-6 w-6",
    spinner: "h-6 w-6",
  },
} as const

export interface AvatarUploadButtonProps {
  /** Display name – used for fallback initials */
  name: string
  /** URL of the current/preview avatar image */
  displayUrl?: string | null
  /** Called with the parsed file after the user picks one */
  onFileSelect: (file: AvatarFile) => void
  /** Called when the user removes the current avatar */
  onRemove?: () => void | Promise<void>
  /** Whether an upload is in progress (shows spinner overlay) */
  isUploading?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Size variant */
  size?: "sm" | "md" | "lg"
  /** Show file-type hint text beside the avatar */
  showHint?: boolean
  /** Accessible label override */
  ariaLabel?: string
  /** Extra classes on the outer wrapper */
  className?: string
}

export function AvatarUploadButton({
  name,
  displayUrl,
  onFileSelect,
  onRemove,
  isUploading = false,
  disabled = false,
  size = "md",
  showHint = false,
  ariaLabel,
  className,
}: AvatarUploadButtonProps): React.JSX.Element {
  const t = useTranslations()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const s = sizeClasses[size]
  const [cropOpen, setCropOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingImage, setPendingImage] = useState<{
    src: string
    mimeType: AcceptedMimeType
  } | null>(null)
  const [imageSize, setImageSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const prevDisplayUrlRef = useRef(displayUrl)
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const cropViewportSize = 256
  const outputSize = 512

  useEffect(() => {
    if (prevDisplayUrlRef.current === displayUrl) {
      return
    }

    prevDisplayUrlRef.current = displayUrl
    setImageLoaded(false)
  }, [displayUrl])

  const hasExistingAvatar = Boolean(displayUrl) && imageLoaded

  const rotationRad = (rotation * Math.PI) / 180
  const absCos = Math.abs(Math.cos(rotationRad))
  const absSin = Math.abs(Math.sin(rotationRad))

  const baseScale = useMemo(() => {
    if (!imageSize) {
      return 1
    }

    const coverFactor = absCos + absSin
    const needed = cropViewportSize * coverFactor
    return Math.max(needed / imageSize.width, needed / imageSize.height)
  }, [absCos, absSin, imageSize])

  const effectiveScale = baseScale * zoom

  const clampCropPosition = useCallback(
    (position: { x: number; y: number }) => {
      if (!imageSize) {
        return { x: 0, y: 0 }
      }

      const cos = Math.cos(rotationRad)
      const sin = Math.sin(rotationRad)
      const coverFactor = absCos + absSin
      const maxU = Math.max(
        0,
        (imageSize.width * effectiveScale - coverFactor * cropViewportSize) / 2,
      )
      const maxV = Math.max(
        0,
        (imageSize.height * effectiveScale - coverFactor * cropViewportSize) /
          2,
      )

      const u = cos * position.x + sin * position.y
      const v = -sin * position.x + cos * position.y
      const clampedU = Math.min(Math.max(u, -maxU), maxU)
      const clampedV = Math.min(Math.max(v, -maxV), maxV)

      return {
        x: cos * clampedU - sin * clampedV,
        y: sin * clampedU + cos * clampedV,
      }
    },
    [absCos, absSin, effectiveScale, imageSize, rotationRad],
  )

  useEffect(() => {
    setCropPosition((current) => clampCropPosition(current))
  }, [clampCropPosition])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!isAcceptedMimeType(file.type)) {
        toast.error(t("profile.avatarTypeError"))
        e.target.value = ""
        return
      }

      const mimeType = file.type
      const reader = new FileReader()
      reader.addEventListener(
        "load",
        (event) => {
          const base64 = event.target?.result as string
          setPendingImage({
            src: base64,
            mimeType,
          })
          setImageSize(null)
          setCropPosition({ x: 0, y: 0 })
          setZoom(1)
          setRotation(0)
          setCropOpen(true)
        },
        { once: true },
      )
      reader.readAsDataURL(file)
      e.target.value = ""
    },
    [t],
  )

  const handleCropConfirm = useCallback(async () => {
    if (!pendingImage || !imageSize) {
      return
    }

    const image = new window.Image()
    image.src = pendingImage.src

    await new Promise<void>((resolve, reject) => {
      const handleLoad = (): void => {
        resolve()
      }
      const handleError = (): void => {
        reject(new Error("Failed to load image"))
      }

      image.addEventListener("load", handleLoad, { once: true })
      image.addEventListener("error", handleError, { once: true })
    })

    const canvas = document.createElement("canvas")
    canvas.width = outputSize
    canvas.height = outputSize

    const context = canvas.getContext("2d")
    if (!context) {
      toast.error(t("profile.avatarError"))
      return
    }

    const scaleRatio = outputSize / cropViewportSize
    const drawWidth = imageSize.width * effectiveScale * scaleRatio
    const drawHeight = imageSize.height * effectiveScale * scaleRatio

    context.clearRect(0, 0, outputSize, outputSize)
    context.save()
    context.translate(
      outputSize / 2 + cropPosition.x * scaleRatio,
      outputSize / 2 + cropPosition.y * scaleRatio,
    )
    context.rotate(rotationRad)
    context.drawImage(
      image,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight,
    )
    context.restore()

    const croppedBase64 = canvas.toDataURL(pendingImage.mimeType)
    const rawBase64 = croppedBase64.split(",")[1] || ""

    onFileSelect({
      base64: croppedBase64,
      mimeType: pendingImage.mimeType,
      rawBase64,
    })

    setCropOpen(false)
    setPendingImage(null)
  }, [
    cropPosition.x,
    cropPosition.y,
    effectiveScale,
    imageSize,
    onFileSelect,
    pendingImage,
    rotationRad,
    t,
  ])

  const handleCropCancel = useCallback(() => {
    setCropOpen(false)
    setPendingImage(null)
    setImageSize(null)
    setCropPosition({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
  }, [])

  const handleOpenPicker = useCallback(() => {
    if (disabled || isUploading || isRemoving) {
      return
    }

    fileInputRef.current?.click()
  }, [disabled, isRemoving, isUploading])

  const handleRemove = useCallback(async () => {
    if (!onRemove || isRemoving) {
      return
    }

    setMenuOpen(false)
    setIsRemoving(true)

    try {
      await onRemove()
    } finally {
      setIsRemoving(false)
    }
  }, [isRemoving, onRemove])

  const isDisabled = disabled || isUploading || isRemoving

  const trigger = (
    <button
      type="button"
      onClick={!hasExistingAvatar || !onRemove ? handleOpenPicker : undefined}
      disabled={isDisabled}
      className="group focus-visible:ring-ring relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      aria-label={ariaLabel ?? t("profile.uploadAvatar")}
    >
      <Avatar className={cn(s.avatar, "rounded-full")}>
        {displayUrl && (
          <AvatarImage
            src={displayUrl}
            alt={name}
            onLoadingStatusChange={(status) =>
              setImageLoaded(status === "loaded")
            }
          />
        )}
        <AvatarFallback className={cn(s.fallback, "rounded-full")}>
          {name ? (
            getInitials(name)
          ) : (
            <Camera className={cn(s.icon, "text-muted-foreground")} />
          )}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center rounded-full bg-black/50 transition-opacity",
          isUploading || isRemoving
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {isUploading || isRemoving ? (
          <div
            className={cn(
              s.spinner,
              "animate-spin rounded-full border-2 border-white border-t-transparent",
            )}
          />
        ) : (
          <Camera className={cn(s.icon, "text-white")} />
        )}
      </div>
    </button>
  )

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_CONFIG.acceptString}
        onChange={handleFileSelect}
        className="hidden"
        disabled={isDisabled}
      />
      {hasExistingAvatar && onRemove ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleOpenPicker}>
              <ImageUp className="size-4" />
              {t("profile.changeAvatar")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={isRemoving}
              onClick={() => void handleRemove()}
            >
              <Trash2 className="size-4" />
              {t("profile.removeAvatar")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        trigger
      )}

      {showHint && (
        <div className="text-muted-foreground grid text-xs">
          <p className="invisible col-start-1 row-start-1" aria-hidden="true">
            {t("profile.avatarMenuHint")}
          </p>
          <p className="invisible col-start-1 row-start-1" aria-hidden="true">
            {t("common.clickToUpload")}
          </p>
          <p className="col-start-1 row-start-1">
            {hasExistingAvatar && onRemove
              ? t("profile.avatarMenuHint")
              : t("common.clickToUpload")}
          </p>
        </div>
      )}

      <Dialog
        open={cropOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCropCancel()
          }
        }}
      >
        <DialogContent
          className={cn("sm:max-w-xl", isDragging && "select-none")}
        >
          <DialogHeader>
            <DialogTitle>{t("profile.cropAvatar")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div
              className="bg-muted relative mx-auto h-64 w-64 cursor-grab touch-none overflow-hidden rounded-2xl select-none active:cursor-grabbing"
              onPointerDown={(event) => {
                if (!imageSize) {
                  return
                }

                event.preventDefault()
                setIsDragging(true)

                dragStateRef.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: cropPosition.x,
                  originY: cropPosition.y,
                }

                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                const dragState = dragStateRef.current
                if (!dragState || dragState.pointerId !== event.pointerId) {
                  return
                }

                event.preventDefault()

                const nextPosition = clampCropPosition({
                  x: dragState.originX + (event.clientX - dragState.startX),
                  y: dragState.originY + (event.clientY - dragState.startY),
                })
                setCropPosition(nextPosition)
              }}
              onPointerUp={(event) => {
                if (dragStateRef.current?.pointerId === event.pointerId) {
                  dragStateRef.current = null
                  setIsDragging(false)
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }
              }}
              onPointerCancel={(event) => {
                if (dragStateRef.current?.pointerId === event.pointerId) {
                  dragStateRef.current = null
                  setIsDragging(false)
                }
              }}
            >
              {pendingImage ? (
                <>
                  <img
                    src={pendingImage.src}
                    alt={t("common.avatar")}
                    className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
                    onLoad={(event) => {
                      const nextImageSize = {
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      }
                      setImageSize(nextImageSize)
                      setCropPosition({ x: 0, y: 0 })
                    }}
                    style={{
                      width: imageSize?.width ?? cropViewportSize,
                      height: imageSize?.height ?? cropViewportSize,
                      transform: `translate(calc(-50% + ${cropPosition.x}px), calc(-50% + ${cropPosition.y}px)) scale(${effectiveScale}) rotate(${rotation}deg)`,
                      transformOrigin: "center",
                    }}
                    draggable={false}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-black/10" />
                </>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="avatar-crop-zoom">
                {t("profile.avatarZoom")}
              </label>
              <input
                id="avatar-crop-zoom"
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="accent-primary w-full"
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="avatar-crop-rotation"
              >
                {t("profile.avatarRotation")}
              </label>
              <input
                id="avatar-crop-rotation"
                type="range"
                min="-180"
                max="180"
                step="1"
                value={rotation}
                onChange={(event) => setRotation(Number(event.target.value))}
                className="accent-primary w-full"
              />
              <p className="text-muted-foreground text-xs">
                {t("profile.avatarCropHint")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCropCancel}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleCropConfirm()}
              disabled={!pendingImage}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
