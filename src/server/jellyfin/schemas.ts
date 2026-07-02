import { z } from "zod"

export const JellyfinUserPolicySchema = z.object({
  IsAdministrator: z.boolean().optional(),
  IsDisabled: z.boolean().optional(),
  IsHidden: z.boolean().optional(),
  EnabledFolders: z.array(z.string()).nullable().optional(),
  EnableAllFolders: z.boolean().optional(),
  RemoteClientBitrateLimit: z.number().optional(),
  EnableVideoPlaybackTranscoding: z.boolean().optional(),
  EnableAudioPlaybackTranscoding: z.boolean().optional(),
  EnablePlaybackRemuxing: z.boolean().optional(),
})

export type JellyfinUserPolicyRaw = z.output<typeof JellyfinUserPolicySchema>

export const JellyfinUserSchema = z.object({
  Id: z.string().optional(),
  Name: z.string().nullable().optional(),
  Policy: JellyfinUserPolicySchema.optional(),
  LastActivityDate: z.string().nullable().optional(),
  HasPassword: z.boolean().optional(),
})

export type JellyfinUserRaw = z.output<typeof JellyfinUserSchema>

export const JellyfinAuthenticationResultSchema = z.object({
  User: JellyfinUserSchema.optional(),
  AccessToken: z.string().nullable().optional(),
})

export type JellyfinAuthenticationResultRaw = z.output<
  typeof JellyfinAuthenticationResultSchema
>

export const JellyfinPublicSystemInfoSchema = z.object({
  ServerName: z.string().nullable().optional(),
  Version: z.string().nullable().optional(),
})

export type JellyfinPublicSystemInfoRaw = z.output<
  typeof JellyfinPublicSystemInfoSchema
>

export const JellyfinBaseItemSchema = z.object({
  Id: z.string().optional(),
  Name: z.string().nullable().optional(),
  CollectionType: z.string().nullable().optional(),
})

export type JellyfinBaseItemRaw = z.output<typeof JellyfinBaseItemSchema>

export const JellyfinMediaFoldersSchema = z.object({
  Items: z.array(JellyfinBaseItemSchema).nullable().optional(),
})

export type JellyfinMediaFoldersRaw = z.output<
  typeof JellyfinMediaFoldersSchema
>

export const JellyfinForgotPasswordActionSchema = z.enum([
  "PinCode",
  "ContactAdmin",
  "InNetworkRequired",
])

export const JellyfinForgotPasswordResultSchema = z.object({
  Action: JellyfinForgotPasswordActionSchema.optional(),
  PinFile: z.string().nullable().optional(),
  PinExpirationDate: z.string().nullable().optional(),
})

export type JellyfinForgotPasswordResultRaw = z.output<
  typeof JellyfinForgotPasswordResultSchema
>
