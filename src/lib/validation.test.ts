import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Type, type StaticDecode, type StaticEncode } from "typebox"
import { describe, expect, expectTypeOf, it } from "vitest"

import {
  dateSchema,
  defaulted,
  enumValues,
  nullable,
  parse,
  refine,
  safeParse,
  standardSchema,
  stringSchema,
  superRefine,
  trimmedString,
  ValidationError,
} from "@/lib/validation"

function issues(schema: Type.TSchema, value: unknown) {
  const result = safeParse(schema, value)
  expect(result.success).toBe(false)
  return result.success ? [] : result.error.issues
}

describe("TypeBox validation", () => {
  it("uses native schemas and preserves hidden kind metadata when annotating", () => {
    const schema = defaulted(
      refine(Type.String(), (value) => value !== "bad", "bad value"),
      "okay",
    )
    expect(Type.IsString(schema)).toBe(true)
    expect(schema.type).toBe("string")
    expect(parse(schema, undefined)).toBe("okay")
    expect(issues(schema, "bad")).toEqual([{ path: [], message: "bad value" }])
  })

  it("trims before constraints, without trimming other strings or mutating input", () => {
    const schema = Type.Object({
      text: trimmedString({
        minLength: 2,
        maxLength: 4,
        pattern: "^[a-z]+$",
        errorMessage: { minLength: "too short" },
      }),
      raw: Type.String(),
    })
    const value = { text: "  abcd  ", raw: " keep " }
    expect(parse(schema, value)).toEqual({ text: "abcd", raw: " keep " })
    expect(value.text).toBe("  abcd  ")
    expect(issues(schema, { text: "  a ", raw: "" })).toEqual([
      { path: ["text"], message: "too short" },
    ])
  })

  it("preserves UTF-16 length limits rather than counting grapheme clusters", () => {
    const schema = stringSchema({
      minLength: 2,
      maxLength: 4,
      errorMessage: { minLength: "short", maxLength: "long" },
    })
    expect(parse(schema, "😀")).toBe("😀")
    expect(parse(schema, "a\u0301")).toBe("a\u0301")
    expect(issues(schema, "a")).toEqual([{ path: [], message: "short" }])
    expect(issues(schema, "😀😀😀")).toEqual([{ path: [], message: "long" }])
    const confirmed = refine(
      Type.Object({ text: schema, confirm: Type.String() }),
      (value) => value.text === value.confirm,
      { path: ["confirm"], message: "mismatch" },
    )
    expect(issues(confirmed, { text: "a", confirm: "b" })).toEqual([
      { path: ["text"], message: "short" },
      { path: ["confirm"], message: "mismatch" },
    ])
  })

  it("applies native default metadata before validation and never defaults null", () => {
    const schema = Type.Object({
      count: Type.Integer({ minimum: 1, default: 3 }),
      nullable: defaulted(nullable(Type.String()), "fallback"),
      optional: Type.Optional(defaulted(Type.String(), "default")),
    })
    expect(parse(schema, {})).toEqual({
      count: 3,
      nullable: "fallback",
      optional: "default",
    })
    expect(parse(schema, { nullable: null })).toEqual({
      count: 3,
      nullable: null,
      optional: "default",
    })
    expect(safeParse(schema, { count: null }).success).toBe(false)
    expect(safeParse(Type.String({ default: 5 }), undefined).success).toBe(
      false,
    )
  })

  it("clones defaults on every parse", () => {
    const schema = defaulted(
      Type.Object({ items: Type.Array(Type.String()) }),
      { items: [] },
    )
    const first = parse(schema, undefined)
    first.items.push("changed")
    expect(parse(schema, undefined)).toEqual({ items: [] })
  })

  it("distinguishes missing, optional undefined, null and empty strings", () => {
    const schema = Type.Object({
      optional: Type.Optional(Type.String()),
      nullable: nullable(Type.String()),
    })
    expect(parse(schema, { nullable: null })).toEqual({ nullable: null })
    expect(parse(schema, { optional: undefined, nullable: "" })).toEqual({
      optional: undefined,
      nullable: "",
    })
    expect(safeParse(schema, { optional: null, nullable: "" }).success).toBe(
      false,
    )
    expect(safeParse(schema, {}).success).toBe(false)
  })

  it("strips unknown keys recursively unless passthrough or strict was requested", () => {
    const child = Type.Object({ name: Type.String() })
    const value = { child: { name: "a", secret: true }, extra: "value" }
    expect(parse(Type.Object({ child }), value)).toEqual({
      child: { name: "a" },
    })
    expect(
      parse(Type.Object({ child }, { additionalProperties: true }), value),
    ).toEqual({ child: { name: "a" }, extra: "value" })
    expect(
      safeParse(Type.Object({ child }, { additionalProperties: false }), value)
        .success,
    ).toBe(false)
    expect(value.child.secret).toBe(true)
  })

  it("retains record keys and validates their nested contents", () => {
    const schema = Type.Record(
      Type.String(),
      Type.Object({ value: trimmedString() }),
    )
    expect(parse(schema, { key: { value: " okay ", extra: true } })).toEqual({
      key: { value: "okay" },
    })
    expect(safeParse(schema, { key: { value: 1 } }).success).toBe(false)
  })

  it("does not coerce primitive values", () => {
    expect(safeParse(Type.Number(), "1").success).toBe(false)
    expect(safeParse(Type.Boolean(), "false").success).toBe(false)
    expect(safeParse(Type.String(), 1).success).toBe(false)
    expect(safeParse(Type.Number(), Number.NaN).success).toBe(false)
    expect(safeParse(Type.Number(), Infinity).success).toBe(false)
  })

  it("supports explicit native codecs after validation without cleaning passthrough keys", () => {
    const count = Type.Decode(Type.String({ pattern: "^\\d+$" }), Number)
    const schema = refine(
      Type.Object({ count }, { additionalProperties: true }),
      (value) => value.count > 0,
      { path: ["count"], message: "positive" },
    )
    expectTypeOf<StaticDecode<typeof schema>>().toEqualTypeOf<{
      count: number
    }>()
    expect(parse(schema, { count: "2", extra: "keep" })).toEqual({
      count: 2,
      extra: "keep",
    })
    expect(safeParse(schema, { count: 2 }).success).toBe(false)
    expect(issues(schema, { count: "0" })).toEqual([
      { path: ["count"], message: "positive" },
    ])
  })

  it("prefixes validation failures thrown by nested codecs but rethrows programmer errors", () => {
    const count = Type.Decode(Type.Unknown(), (value) =>
      parse(
        Type.Integer({ minimum: 1, errorMessage: "positive integer" }),
        Number(value),
      ),
    )
    const schema = Type.Object({ items: Type.Array(Type.Object({ count })) })
    expect(parse(schema, { items: [{ count: "2" }] })).toEqual({
      items: [{ count: 2 }],
    })
    expect(issues(schema, { items: [{ count: "0" }] })).toEqual([
      { path: ["items", 0, "count"], message: "positive integer" },
    ])
    const broken = Type.Decode(Type.String(), () => {
      throw new Error("programmer error")
    })
    expect(() => safeParse(broken, "value")).toThrow("programmer error")
  })

  it("selects union branches before decoding and runs their decoded refinements", () => {
    const schema = Type.Union([
      refine(
        Type.Decode(Type.String(), Number),
        (value) => value > 1,
        "too small",
      ),
      Type.Null(),
    ])
    expect(issues(schema, "1")).toEqual([{ path: [], message: "too small" }])
    expect(parse(schema, "2")).toBe(2)
    expect(parse(schema, null)).toBeNull()
  })

  it("prepares failing union branches before checking their constraints", () => {
    const schema = nullable(
      trimmedString({ minLength: 2, errorMessage: "too short" }),
    )
    expect(issues(schema, " a ")).toEqual([{ path: [], message: "too short" }])
    expect(parse(schema, " ab ")).toBe("ab")
    expect(
      parse(
        Type.Union([defaulted(Type.Null(), null), Type.String()]),
        undefined,
      ),
    ).toBeNull()
    expect(
      parse(defaulted(Type.Decode(Type.String(), Number), "2"), undefined),
    ).toBe(2)
  })

  it("keeps all declared properties when preparing object intersections", () => {
    const schema = Type.Intersect([
      Type.Object({ left: trimmedString() }),
      Type.Object({ right: defaulted(Type.Integer(), 1) }),
    ])
    expect(parse(schema, { left: " left ", extra: true })).toEqual({
      left: "left",
      right: 1,
    })
  })

  it("retains Date objects and rejects invalid dates or strings", () => {
    const date = new Date("2099-01-01T00:00:00Z")
    expect(parse(dateSchema, date)).toEqual(date)
    expect(safeParse(dateSchema, new Date("invalid")).success).toBe(false)
    expect(safeParse(dateSchema, date.toISOString()).success).toBe(false)
  })

  it("preserves numeric array indices and literal object keys in issue paths", () => {
    const schema = Type.Object({
      "a/b~c": Type.Array(
        Type.Object({
          "0": Type.String({ minLength: 1, errorMessage: "required" }),
        }),
      ),
    })
    expect(issues(schema, { "a/b~c": [{ "0": "" }] })).toEqual([
      { path: ["a/b~c", 0, "0"], message: "required" },
    ])
  })

  it("prefixes nested refinement paths and reports multiple form errors", () => {
    const child = superRefine(
      Type.Object({ name: Type.String() }),
      (_value, context) => {
        context.addIssue({ path: ["name"], message: "first" })
        context.addIssue({ message: "second" })
      },
    )
    expect(
      issues(Type.Object({ items: Type.Array(child) }), {
        items: [{ name: "" }],
      }),
    ).toEqual([
      { path: ["items", 0, "name"], message: "first" },
      { path: ["items", 0], message: "second" },
    ])
  })

  it("runs cross-field checks after constraint errors, but not missing-field/type errors", () => {
    const schema = refine(
      Type.Object({
        text: Type.String({ minLength: 2, errorMessage: "length" }),
        confirm: Type.String(),
      }),
      (value) => value.text.toLowerCase() === value.confirm,
      { path: ["confirm"], message: "mismatch" },
    )
    expect(issues(schema, { text: "a", confirm: "b" })).toEqual([
      { path: ["text"], message: "length" },
      { path: ["confirm"], message: "mismatch" },
    ])
    expect(() => safeParse(schema, { text: 1, confirm: "b" })).not.toThrow()
    expect(
      issues(schema, { confirm: "b" }).some(
        (issue) => issue.path[0] === "text",
      ),
    ).toBe(true)
  })

  it("throws a stable ValidationError containing issues", () => {
    expect(() => parse(Type.String(), 1)).toThrow(ValidationError)
    const result = safeParse(Type.String(), 1)
    if (result.success) throw new Error("Expected failure")
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error.name).toBe("ValidationError")
    expect(result.error.issues[0]?.path).toEqual([])
  })

  it("infers literal unions from readonly lists and string enums", () => {
    enum Choice {
      First = "first",
      Second = "second",
    }
    const list = enumValues(["first", "second"])
    const enumeration = enumValues(Choice)
    expectTypeOf<StaticDecode<typeof list>>().toEqualTypeOf<
      "first" | "second"
    >()
    expectTypeOf<StaticDecode<typeof enumeration>>().toEqualTypeOf<Choice>()
    expect(Type.IsUnion(list)).toBe(true)
    expect(parse(list, "first")).toBe("first")
    expect(parse(enumeration, "second")).toBe("second")
    expect(safeParse(list, "third").success).toBe(false)
    expect(safeParse(enumValues([]), "anything").success).toBe(false)
  })

  it("exposes optional default inputs and required decoded outputs in Standard Schema", () => {
    const schema = Type.Decode(
      Type.Object({ page: Type.Optional(defaulted(Type.Integer(), 1)) }),
      (value) => ({ page: value.page ?? 1 }),
    )
    expectTypeOf<StaticEncode<typeof schema>>().toEqualTypeOf<{
      page?: number
    }>()
    expectTypeOf<{}>().toExtend<StaticEncode<typeof schema>>()
    expectTypeOf<StaticDecode<typeof schema>>().toEqualTypeOf<{
      page: number
    }>()
    expect(standardSchema(schema)["~standard"].validate({})).toEqual({
      value: { page: 1 },
    })
  })

  it("preserves field messages and transformed values in the RHF resolver", async () => {
    const schema = Type.Object({
      name: trimmedString({
        minLength: 1,
        errorMessage: { minLength: "validation.nameRequired" },
      }),
    })
    const resolver = standardSchemaResolver(standardSchema(schema))
    const options = { fields: {}, shouldUseNativeValidation: false }
    expect(await resolver({ name: " name " }, undefined, options)).toEqual({
      values: { name: "name" },
      errors: {},
    })
    const result = await resolver({ name: " " }, undefined, options)
    expect(result.errors.name?.message).toBe("validation.nameRequired")
  })
})

describe("legacy string format rules", () => {
  it.each(["user@example.com", "user+tag@example.co.uk", "O'Neil@example.com"])(
    "accepts email %s",
    (value) => {
      expect(safeParse(Type.String({ format: "email" }), value).success).toBe(
        true,
      )
    },
  )
  it.each([
    " user@example.com",
    "user@example.com ",
    "a@localhost",
    ".a@example.com",
    "a..b@example.com",
    "a@example.c",
    '"a b"@example.com',
  ])("rejects email %s", (value) => {
    expect(safeParse(Type.String({ format: "email" }), value).success).toBe(
      false,
    )
  })
  it.each([
    "018f3f9f-3a65-7a6d-8c8f-30a8a1f705a1",
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ])("accepts UUID %s", (value) => {
    expect(safeParse(Type.String({ format: "uuid" }), value).success).toBe(true)
  })
  it.each([
    "018f3f9f-3a65-0a6d-8c8f-30a8a1f705a1",
    "018f3f9f-3a65-7a6d-0c8f-30a8a1f705a1",
    "invalid",
  ])("rejects UUID %s", (value) => {
    expect(safeParse(Type.String({ format: "uuid" }), value).success).toBe(
      false,
    )
  })
  it.each([
    "2024-02-29T12:34Z",
    "2024-02-29T12:34:56Z",
    "2024-02-29T12:34:56.123456Z",
    "0000-02-29T00:00Z",
  ])("accepts UTC datetime %s", (value) => {
    expect(safeParse(Type.String({ format: "date-time" }), value).success).toBe(
      true,
    )
  })
  it.each([
    "2023-02-29T12:34:56Z",
    "2024-04-31T00:00Z",
    "2024-01-01T24:00Z",
    "2024-01-01T12:34:60Z",
    "2024-01-01T12:34:56+00:00",
    "2024-01-01T12:34:56",
    "2024-01-01t12:34:56z",
  ])("rejects non-UTC or invalid datetime %s", (value) => {
    expect(safeParse(Type.String({ format: "date-time" }), value).success).toBe(
      false,
    )
  })
  it.each([
    "http://localhost:8096",
    "https://example.com/base",
    "mailto:user@example.com",
  ])("accepts URL %s", (value) => {
    expect(safeParse(Type.String({ format: "uri" }), value).success).toBe(true)
  })
  it("rejects relative URLs", () => {
    expect(safeParse(Type.String({ format: "uri" }), "/relative").success).toBe(
      false,
    )
  })
})
