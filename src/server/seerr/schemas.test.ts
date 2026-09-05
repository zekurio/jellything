import { describe, expect, it } from "vitest"

import { parse, safeParse } from "@/lib/validation"
import {
  SeerrStatusSchema,
  SeerrUserSchema,
  SeerrUserSearchResponseSchema,
} from "@/server/seerr/schemas"

describe("Seerr response schemas", () => {
  it("accepts both search response shapes and strips nested extra fields", () => {
    const user = { id: 12, email: null, username: null, jellyfinUserId: null }
    expect(
      parse(SeerrUserSearchResponseSchema, [{ ...user, extra: true }]),
    ).toEqual([user])
    expect(
      parse(SeerrUserSearchResponseSchema, {
        results: [{ ...user, extra: true }],
        pageInfo: { pages: 1, pageSize: 10, results: 1, page: 1, extra: true },
        extra: true,
      }),
    ).toEqual({
      results: [user],
      pageInfo: { pages: 1, pageSize: 10, results: 1, page: 1 },
    })
    expect(parse(SeerrUserSearchResponseSchema, {})).toEqual({})
  })

  it.each([
    {},
    { id: "12" },
    { id: null },
    { id: 12, email: 123 },
    { id: 12, permissions: "admin" },
  ])("rejects invalid user fields %j", (value) => {
    expect(safeParse(SeerrUserSchema, value).success).toBe(false)
  })

  it("rejects malformed nested search results", () => {
    expect(
      safeParse(SeerrUserSearchResponseSchema, { results: [{ id: "12" }] })
        .success,
    ).toBe(false)
    expect(
      safeParse(SeerrUserSearchResponseSchema, [{ id: "12" }]).success,
    ).toBe(false)
    expect(
      safeParse(SeerrUserSearchResponseSchema, { pageInfo: { pages: 1 } })
        .success,
    ).toBe(false)
  })

  it("validates known status fields while stripping extras from schema decoding", () => {
    expect(parse(SeerrStatusSchema, { version: "1.0", extra: true })).toEqual({
      version: "1.0",
    })
    expect(
      safeParse(SeerrStatusSchema, { updateAvailable: "yes" }).success,
    ).toBe(false)
  })
})
