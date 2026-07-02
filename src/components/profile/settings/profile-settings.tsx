"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { useCallback, useMemo } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { AccountAccessCard } from "@/components/profile/settings/account-access-card"
import { FormShell } from "@/components/shared/form-shell"
import { PasswordInput } from "@/components/shared/password-input"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createAppStore } from "@/hooks/store-utils"
import { useScopedStore } from "@/hooks/use-scoped-store"
import { getApiErrorMessage } from "@/lib/api/error-message"
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  useTranslations,
  type Locale,
} from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import { getProfileTabPath, type ProfileTab } from "@/lib/profile-tabs"
import type { MyExpiryInfo } from "@/lib/renewal-types"
import {
  normalizeEmail,
  optionalEmailAccountFormSchema,
  passwordFormSchema,
  type AccountFormValues,
  type PasswordFormValues,
} from "@/lib/schemas"
import type { SessionData } from "@/lib/session"

interface ProfileData {
  id: string
  name: string
  email: string | null
  emailVerified: boolean
  locale: string | null
  avatarUrl: string
  createdAt: string
}

interface ProfileSettingsProps {
  activeTab: ProfileTab
  emailConfigured: boolean
  expiry: MyExpiryInfo | null
  profile: ProfileData
  onUpdate: (session: SessionData) => void
}

interface SavedProfileState {
  name: string
  email: string | null
  emailVerified: boolean
  locale: string | null
  avatarUrl: string
}

function toSavedProfileState(session: SessionData): SavedProfileState {
  return {
    name: session.name,
    email: session.email,
    emailVerified: session.emailVerified,
    locale: session.locale,
    avatarUrl: session.avatarUrl,
  }
}

function toSavedProfileStateFromProfile(
  profile: ProfileData,
): SavedProfileState {
  return {
    name: profile.name,
    email: profile.email,
    emailVerified: profile.emailVerified,
    locale: profile.locale,
    avatarUrl: profile.avatarUrl,
  }
}

interface ProfileSettingsStoreState {
  savedProfile: SavedProfileState
  isGeneralSaving: boolean
  isPreferencesSaving: boolean
  isResendingVerification: boolean
  setSavedProfile: (savedProfile: SavedProfileState) => void
  setIsGeneralSaving: (isGeneralSaving: boolean) => void
  setIsPreferencesSaving: (isPreferencesSaving: boolean) => void
  setIsResendingVerification: (isResendingVerification: boolean) => void
}

export function ProfileSettings({
  activeTab,
  emailConfigured,
  expiry,
  profile,
  onUpdate,
}: ProfileSettingsProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const router = useRouter()
  const initialSavedProfile = toSavedProfileStateFromProfile(profile)
  const store = useScopedStore(() =>
    createAppStore<ProfileSettingsStoreState>((set) => ({
      savedProfile: initialSavedProfile,
      isGeneralSaving: false,
      isPreferencesSaving: false,
      isResendingVerification: false,
      setSavedProfile: (savedProfile) => set({ savedProfile }),
      setIsGeneralSaving: (isGeneralSaving) => set({ isGeneralSaving }),
      setIsPreferencesSaving: (isPreferencesSaving) =>
        set({ isPreferencesSaving }),
      setIsResendingVerification: (isResendingVerification) =>
        set({ isResendingVerification }),
    })),
  )
  const savedProfile = useStore(store, (state) => state.savedProfile)
  const isGeneralSaving = useStore(store, (state) => state.isGeneralSaving)
  const isPreferencesSaving = useStore(
    store,
    (state) => state.isPreferencesSaving,
  )
  const isResendingVerification = useStore(
    store,
    (state) => state.isResendingVerification,
  )

  const accountForm = useForm<AccountFormValues>({
    resolver: zodResolver(optionalEmailAccountFormSchema),
    defaultValues: {
      name: profile.name,
      email: profile.email ?? "",
    },
  })
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })
  const preferencesForm = useForm<{ locale: string }>({
    defaultValues: {
      locale: profile.locale ?? "_default",
    },
  })

  const normalizedSavedEmail = useMemo(
    () => (savedProfile.email ? normalizeEmail(savedProfile.email) : null),
    [savedProfile.email],
  )
  const generalDirty = accountForm.formState.isDirty
  const passwordDirty = passwordForm.formState.isDirty
  const preferencesDirty = preferencesForm.formState.isDirty
  const currentTabDirty =
    activeTab === "general"
      ? generalDirty
      : activeTab === "password"
        ? passwordDirty
        : activeTab === "preferences"
          ? preferencesDirty
          : false

  const handleTabChange = useCallback(
    (nextTab: string) => {
      if (nextTab === activeTab) {
        return
      }

      if (currentTabDirty) {
        toast.error(t("profile.saveOrResetToSwitchTabs"), {
          id: "profile-tab-switch-blocked",
        })
        return
      }

      void navigate({
        to: getProfileTabPath(nextTab as ProfileTab),
        replace: true,
      })
    },
    [activeTab, currentTabDirty, navigate, t],
  )

  const handleGeneralReset = useCallback(() => {
    accountForm.reset({
      name: savedProfile.name,
      email: savedProfile.email ?? "",
    })
  }, [accountForm, savedProfile.email, savedProfile.name])

  const handlePasswordReset = useCallback(() => {
    passwordForm.reset({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    })
  }, [passwordForm])

  const handlePreferencesReset = useCallback(() => {
    preferencesForm.reset({
      locale: savedProfile.locale ?? "_default",
    })
  }, [preferencesForm, savedProfile.locale])

  async function handleGeneralSubmit(data: AccountFormValues): Promise<void> {
    const client = getBrowserORPCClient()
    const nextName = data.name
    const rawNextEmail = data.email.trim()
    const nextEmail = rawNextEmail === "" ? null : normalizeEmail(rawNextEmail)
    const nameChanged = nextName !== savedProfile.name
    const emailChanged = nextEmail !== normalizedSavedEmail
    const updates: {
      name?: string
      email?: string | null
    } = {}

    if (!nameChanged && !emailChanged) {
      return
    }

    if (nameChanged) {
      updates.name = nextName
    }
    if (emailChanged) {
      updates.email = nextEmail
    }
    if (Object.keys(updates).length === 0) {
      return
    }

    store.getState().setIsGeneralSaving(true)

    try {
      const result = await runApiEffect(client.me.updateAccount(updates))
      if (result.error === null && result.data) {
        const nextSavedProfile = toSavedProfileState(result.data)
        store.getState().setSavedProfile(nextSavedProfile)
        accountForm.reset({
          name: nextSavedProfile.name,
          email: nextSavedProfile.email ?? "",
        })
        onUpdate(result.data)
        toast.success(
          emailChanged
            ? t("profile.emailUpdated")
            : t("profile.profileUpdated"),
        )
        return
      }

      toast.error(getApiErrorMessage(result.error, t, "profile.updateFailed"), {
        id: "profile-general-save-error",
      })
    } finally {
      store.getState().setIsGeneralSaving(false)
    }
  }

  const handleResendVerification = useCallback(async () => {
    store.getState().setIsResendingVerification(true)

    try {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(client.me.resendVerification({}))
      if (result.error === null) {
        toast.success(t("profile.verificationSent"))
      } else {
        toast.error(t("profile.verificationError"))
      }
    } finally {
      store.getState().setIsResendingVerification(false)
    }
  }, [store, t])

  async function handlePasswordSubmit(data: PasswordFormValues): Promise<void> {
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.me.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    )

    if (result.error === null) {
      toast.success(t("profile.passwordChanged"))
      handlePasswordReset()
      return
    }

    toast.error(
      getApiErrorMessage(result.error, t, "profile.passwordChangeFailed"),
    )
  }

  async function handlePreferencesSubmit(data: {
    locale: string
  }): Promise<void> {
    const localeValue =
      data.locale === "_default" ? null : (data.locale as Locale)
    const client = getBrowserORPCClient()

    store.getState().setIsPreferencesSaving(true)

    try {
      const result = await runApiEffect(
        client.me.updateAccount({ locale: localeValue }),
      )

      if (result.error === null && result.data) {
        const nextSavedProfile = toSavedProfileState(result.data)
        store.getState().setSavedProfile(nextSavedProfile)
        preferencesForm.reset({
          locale: nextSavedProfile.locale ?? "_default",
        })
        onUpdate(result.data)
        await router.invalidate()
        toast.success(t("settings.languageSaved"))
        return
      }

      toast.error(t("settings.languageSaveFailed"))
    } finally {
      store.getState().setIsPreferencesSaving(false)
    }
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="max-w-2xl"
    >
      <div className="md:hidden">
        <Select value={activeTab} onValueChange={handleTabChange}>
          <SelectTrigger className="w-full" aria-label={t("settings.title")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">{t("settings.general")}</SelectItem>
            <SelectItem value="password">{t("auth.password")}</SelectItem>
            <SelectItem value="preferences">
              {t("settings.preferences")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <TabsList className="hidden md:inline-flex">
        <TabsTrigger value="general">{t("settings.general")}</TabsTrigger>
        <TabsTrigger value="password">{t("auth.password")}</TabsTrigger>
        <TabsTrigger value="preferences">
          {t("settings.preferences")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="mt-4">
        <form onSubmit={accountForm.handleSubmit(handleGeneralSubmit)}>
          <FormShell
            title={t("profile.accountDetails")}
            actions={
              <>
                <Button
                  type="submit"
                  disabled={!generalDirty || isGeneralSaving}
                >
                  {isGeneralSaving ? t("common.saving") : t("common.save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!generalDirty}
                  onClick={handleGeneralReset}
                >
                  {t("common.reset")}
                </Button>
              </>
            }
          >
            <FieldGroup>
              <Field data-invalid={!!accountForm.formState.errors.name}>
                <FieldLabel htmlFor="name">{t("auth.username")}</FieldLabel>
                <Input
                  id="name"
                  aria-invalid={!!accountForm.formState.errors.name}
                  {...accountForm.register("name")}
                />
                {accountForm.formState.errors.name && (
                  <FieldError errors={[accountForm.formState.errors.name]} />
                )}
              </Field>

              <Field data-invalid={!!accountForm.formState.errors.email}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
                  {savedProfile.email && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                        savedProfile.emailVerified
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {savedProfile.emailVerified ? (
                        <>
                          <CheckCircle2 className="size-3" />
                          {t("profile.verified")}
                        </>
                      ) : (
                        <>
                          <AlertCircle className="size-3" />
                          {t("profile.unverified")}
                        </>
                      )}
                    </span>
                  )}
                </div>
                <Input
                  id="email"
                  type="email"
                  aria-invalid={!!accountForm.formState.errors.email}
                  {...accountForm.register("email")}
                />
                {accountForm.formState.errors.email && (
                  <FieldError errors={[accountForm.formState.errors.email]} />
                )}
                {emailConfigured &&
                  Boolean(savedProfile.email) &&
                  !savedProfile.emailVerified && (
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs">
                      <span>{t("profile.checkInboxOr")}</span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 py-0 text-xs font-medium"
                        disabled={isResendingVerification}
                        onClick={handleResendVerification}
                      >
                        {isResendingVerification ? (
                          <>
                            <Loader2 className="size-3 animate-spin" />
                            {t("common.sending")}
                          </>
                        ) : (
                          t("profile.resendVerification")
                        )}
                      </Button>
                    </div>
                  )}
              </Field>
            </FieldGroup>
          </FormShell>
        </form>

        {expiry && expiry.expiresAt && (
          <>
            <Separator className="my-8" />
            <AccountAccessCard expiry={expiry} />
          </>
        )}
      </TabsContent>

      <TabsContent value="password" className="mt-4">
        <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}>
          <FormShell
            title={t("auth.changePassword")}
            actions={
              <>
                <Button
                  type="submit"
                  disabled={
                    !passwordDirty || passwordForm.formState.isSubmitting
                  }
                >
                  {passwordForm.formState.isSubmitting
                    ? t("common.saving")
                    : t("common.save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!passwordDirty}
                  onClick={handlePasswordReset}
                >
                  {t("common.reset")}
                </Button>
              </>
            }
          >
            <FieldGroup>
              <Field
                data-invalid={!!passwordForm.formState.errors.currentPassword}
              >
                <FieldLabel htmlFor="current-password">
                  {t("auth.currentPassword")}
                </FieldLabel>
                <PasswordInput
                  id="current-password"
                  value={passwordForm.watch("currentPassword")}
                  onChange={(value) =>
                    passwordForm.setValue("currentPassword", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  autoComplete="current-password"
                />
                {passwordForm.formState.errors.currentPassword && (
                  <FieldError
                    errors={[passwordForm.formState.errors.currentPassword]}
                  />
                )}
              </Field>

              <Field data-invalid={!!passwordForm.formState.errors.newPassword}>
                <FieldLabel htmlFor="new-password">
                  {t("auth.newPassword")}
                </FieldLabel>
                <PasswordInput
                  id="new-password"
                  value={passwordForm.watch("newPassword")}
                  onChange={(value) =>
                    passwordForm.setValue("newPassword", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  showStrengthIndicator
                  showRequirements
                  autoComplete="new-password"
                />
                {passwordForm.formState.errors.newPassword && (
                  <FieldError
                    errors={[passwordForm.formState.errors.newPassword]}
                  />
                )}
              </Field>

              <Field
                data-invalid={!!passwordForm.formState.errors.confirmPassword}
              >
                <FieldLabel htmlFor="confirm-password">
                  {t("auth.confirmPassword")}
                </FieldLabel>
                <PasswordInput
                  id="confirm-password"
                  value={passwordForm.watch("confirmPassword")}
                  onChange={(value) =>
                    passwordForm.setValue("confirmPassword", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  autoComplete="new-password"
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <FieldError
                    errors={[passwordForm.formState.errors.confirmPassword]}
                  />
                )}
              </Field>
            </FieldGroup>
          </FormShell>
        </form>
      </TabsContent>

      <TabsContent value="preferences" className="mt-4">
        <form onSubmit={preferencesForm.handleSubmit(handlePreferencesSubmit)}>
          <FormShell
            title={t("settings.preferences")}
            actions={
              <>
                <Button
                  type="submit"
                  disabled={!preferencesDirty || isPreferencesSaving}
                >
                  {isPreferencesSaving ? t("common.saving") : t("common.save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!preferencesDirty}
                  onClick={handlePreferencesReset}
                >
                  {t("common.reset")}
                </Button>
              </>
            }
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="locale">
                  {t("settings.language")}
                </FieldLabel>
                <Select
                  value={preferencesForm.watch("locale")}
                  onValueChange={(value) =>
                    preferencesForm.setValue("locale", value, {
                      shouldDirty: true,
                    })
                  }
                  disabled={isPreferencesSaving}
                >
                  <SelectTrigger id="locale" className="w-full max-w-xs">
                    <SelectValue
                      placeholder={t("settings.languagePlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">
                      {t("settings.useAppDefault")}
                    </SelectItem>
                    {SUPPORTED_LOCALES.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {LOCALE_LABELS[loc]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  {t("settings.languageDescription")}
                </p>
              </Field>
            </FieldGroup>
          </FormShell>
        </form>
      </TabsContent>
    </Tabs>
  )
}
