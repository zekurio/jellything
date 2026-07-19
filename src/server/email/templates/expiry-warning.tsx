import { Button, Heading, Section, Text } from "@react-email/components"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import {
  EmailLayout,
  type EmailThemeProps,
} from "@/server/email/templates/layout"
import { createEmailTemplateStyles } from "@/server/email/templates/styles"

interface ExpiryWarningEmailProps extends EmailThemeProps {
  username: string
  expiryDate: string
  manageUrl: string
  locale?: Locale
}

export function ExpiryWarningEmailTemplate({
  username,
  expiryDate,
  manageUrl,
  locale,
  ...themeProps
}: ExpiryWarningEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)

  return (
    <EmailLayout
      preview={t("emailTemplates.expiryWarning.preview", {
        serverName: themeProps.serverName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.expiryWarning.heading", { username })}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.expiryWarning.intro", {
          serverName: themeProps.serverName,
          expiryDate,
        })}
      </Text>

      <Text style={styles.highlight}>{expiryDate}</Text>

      <Text style={styles.paragraph}>
        {t("emailTemplates.expiryWarning.contact")}
      </Text>

      <Section style={styles.buttonSection}>
        <Button style={styles.button} href={manageUrl}>
          {t("emailTemplates.expiryWarning.action", {
            serverName: themeProps.serverName,
          })}
        </Button>
      </Section>

      <Text style={styles.muted}>
        {t("emailTemplates.expiryWarning.footer")}
      </Text>
    </EmailLayout>
  )
}

export function getExpiryWarningEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.expiryWarning.subject", {
    serverName: input.serverName ?? "Inviterr",
  })
}
