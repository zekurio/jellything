import "@tanstack/react-start/server-only"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { migrate } from "drizzle-orm/libsql/migrator"
import { drizzle } from "drizzle-orm/libsql/node"

import { env } from "@/env"
import { normalizeEmail } from "@/lib/schemas"
import { schema } from "@/server/db/schema"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "database" })

function resolveDatabaseUrl(databaseUrl: string): string {
  if (databaseUrl === ":memory:" || databaseUrl === "file::memory:") {
    return "file::memory:"
  }

  if (databaseUrl.startsWith("file:")) {
    if (databaseUrl === "file::memory:") {
      return databaseUrl
    }

    const filePath = databaseUrl.startsWith("file://")
      ? fileURLToPath(databaseUrl)
      : path.resolve(process.cwd(), databaseUrl.slice("file:".length))

    mkdirSync(path.dirname(filePath), { recursive: true })
    return pathToFileURL(filePath).href
  }

  if (databaseUrl.includes("://") && !databaseUrl.startsWith("sqlite://")) {
    throw new Error(
      `DB_PATH must be a SQLite filename/path, "sqlite://...", or "file://...". Received: ${databaseUrl}`,
    )
  }

  const sqlitePath = databaseUrl.startsWith("sqlite://")
    ? databaseUrl.slice("sqlite://".length)
    : databaseUrl

  if (sqlitePath === ":memory:") {
    return "file::memory:"
  }

  const absolutePath = path.isAbsolute(sqlitePath)
    ? sqlitePath
    : path.join(process.cwd(), sqlitePath)

  mkdirSync(path.dirname(absolutePath), { recursive: true })
  return pathToFileURL(absolutePath).href
}

const databaseUrl = resolveDatabaseUrl(env.DB_PATH)

const rawDb = drizzle({
  connection: databaseUrl,
  schema,
})

export const db = rawDb
export const sqlClient = rawDb.$client

let migrationPromise: Promise<void> | null = null

export async function ensureMigrated(): Promise<void> {
  if (!migrationPromise) {
    log.info({ path: databaseUrl }, "Initializing database")
    migrationPromise = (async () => {
      log.info("Running database migrations")
      await migrate(rawDb, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      })
      log.info("Database migrations completed")
    })()
  }
  await migrationPromise
}

export async function getUserByEmail(email: string) {
  await ensureMigrated()
  const normalizedEmail = normalizeEmail(email)
  return db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, normalizedEmail),
  })
}

export async function getUserById(userId: string) {
  await ensureMigrated()
  return db.query.users.findFirst({
    where: (users, { eq }) => eq(users.userId, userId),
  })
}
