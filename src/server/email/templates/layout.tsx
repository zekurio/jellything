import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { CSSProperties, ReactNode } from "react"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"

interface EmailLayoutProps {
  preview: string
  children: ReactNode
  serverName?: string
  baseUrl?: string
  locale?: Locale
}

export function EmailLayout({
  preview,
  children,
  serverName = "Jellything",
  baseUrl,
  locale,
}: EmailLayoutProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)

  return (
    <Html lang={locale ?? DEFAULT_LOCALE}>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={wrapper}>
          <Section style={header}>
            <table
              cellPadding="0"
              cellSpacing="0"
              role="presentation"
              style={{ width: "100%" }}
            >
              <tr>
                {baseUrl && (
                  <td style={logoCell}>
                    <Img
                      src={`${baseUrl}/logo-192.png`}
                      width="28"
                      height="28"
                      alt={serverName}
                      style={logo}
                    />
                  </td>
                )}
                <td style={brandCell}>
                  <Text style={brandName}>{serverName}</Text>
                </td>
              </tr>
            </table>
          </Section>

          <Section style={content}>{children}</Section>

          <Section style={footerSection}>
            <Text style={footer}>
              {t("emailTemplates.layout.footer", { serverName })}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main: CSSProperties = {
  backgroundColor: "#ececef",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
  padding: "40px 16px",
}

const wrapper: CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "480px",
  borderRadius: "8px",
  border: "1px solid #dbdadf",
}

const header: CSSProperties = {
  padding: "24px 32px",
  borderBottom: "1px solid #dbdadf",
}

const logoCell: CSSProperties = {
  width: "28px",
  verticalAlign: "middle",
  paddingRight: "10px",
}

const logo: CSSProperties = {
  borderRadius: "6px",
  display: "block",
}

const brandCell: CSSProperties = {
  verticalAlign: "middle",
}

const brandName: CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#333333",
  margin: "0",
}

const content: CSSProperties = {
  padding: "28px 32px",
}

const footerSection: CSSProperties = {
  padding: "0 32px 24px",
  borderTop: "1px solid #dbdadf",
}

const footer: CSSProperties = {
  color: "#6c6b75",
  fontSize: "12px",
  lineHeight: "18px",
  textAlign: "center",
  margin: "20px 0 0",
}
