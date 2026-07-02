import { defineConfig } from "drizzle-kit"

import { env } from "@/env"

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: env.DB_PATH,
  },
})
