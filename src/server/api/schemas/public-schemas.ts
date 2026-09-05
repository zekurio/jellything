import { Type, type StaticDecode } from "typebox"

import {
  AnyStringSchema,
  BooleanSchema,
  NonEmptyStringSchema,
  UriStringSchema,
  boundedIntSchema,
} from "@/server/api/schemas/schema-helpers"

export const initializeConfigBodySchema = Type.Object({
  setupKey: NonEmptyStringSchema,
  app: Type.Optional(
    Type.Object({
      url: UriStringSchema,
    }),
  ),
  jellyfin: Type.Object({
    internalUrl: UriStringSchema,
    externalUrl: Type.Optional(UriStringSchema),
    apiKey: NonEmptyStringSchema,
    configPath: Type.Optional(AnyStringSchema),
  }),
  seerr: Type.Optional(
    Type.Object({
      internalUrl: UriStringSchema,
      externalUrl: Type.Optional(UriStringSchema),
      apiKey: NonEmptyStringSchema,
    }),
  ),
  email: Type.Optional(
    Type.Object({
      from: NonEmptyStringSchema,
      smtp: Type.Optional(
        Type.Object({
          host: NonEmptyStringSchema,
          port: boundedIntSchema(1, 65535),
          secure: Type.Optional(BooleanSchema),
          username: Type.Optional(NonEmptyStringSchema),
          password: Type.Optional(NonEmptyStringSchema),
        }),
      ),
    }),
  ),
})

export type InitializeConfigInput = StaticDecode<
  typeof initializeConfigBodySchema
>
