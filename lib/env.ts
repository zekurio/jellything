import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    JELLYFIN_URL: z.string().url(),
    JELLYFIN_API_KEY: z.string().min(1),
    ENCRYPTION_KEY: z.string().length(64),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("Jellything <noreply@example.com>"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    JELLYFIN_URL: process.env.JELLYFIN_URL,
    JELLYFIN_API_KEY: process.env.JELLYFIN_API_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
  },
});
