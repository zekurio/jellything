import { z } from "zod"

import {
  AnyStringSchema,
  BooleanSchema,
  NonEmptyStringSchema,
  UriStringSchema,
  boundedIntSchema,
  exactOptional,
} from "@/server/api/schemas/zod-helpers"

export const initializeConfigBodySchema = z.object({
  setupKey: NonEmptyStringSchema,
  app: exactOptional(
    z.object({
      url: UriStringSchema,
    }),
  ),
  jellyfin: z.object({
    internalUrl: UriStringSchema,
    externalUrl: exactOptional(UriStringSchema),
    apiKey: NonEmptyStringSchema,
    configPath: exactOptional(AnyStringSchema),
  }),
  seerr: exactOptional(
    z.object({
      internalUrl: UriStringSchema,
      externalUrl: exactOptional(UriStringSchema),
      apiKey: NonEmptyStringSchema,
    }),
  ),
  email: exactOptional(
    z.object({
      from: NonEmptyStringSchema,
      smtp: exactOptional(
        z.object({
          host: NonEmptyStringSchema,
          port: boundedIntSchema(1, 65535),
          secure: exactOptional(BooleanSchema),
          username: exactOptional(NonEmptyStringSchema),
          password: exactOptional(NonEmptyStringSchema),
        }),
      ),
    }),
  ),
})

export type InitializeConfigInput = z.output<typeof initializeConfigBodySchema>
