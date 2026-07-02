"use client"

import { Link } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { ArrowLeft } from "lucide-react"
import { useCallback } from "react"
import { toast } from "sonner"

import { ProfileSettings } from "@/components/profile/settings/profile-settings"
import {
  AvatarUploadButton,
  type AvatarFile,
} from "@/components/shared/avatar-upload"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { createAppStore } from "@/hooks/store-utils"
import { useScopedStore } from "@/hooks/use-scoped-store"
import { useSession } from "@/hooks/use-session"
import { useLocale, useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import type { ProfileTab } from "@/lib/profile-tabs"
import type { MyExpiryInfo } from "@/lib/renewal-types"
import type { SessionData } from "@/lib/session"
import { formatMemberSince } from "@/lib/utils"

interface ProfileData {
  id: string
  name: string
  email: string | null
  emailVerified: boolean
  locale: string | null
  avatarUrl: string
  createdAt: string
}

interface ProfilePageShellProps {
  activeTab: ProfileTab
  emailConfigured: boolean
  expiry: MyExpiryInfo | null
}

interface ProfilePageShellStoreState {
  isUploading: boolean
  previewUrl: string | null
  setIsUploading: (isUploading: boolean) => void
  setPreviewUrl: (previewUrl: string | null) => void
}

function useProfileShellStore() {
  const store = useScopedStore(() =>
    createAppStore<ProfilePageShellStoreState>((set) => ({
      isUploading: false,
      previewUrl: null,
      setIsUploading: (isUploading) => set({ isUploading }),
      setPreviewUrl: (previewUrl) => set({ previewUrl }),
    })),
  )

  return {
    store,
    isUploading: useStore(store, (state) => state.isUploading),
    previewUrl: useStore(store, (state) => state.previewUrl),
  }
}

function toProfileData(session: SessionData | null): ProfileData | null {
  return session
    ? {
        id: session.userId,
        name: session.name,
        email: session.email,
        emailVerified: session.emailVerified,
        locale: session.locale,
        avatarUrl: session.avatarUrl,
        createdAt: session.createdAt,
      }
    : null
}

function ProfileErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations()

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed p-6">
          <p className="text-muted-foreground text-sm">
            {t("profiles.dataLoadFailed")}
          </p>
          <Button variant="outline" onClick={onRetry}>
            {t("common.tryAgain")}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProfileHeader({
  isAdmin,
  isUploading,
  locale,
  previewUrl,
  profile,
  onAvatarRemove,
  onAvatarSelect,
}: {
  isAdmin: boolean
  isUploading: boolean
  locale: string
  previewUrl: string | null
  profile: ProfileData
  onAvatarRemove: () => void
  onAvatarSelect: (file: AvatarFile) => void
}) {
  const t = useTranslations()

  return (
    <>
      {isAdmin && (
        <Link
          to="/dashboard"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          {t("nav.backToDashboard")}
        </Link>
      )}

      <div className={isAdmin ? "mt-8" : undefined}>
        <div className="flex items-center gap-4">
          <AvatarUploadButton
            name={profile.name}
            displayUrl={previewUrl ?? profile.avatarUrl}
            onFileSelect={onAvatarSelect}
            onRemove={onAvatarRemove}
            isUploading={isUploading}
            size="lg"
          />
          <div>
            <h1 className="text-2xl font-semibold">{profile.name}</h1>
            <p className="text-muted-foreground text-sm">
              {t("profile.memberSince", {
                date: formatMemberSince(profile.createdAt, locale),
              })}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export function ProfilePageShell({
  activeTab,
  emailConfigured,
  expiry,
}: ProfilePageShellProps) {
  const t = useTranslations()
  const locale = useLocale()
  const {
    session,
    isAdmin,
    isLoading: isSessionLoading,
    refresh: refreshSession,
    setSession,
  } = useSession()
  const { store, isUploading, previewUrl } = useProfileShellStore()

  const handleAvatarSelect = useCallback(
    async (file: AvatarFile) => {
      store.getState().setPreviewUrl(file.base64)
      store.getState().setIsUploading(true)

      try {
        const client = getBrowserORPCClient()
        const result = await runApiEffect(
          client.me.uploadAvatar({
            imageBase64: file.rawBase64,
            mimeType: file.mimeType,
          }),
        )

        if (result.error === null && result.data) {
          setSession(result.data)
          toast.success(t("profile.avatarSaved"))
          return
        }

        toast.error(t("profile.avatarError"))
        store.getState().setPreviewUrl(null)
      } finally {
        store.getState().setIsUploading(false)
      }
    },
    [setSession, store, t],
  )

  const handleAvatarRemove = useCallback(async () => {
    store.getState().setIsUploading(true)

    try {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(client.me.removeAvatar({}))

      if (result.error === null && result.data) {
        store.getState().setPreviewUrl("")
        setSession(result.data)
        toast.success(t("profile.avatarRemoved"))
        return
      }

      toast.error(t("profile.avatarRemoveError"))
    } finally {
      store.getState().setIsUploading(false)
    }
  }, [setSession, store, t])

  const profile = toProfileData(session)

  if (isSessionLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!profile) {
    return <ProfileErrorState onRetry={() => void refreshSession()} />
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <ProfileHeader
          isAdmin={isAdmin}
          isUploading={isUploading}
          locale={locale}
          previewUrl={previewUrl}
          profile={profile}
          onAvatarRemove={handleAvatarRemove}
          onAvatarSelect={handleAvatarSelect}
        />

        <div className="mt-10">
          <ProfileSettings
            key={[
              profile.id,
              profile.name,
              profile.email ?? "",
              profile.emailVerified ? "verified" : "unverified",
              profile.locale ?? "",
              profile.avatarUrl,
            ].join(":")}
            activeTab={activeTab}
            emailConfigured={emailConfigured}
            expiry={expiry}
            profile={profile}
            onUpdate={(updatedSession: SessionData) =>
              setSession(updatedSession)
            }
          />
        </div>
      </div>
    </div>
  )
}
