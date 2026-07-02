import { Button, Heading, Section, Text } from "@react-email/components"
import { render } from "@react-email/render"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import { EmailLayout } from "@/server/email/templates/layout"

interface VerifyEmailProps {
  username: string
  verifyUrl: string
  serverName?: string
  baseUrl?: string
  locale?: Locale
}

export function VerifyEmailTemplate({
  username,
  verifyUrl,
  serverName = "Jellything",
  baseUrl,
  locale,
}: VerifyEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)

  return (
    <EmailLayout
      preview={t("emailTemplates.verifyEmail.preview", { serverName })}
      serverName={serverName}
      baseUrl={baseUrl}
      locale={locale}
    >
      <Heading style={heading}>
        {t("emailTemplates.verifyEmail.heading", { username })}
      </Heading>

      <Text style={paragraph}>{t("emailTemplates.verifyEmail.intro")}</Text>

      <Section style={buttonSection}>
        <Button style={button} href={verifyUrl}>
          {t("emailTemplates.verifyEmail.action")}
        </Button>
      </Section>

      <Text style={expiry}>{t("emailTemplates.verifyEmail.expiry")}</Text>

      <Text style={muted}>{t("emailTemplates.verifyEmail.ignore")}</Text>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#333333",
  margin: "0 0 12px",
  lineHeight: "28px",
}

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#333333",
  margin: "0",
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

export function getVerifyEmailSubject(input: { locale?: Locale }): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.verifyEmail.subject")
}

/**
 * Render the verify email template to HTML.
 */
export async function renderVerifyEmail(
  props: VerifyEmailProps,
): Promise<string> {
  return await render(<VerifyEmailTemplate {...props} />)
}
