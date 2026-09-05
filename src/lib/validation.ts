import type { StandardSchemaV1 } from "@standard-schema/spec"
import {
  Type,
  type StaticDecode,
  type StaticEncode,
  type TLiteral,
  type TSchema,
  type TStringOptions,
} from "typebox"
import { Compile, type Validator } from "typebox/compile"
import type { TLocalizedValidationError } from "typebox/error"
import { Format } from "typebox/format"
import { Clone } from "typebox/value"

export interface ValidationIssue {
  path: (string | number)[]
  message: string
}

export class ValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues[0]?.message ?? "Validation failed")
    this.name = "ValidationError"
  }
}

interface RefinementContext {
  addIssue(issue: { message: string; path?: (string | number)[] }): void
}

type Refinement = (value: unknown, context: RefinementContext) => void
const refinementKey = "~validationRefinements"
const trimKey = "~validationTrim"
const validators = new WeakMap<TSchema, Validator>()

function validator(schema: TSchema) {
  const cached = validators.get(schema)
  if (cached) return cached
  const compiled = Compile(schema)
  validators.set(schema, compiled)
  return compiled
}

function nativeErrors(schema: TSchema, value: unknown) {
  const compiled = validator(schema)
  if (compiled.Check(value)) return []
  const errors = compiled.Errors(value)
  const unionPaths = errors
    .filter((error) => error.keyword === "anyOf")
    .map((error) => `${error.schemaPath}/anyOf/`)
  // TypeBox reports failed branches as well as the union error. Format the
  // union once below, choosing a matching branch's field messages when possible.
  return errors.filter(
    (error) => !unionPaths.some((path) => error.schemaPath.startsWith(path)),
  )
}

const blockingKeywords = new Set([
  "type",
  "required",
  "const",
  "enum",
  "anyOf",
  "~refine",
])

function isBlockingError(schema: TSchema, error: TLocalizedValidationError) {
  if (
    error.keyword === "~refine" &&
    Type.IsString(resolvePointer(error.schemaPath, schema).value)
  )
    return false
  return blockingKeywords.has(error.keyword)
}

interface ValidationSchema extends TSchema {
  default?: unknown
  [trimKey]?: boolean
  [refinementKey]?: Refinement[]
  properties?: Record<string, TSchema>
  patternProperties?: Record<string, TSchema>
  additionalProperties?: TSchema | boolean
}

// Keep the existing email and RFC 9562 UUID rules, rather than the broader
// JSON Schema formats. Datetimes accept UTC only, including minute precision.
Format.Set("email", (value) =>
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/.test(
    value,
  ),
)
Format.Set("uuid", (value) =>
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/.test(
    value,
  ),
)
Format.Set("date-time", (value) => {
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z$/.test(
      value,
    )
  )
    return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= (days[month - 1] ?? 0)
})
Format.Set("uri", (value) => URL.canParse(value))

// TypeBox counts grapheme clusters. Existing limits count UTF-16 code units,
// including passwords and payload size limits, so keep those checks explicit.
export function stringSchema(options: TStringOptions = {}) {
  const constraints = { ...options }
  delete constraints.minLength
  delete constraints.maxLength
  const schema = Type.String(constraints)
  const message = (keyword: "minLength" | "maxLength", fallback: string) => {
    const metadata: unknown = options.errorMessage
    if (typeof metadata === "string") return metadata
    return isObject(metadata) && typeof metadata[keyword] === "string"
      ? metadata[keyword]
      : fallback
  }
  const minimum = options.minLength
  const maximum = options.maxLength
  const withMinimum =
    minimum === undefined
      ? schema
      : Type.Refine(
          schema,
          (value) => value.length >= minimum,
          () => message("minLength", `Expected at least ${minimum} characters`),
        )
  return maximum === undefined
    ? withMinimum
    : Type.Refine(
        withMinimum,
        (value) => value.length <= maximum,
        () => message("maxLength", `Expected at most ${maximum} characters`),
      )
}

/** String preprocessing runs before constraints, unlike a decode callback. */
export function trimmedString(options?: TStringOptions) {
  return Type.With(stringSchema(options), { [trimKey]: true })
}

/** Defaults apply to undefined only, and are cloned for each parse. */
export function defaulted<T extends TSchema>(
  schema: T,
  value: StaticEncode<T>,
): T & { default: StaticEncode<T> } {
  return Type.With(schema, { default: value }) as T & {
    default: StaticEncode<T>
  }
}

export function nullable<T extends TSchema>(schema: T) {
  return Type.Union([schema, Type.Null()])
}

export function enumValues<
  const T extends readonly string[] | Record<string, string>,
>(values: T) {
  type Member = T extends readonly string[] ? T[number] : T[keyof T] & string
  const members = (
    Array.isArray(values) ? values : Object.values(values)
  ) as Member[]
  return Type.Union(
    members.map((value): TLiteral<Member> => Type.Literal(value)) as [
      TLiteral<Member>,
      ...TLiteral<Member>[],
    ],
  )
}

export const dateSchema = Type.Refine(
  Type.Unsafe<Date>({}),
  (value) => value instanceof Date && !Number.isNaN(value.getTime()),
  () => "Invalid date",
)

/** Attach form refinements without changing the native schema's static type. */
export function superRefine<T extends TSchema>(
  schema: T,
  check: (value: StaticDecode<T>, context: RefinementContext) => void,
): T {
  const previous = (schema as ValidationSchema)[refinementKey] ?? []
  return Type.With(schema, { [refinementKey]: [...previous, check] }) as T
}

export function refine<T extends TSchema>(
  schema: T,
  check: (value: StaticDecode<T>) => boolean,
  options: string | { message: string; path?: (string | number)[] },
): T {
  return superRefine(schema, (value, context) => {
    if (!check(value))
      context.addIssue(
        typeof options === "string" ? { message: options } : options,
      )
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  )
}

/** Prepare only declared fields. Never clean strict objects before checking. */
function prepare(
  schema: TSchema,
  input: unknown,
  preserveUnknown = false,
): unknown {
  const options = schema as ValidationSchema
  const value =
    input === undefined && Object.hasOwn(schema, "default")
      ? Clone(options.default)
      : input
  if (value === undefined && Type.IsOptional(schema)) return value
  if (options[trimKey] && typeof value === "string") return value.trim()
  if (Type.IsUnion(schema)) {
    const candidates = schema.anyOf.map((member) => ({
      member,
      value: prepare(member, value),
    }))
    const selected =
      candidates.find((candidate) =>
        validator(candidate.member).Check(candidate.value),
      ) ??
      candidates.find((candidate) =>
        nativeErrors(candidate.member, candidate.value).every(
          (error) => !isBlockingError(candidate.member, error),
        ),
      )
    return selected ? selected.value : value
  }
  if (Type.IsIntersect(schema)) {
    const prepared = schema.allOf.reduce<unknown>(
      (result, member) => prepare(member, result, true),
      value,
    )
    const objects = schema.allOf.filter(
      (member) => Type.IsObject(member) || Type.IsRecord(member),
    )
    if (
      !isObject(prepared) ||
      !objects.length ||
      preserveUnknown ||
      objects.some(
        (member) =>
          (member as ValidationSchema).additionalProperties !== undefined,
      )
    )
      return prepared
    return Object.fromEntries(
      Object.entries(prepared).filter(([key]) =>
        objects.some(
          (member) =>
            Object.hasOwn((member as ValidationSchema).properties ?? {}, key) ||
            Object.keys(
              (member as ValidationSchema).patternProperties ?? {},
            ).some((pattern) => new RegExp(pattern).test(key)),
        ),
      ),
    )
  }
  if ((Type.IsObject(schema) || Type.IsRecord(schema)) && isObject(value)) {
    const properties = options.properties ?? {}
    const patterns = Object.entries(options.patternProperties ?? {})
    const entries = Object.entries(value).flatMap(([key, item]) => {
      if (Object.hasOwn(properties, key)) return []
      const matching = patterns.filter(([pattern]) =>
        new RegExp(pattern).test(key),
      )
      if (matching.length)
        return [
          [
            key,
            matching.reduce<unknown>(
              (result, [, member]) => prepare(member, result),
              item,
            ),
          ],
        ]
      if (typeof options.additionalProperties === "object")
        return [[key, prepare(options.additionalProperties, item)]]
      return preserveUnknown || options.additionalProperties !== undefined
        ? [[key, item]]
        : []
    })
    for (const [key, member] of Object.entries(properties)) {
      const prepared = prepare(
        member as TSchema,
        Object.hasOwn(value, key) ? value[key] : undefined,
      )
      if (prepared !== undefined || Object.hasOwn(value, key))
        entries.push([key, prepared])
    }
    return Object.fromEntries(entries)
  }
  if (Type.IsArray(schema) && Array.isArray(value))
    return value.map((item) => prepare(schema.items, item))
  if (Type.IsTuple(schema) && Array.isArray(value))
    return value.map((item, index) =>
      schema.items[index] ? prepare(schema.items[index], item) : item,
    )
  return value
}

function resolvePointer(pointer: string, value: unknown) {
  const path: (string | number)[] = []
  const parts = pointer.replace(/^#/, "").split("/").slice(1)
  for (let index = 0; index < parts.length;) {
    // TypeBox 1.3 emits raw property names, not escaped JSON pointers.
    // Match actual keys so slashes, tildes and numeric object keys survive.
    const remaining = parts.slice(index).join("/")
    const key =
      (isObject(value)
        ? Object.keys(value)
            .filter(
              (key) => remaining === key || remaining.startsWith(`${key}/`),
            )
            .sort((a, b) => b.length - a.length)[0]
        : undefined) ?? parts[index]!
    path.push(Array.isArray(value) ? Number(key) : key)
    value =
      typeof value === "object" && value !== null
        ? Reflect.get(value, key)
        : undefined
    index += key.split("/").length
  }
  return { path, value }
}

function errorIssues(
  schema: TSchema,
  value: unknown,
  error: TLocalizedValidationError,
): ValidationIssue[] {
  const node = resolvePointer(error.schemaPath, schema).value
  const metadata: unknown =
    typeof node === "object" && node !== null
      ? Reflect.get(node, "errorMessage")
      : undefined
  const keywordMessage = isObject(metadata)
    ? metadata[error.keyword]
    : undefined
  const message =
    typeof metadata === "string"
      ? metadata
      : typeof keywordMessage === "string"
        ? keywordMessage
        : error.message
  const location = resolvePointer(error.instancePath, value)
  const path = location.path
  if (
    error.keyword === "anyOf" &&
    typeof metadata !== "string" &&
    Type.IsUnion(node)
  ) {
    const candidates = node.anyOf.map((member) => ({
      member,
      value: prepare(member, location.value),
    }))
    const branch = candidates
      .map((candidate) => ({
        ...candidate,
        errors: nativeErrors(candidate.member, candidate.value),
      }))
      .find((candidate) =>
        candidate.errors.every(
          (issue) => !isBlockingError(candidate.member, issue),
        ),
      )
    if (branch)
      return branch.errors
        .flatMap((issue) => errorIssues(branch.member, branch.value, issue))
        .map((issue) => ({ ...issue, path: [...path, ...issue.path] }))
  }
  return error.keyword === "required"
    ? error.params.requiredProperties.map((key) => ({
        path: [...path, key],
        message,
      }))
    : [{ path, message }]
}

interface NativeFailure {
  path: (string | number)[]
  blocking: boolean
}

function decodeChildren(
  schema: TSchema,
  value: unknown,
  path: (string | number)[],
  issues: ValidationIssue[],
  failures: NativeFailure[],
): unknown {
  const options = schema as ValidationSchema
  if ((Type.IsObject(schema) || Type.IsRecord(schema)) && isObject(value)) {
    const properties = options.properties ?? {}
    const patterns = Object.entries(options.patternProperties ?? {})
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const property = Object.hasOwn(properties, key)
          ? properties[key]
          : undefined
        const members = [
          ...(property ? [property] : []),
          ...patterns
            .filter(([pattern]) => new RegExp(pattern).test(key))
            .map(([, member]) => member),
        ]
        if (!members.length && typeof options.additionalProperties === "object")
          members.push(options.additionalProperties)
        return [
          key,
          members.reduce<unknown>(
            (result, member) =>
              decode(member, result, [...path, key], issues, failures),
            item,
          ),
        ]
      }),
    )
  }
  if (Type.IsArray(schema) && Array.isArray(value))
    return value.map((item, index) =>
      decode(schema.items, item, [...path, index], issues, failures),
    )
  if (Type.IsTuple(schema) && Array.isArray(value))
    return value.map((item, index) =>
      schema.items[index]
        ? decode(schema.items[index], item, [...path, index], issues, failures)
        : item,
    )
  if (Type.IsUnion(schema)) {
    // Select on the encoded value, before codecs can change its type.
    const member =
      schema.anyOf.find((candidate) => validator(candidate).Check(value)) ??
      schema.anyOf.find((candidate) =>
        nativeErrors(candidate, value).every(
          (error) => !isBlockingError(candidate, error),
        ),
      )
    return member ? decode(member, value, path, issues, failures) : value
  }
  if (Type.IsIntersect(schema))
    return schema.allOf.reduce<unknown>(
      (result, member) => decode(member, result, path, issues, failures),
      value,
    )
  return value
}

function decode(
  schema: TSchema,
  value: unknown,
  path: (string | number)[],
  issues: ValidationIssue[],
  failures: NativeFailure[],
): unknown {
  if (value === undefined && Type.IsOptional(schema)) return value
  const nodeFailures = failures.filter((failure) =>
    path.every((part, index) => part === failure.path[index]),
  )
  const children = decodeChildren(schema, value, path, issues, failures)
  const decoded =
    Type.IsCodec(schema) && !nodeFailures.length
      ? decodeCodec(schema, children, path)
      : children
  // Constraint failures still allow form refinements. Structural failures do
  // not, and a skipped codec cannot provide its promised decoded type.
  if (
    nodeFailures.some((failure) => failure.blocking) ||
    (Type.IsCodec(schema) && nodeFailures.length)
  )
    return decoded
  for (const check of (schema as ValidationSchema)[refinementKey] ?? []) {
    check(decoded, {
      addIssue: (issue) =>
        issues.push({
          path: [...path, ...(issue.path ?? [])],
          message: issue.message,
        }),
    })
  }
  return decoded
}

function decodeCodec(
  schema: Type.TCodec,
  value: unknown,
  path: (string | number)[],
) {
  // Codec callbacks may call parse for explicit coercion. Translate only
  // validation failures here; programmer exceptions must remain visible.
  try {
    return schema["~codec"].decode(value)
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error
    throw new ValidationError(
      error.issues.map((issue) => ({
        ...issue,
        path: [...path, ...issue.path],
      })),
    )
  }
}

export function safeParse<T extends TSchema>(
  schema: T,
  value: unknown,
):
  | { success: true; data: StaticDecode<T> }
  | { success: false; error: ValidationError } {
  const prepared = prepare(schema, value)
  const errors = nativeErrors(schema, prepared)
  const issues = errors.flatMap((error) => errorIssues(schema, prepared, error))
  const failures = errors.map((error) => ({
    path: resolvePointer(error.instancePath, prepared).path,
    blocking: isBlockingError(schema, error),
  }))
  // Value.Decode implicitly coerces and cleans. Walk codecs separately so
  // strict inputs stay strict and nested codec failures retain field paths.
  try {
    const decoded = decode(schema, prepared, [], issues, failures)
    return issues.length
      ? { success: false, error: new ValidationError(issues) }
      : { success: true, data: decoded as StaticDecode<T> }
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error
    return {
      success: false,
      error: new ValidationError([...issues, ...error.issues]),
    }
  }
}

export function parse<T extends TSchema>(
  schema: T,
  value: unknown,
): StaticDecode<T> {
  const result = safeParse(schema, value)
  if (!result.success) throw result.error
  return result.data
}

export function standardSchema<T extends TSchema>(
  schema: T,
): StandardSchemaV1<StaticEncode<T>, StaticDecode<T>> {
  return {
    "~standard": {
      version: 1,
      vendor: "typebox",
      validate(value) {
        const result = safeParse(schema, value)
        return result.success
          ? { value: result.data }
          : { issues: result.error.issues }
      },
    },
  }
}
