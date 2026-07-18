import { Button, Heading, Section, Text } from "@react-email/components"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import {
  EmailLayout,
  type EmailThemeProps,
} from "@/server/email/templates/layout"
import { createEmailTemplateStyles } from "@/server/email/templates/styles"

interface AccountRenewedEmailProps extends EmailThemeProps {
  username: string
  expiryDate: string
  manageUrl: string
  locale?: Locale
}

export function AccountRenewedEmailTemplate({
  username,
  expiryDate,
  manageUrl,
  locale,
  ...themeProps
}: AccountRenewedEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)

  return (
    <EmailLayout
      preview={t("emailTemplates.accountRenewed.preview", {
        serverName: themeProps.serverName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.accountRenewed.heading", { username })}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.accountRenewed.intro", {
          serverName: themeProps.serverName,
        })}
      </Text>

      <Text style={styles.highlight}>{expiryDate}</Text>

      <Section style={styles.buttonSection}>
        <Button style={styles.button} href={manageUrl}>
          {t("emailTemplates.accountRenewed.action", {
            serverName: themeProps.serverName,
          })}
        </Button>
      </Section>

      <Text style={styles.muted}>
        {t("emailTemplates.accountRenewed.footer")}
      </Text>
    </EmailLayout>
  )
}

export function getAccountRenewedEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.accountRenewed.subject", {
    serverName: input.serverName ?? "Jellything",
  })
}
