"use server";

import { env } from "@/lib/env";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, getUserByEmail } from "@/server/db";
import { inviteUsages, invites, profiles, users } from "@/server/db/schema";
import {
  authenticateUser,
  createUser,
  isUsernameTaken,
  updateUserPolicy,
  uploadUserAvatar,
} from "@/server/jellyfin";
import { createSession } from "@/server/session";
import { sendEmail, isEmailConfigured } from "@/server/email";
import { renderVerifyEmail } from "@/server/email/templates/verify-email";
import { createEmailVerificationToken } from "@/server/tokens";
import { success, error, type ActionResult } from "@/app/actions/types";
import { redeemInviteSchema } from "@/lib/schemas";

export async function validateInvite(code: string): Promise<
  ActionResult<{
    valid: boolean;
    profileName: string;
    error?: string;
  }>
> {
  const normalizedCode = code.toUpperCase();

  const [invite] = await db
    .select({
      id: invites.id,
      useLimit: invites.useLimit,
      useCount: invites.useCount,
      expiresAt: invites.expiresAt,
      profileName: profiles.name,
    })
    .from(invites)
    .leftJoin(profiles, eq(invites.profileId, profiles.id))
    .where(eq(invites.code, normalizedCode));

  if (!invite) {
    return success({
      valid: false,
      profileName: "",
      error: "Invalid invite code",
    });
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return success({
      valid: false,
      profileName: "",
      error: "This invite has expired",
    });
  }

  if (invite.useLimit !== null && invite.useCount >= invite.useLimit) {
    return success({
      valid: false,
      profileName: "",
      error: "This invite has reached its use limit",
    });
  }

  return success({
    valid: true,
    profileName: invite.profileName ?? "Default",
  });
}

export async function redeemInvite(input: z.infer<typeof redeemInviteSchema>): Promise<
  ActionResult<{
    success: boolean;
    user?: { userId: string; name: string };
    error?: string;
  }>
> {
  const parsed = redeemInviteSchema.safeParse(input);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message || "Validation failed");
  }

  const code = parsed.data.code.toUpperCase();

  const [invite] = await db
    .select({
      id: invites.id,
      profileId: invites.profileId,
      useLimit: invites.useLimit,
      useCount: invites.useCount,
      expiresAt: invites.expiresAt,
      policy: profiles.policy,
    })
    .from(invites)
    .leftJoin(profiles, eq(invites.profileId, profiles.id))
    .where(eq(invites.code, code));

  if (!invite) {
    return error("Invalid invite code");
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return error("This invite has expired");
  }

  if (invite.useLimit !== null && invite.useCount >= invite.useLimit) {
    return error("This invite has reached its use limit");
  }

  if (await isUsernameTaken(parsed.data.username)) {
    return error("Username is already taken");
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  if (await getUserByEmail(normalizedEmail)) {
    return error("Email is already registered");
  }

  let result:
    | {
        success: true;
        user: { userId: string; name: string };
      }
    | { success: false; error: string; status: number };

  try {
    result = await db.transaction(async (tx) => {
      const now = new Date();
      const updateResult = await tx
        .update(invites)
        .set({ useCount: sql`${invites.useCount} + 1` })
        .where(
          and(
            eq(invites.id, invite.id),
            or(isNull(invites.expiresAt), gt(invites.expiresAt, now)),
            or(isNull(invites.useLimit), lt(invites.useCount, invite.useLimit!)),
          ),
        )
        .returning({ id: invites.id });

      if (updateResult.length === 0) {
        return {
          success: false,
          error: "This invite is no longer valid",
          status: 400,
        } as const;
      }

      if (await isUsernameTaken(parsed.data.username)) {
        throw new Error("USERNAME_TAKEN");
      }

      const jellyfinUser = await createUser(parsed.data.username, parsed.data.password);

      if (invite.policy) {
        await updateUserPolicy(jellyfinUser.id, {
          enableAllFolders: invite.policy.enableAllFolders,
          enabledFolders: invite.policy.enabledFolders,
          remoteClientBitrateLimit: invite.policy.remoteClientBitrateLimit,
          isDisabled: invite.policy.isDisabled,
        });
      }

      if (parsed.data.avatar) {
        try {
          // Only accept jpeg, png, webp
          const dataUrlMatch = parsed.data.avatar.match(
            /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/,
          );

          if (!dataUrlMatch) {
            console.error("Invalid avatar format - must be JPEG, PNG, or WebP data URL");
          } else {
            const mimeType = dataUrlMatch[1];
            const base64Data = dataUrlMatch[2];
            const imageBuffer = Buffer.from(base64Data, "base64");

            // Validate size (max 5MB)
            const maxSize = 5 * 1024 * 1024;
            if (imageBuffer.length > maxSize) {
              console.error("Avatar too large - max 5MB");
            } else {
              await uploadUserAvatar(jellyfinUser.id, imageBuffer, mimeType);
            }
          }
        } catch {
          console.error("Failed to upload avatar");
        }
      }

      const [newUser] = await tx
        .insert(users)
        .values({
          userId: jellyfinUser.id,
          inviteId: invite.id,
          email: parsed.data.email.toLowerCase(),
          emailVerified: false,
        })
        .returning();

      await tx.insert(inviteUsages).values({
        inviteId: invite.id,
        userId: newUser.userId,
      });

      return {
        success: true,
        user: {
          userId: newUser.userId,
          name: jellyfinUser.name,
        },
      } as const;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "USERNAME_TAKEN") {
      return error("Username is already taken");
    }
    return error(err instanceof Error ? err.message : "Failed to create account");
  }

  if (!result.success) {
    return error(result.error);
  }

  if (isEmailConfigured()) {
    try {
      const token = await createEmailVerificationToken(result.user.userId);
      const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-email/${token}`;

      const html = await renderVerifyEmail({
        username: parsed.data.username,
        verifyUrl,
      });

      await sendEmail({
        to: parsed.data.email.toLowerCase(),
        subject: "Verify your email address",
        html,
      });
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
    }
  }

  try {
    const authResult = await authenticateUser(parsed.data.username, parsed.data.password);
    const sessionId = await createSession(
      result.user.userId,
      false,
      authResult.accessToken,
    );

    const cookieStore = await cookies();
    cookieStore.set("session", sessionId, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch {
    console.error("Failed to create session after registration");
  }

  revalidatePath("/");

  return success({ success: true, user: result.user });
}
