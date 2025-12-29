import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Profile policy type - matches Jellyfin UserPolicy structure
export interface ProfilePolicy {
  enableAllFolders: boolean;
  enabledFolders: string[];
  remoteClientBitrateLimit: number;
  isDisabled: boolean;
  // Expandable with more Jellyfin policy fields later
}

// Default policy for new profiles
export const DEFAULT_PROFILE_POLICY: ProfilePolicy = {
  enableAllFolders: true,
  enabledFolders: [],
  remoteClientBitrateLimit: 0,
  isDisabled: false,
};

// Profiles - reusable policy templates for invites
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isDefault: boolean("is_default").notNull().default(false),
  policy: jsonb("policy").notNull().$type<ProfilePolicy>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  jellyfinUserId: text("jellyfin_user_id").notNull().unique(),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  inviteId: uuid("invite_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Invites - shareable codes with optional limits
export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  label: text("label"),
  useLimit: integer("use_limit"),
  useCount: integer("use_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Invite usage tracking
export const inviteUsages = pgTable("invite_usages", {
  id: uuid("id").primaryKey().defaultRandom(),
  inviteId: uuid("invite_id")
    .notNull()
    .references(() => invites.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  usedAt: timestamp("used_at").notNull().defaultNow(),
});

// Sessions
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  adminCheckedAt: timestamp("admin_checked_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Email verification tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  pendingEmail: text("pending_email"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(), // SHA-256 hash
  expiresAt: timestamp("expires_at").notNull(), // 1 hour
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const profilesRelations = relations(profiles, ({ many }) => ({
  invites: many(invites),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  sessions: many(sessions),
  invite: one(invites, {
    fields: [users.inviteId],
    references: [invites.id],
  }),
  inviteUsages: many(inviteUsages),
  emailVerificationTokens: many(emailVerificationTokens),
  passwordResetTokens: many(passwordResetTokens),
}));

export const invitesRelations = relations(invites, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [invites.profileId],
    references: [profiles.id],
  }),
  createdBy: one(users, {
    fields: [invites.createdById],
    references: [users.id],
  }),
  usages: many(inviteUsages),
}));

export const inviteUsagesRelations = relations(inviteUsages, ({ one }) => ({
  invite: one(invites, {
    fields: [inviteUsages.inviteId],
    references: [invites.id],
  }),
  user: one(users, {
    fields: [inviteUsages.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

// Type exports
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
export type InviteUsage = typeof inviteUsages.$inferSelect;
export type NewInviteUsage = typeof inviteUsages.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
