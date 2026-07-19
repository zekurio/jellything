import { Button, Heading, Section, Text } from "@react-email/components"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import {
  EmailLayout,
  type EmailThemeProps,
} from "@/server/email/templates/layout"
import { createEmailTemplateStyles } from "@/server/email/templates/styles"

interface VerifyEmailProps extends EmailThemeProps {
  username: string
  verifyUrl: string
  locale?: Locale
}

export function VerifyEmailTemplate({
  username,
  verifyUrl,
  locale,
  ...themeProps
}: VerifyEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)

  return (
    <EmailLayout
      preview={t("emailTemplates.verifyEmail.preview", {
        serverName: themeProps.serverName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.verifyEmail.heading", { username })}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.verifyEmail.intro")}
      </Text>

      <Section style={styles.buttonSection}>
        <Button style={styles.button} href={verifyUrl}>
          {t("emailTemplates.verifyEmail.action")}
        </Button>
      </Section>

      <Text style={styles.centeredMuted}>
        {t("emailTemplates.verifyEmail.expiry")}
      </Text>

      <Text style={styles.muted}>
        {t("emailTemplates.verifyEmail.ignore", {
          serverName: themeProps.serverName,
        })}
      </Text>
    </EmailLayout>
  )
}

export function getVerifyEmailSubject(input: { locale?: Locale }): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.verifyEmail.subject")
}
