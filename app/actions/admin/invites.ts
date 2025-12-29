"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { inviteUsages, invites, profiles, users } from "@/server/db/schema";
import { requireAdmin } from "@/lib/auth";
import { generateInviteCode } from "@/server/invite";
import { getUserById } from "@/server/jellyfin";
import { success, error, type ActionResult } from "../types";
import { createInviteSchema, updateInviteSchema } from "@/lib/schemas";

function getInviteStatus(invite: {
  useLimit: number | null;
  useCount: number;
  expiresAt: Date | null;
}): "active" | "expired" | "exhausted" {
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return "expired";
  }
  if (invite.useLimit !== null && invite.useCount >= invite.useLimit) {
    return "exhausted";
  }
  return "active";
}

export type InviteListItem = {
  id: string;
  code: string;
  profileId: string;
  profileName: string;
  label: string | null;
  useLimit: number | null;
  useCount: number;
  expiresAt: string | null;
  createdAt: string;
  status: "active" | "expired" | "exhausted";
};

export type InviteDetail = InviteListItem;

export type InviteHistoryItem = {
  id: string;
  inviteId: string;
  inviteLabel: string | null;
  inviteCode: string;
  userId: string;
  jellyfinUserId: string | null;
  userName: string;
  avatarUrl: string | null;
  usedAt: string;
};

export async function listInvites(): Promise<ActionResult<InviteListItem[]>> {
  try {
    await requireAdmin();

    const result = await db
      .select({
        id: invites.id,
        code: invites.code,
        profileId: invites.profileId,
        profileName: profiles.name,
        label: invites.label,
        useLimit: invites.useLimit,
        useCount: invites.useCount,
        expiresAt: invites.expiresAt,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .leftJoin(profiles, eq(invites.profileId, profiles.id))
      .orderBy(desc(invites.createdAt));

    return success(
      result.map((inv) => ({
        id: inv.id,
        code: inv.code,
        profileId: inv.profileId,
        profileName: inv.profileName ?? "Unknown",
        label: inv.label,
        useLimit: inv.useLimit,
        useCount: inv.useCount,
        expiresAt: inv.expiresAt?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),
        status: getInviteStatus(inv),
      })),
    );
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to list invites");
  }
}

export async function getInvite(inviteId: string): Promise<ActionResult<InviteDetail>> {
  try {
    await requireAdmin();

    const [invite] = await db
      .select({
        id: invites.id,
        code: invites.code,
        profileId: invites.profileId,
        profileName: profiles.name,
        label: invites.label,
        useLimit: invites.useLimit,
        useCount: invites.useCount,
        expiresAt: invites.expiresAt,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .leftJoin(profiles, eq(invites.profileId, profiles.id))
      .where(eq(invites.id, inviteId));

    if (!invite) {
      return error("Invite not found");
    }

    return success({
      id: invite.id,
      code: invite.code,
      profileId: invite.profileId,
      profileName: invite.profileName ?? "Unknown",
      label: invite.label,
      useLimit: invite.useLimit,
      useCount: invite.useCount,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
      status: getInviteStatus(invite),
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to get invite");
  }
}

export async function createInviteAction(
  input: z.infer<typeof createInviteSchema>,
): Promise<ActionResult<InviteDetail>> {
  try {
    await requireAdmin();
    const parsed = createInviteSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, parsed.data.profileId));
    if (!profile) {
      return error("Profile not found");
    }

    let code = generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const [existing] = await db.select().from(invites).where(eq(invites.code, code));
      if (!existing) break;
      code = generateInviteCode();
      attempts++;
    }

    if (attempts >= 10) {
      return error("Failed to generate unique invite code. Please try again.");
    }

    const [invite] = await db
      .insert(invites)
      .values({
        code,
        profileId: parsed.data.profileId,
        label: parsed.data.label,
        useLimit: parsed.data.useLimit,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      })
      .returning();

    revalidatePath("/dashboard/invites");

    return success({
      id: invite.id,
      code: invite.code,
      profileId: invite.profileId,
      profileName: profile.name,
      label: invite.label,
      useLimit: invite.useLimit,
      useCount: invite.useCount,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
      status: getInviteStatus(invite) as "active" | "expired" | "exhausted",
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to create invite");
  }
}

export async function updateInviteAction(
  inviteId: string,
  input: z.infer<typeof updateInviteSchema>,
): Promise<ActionResult<InviteDetail>> {
  try {
    await requireAdmin();
    const parsed = updateInviteSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const [existing] = await db.select().from(invites).where(eq(invites.id, inviteId));
    if (!existing) {
      return error("Invite not found");
    }

    const [updated] = await db
      .update(invites)
      .set({
        ...(parsed.data.label !== undefined && { label: parsed.data.label }),
        ...(parsed.data.useLimit !== undefined && { useLimit: parsed.data.useLimit }),
        ...(parsed.data.expiresAt !== undefined && {
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        }),
      })
      .where(eq(invites.id, inviteId))
      .returning();

    const [profile] = await db
      .select({ name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, updated.profileId));

    revalidatePath("/dashboard/invites");

    return success({
      id: updated.id,
      code: updated.code,
      profileId: updated.profileId,
      profileName: profile?.name ?? "Unknown",
      label: updated.label,
      useLimit: updated.useLimit,
      useCount: updated.useCount,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      status: getInviteStatus(updated) as "active" | "expired" | "exhausted",
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to update invite");
  }
}

export async function deleteInviteAction(inviteId: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();

    const [existing] = await db.select().from(invites).where(eq(invites.id, inviteId));
    if (!existing) {
      return error("Invite not found");
    }

    await db.delete(inviteUsages).where(eq(inviteUsages.inviteId, inviteId));
    await db.delete(invites).where(eq(invites.id, inviteId));

    revalidatePath("/dashboard/invites");
    return success(null);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to delete invite");
  }
}

export async function getInviteHistory(): Promise<ActionResult<InviteHistoryItem[]>> {
  try {
    await requireAdmin();

    const result = await db
      .select({
        id: inviteUsages.id,
        inviteId: inviteUsages.inviteId,
        inviteLabel: invites.label,
        inviteCode: invites.code,
        userId: inviteUsages.userId,
        jellyfinUserId: users.jellyfinUserId,
        usedAt: inviteUsages.usedAt,
      })
      .from(inviteUsages)
      .leftJoin(invites, eq(inviteUsages.inviteId, invites.id))
      .leftJoin(users, eq(inviteUsages.userId, users.id))
      .orderBy(desc(inviteUsages.usedAt));

    const usagesWithUserData = await Promise.all(
      result.map(async (usage) => {
        let userName = "Unknown";
        let jellyfinUserId = usage.jellyfinUserId ?? null;
        let avatarUrl = null;
        if (usage.jellyfinUserId) {
          try {
            const jellyfinUser = await getUserById(usage.jellyfinUserId);
            userName = jellyfinUser.name;
            avatarUrl = jellyfinUser.avatarUrl;
          } catch {
            // User may have been deleted from Jellyfin
          }
        }
        return {
          id: usage.id,
          inviteId: usage.inviteId ?? "",
          inviteLabel: usage.inviteLabel,
          inviteCode: usage.inviteCode ?? "",
          userId: usage.userId,
          jellyfinUserId,
          userName,
          avatarUrl,
          usedAt: usage.usedAt.toISOString(),
        };
      }),
    );

    return success(usagesWithUserData);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to get invite history");
  }
}
