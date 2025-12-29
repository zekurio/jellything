import { Button, Heading, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { EmailLayout } from "@/server/email/templates/layout";

interface PasswordResetProps {
  username: string;
  resetUrl: string;
  serverName?: string;
}

export function PasswordResetTemplate({
  username,
  resetUrl,
  serverName = "Jellything",
}: PasswordResetProps) {
  return (
    <EmailLayout preview={`Reset your ${serverName} password`} serverName={serverName}>
      <Heading style={heading}>Password Reset Request</Heading>
      <Text style={paragraph}>Hi {username},</Text>
      <Text style={paragraph}>
        We received a request to reset your password. Click the button below to choose a new
        password.
      </Text>
      <Button style={button} href={resetUrl}>
        Reset Password
      </Button>
      <Text style={paragraph}>This link will expire in 1 hour.</Text>
      <Text style={paragraph}>
        If you didn't request a password reset, you can safely ignore this email. Your password will
        remain unchanged.
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
 * Render the password reset template to HTML.
 */
export async function renderPasswordReset(props: PasswordResetProps): Promise<string> {
  return await render(<PasswordResetTemplate {...props} />);
}
