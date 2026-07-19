import { Heading, Text } from "@react-email/components"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import {
  EmailLayout,
  type EmailThemeProps,
} from "@/server/email/templates/layout"
import { createEmailTemplateStyles } from "@/server/email/templates/styles"

interface AccountDeletedEmailProps extends EmailThemeProps {
  username: string
  locale?: Locale
}

export function AccountDeletedEmailTemplate({
  username,
  locale,
  ...themeProps
}: AccountDeletedEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)

  return (
    <EmailLayout
      preview={t("emailTemplates.accountDeleted.preview", {
        serverName: themeProps.serverName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.accountDeleted.heading", { username })}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.accountDeleted.intro", {
          serverName: themeProps.serverName,
        })}
      </Text>

      <Text style={styles.muted}>
        {t("emailTemplates.accountDeleted.contact")}
      </Text>
    </EmailLayout>
  )
}

export function getAccountDeletedEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.accountDeleted.subject", {
    serverName: input.serverName ?? "Inviterr",
  })
}
