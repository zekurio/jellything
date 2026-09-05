import type { StaticDecode, TSchema } from "typebox"

import { safeParse, type ValidationError } from "@/lib/validation"

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

function formatValidationError(error: ValidationError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>"
      return `${path}: ${issue.message}`
    })
    .join("; ")
}

export function decodeWithSchema<Type extends TSchema>(
  schema: Type,
  value: unknown,
  context: {
    service: string
    path: string
  },
): StaticDecode<Type> {
  const result = safeParse(schema, value)
  if (result.success) {
    return result.data
  }

  throw new ExternalServiceDecodeError(
    context.service,
    context.path,
    formatValidationError(result.error),
    result.error,
  )
}
