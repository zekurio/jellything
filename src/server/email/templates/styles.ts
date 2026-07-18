import type { CSSProperties } from "react"

import type { ResolvedEmailTheme } from "@/server/email/branding"

export interface EmailTemplateStyles {
  heading: CSSProperties
  paragraph: CSSProperties
  buttonSection: CSSProperties
  button: CSSProperties
  muted: CSSProperties
  centeredMuted: CSSProperties
  highlight: CSSProperties
  codeLabel: CSSProperties
  pinCode: CSSProperties
  link: CSSProperties
  list: CSSProperties
  listItem: CSSProperties
}

export interface EmailLayoutStyles {
  main: CSSProperties
  wrapper: CSSProperties
  header: CSSProperties
  logoCell: CSSProperties
  logo: CSSProperties
  brandCell: CSSProperties
  brandName: CSSProperties
  content: CSSProperties
  footerSection: CSSProperties
  footer: CSSProperties
}

export function createEmailLayoutStyles(
  theme: ResolvedEmailTheme,
): EmailLayoutStyles {
  return {
    main: {
      backgroundColor: theme.pageBackground,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
      padding: "40px 16px",
    },
    wrapper: {
      backgroundColor: theme.surface,
      margin: "0 auto",
      maxWidth: "480px",
      borderRadius: "8px",
      border: `1px solid ${theme.border}`,
    },
    header: {
      padding: "24px 32px",
      borderBottom: `1px solid ${theme.border}`,
    },
    logoCell: {
      verticalAlign: "middle",
      paddingRight: "10px",
    },
    logo: {
      borderRadius: "6px",
      display: "block",
    },
    brandCell: {
      verticalAlign: "middle",
    },
    brandName: {
      fontSize: "16px",
      fontWeight: 700,
      color: theme.text,
      margin: "0",
    },
    content: {
      padding: "28px 32px",
    },
    footerSection: {
      padding: "0 32px 24px",
      borderTop: `1px solid ${theme.border}`,
    },
    footer: {
      color: theme.mutedText,
      fontSize: "12px",
      lineHeight: "18px",
      textAlign: "center",
      margin: "20px 0 0",
    },
  }
}

export function createEmailTemplateStyles(
  theme: ResolvedEmailTheme,
): EmailTemplateStyles {
  return {
    heading: {
      fontSize: "20px",
      fontWeight: 700,
      color: theme.text,
      margin: "0 0 16px",
      lineHeight: "28px",
    },
    paragraph: {
      fontSize: "15px",
      lineHeight: "24px",
      color: theme.text,
      margin: "0 0 12px",
    },
    buttonSection: {
      textAlign: "center",
      margin: "24px 0",
    },
    button: {
      backgroundColor: theme.accent,
      borderRadius: "6px",
      color: theme.accentForeground,
      fontSize: "15px",
      fontWeight: 600,
      textDecoration: "none",
      padding: "12px 28px",
      display: "inline-block",
    },
    muted: {
      fontSize: "13px",
      lineHeight: "20px",
      color: theme.mutedText,
      margin: "0",
      borderTop: `1px solid ${theme.border}`,
      paddingTop: "16px",
    },
    centeredMuted: {
      fontSize: "13px",
      lineHeight: "20px",
      color: theme.mutedText,
      textAlign: "center",
      margin: "0 0 20px",
    },
    highlight: {
      fontSize: "16px",
      lineHeight: "24px",
      color: theme.accentText,
      fontWeight: 700,
      margin: "0 0 20px",
      textAlign: "center",
    },
    codeLabel: {
      fontSize: "13px",
      color: theme.mutedText,
      margin: "0 0 8px",
      textAlign: "center",
    },
    pinCode: {
      fontSize: "32px",
      fontWeight: 700,
      fontFamily:
        "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
      color: theme.accentText,
      textAlign: "center",
      letterSpacing: "0.3em",
      margin: "0 0 20px",
    },
    link: {
      color: theme.accentText,
      textDecoration: "underline",
    },
    list: {
      fontSize: "15px",
      lineHeight: "24px",
      color: theme.text,
      margin: "0 0 12px",
      paddingLeft: "24px",
    },
    listItem: {
      margin: "0 0 4px",
    },
  }
}
