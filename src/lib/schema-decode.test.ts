import { Type } from "typebox"
import { describe, expect, it } from "vitest"

import {
  decodeWithSchema,
  ExternalServiceDecodeError,
} from "@/lib/schema-decode"
import { ValidationError } from "@/lib/validation"

const context = { service: "Jellyfin", path: "/Users" }

describe("external response decoding", () => {
  it("strips unknown properties recursively without mutating the response", () => {
    const schema = Type.Array(
      Type.Object({ user: Type.Object({ id: Type.String() }) }),
    )
    const response = [{ user: { id: "123", secret: "hidden" }, extra: true }]
    expect(decodeWithSchema(schema, response, context)).toEqual([
      { user: { id: "123" } },
    ])
    expect(response[0]?.user.secret).toBe("hidden")
  })

  it("returns decoded codec values", () => {
    const schema = Type.Object({
      count: Type.Decode(Type.String(), (value) => Number(value)),
    })
    expect(decodeWithSchema(schema, { count: "42" }, context)).toEqual({
      count: 42,
    })
  })

  it("reports service, endpoint, and nested issue paths without response values", () => {
    const schema = Type.Array(Type.Object({ id: Type.Number() }))
    const decode = () =>
      decodeWithSchema(schema, [{ id: "secret-token" }], context)
    expect(decode).toThrow(ExternalServiceDecodeError)
    expect(decode).toThrow(
      "Jellyfin returned an invalid response for /Users: 0.id:",
    )
    expect(decode).toThrow(
      expect.objectContaining({
        service: "Jellyfin",
        path: "/Users",
        cause: expect.any(ValidationError),
      }),
    )
    expect(decode).not.toThrow("secret-token")
  })

  it("labels root errors and joins multiple issues", () => {
    expect(() => decodeWithSchema(Type.String(), null, context)).toThrow(
      "<root>:",
    )
    expect(() =>
      decodeWithSchema(
        Type.Object({ id: Type.Number(), name: Type.String() }),
        { id: false, name: false },
        context,
      ),
    ).toThrow(/id:.*; name:/)
  })
})
