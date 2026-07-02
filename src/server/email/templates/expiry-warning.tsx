import { Button, Heading, Section, Text } from "@react-email/components"
import { render } from "@react-email/render"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import { EmailLayout } from "@/server/email/templates/layout"

interface ExpiryWarningEmailProps {
  username: string
  expiryDate: string
  manageUrl: string
  serverName?: string
  baseUrl?: string
  locale?: Locale
}

export function ExpiryWarningEmailTemplate({
  username,
  expiryDate,
  manageUrl,
  serverName = "Jellything",
  baseUrl,
  locale,
}: ExpiryWarningEmailProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)

  return (
    <EmailLayout
      preview={t("emailTemplates.expiryWarning.preview", { serverName })}
      serverName={serverName}
      baseUrl={baseUrl}
      locale={locale}
    >
      <Heading style={heading}>
        {t("emailTemplates.expiryWarning.heading", { username })}
      </Heading>

      <Text style={paragraph}>
        {t("emailTemplates.expiryWarning.intro", {
          serverName,
          expiryDate,
        })}
      </Text>

      <Text style={highlight}>{expiryDate}</Text>

      <Text style={paragraph}>{t("emailTemplates.expiryWarning.contact")}</Text>

      <Section style={buttonSection}>
        <Button style={button} href={manageUrl}>
          {t("emailTemplates.expiryWarning.action", { serverName })}
        </Button>
      </Section>

      <Text style={muted}>{t("emailTemplates.expiryWarning.footer")}</Text>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#1a1a2e",
  margin: "0 0 16px",
  lineHeight: "28px",
}

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#484868",
  margin: "0 0 12px",
}

const highlight: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#1a1a2e",
  fontWeight: 700,
  margin: "0 0 20px",
  textAlign: "center",
}

const buttonSection: React.CSSProperties = {
  textAlign: "center",
  margin: "24px 0",
}

const button: React.CSSProperties = {
  backgroundColor: "#615ff0",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 28px",
  display: "inline-block",
}

const muted: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#a0a0b8",
  margin: "0",
  borderTop: "1px solid #eeeef3",
  paddingTop: "16px",
}

export function getExpiryWarningEmailSubject(input: {
  serverName?: string
  locale?: Locale
}): string {
  const t = createTranslator(input.locale ?? DEFAULT_LOCALE)
  return t("emailTemplates.expiryWarning.subject", {
    serverName: input.serverName ?? "Jellything",
  })
}

export async function renderExpiryWarningEmail(
  props: ExpiryWarningEmailProps,
): Promise<string> {
  return await render(<ExpiryWarningEmailTemplate {...props} />)
}
