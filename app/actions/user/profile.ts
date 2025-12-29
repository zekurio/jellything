"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createApiWithToken } from "@/server/jellyfin/client";
import { getUserAvatarUrl } from "@/server/jellyfin";
import { deleteUser } from "@/server/jellyfin/admin";
import { getSession } from "@/lib/auth";
import { success, error, type ActionResult } from "../types";
import {
  changePasswordSchema,
  updateOwnProfileSchema,
  updateEmailSchema,
  uploadAvatarSchema,
} from "@/lib/schemas";
import {
  changePassword as changePasswordApi,
  getOwnProfile,
  updateOwnProfile,
  uploadOwnAvatar,
} from "@/server/jellyfin/user";
import {
  createEmailVerificationToken,
} from "@/server/tokens";
import { sendEmail, isEmailConfigured } from "@/server/email";
import { renderVerifyEmail } from "@/server/email/templates/verify-email";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { destroySession } from "@/server/session";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export async function getOwnProfileAction(): Promise<
  ActionResult<{
    id: string;
    name: string;
  }>
> {
  try {
    const session = await getSession();
    if (!session) {
      return error("Unauthorized");
    }

    const userApi = createApiWithToken(session.decryptedAccessToken);
    const profile = await getOwnProfile(userApi, session.user.jellyfinUserId);

    return success({
      id: session.user.jellyfinUserId,
      name: profile.name ?? "Unknown",
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to get profile");
  }
}

export async function getFullProfileAction(): Promise<
  ActionResult<{
    id: string;
    name: string;
    email: string | null;
    emailVerified: boolean;
    avatarUrl: string;
  }>
> {
  try {
    const session = await getSession();
    if (!session) {
      return error("Unauthorized");
    }

    const userApi = createApiWithToken(session.decryptedAccessToken);
    const profile = await getOwnProfile(userApi, session.user.jellyfinUserId);

    return success({
      id: session.user.jellyfinUserId,
      name: profile.name ?? "Unknown",
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      avatarUrl: getUserAvatarUrl(session.user.jellyfinUserId),
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to get profile");
  }
}

export async function updateOwnProfileAction(
  input: z.infer<typeof updateOwnProfileSchema>,
): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) {
      return error("Unauthorized");
    }

    const parsed = updateOwnProfileSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const userApi = createApiWithToken(session.decryptedAccessToken);
    await updateOwnProfile(userApi, session.user.jellyfinUserId, parsed.data);

    revalidatePath("/dashboard");
    return success(null);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to update profile");
  }
}

export async function changePasswordAction(
  input: z.infer<typeof changePasswordSchema>,
): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) {
      return error("Unauthorized");
    }

    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const userApi = createApiWithToken(session.decryptedAccessToken);
    await changePasswordApi(
      userApi,
      session.user.jellyfinUserId,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );

    return success(null);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to change password");
  }
}

export async function updateEmailAction(
  input: z.infer<typeof updateEmailSchema>,
): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) {
      return error("Unauthorized");
    }

    if (!isEmailConfigured()) {
      return error("Email service is not configured");
    }

    const parsed = updateEmailSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const newEmail = parsed.data.newEmail;

    const jellyfinUser = await getOwnProfile(
      createApiWithToken(session.decryptedAccessToken),
      session.user.jellyfinUserId,
    );

    await db
      .update(users)
      .set({ email: newEmail, emailVerified: false })
      .where(eq(users.id, session.user.id));

    const verifyToken = await createEmailVerificationToken(session.user.id);
    const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-email/${verifyToken}`;

    const html = await renderVerifyEmail({
      username: jellyfinUser.name,
      verifyUrl,
    });

    await sendEmail({
      to: newEmail,
      subject: "Verify your email address",
      html,
    });

    revalidatePath("/");
    return success(null);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to update email");
  }
}

export async function uploadAvatarAction(
  input: z.infer<typeof uploadAvatarSchema>,
): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) {
      return error("Unauthorized");
    }

    const parsed = uploadAvatarSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const { imageBase64, mimeType } = parsed.data;

    const imageBuffer = Buffer.from(imageBase64, "base64");
    if (imageBuffer.length > MAX_AVATAR_SIZE) {
      return error("Image must be less than 5MB");
    }

    const validMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimeTypes.includes(mimeType)) {
      return error("Invalid image type. Only JPEG, PNG, and WebP are allowed.");
    }

    const userApi = createApiWithToken(session.decryptedAccessToken);
    await uploadOwnAvatar(userApi, session.user.jellyfinUserId, imageBuffer, mimeType);

    revalidatePath("/dashboard");
    return success(null);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to upload avatar");
  }
}

export async function deleteAccountAction(): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) {
      return error("Unauthorized");
    }

    await deleteUser(session.user.jellyfinUserId);

    await db.delete(users).where(eq(users.id, session.user.id));

    const cookieStore = await cookies();
    const sessionId = cookieStore.get("session")?.value;
    if (sessionId) {
      await destroySession(sessionId);
    }

    revalidatePath("/");
    return success(null);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to delete account");
  }
}
