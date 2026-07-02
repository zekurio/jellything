import { z } from "zod"

export class ExternalServiceDecodeError extends Error {
  readonly service: string
  readonly path: string
  readonly details: string

  constructor(service: string, path: string, details: string, cause: unknown) {
    super(`${service} returned an invalid response for ${path}: ${details}`)
    this.name = "ExternalServiceDecodeError"
    this.service = service
    this.path = path
    this.details = details
    this.cause = cause
  }
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>"
      return `${path}: ${issue.message}`
    })
    .join("; ")
}

export function decodeWithSchema<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  context: {
    service: string
    path: string
  },
): z.output<TSchema> {
  const result = schema.safeParse(value)
  if (result.success) {
    return result.data
  }

  throw new ExternalServiceDecodeError(
    context.service,
    context.path,
    formatZodError(result.error),
    result.error,
  )
}
