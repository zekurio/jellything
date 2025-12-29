"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { profiles, DEFAULT_PROFILE_POLICY, type Profile } from "@/server/db/schema";
import { requireAdmin } from "@/lib/auth";
import { success, error, type ActionResult } from "../types";
import { createProfileSchema, updateProfileSchema } from "@/lib/schemas";

export type ProfileListItem = Omit<Profile, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export async function listProfiles(): Promise<ActionResult<ProfileListItem[]>> {
  try {
    await requireAdmin();
    const result = await db
      .select({
        id: profiles.id,
        name: profiles.name,
        isDefault: profiles.isDefault,
        policy: profiles.policy,
        createdAt: profiles.createdAt,
        updatedAt: profiles.updatedAt,
      })
      .from(profiles)
      .orderBy(profiles.name);

    return success(
      result.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    );
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to list profiles");
  }
}

export async function getProfile(profileId: string): Promise<ActionResult<ProfileListItem>> {
  try {
    await requireAdmin();
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));

    if (!profile) {
      return error("Profile not found");
    }

    return success({
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to get profile");
  }
}

export async function createProfileAction(
  input: z.infer<typeof createProfileSchema>,
): Promise<ActionResult<ProfileListItem>> {
  try {
    await requireAdmin();
    const parsed = createProfileSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const [profile] = await db
      .insert(profiles)
      .values({
        name: parsed.data.name,
        policy: parsed.data.policy,
      })
      .returning();

    revalidatePath("/dashboard/profiles");

    return success({
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      return error("A profile with this name already exists");
    }
    return error(err instanceof Error ? err.message : "Failed to create profile");
  }
}

export async function updateProfileAction(
  profileId: string,
  input: z.infer<typeof updateProfileSchema>,
): Promise<ActionResult<ProfileListItem>> {
  try {
    await requireAdmin();
    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message || "Validation failed");
    }

    const [existing] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    if (!existing) {
      return error("Profile not found");
    }

    if (parsed.data.isDefault === false && existing.isDefault) {
      return error("Cannot unset the default profile. Set another profile as default instead.");
    }

    if (parsed.data.isDefault) {
      await db
        .update(profiles)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(profiles.isDefault, true));
    }

    const [updated] = await db
      .update(profiles)
      .set({
        ...(parsed.data.name && { name: parsed.data.name }),
        ...(parsed.data.policy && { policy: parsed.data.policy }),
        ...(parsed.data.isDefault !== undefined && { isDefault: parsed.data.isDefault }),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId))
      .returning();

    revalidatePath("/dashboard/profiles");

    return success({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      return error("A profile with this name already exists");
    }
    return error(err instanceof Error ? err.message : "Failed to update profile");
  }
}

export async function deleteProfileAction(profileId: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();

    const [existing] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    if (!existing) {
      return error("Profile not found");
    }

    if (existing.isDefault) {
      return error("Cannot delete the default profile");
    }

    await db.delete(profiles).where(eq(profiles.id, profileId));
    revalidatePath("/dashboard/profiles");
    return success(null);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to delete profile");
  }
}

export async function ensureDefaultProfile(): Promise<
  ActionResult<{
    exists: boolean;
    created?: boolean;
    profile?: ProfileListItem;
  }>
> {
  try {
    await requireAdmin();

    const [existing] = await db.select().from(profiles).where(eq(profiles.isDefault, true));

    if (existing) {
      return success({
        exists: true,
        profile: {
          ...existing,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        },
      });
    }

    const [created] = await db
      .insert(profiles)
      .values({
        name: "Default",
        isDefault: true,
        policy: DEFAULT_PROFILE_POLICY,
      })
      .returning();

    revalidatePath("/dashboard/profiles");

    return success({
      exists: false,
      created: true,
      profile: {
        ...created,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to ensure default profile");
  }
}
