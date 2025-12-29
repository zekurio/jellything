"use server";

import { env } from "@/lib/env";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { authenticateUser, adminResetUserPassword, getUserById } from "@/server/jellyfin";
import { sendEmail, isEmailConfigured } from "@/server/email";
import { renderPasswordReset } from "@/server/email/templates/password-reset";
import {
  createPasswordResetToken,
  validatePasswordResetToken,
  markPasswordResetTokenUsed,
} from "@/server/tokens";
import { createSession, sessionCookieConfig } from "@/server/session";
import { success, error, type ActionResult } from "@/app/actions/types";
import { passwordResetRequestSchema, passwordResetCompleteSchema } from "@/lib/schemas";

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult<null>> {
  const parsed = passwordResetRequestSchema.safeParse(input);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message || "Validation failed");
  }

  if (!isEmailConfigured()) {
    return success(null);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()));

  if (!user || !user.emailVerified || !user.email) {
    return success(null);
  }

  try {
    const jellyfinUser = await getUserById(user.jellyfinUserId);
    const token = await createPasswordResetToken(user.id);
    const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password/${token}`;

    const html = await renderPasswordReset({
      username: jellyfinUser.name,
      resetUrl,
    });

    await sendEmail({
      to: user.email,
      subject: "Reset your password",
      html,
    });
  } catch (emailError) {
    console.error("Failed to send password reset email:", emailError);
  }

  return success(null);
}

export async function validateResetToken(token: string): Promise<ActionResult<{ valid: boolean }>> {
  const result = await validatePasswordResetToken(token);
  return success({ valid: !!result });
}

export async function completePasswordReset(input: {
  token: string;
  newPassword: string;
}): Promise<ActionResult<null>> {
  const parsed = passwordResetCompleteSchema.safeParse(input);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message || "Validation failed");
  }

  const result = await validatePasswordResetToken(parsed.data.token);
  if (!result) {
    return error("Invalid or expired reset token");
  }

  const { user, token: tokenRecord } = result;

  try {
    await adminResetUserPassword(user.jellyfinUserId, parsed.data.newPassword);

    const jellyfinUser = await getUserById(user.jellyfinUserId);
    const authResult = await authenticateUser(jellyfinUser.name, parsed.data.newPassword);

    const sessionId = await createSession(
      authResult.id,
      authResult.isAdmin,
      authResult.accessToken,
    );
    await markPasswordResetTokenUsed(tokenRecord.id);

    const cookieStore = await cookies();
    cookieStore.set("session", sessionId, sessionCookieConfig);
  } catch {
    return error("Failed to reset password");
  }

  revalidatePath("/");

  return success(null);
}
