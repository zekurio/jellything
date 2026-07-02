import { spawnSync } from "node:child_process"
import { readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

const drizzleDir = "drizzle"

const beforeSqlFiles = listSqlFiles()
const beforeFiles = listFiles(drizzleDir)
const generateResult = spawnSync("pnpm", ["exec", "drizzle-kit", "generate"], {
  stdio: "inherit",
})
const afterSqlFiles = listSqlFiles()
const afterFiles = listFiles(drizzleDir)
const newSqlFiles = afterSqlFiles.filter(
  (file) => !beforeSqlFiles.includes(file),
)
const newFiles = afterFiles.filter((file) => !beforeFiles.includes(file))

for (const file of newFiles) {
  rmSync(join(drizzleDir, file), { force: true })
}

const cleanupResult = spawnSync("git", ["checkout", "--", drizzleDir], {
  stdio: "inherit",
})

if (cleanupResult.status !== 0) {
  writeError("Failed to restore drizzle/ after migration drift check.")
  process.exit(cleanupResult.status ?? 1)
}

if (generateResult.status !== 0) {
  writeError(
    "Drizzle migration drift check failed because drizzle-kit generate failed.",
  )
  process.exit(generateResult.status ?? 1)
}

if (newSqlFiles.length > 0) {
  writeError("Drizzle migration drift detected.")
  writeError("Run pnpm run db:generate and commit the generated migration.")
  writeError(`Generated migration file(s): ${newSqlFiles.join(", ")}`)
  process.exit(1)
}

writeOutput("No Drizzle migration drift detected.")

function listSqlFiles() {
  return readdirSync(drizzleDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
}

function listFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = join(prefix, entry.name)
      if (!entry.isDirectory()) return relativePath
      return listFiles(join(dir, entry.name), relativePath)
    })
    .sort()
}

function writeOutput(message) {
  process.stdout.write(`${message}\n`)
}

function writeError(message) {
  process.stderr.write(`${message}\n`)
}
