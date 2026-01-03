import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export interface ProfilePolicy {
  enableAllFolders: boolean;
  enabledFolders: string[];
  remoteClientBitrateLimit: number;
  isDisabled: boolean;
  allowVideoTranscoding: boolean;
  allowAudioTranscoding: boolean;
  allowMediaRemuxing: boolean;
}

export const DEFAULT_PROFILE_POLICY: ProfilePolicy = {
  enableAllFolders: true,
  enabledFolders: [],
  remoteClientBitrateLimit: 0,
  isDisabled: false,
  allowVideoTranscoding: true,
  allowAudioTranscoding: true,
  allowMediaRemuxing: true,
};

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isDefault: boolean("is_default").notNull().default(false),
  policy: jsonb("policy").notNull().$type<ProfilePolicy>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  userId: text("user_id").primaryKey(),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  inviteId: uuid("invite_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  createdById: text("created_by_id").references(() => users.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const inviteUsages = pgTable("invite_usages", {
  id: uuid("id").primaryKey().defaultRandom(),
  inviteId: uuid("invite_id")
    .notNull()
    .references(() => invites.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.userId),
  usedAt: timestamp("used_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  adminCheckedAt: timestamp("admin_checked_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  pendingEmail: text("pending_email"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
}));

export const invitesRelations = relations(invites, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [invites.profileId],
    references: [profiles.id],
  }),
  createdBy: one(users, {
    fields: [invites.createdById],
    references: [users.userId],
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
    references: [users.userId],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.userId],
  }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.userId],
  }),
}));

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
