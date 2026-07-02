import { z } from "zod"

export const SeerrUserSchema = z.object({
  id: z.number(),
  email: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  jellyfinUserId: z.string().nullable().optional(),
  permissions: z.number().optional(),
})

export type SeerrUser = z.output<typeof SeerrUserSchema>

export const SeerrPageInfoSchema = z.object({
  pages: z.number(),
  pageSize: z.number(),
  results: z.number(),
  page: z.number(),
})

export type SeerrPageInfo = z.output<typeof SeerrPageInfoSchema>

export const SeerrUserResultsSchema = z.object({
  results: z.array(SeerrUserSchema).optional(),
  pageInfo: SeerrPageInfoSchema.optional(),
})

export type SeerrUserResults = z.output<typeof SeerrUserResultsSchema>

export const SeerrUserSearchResponseSchema = z.union([
  SeerrUserResultsSchema,
  z.array(SeerrUserSchema),
])

export type SeerrUserSearchResponse = z.output<
  typeof SeerrUserSearchResponseSchema
>

export const SeerrStatusSchema = z.object({
  version: z.string().optional(),
  commitTag: z.string().optional(),
  commitHash: z.string().optional(),
  buildDate: z.string().optional(),
  updateAvailable: z.boolean().optional(),
})

export type SeerrStatus = z.output<typeof SeerrStatusSchema> &
  Record<string, unknown>
