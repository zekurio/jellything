import { relations, sql } from "drizzle-orm"
import {
  type AnySQLiteColumn,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import type { ProfileRenewalPolicy } from "@/lib/renewal-types"
import { DEFAULT_SEERR_PERMISSIONS } from "@/lib/seerr-permissions"

const DEFAULT_TIMESTAMP_MS = sql`(unixepoch() * 1000)`

function createId(): string {
  return crypto.randomUUID()
}

export interface SeerrQuotas {
  movieQuotaLimit?: number
  movieQuotaDays?: number
  tvQuotaLimit?: number
  tvQuotaDays?: number
}

export interface ProfilePolicy {
  enableAllFolders: boolean
  enabledFolders: string[]
  showInLoginScreen: boolean
  remoteClientBitrateLimit: number
  allowVideoTranscoding: boolean
  allowAudioTranscoding: boolean
  allowMediaRemuxing: boolean
  seerrPermissions: number
  seerrQuotas?: SeerrQuotas
  // Optional; stored inside the JSON `policy` column, so no migration is
  // required. Absent/undefined means self-service renewal is disabled.
  renewal?: ProfileRenewalPolicy
}

export const DEFAULT_PROFILE_POLICY: ProfilePolicy = {
  enableAllFolders: true,
  enabledFolders: [],
  showInLoginScreen: false,
  remoteClientBitrateLimit: 0,
  allowVideoTranscoding: true,
  allowAudioTranscoding: true,
  allowMediaRemuxing: true,
  seerrPermissions: DEFAULT_SEERR_PERMISSIONS,
}

export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name").notNull().unique(),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    policy: text("policy", { mode: "json" }).notNull().$type<ProfilePolicy>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(DEFAULT_TIMESTAMP_MS),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(DEFAULT_TIMESTAMP_MS),
  },
  (table) => [
    uniqueIndex("profiles_default_unique")
      .on(table.isDefault)
      .where(sql`${table.isDefault} = 1`),
  ],
)

export const users = sqliteTable("users", {
  userId: text("user_id").primaryKey(),
  email: text("email").unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  locale: text("locale"),
  profileId: text("profile_id").references((): AnySQLiteColumn => profiles.id, {
    onDelete: "set null",
  }),
  inviteId: text("invite_id").references((): AnySQLiteColumn => invites.id, {
    onDelete: "set null",
  }),
  seerrSyncedAt: integer("seerr_synced_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  expiryWarningSentAt: integer("expiry_warning_sent_at", {
    mode: "timestamp_ms",
  }),
  expiryWarningSentFor: integer("expiry_warning_sent_for", {
    mode: "timestamp_ms",
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(DEFAULT_TIMESTAMP_MS),
})

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().$defaultFn(createId),
  userId: text("user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  secretHash: text("secret_hash").notNull(),
  jellyfinAccessToken: text("jellyfin_access_token").notNull(),
  jellyfinDeviceId: text("jellyfin_device_id").notNull(),
  displayNameSnapshot: text("display_name_snapshot").notNull(),
  isAdminSnapshot: integer("is_admin_snapshot", { mode: "boolean" })
    .notNull()
    .default(false),
  lastValidatedAt: integer("last_validated_at", { mode: "timestamp_ms" }),
  validationBlockedUntil: integer("validation_blocked_until", {
    mode: "timestamp_ms",
  }),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(DEFAULT_TIMESTAMP_MS),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(DEFAULT_TIMESTAMP_MS),
})

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey().$defaultFn(createId),
  code: text("code").notNull().unique(),
  profileId: text("profile_id")
    .notNull()
    .references((): AnySQLiteColumn => profiles.id),
  isDisabled: integer("is_disabled", { mode: "boolean" })
    .notNull()
    .default(false),
  useLimit: integer("use_limit"),
  useCount: integer("use_count").notNull().default(0),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  createdById: text("created_by_id").references(
    (): AnySQLiteColumn => users.userId,
  ),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(DEFAULT_TIMESTAMP_MS),
})

export const inviteUsages = sqliteTable("invite_usages", {
  id: text("id").primaryKey().$defaultFn(createId),
  inviteId: text("invite_id")
    .notNull()
    .references(() => invites.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.userId),
  usedAt: integer("used_at", { mode: "timestamp_ms" })
    .notNull()
    .default(DEFAULT_TIMESTAMP_MS),
})

export const emailVerificationTokens = sqliteTable(
  "email_verification_tokens",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    pendingEmail: text("pending_email"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(DEFAULT_TIMESTAMP_MS),
  },
)

export const profilesRelations = relations(profiles, ({ many }) => ({
  invites: many(invites),
  users: many(users),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.profileId],
    references: [profiles.id],
  }),
  invite: one(invites, {
    fields: [users.inviteId],
    references: [invites.id],
  }),
  inviteUsages: many(inviteUsages),
  emailVerificationTokens: many(emailVerificationTokens),
  sessions: many(sessions),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.userId],
  }),
}))

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
}))

export const inviteUsagesRelations = relations(inviteUsages, ({ one }) => ({
  invite: one(invites, {
    fields: [inviteUsages.inviteId],
    references: [invites.id],
  }),
  user: one(users, {
    fields: [inviteUsages.userId],
    references: [users.userId],
  }),
}))

export const emailVerificationTokensRelations = relations(
  emailVerificationTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationTokens.userId],
      references: [users.userId],
    }),
  }),
)

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type Invite = typeof invites.$inferSelect
export type NewInvite = typeof invites.$inferInsert
export type InviteUsage = typeof inviteUsages.$inferSelect
export type NewInviteUsage = typeof inviteUsages.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect
export type NewEmailVerificationToken =
  typeof emailVerificationTokens.$inferInsert
