import { describe, expect, it } from "vitest"

import { parse, safeParse } from "@/lib/validation"
import {
  JellyfinAuthenticationResultSchema,
  JellyfinForgotPasswordResultSchema,
  JellyfinMediaFoldersSchema,
  JellyfinUserSchema,
} from "@/server/jellyfin/schemas"

describe("Jellyfin response schemas", () => {
  it("preserves optional and nullable fields and strips nested unknown fields", () => {
    expect(
      parse(JellyfinAuthenticationResultSchema, {
        User: {
          Id: "user",
          Name: null,
          LastActivityDate: null,
          Policy: { IsAdministrator: false, EnabledFolders: null, Extra: true },
          Extra: true,
        },
        AccessToken: null,
        Extra: true,
      }),
    ).toEqual({
      User: {
        Id: "user",
        Name: null,
        LastActivityDate: null,
        Policy: { IsAdministrator: false, EnabledFolders: null },
      },
      AccessToken: null,
    })
    expect(parse(JellyfinUserSchema, {})).toEqual({})
    expect(parse(JellyfinMediaFoldersSchema, { Items: null })).toEqual({
      Items: null,
    })
  })

  it("strips unknown properties from array members", () => {
    expect(
      parse(JellyfinMediaFoldersSchema, {
        Items: [
          { Id: "movies", Name: "Movies", CollectionType: null, Extra: true },
        ],
      }),
    ).toEqual({
      Items: [{ Id: "movies", Name: "Movies", CollectionType: null }],
    })
  })

  it.each([
    { Id: 123 },
    { Id: null },
    { Policy: null },
    { Policy: { IsAdministrator: "true" } },
    { Policy: { EnabledFolders: [123] } },
    { Policy: { RemoteClientBitrateLimit: Number.POSITIVE_INFINITY } },
  ])("rejects invalid user fields %j", (value) => {
    expect(safeParse(JellyfinUserSchema, value).success).toBe(false)
  })

  it.each(["PinCode", "ContactAdmin", "InNetworkRequired"])(
    "accepts forgot-password action %s",
    (Action) => {
      expect(parse(JellyfinForgotPasswordResultSchema, { Action })).toEqual({
        Action,
      })
    },
  )

  it("rejects unsupported forgot-password actions", () => {
    expect(
      safeParse(JellyfinForgotPasswordResultSchema, { Action: "Unknown" })
        .success,
    ).toBe(false)
  })
})
