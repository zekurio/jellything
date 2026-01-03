import { z } from "zod";

// Password validation types
export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export interface PasswordValidationResult {
  isValid: boolean;
  strength: PasswordStrength;
  errors: string[];
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

/**
 * Validate password and return detailed results for UI
 */
export function validatePassword(password: string): PasswordValidationResult {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };

  const errors: string[] = [];
  if (!checks.minLength) errors.push("At least 8 characters");
  if (!checks.hasUppercase) errors.push("At least one uppercase letter");
  if (!checks.hasLowercase) errors.push("At least one lowercase letter");

  // Calculate strength based on passed checks
  const passedCount = Object.values(checks).filter(Boolean).length;
  let strength: PasswordStrength = "weak";
  if (passedCount >= 3) strength = "fair";
  if (passedCount >= 4) strength = "good";
  if (passedCount === 5) strength = "strong";

  const isValid = checks.minLength && checks.hasUppercase && checks.hasLowercase;

  return { isValid, strength, errors, checks };
}

/**
 * Password schema with strength requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter");

/**
 * Normalize email: trim whitespace and convert to lowercase
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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
    allowVideoTranscoding: z.boolean(),
    allowAudioTranscoding: z.boolean(),
    allowMediaRemuxing: z.boolean(),
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
      allowVideoTranscoding: z.boolean(),
      allowAudioTranscoding: z.boolean(),
      allowMediaRemuxing: z.boolean(),
    })
    .optional(),
  isDefault: z.boolean().optional(),
});

export const createInviteSchema = z.object({
  profileId: z.uuid("Invalid profile ID"),
  label: z.string().max(100).optional(),
  useLimit: z.number().min(1).optional(),
  expiresAt: z.iso.datetime().optional(),
});

export const updateInviteSchema = z.object({
  label: z.string().max(100).optional(),
  useLimit: z.number().min(1).nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
});

export const redeemInviteSchema = z.object({
  code: z.string().min(1, "Invite code is required"),
  username: z.string().min(1, "Username is required").max(100),
  password: passwordSchema,
  email: z.email("Invalid email address"),
  avatar: z.string().optional(),
});

export const policyUpdateSchema = z.object({
  enabledFolders: z.array(z.string()).optional(),
  enableAllFolders: z.boolean().optional(),
  remoteClientBitrateLimit: z.number().optional(),
  isDisabled: z.boolean().optional(),
  allowVideoTranscoding: z.boolean().optional(),
  allowAudioTranscoding: z.boolean().optional(),
  allowMediaRemuxing: z.boolean().optional(),
});

export const bulkPolicyUpdateSchema = z.object({
  userIds: z.array(z.string().min(1, "User ID is required")),
  updates: policyUpdateSchema,
});

export const bulkDeleteSchema = z.object({
  userIds: z.array(z.string().min(1, "User ID is required")),
});

export const emailVerificationSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

export const updateOwnProfileSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
});

export const updateEmailSchema = z.object({
  newEmail: z.email("Invalid email address"),
});

export const uploadAvatarSchema = z.object({
  imageBase64: z.string().min(1, "Image is required"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
