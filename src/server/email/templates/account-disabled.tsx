import { Heading, Text } from "@react-email/components"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import {
  EmailLayout,
  type EmailThemeProps,
} from "@/server/email/templates/layout"
import { createEmailTemplateStyles } from "@/server/email/templates/styles"

interface AccountDisabledEmailProps extends EmailThemeProps {
  username: string
  mediaServerName: string
  locale?: Locale
}

export function AccountDisabledEmailTemplate({
  username,
  mediaServerName,
  locale,
  ...themeProps
}: AccountDisabledEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)

  return (
    <EmailLayout
      preview={t("emailTemplates.accountDisabled.preview", {
        mediaServerName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.accountDisabled.heading", { username })}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.accountDisabled.intro", {
          mediaServerName,
        })}
      </Text>

      <Text style={styles.muted}>
        {t("emailTemplates.accountDisabled.contact")}
      </Text>
    </EmailLayout>
  )
}

export function getAccountDisabledEmailSubject(input: {
  mediaServerName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.accountDisabled.subject", {
    mediaServerName: input.mediaServerName ?? "Jellyfin",
  })
}
