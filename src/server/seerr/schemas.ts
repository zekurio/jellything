import { Type, type StaticDecode } from "typebox"

import { nullable } from "@/lib/validation"

export const SeerrUserSchema = Type.Object({
  id: Type.Number(),
  email: Type.Optional(nullable(Type.String())),
  username: Type.Optional(nullable(Type.String())),
  jellyfinUserId: Type.Optional(nullable(Type.String())),
  permissions: Type.Optional(Type.Number()),
})

export type SeerrUser = StaticDecode<typeof SeerrUserSchema>

export const SeerrPageInfoSchema = Type.Object({
  pages: Type.Number(),
  pageSize: Type.Number(),
  results: Type.Number(),
  page: Type.Number(),
})

export type SeerrPageInfo = StaticDecode<typeof SeerrPageInfoSchema>

export const SeerrUserResultsSchema = Type.Object({
  results: Type.Optional(Type.Array(SeerrUserSchema)),
  pageInfo: Type.Optional(SeerrPageInfoSchema),
})

export type SeerrUserResults = StaticDecode<typeof SeerrUserResultsSchema>

export const SeerrUserSearchResponseSchema = Type.Union([
  SeerrUserResultsSchema,
  Type.Array(SeerrUserSchema),
])

export type SeerrUserSearchResponse = StaticDecode<
  typeof SeerrUserSearchResponseSchema
>

export const SeerrStatusSchema = Type.Object({
  version: Type.Optional(Type.String()),
  commitTag: Type.Optional(Type.String()),
  commitHash: Type.Optional(Type.String()),
  buildDate: Type.Optional(Type.String()),
  updateAvailable: Type.Optional(Type.Boolean()),
})

export type SeerrStatus = StaticDecode<typeof SeerrStatusSchema> &
  Record<string, unknown>
