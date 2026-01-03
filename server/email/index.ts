import { Resend } from "resend";
import { configManager } from "@/lib/config";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = configManager.email?.resendApiKey;
    if (!apiKey) {
      throw new Error("Resend API key is not configured");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Reset the cached Resend client.
 * Call this after updating email configuration to ensure the new API key is used.
 */
export function resetEmailClient(): void {
  resendClient = null;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const client = getResendClient();
  const emailConfig = configManager.email;

  if (!emailConfig?.from) {
    throw new Error("Email 'from' address is not configured");
  }

  const { error } = await client.emails.send({
    from: emailConfig.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(configManager.email?.resendApiKey);
}
