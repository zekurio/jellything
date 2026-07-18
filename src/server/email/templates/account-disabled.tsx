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
  locale?: Locale
}

export function AccountDisabledEmailTemplate({
  username,
  locale,
  ...themeProps
}: AccountDisabledEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)

  return (
    <EmailLayout
      preview={t("emailTemplates.accountDisabled.preview", {
        serverName: themeProps.serverName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.accountDisabled.heading", { username })}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.accountDisabled.intro", {
          serverName: themeProps.serverName,
        })}
      </Text>

      <Text style={styles.muted}>
        {t("emailTemplates.accountDisabled.contact")}
      </Text>
    </EmailLayout>
  )
}

export function getAccountDisabledEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.accountDisabled.subject", {
    serverName: input.serverName ?? "Jellything",
  })
}
