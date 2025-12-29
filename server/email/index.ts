import { Resend } from "resend";
import { env } from "@/lib/env";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const client = getResendClient();

  const { error } = await client.emails.send({
    from: env.EMAIL_FROM,
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
  return Boolean(env.RESEND_API_KEY);
}
