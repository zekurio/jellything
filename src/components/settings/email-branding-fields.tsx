"use client"

import { BrandingImageField } from "@/components/settings/branding-image-field"
import { ColorField } from "@/components/settings/color-field"
import type { EmailConfigDto } from "@/lib/api/contracts/admin"
import type { EmailBrandingDraft } from "@/lib/email"
import { useTranslations } from "@/lib/i18n"

interface EmailBrandingFieldsProps {
  branding: EmailBrandingDraft
  currentLogo: EmailConfigDto["branding"]["logo"]
  onChange: (branding: EmailBrandingDraft) => void
}

export function EmailBrandingFields({
  branding,
  currentLogo,
  onChange,
}: EmailBrandingFieldsProps) {
  const t = useTranslations()

  return (
    <>
      <div>
        <h3 className="text-sm font-medium">
          {t("settings.emailBrandingTitle")}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t("settings.emailBrandingDescription")}
        </p>
      </div>

      <ColorField
        id="emailAccentColor"
        label={t("settings.emailAccentColor")}
        description={t("settings.emailAccentColorDescription")}
        value={branding.accentColor}
        onChange={(accentColor) => onChange({ ...branding, accentColor })}
      />

      <ColorField
        id="emailPageBackgroundColor"
        label={t("settings.emailPageBackgroundColor")}
        description={t("settings.emailPageBackgroundColorDescription")}
        value={branding.pageBackgroundColor}
        onChange={(pageBackgroundColor) =>
          onChange({ ...branding, pageBackgroundColor })
        }
      />

      <BrandingImageField
        label={t("settings.emailLogo")}
        description={t("settings.emailLogoDescription")}
        draft={branding.logo}
        current={currentLogo}
        onChange={(logo) => onChange({ ...branding, logo })}
      />
    </>
  )
}
