"use server";

import { env } from "@/lib/env";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { getUserById } from "@/server/jellyfin";
import { sendEmail, isEmailConfigured } from "@/server/email";
import { renderVerifyEmail } from "@/server/email/templates/verify-email";
import {
  createEmailVerificationToken,
  validateEmailVerificationToken,
  deleteEmailVerificationToken,
} from "@/server/tokens";
import { getSession } from "@/lib/auth";
import { success, error, type ActionResult } from "@/app/actions/types";
import { emailVerificationSchema } from "@/lib/schemas";

export async function verifyEmail(input: { token: string }): Promise<ActionResult<null>> {
  const parsed = emailVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message || "Validation failed");
  }

  const user = await validateEmailVerificationToken(parsed.data.token);

  if (!user) {
    return error("Invalid or expired verification token");
  }

  await db.update(users).set({ emailVerified: true }).where(eq(users.jellyfinUserId, user.jellyfinUserId));
  await deleteEmailVerificationToken(user.jellyfinUserId);

  revalidatePath("/");

  return success(null);
}

export async function resendVerification(): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) {
    return error("Unauthorized");
  }

  if (!isEmailConfigured()) {
    return error("Email service is not configured");
  }

  const user = session.user;

  if (user.emailVerified) {
    return error("Email is already verified");
  }

  if (!user.email) {
    return error("No email address on file");
  }

  const jellyfinUser = await getUserById(user.jellyfinUserId);

  const token = await createEmailVerificationToken(user.jellyfinUserId);
  const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-email/${token}`;

  const html = await renderVerifyEmail({
    username: jellyfinUser.name,
    verifyUrl,
  });

  await sendEmail({
    to: user.email,
    subject: "Verify your email address",
    html,
  });

  return success(null);
}
