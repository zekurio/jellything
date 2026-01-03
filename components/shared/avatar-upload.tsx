"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, User, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";

// Unified avatar validation constants
export const AVATAR_CONFIG = {
  maxSize: 1024 * 1024, // 1MB
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  acceptString: "image/jpeg,image/png,image/webp",
} as const;

export type AcceptedMimeType = (typeof AVATAR_CONFIG.acceptedTypes)[number];

export interface AvatarFile {
  base64: string; // Base64 data URL (data:image/...;base64,...)
  mimeType: AcceptedMimeType;
  rawBase64: string; // Base64 without data URL prefix
}

interface AvatarUploadProps {
  /** Current avatar URL for display */
  currentAvatarUrl?: string | null;
  /** Name for fallback initials */
  name?: string;
  /** Called when a new file is selected */
  onFileSelect?: (file: AvatarFile) => void;
  /** Called when the avatar is cleared */
  onClear?: () => void;
  /** Whether upload is in progress */
  isUploading?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to show the remove button */
  showRemove?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Class name for the container */
  className?: string;
}

const sizeClasses = {
  sm: "size-12",
  md: "size-16",
  lg: "size-24",
};

const iconSizes = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

const fallbackTextSizes = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

export function AvatarUpload({
  currentAvatarUrl,
  name = "",
  onFileSelect,
  onClear,
  isUploading = false,
  size = "md",
  showRemove = true,
  disabled = false,
  className,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!AVATAR_CONFIG.acceptedTypes.includes(file.type as AcceptedMimeType)) {
        toast.error("Invalid image type. Only JPEG, PNG, and WebP are allowed.");
        return;
      }

      // Validate file size
      if (file.size > AVATAR_CONFIG.maxSize) {
        toast.error("Image must be less than 1MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setPreviewUrl(base64);

        // Extract raw base64 without data URL prefix
        const rawBase64 = base64.split(",")[1] || "";

        onFileSelect?.({
          base64,
          mimeType: file.type as AcceptedMimeType,
          rawBase64,
        });
      };
      reader.readAsDataURL(file);
    },
    [onFileSelect],
  );

  const handleClear = useCallback(() => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClear?.();
  }, [onClear]);

  const displayUrl = previewUrl || currentAvatarUrl;

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative">
        <Avatar className={sizeClasses[size]}>
          <AvatarImage src={displayUrl || undefined} alt={name} />
          <AvatarFallback className={fallbackTextSizes[size]}>
            {name ? getInitials(name) : <User className={iconSizes[size]} />}
          </AvatarFallback>
        </Avatar>

        {previewUrl && showRemove && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -right-2 -top-2 h-6 w-6"
            onClick={handleClear}
            disabled={disabled || isUploading}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={AVATAR_CONFIG.acceptString}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || isUploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
        >
          {isUploading ? (
            <>Uploading...</>
          ) : (
            <>
              <Camera className="mr-2 h-4 w-4" />
              {previewUrl || currentAvatarUrl ? "Change" : "Upload"} Photo
            </>
          )}
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          JPG, PNG, or WebP. Max {AVATAR_CONFIG.maxSize / 1024 / 1024}MB.
        </p>
      </div>
    </div>
  );
}
