import { z } from "zod"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value)
    void parsedUrl
    return true
  } catch {
    return false
  }
}

function isValidDateTime(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

export const AnyStringSchema = z.string()
export const NonEmptyStringSchema = z.string().min(1)
export const NullableStringSchema = z.string().nullable()
export const BooleanSchema = z.boolean()
export const NullSchema = z.null()
export const EmailStringSchema = z
  .string()
  .refine((value) => EMAIL_PATTERN.test(value), {
    message: "Expected an email address",
  })
export const UriStringSchema = z.string().refine(isValidUrl, {
  message: "Expected a valid URI",
})
export const DateTimeStringSchema = z.string().refine(isValidDateTime, {
  message: "Expected a valid date-time",
})
export const UuidStringSchema = z.uuid()
export const NonNegativeIntSchema = z.number().int().nonnegative()

export function boundedIntSchema(min: number, max: number) {
  return z.number().int().gte(min).lte(max)
}

export function exactOptional<TSchema extends z.ZodType>(schema: TSchema) {
  return schema.optional()
}

export function minProperties<TSchema extends z.ZodType>(
  schema: TSchema,
  count: number,
) {
  return schema.refine(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      Object.keys(value as Record<string, unknown>).length >= count,
    {
      message: `Expected at least ${count} propert${count === 1 ? "y" : "ies"}`,
    },
  )
}
