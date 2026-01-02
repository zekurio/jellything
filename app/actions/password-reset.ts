"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import {
  forgotPassword,
  forgotPasswordPin,
  getUserById,
  authenticateUser,
  getPasswordResetPin,
} from "@/server/jellyfin/admin";
import { changePassword } from "@/server/jellyfin/user";
import { JELLYFIN_URL, JellyfinClient } from "@/server/jellyfin/client";
import { sendEmail, isEmailConfigured } from "@/server/email";
import { renderPasswordReset } from "@/server/email/templates/password-reset";
import { env } from "@/lib/env";
import { success, error, type ActionResult } from "@/app/actions/types";
import {
  passwordResetRequestSchema,
  passwordResetVerifyPinSchema,
  passwordResetCompleteSchema,
} from "@/lib/schemas";

export async function requestPasswordReset(input: {
  email: string;
}): Promise<ActionResult<{ username: string }>> {
  const parsed = passwordResetRequestSchema.safeParse(input);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message || "Validation failed");
  }

  if (!isEmailConfigured()) {
    return success({ username: "" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()));

  if (!user || !user.emailVerified || !user.email) {
    return success({ username: "" });
  }

  let pinInfo: Awaited<ReturnType<typeof getPasswordResetPin>> = null;
  let jellyfinUsername = "";

  try {
    const jellyfinUser = await getUserById(user.jellyfinUserId);
    jellyfinUsername = jellyfinUser.name;

    const result = await forgotPassword(jellyfinUser.name);

    if (result.action !== "PinCode") {
      return error("Password reset not available for this user");
    }

    pinInfo = await getPasswordResetPin(jellyfinUser.name);

    if (!pinInfo) {
      return error("Failed to retrieve password reset PIN");
    }

    const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?username=${encodeURIComponent(jellyfinUser.name)}&pin=${encodeURIComponent(pinInfo.pin)}`;

    const html = await renderPasswordReset({
      username: jellyfinUser.name,
      resetUrl,
    });

    await sendEmail({
      to: user.email,
      subject: "Your Jellyfin Password Reset PIN",
      html,
    });
  } catch {
    // Silent fail for email sending
  }

  return success({ username: jellyfinUsername });
}

export async function verifyPasswordResetPin(input: {
  username: string;
  pin: string;
}): Promise<ActionResult<null>> {
  const parsed = passwordResetVerifyPinSchema.safeParse(input);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message || "Validation failed");
  }

  const { username: _username, pin } = parsed.data;
  const cleanPin = pin.replace(/-/g, "").toUpperCase();

  try {
    await forgotPasswordPin(cleanPin);
  } catch {
    return error("Invalid or expired PIN. Please request a new one.");
  }

  return success(null);
}

export async function completePasswordReset(input: {
  username: string;
  pin: string;
  newPassword: string;
}): Promise<ActionResult<null>> {
  const parsed = passwordResetCompleteSchema.safeParse(input);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message || "Validation failed");
  }

  const { username, pin, newPassword } = parsed.data;
  const cleanPin = pin.replace(/-/g, "").toUpperCase();

  try {
    const authResult = await authenticateUser(username, cleanPin);

    const tempApi = new JellyfinClient(JELLYFIN_URL, authResult.accessToken);
    await changePassword(tempApi, authResult.id, cleanPin, newPassword);
  } catch {
    return error("Failed to reset password. Please try again or request a new PIN.");
  }

  revalidatePath("/");

  return success(null);
}
