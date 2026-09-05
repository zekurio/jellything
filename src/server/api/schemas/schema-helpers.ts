import { Type, type TSchema } from "typebox"

import {
  ValidationError,
  nullable,
  parse,
  refine,
  stringSchema,
} from "@/lib/validation"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const AnyStringSchema = Type.String()
export const NonEmptyStringSchema = stringSchema({ minLength: 1 })
export const NullableStringSchema = nullable(Type.String())
export const BooleanSchema = Type.Boolean()
export const NullSchema = Type.Null()

// These API formats predate the stricter form validation rules.
export const EmailStringSchema = refine(
  Type.String(),
  (value) => EMAIL_PATTERN.test(value),
  { message: "Expected an email address" },
)
export const UriStringSchema = refine(
  Type.String(),
  (value) => URL.canParse(value),
  { message: "Expected a valid URI" },
)
export const DateTimeStringSchema = refine(
  Type.String(),
  (value) => !Number.isNaN(Date.parse(value)),
  { message: "Expected a valid date-time" },
)
export const UuidStringSchema = Type.String({ format: "uuid" })
export const NonNegativeIntSchema = Type.Integer({
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
})

export function boundedIntSchema(min: number, max: number) {
  return Type.Integer({
    minimum: Math.max(min, Number.MIN_SAFE_INTEGER),
    maximum: Math.min(max, Number.MAX_SAFE_INTEGER),
  })
}

export function coercedBoundedIntSchema(min: number, max: number) {
  const schema = boundedIntSchema(min, max)
  return Type.Decode(Type.Unknown(), (value) =>
    parse(schema, coerceNumber(value)),
  )
}

function coerceNumber(value: unknown): number {
  // Number can throw for untrusted values such as symbols and objects without
  // primitive conversion. Treat those as validation failures, not server errors.
  try {
    return Number(value)
  } catch {
    throw new ValidationError([{ path: [], message: "Expected a number" }])
  }
}

export function minProperties<T extends TSchema>(schema: T, count: number): T {
  return refine(
    schema,
    (value) =>
      typeof value === "object" &&
      value !== null &&
      Object.keys(value).length >= count,
    {
      message: `Expected at least ${count} propert${count === 1 ? "y" : "ies"}`,
    },
  )
}
