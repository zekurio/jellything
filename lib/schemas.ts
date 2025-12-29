import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  profiles,
  invites,
  users,
  inviteUsages,
  sessions,
  emailVerificationTokens,
  passwordResetTokens,
} from "@/server/db/schema";

export const profileInsertSchema = createInsertSchema(profiles);
export const profileSelectSchema = createSelectSchema(profiles);

export const inviteInsertSchema = createInsertSchema(invites);
export const inviteSelectSchema = createSelectSchema(invites);

export const userInsertSchema = createInsertSchema(users);
export const userSelectSchema = createSelectSchema(users);

export const inviteUsageInsertSchema = createInsertSchema(inviteUsages);
export const sessionInsertSchema = createInsertSchema(sessions);
export const emailVerificationTokenInsertSchema = createInsertSchema(emailVerificationTokens);
export const passwordResetTokenInsertSchema = createInsertSchema(passwordResetTokens);

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const createProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  policy: z.object({
    enableAllFolders: z.boolean(),
    enabledFolders: z.array(z.string()),
    remoteClientBitrateLimit: z.number().min(0),
    isDisabled: z.boolean(),
  }),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  policy: z
    .object({
      enableAllFolders: z.boolean(),
      enabledFolders: z.array(z.string()),
      remoteClientBitrateLimit: z.number().min(0),
      isDisabled: z.boolean(),
    })
    .optional(),
  isDefault: z.boolean().optional(),
});

export const createInviteSchema = z.object({
  profileId: z.string().uuid("Invalid profile ID"),
  label: z.string().max(100).optional(),
  useLimit: z.number().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const updateInviteSchema = z.object({
  label: z.string().max(100).optional(),
  useLimit: z.number().min(1).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const redeemInviteSchema = z.object({
  code: z.string().min(1, "Invite code is required"),
  username: z.string().min(1, "Username is required").max(100),
  password: z.string().min(1, "Password is required"),
  email: z.string().email("Invalid email address"),
  avatar: z.string().optional(),
});

export const policyUpdateSchema = z.object({
  enabledFolders: z.array(z.string()).optional(),
  enableAllFolders: z.boolean().optional(),
  remoteClientBitrateLimit: z.number().optional(),
  isDisabled: z.boolean().optional(),
});

export const bulkPolicyUpdateSchema = z.object({
  userIds: z.array(z.string().uuid("Invalid user ID")),
  updates: policyUpdateSchema,
});

export const bulkDeleteSchema = z.object({
  userIds: z.array(z.string().uuid("Invalid user ID")),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const passwordResetCompleteSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z.string().min(1, "New password is required"),
});

export const emailVerificationSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(1, "New password is required"),
});

export const updateOwnProfileSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
});

export const updateEmailSchema = z.object({
  newEmail: z.string().email("Invalid email address"),
});

export const confirmEmailChangeSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
});

export const uploadAvatarSchema = z.object({
  imageBase64: z.string().min(1, "Image is required"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
