import { Button, Heading, Section, Text } from "@react-email/components"
import { render } from "@react-email/render"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import { EmailLayout } from "@/server/email/templates/layout"

interface PasswordResetEmailProps {
  username: string
  pin: string
  resetUrl: string
  expiresInMinutes: number
  serverName?: string
  baseUrl?: string
  locale?: Locale
}

export function PasswordResetEmailTemplate({
  username,
  pin,
  resetUrl,
  expiresInMinutes,
  serverName = "Jellything",
  baseUrl,
  locale,
}: PasswordResetEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
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
      preview={t("emailTemplates.passwordReset.preview", { serverName })}
      serverName={serverName}
      baseUrl={baseUrl}
      locale={locale}
    >
      <Heading style={heading}>
        {t("emailTemplates.passwordReset.heading")}
      </Heading>

      <Text style={paragraph}>
        {t("emailTemplates.passwordReset.greeting", { username })}
      </Text>
      <Text style={paragraph}>{t("emailTemplates.passwordReset.intro")}</Text>

      <Section style={buttonSection}>
        <Button style={button} href={resetUrl}>
          {t("emailTemplates.passwordReset.action")}
        </Button>
      </Section>

      <Text style={codeLabel}>
        {t("emailTemplates.passwordReset.manualCode")}
      </Text>
      <Text style={pinCode}>{pin}</Text>

      <Text style={expiry}>{expiryMessage}</Text>

      <Text style={muted}>{t("emailTemplates.passwordReset.ignore")}</Text>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#333333",
  margin: "0 0 16px",
  lineHeight: "28px",
}

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#333333",
  margin: "0 0 8px",
}

const buttonSection: React.CSSProperties = {
  textAlign: "center",
  margin: "24px 0",
}

const button: React.CSSProperties = {
  backgroundColor: "#6b5fc3",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 28px",
  display: "inline-block",
}

const codeLabel: React.CSSProperties = {
  fontSize: "13px",
  color: "#6c6b75",
  margin: "0 0 8px",
  textAlign: "center",
}

const pinCode: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: 700,
  fontFamily:
    "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  color: "#6b5fc3",
  textAlign: "center",
  letterSpacing: "0.3em",
  margin: "0 0 20px",
}

const expiry: React.CSSProperties = {
  fontSize: "13px",
  color: "#6c6b75",
  textAlign: "center",
  margin: "0 0 20px",
}

const muted: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6c6b75",
  margin: "0",
  borderTop: "1px solid #dbdadf",
  paddingTop: "16px",
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

/**
 * Render the password reset email template to HTML.
 */
export async function renderPasswordResetEmail(
  props: PasswordResetEmailProps,
): Promise<string> {
  return await render(<PasswordResetEmailTemplate {...props} />)
}
