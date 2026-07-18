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
import type { ReactNode } from "react"

import { createTranslator } from "@/lib/i18n"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales"
import type { ResolvedEmailTheme } from "@/server/email/branding"
import { createEmailLayoutStyles } from "@/server/email/templates/styles"

// Shared by every template: branding context resolved in messages.tsx.
export interface EmailThemeProps {
  serverName: string
  theme: ResolvedEmailTheme
  logoSrc?: string
  logoWidth?: number
  logoHeight?: number
  // Custom logos usually contain the wordmark already, so the header text
  // is skipped for them; the fallback app icon keeps it.
  showBrandName?: boolean
}

interface EmailLayoutProps extends EmailThemeProps {
  preview: string
  children: ReactNode
  locale?: Locale
}

const LOGO_MAX_DISPLAY_HEIGHT = 32
const LOGO_MAX_DISPLAY_WIDTH = 200

// Uploaded logos keep their natural aspect ratio but are scaled down to fit
// the header; small logos render at natural size.
function getLogoDisplaySize(
  width: number,
  height: number,
): {
  width: number
  height: number
} {
  const scale = Math.min(
    LOGO_MAX_DISPLAY_HEIGHT / height,
    LOGO_MAX_DISPLAY_WIDTH / width,
    1,
  )
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function EmailLayout({
  preview,
  children,
  serverName,
  theme,
  logoSrc,
  logoWidth,
  logoHeight,
  showBrandName,
  locale,
}: EmailLayoutProps) {
  const t = createTranslator(locale ?? DEFAULT_LOCALE)
  const styles = createEmailLayoutStyles(theme)
  const logoSize = getLogoDisplaySize(logoWidth ?? 28, logoHeight ?? 28)

  return (
    <Html lang={locale ?? DEFAULT_LOCALE}>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.wrapper}>
          <Section style={styles.header}>
            <table
              cellPadding="0"
              cellSpacing="0"
              role="presentation"
              style={{ width: "100%" }}
            >
              <tr>
                {logoSrc && (
                  <td style={{ ...styles.logoCell, width: logoSize.width }}>
                    <Img
                      src={logoSrc}
                      width={logoSize.width}
                      height={logoSize.height}
                      alt={serverName}
                      style={styles.logo}
                    />
                  </td>
                )}
                {(showBrandName !== false || !logoSrc) && (
                  <td style={styles.brandCell}>
                    <Text style={styles.brandName}>{serverName}</Text>
                  </td>
                )}
              </tr>
            </table>
          </Section>

          <Section style={styles.content}>{children}</Section>

          <Section style={styles.footerSection}>
            <Text style={styles.footer}>
              {t("emailTemplates.layout.footer", { serverName })}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
