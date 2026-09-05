import { Type, type StaticDecode } from "typebox"

import { enumValues, nullable } from "@/lib/validation"

export const JellyfinUserPolicySchema = Type.Object({
  IsAdministrator: Type.Optional(Type.Boolean()),
  IsDisabled: Type.Optional(Type.Boolean()),
  IsHidden: Type.Optional(Type.Boolean()),
  EnabledFolders: Type.Optional(nullable(Type.Array(Type.String()))),
  EnableAllFolders: Type.Optional(Type.Boolean()),
  RemoteClientBitrateLimit: Type.Optional(Type.Number()),
  EnableVideoPlaybackTranscoding: Type.Optional(Type.Boolean()),
  EnableAudioPlaybackTranscoding: Type.Optional(Type.Boolean()),
  EnablePlaybackRemuxing: Type.Optional(Type.Boolean()),
})

export type JellyfinUserPolicyRaw = StaticDecode<
  typeof JellyfinUserPolicySchema
>

export const JellyfinUserSchema = Type.Object({
  Id: Type.Optional(Type.String()),
  Name: Type.Optional(nullable(Type.String())),
  Policy: Type.Optional(JellyfinUserPolicySchema),
  LastActivityDate: Type.Optional(nullable(Type.String())),
  HasPassword: Type.Optional(Type.Boolean()),
})

export type JellyfinUserRaw = StaticDecode<typeof JellyfinUserSchema>

export const JellyfinAuthenticationResultSchema = Type.Object({
  User: Type.Optional(JellyfinUserSchema),
  AccessToken: Type.Optional(nullable(Type.String())),
})

export type JellyfinAuthenticationResultRaw = StaticDecode<
  typeof JellyfinAuthenticationResultSchema
>

export const JellyfinPublicSystemInfoSchema = Type.Object({
  ServerName: Type.Optional(nullable(Type.String())),
  Version: Type.Optional(nullable(Type.String())),
})

export type JellyfinPublicSystemInfoRaw = StaticDecode<
  typeof JellyfinPublicSystemInfoSchema
>

export const JellyfinBaseItemSchema = Type.Object({
  Id: Type.Optional(Type.String()),
  Name: Type.Optional(nullable(Type.String())),
  CollectionType: Type.Optional(nullable(Type.String())),
})

export type JellyfinBaseItemRaw = StaticDecode<typeof JellyfinBaseItemSchema>

export const JellyfinMediaFoldersSchema = Type.Object({
  Items: Type.Optional(nullable(Type.Array(JellyfinBaseItemSchema))),
})

export type JellyfinMediaFoldersRaw = StaticDecode<
  typeof JellyfinMediaFoldersSchema
>

export const JellyfinForgotPasswordActionSchema = enumValues([
  "PinCode",
  "ContactAdmin",
  "InNetworkRequired",
])

export const JellyfinForgotPasswordResultSchema = Type.Object({
  Action: Type.Optional(JellyfinForgotPasswordActionSchema),
  PinFile: Type.Optional(nullable(Type.String())),
  PinExpirationDate: Type.Optional(nullable(Type.String())),
})

export type JellyfinForgotPasswordResultRaw = StaticDecode<
  typeof JellyfinForgotPasswordResultSchema
>
