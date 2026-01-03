"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AVATAR_CONFIG, type AcceptedMimeType } from "@/components/shared/avatar-upload";
import { uploadAvatarAction } from "@/app/actions/user/profile";
import { cn, getInitials, formatMemberSince } from "@/lib/utils";

interface ProfileHeaderProps {
  name: string;
  avatarUrl?: string | null;
  memberSince: Date;
  onAvatarUpdate?: () => void;
}

export function ProfileHeader({
  name,
  avatarUrl,
  memberSince,
  onAvatarUpdate,
}: ProfileHeaderProps) {
  const pathname = usePathname();
  const isSettings = pathname === "/profile/settings";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!AVATAR_CONFIG.acceptedTypes.includes(file.type as AcceptedMimeType)) {
        toast.error("Invalid image type. Only JPEG, PNG, and WebP are allowed.");
        return;
      }

      if (file.size > AVATAR_CONFIG.maxSize) {
        toast.error("Image must be less than 1MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        setPreviewUrl(base64);
        const rawBase64 = base64.split(",")[1] || "";

        setAvatarUploading(true);
        try {
          const result = await uploadAvatarAction({
            imageBase64: rawBase64,
            mimeType: file.type as AcceptedMimeType,
          });
          if (result.success) {
            toast.success("Avatar uploaded. A page refresh is required to see the changes.");
            onAvatarUpdate?.();
          } else {
            toast.error(result.error || "Failed to upload avatar");
            setPreviewUrl(null);
          }
        } finally {
          setAvatarUploading(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [onAvatarUpdate],
  );

  const displayUrl = previewUrl || avatarUrl;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        {isSettings ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={AVATAR_CONFIG.acceptString}
              onChange={handleFileSelect}
              className="hidden"
              disabled={avatarUploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="group relative shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
              aria-label="Upload avatar"
            >
              <Avatar className="h-20 w-20">
                {displayUrl && <AvatarImage src={displayUrl} alt={name} />}
                <AvatarFallback className="text-2xl">{getInitials(name)}</AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center rounded-full bg-black/50 transition-opacity",
                  avatarUploading
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                )}
              >
                {avatarUploading ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </div>
            </button>
          </>
        ) : (
          <Avatar className="h-20 w-20 shrink-0">
            {displayUrl && <AvatarImage src={displayUrl} alt={name} />}
            <AvatarFallback className="text-2xl">{getInitials(name)}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            Member since {formatMemberSince(memberSince)}
          </p>
        </div>
      </div>
      {!isSettings && (
        <Button asChild className="w-fit">
          <Link href="/profile/settings">
            <Settings className="size-4 mr-2" />
            Settings
          </Link>
        </Button>
      )}
    </div>
  );
}
