"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  getAllUsers,
  getUserById,
  getUserPolicy,
  updateUserPolicy,
  deleteUser,
  getMediaLibraries,
} from "@/server/jellyfin";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { success, error, type ActionResult } from "../types";
import { policyUpdateSchema, bulkPolicyUpdateSchema, bulkDeleteSchema } from "@/lib/schemas";
import type { JellyfinUserListItem, JellyfinUser, MediaLibrary } from "@/server/jellyfin/admin";

export async function listUsers(): Promise<ActionResult<JellyfinUserListItem[]>> {
  try {
    await requireAdmin();
    const users = await getAllUsers();
    return success(users);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to list users");
  }
}

export async function getUser(userId: string): Promise<ActionResult<JellyfinUser>> {
  try {
    await requireAdmin();
    const user = await getUserById(userId);
    return success(user);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to get user");
  }
}

export async function getLibraries(): Promise<ActionResult<MediaLibrary[]>> {
  try {
    await requireAdmin();
    const libraries = await getMediaLibraries();
    return success(libraries);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to get libraries");
  }
}

export async function getUserPolicyAction(userId: string): Promise<
  ActionResult<{
    enableAllFolders: boolean;
    enabledFolders: string[];
    remoteClientBitrateLimit: number;
    isDisabled: boolean;
    allowVideoTranscoding: boolean;
    allowAudioTranscoding: boolean;
    allowMediaRemuxing: boolean;
  }>
> {
  try {
    await requireAdmin();
    const policy = await getUserPolicy(userId);
    return success(policy);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to get user policy");
  }
}

export async function updateUserPolicyAction(
  userId: string,
  input: z.infer<typeof policyUpdateSchema>,
): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    const parsed = policyUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }
    await updateUserPolicy(userId, parsed.data);
    revalidatePath("/dashboard/users");
    return success(null);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to update policy");
  }
}

export async function deleteUserAction(userId: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await deleteUser(userId);
    revalidatePath("/dashboard/users");
    return success(null);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to delete user");
  }
}

export async function bulkUpdatePolicyAction(
  input: z.infer<typeof bulkPolicyUpdateSchema>,
): Promise<
  ActionResult<{
    success: boolean;
    updated: number;
    failed: number;
  }>
> {
  try {
    await requireAdmin();
    const parsed = bulkPolicyUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const results = await Promise.allSettled(
      parsed.data.userIds.map((id) => updateUserPolicy(id, parsed.data.updates)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;

    revalidatePath("/dashboard/users");

    return success({
      success: failed === 0,
      updated: results.length - failed,
      failed,
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to bulk update policies");
  }
}

export async function bulkDeleteUsersAction(input: z.infer<typeof bulkDeleteSchema>): Promise<
  ActionResult<{
    success: boolean;
    deleted: number;
    failed: number;
  }>
> {
  try {
    await requireAdmin();
    const parsed = bulkDeleteSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const results = await Promise.allSettled(parsed.data.userIds.map((id) => deleteUser(id)));
    const failed = results.filter((r) => r.status === "rejected").length;

    revalidatePath("/dashboard/users");

    return success({
      success: failed === 0,
      deleted: results.length - failed,
      failed,
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to bulk delete users");
  }
}

export async function getUserCreatedAtAction(
  userId: string,
): Promise<ActionResult<{ createdAt: Date | null }>> {
  try {
    await requireAdmin();
    const user = await db.query.users.findFirst({
      where: eq(users.userId, userId),
    });
    return success({ createdAt: user?.createdAt ?? null });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to get user info");
  }
}
