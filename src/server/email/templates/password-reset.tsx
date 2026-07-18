import { Button, Heading, Section, Text } from "@react-email/components"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import {
  EmailLayout,
  type EmailThemeProps,
} from "@/server/email/templates/layout"
import { createEmailTemplateStyles } from "@/server/email/templates/styles"

interface PasswordResetEmailProps extends EmailThemeProps {
  username: string
  pin: string
  resetUrl: string
  expiresInMinutes: number
  locale?: Locale
}

export function PasswordResetEmailTemplate({
  username,
  pin,
  resetUrl,
  expiresInMinutes,
  locale,
  ...themeProps
}: PasswordResetEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailTemplateStyles(themeProps.theme)
  const expiryMessage =
    expiresInMinutes === 1
      ? t("emailTemplates.passwordReset.expiresSingle", {
          minutes: expiresInMinutes,
        })
      : t("emailTemplates.passwordReset.expiresPlural", {
          minutes: expiresInMinutes,
        })

  return (
    <EmailLayout
      preview={t("emailTemplates.passwordReset.preview", {
        serverName: themeProps.serverName,
      })}
      locale={locale}
      {...themeProps}
    >
      <Heading style={styles.heading}>
        {t("emailTemplates.passwordReset.heading")}
      </Heading>

      <Text style={styles.paragraph}>
        {t("emailTemplates.passwordReset.greeting", { username })}
      </Text>
      <Text style={styles.paragraph}>
        {t("emailTemplates.passwordReset.intro")}
      </Text>

      <Section style={styles.buttonSection}>
        <Button style={styles.button} href={resetUrl}>
          {t("emailTemplates.passwordReset.action")}
        </Button>
      </Section>

      <Text style={styles.codeLabel}>
        {t("emailTemplates.passwordReset.manualCode")}
      </Text>
      <Text style={styles.pinCode}>{pin}</Text>

      <Text style={styles.centeredMuted}>{expiryMessage}</Text>

      <Text style={styles.muted}>
        {t("emailTemplates.passwordReset.ignore")}
      </Text>
    </EmailLayout>
  )
}

export function getPasswordResetEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.passwordReset.subject", {
    serverName: input.serverName ?? "Jellything",
  })
}
