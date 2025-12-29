import { Button, Heading, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { EmailLayout } from "@/server/email/templates/layout";

interface VerifyEmailProps {
  username: string;
  verifyUrl: string;
  serverName?: string;
}

export function VerifyEmailTemplate({
  username,
  verifyUrl,
  serverName = "Jellything",
}: VerifyEmailProps) {
  return (
    <EmailLayout preview={`Verify your email for ${serverName}`} serverName={serverName}>
      <Heading style={heading}>Welcome, {username}!</Heading>
      <Text style={paragraph}>
        Thanks for signing up. Please verify your email address to enable password reset and other
        email features.
      </Text>
      <Button style={button} href={verifyUrl}>
        Verify Email Address
      </Button>
      <Text style={paragraph}>This link will expire in 24 hours.</Text>
      <Text style={paragraph}>
        If you didn't create an account, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: "bold",
  marginTop: "32px",
  marginBottom: "24px",
};

const paragraph = {
  fontSize: "16px",
  lineHeight: "26px",
  marginBottom: "16px",
};

const button = {
  backgroundColor: "#000000",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
  marginTop: "24px",
  marginBottom: "24px",
};

/**
 * Render the verify email template to HTML.
 */
export async function renderVerifyEmail(props: VerifyEmailProps): Promise<string> {
  return await render(<VerifyEmailTemplate {...props} />);
}
