import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";
import type * as React from "react";

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  serverName?: string;
}

export function EmailLayout({ preview, children, serverName = "Jellything" }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={content}>{children}</Section>
          <Text style={footer}>
            This email was sent by {serverName}. If you did not expect this email, you can safely
            ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
};

const content = {
  padding: "0 48px",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  textAlign: "center" as const,
  marginTop: "32px",
};
