const drizzleDir = "drizzle"

const beforeSqlFiles = listSqlFiles()
const beforeFiles = listFiles(drizzleDir)
const generateStatus = await new Deno.Command("deno", {
  args: ["task", "db:generate"],
  stdout: "inherit",
  stderr: "inherit",
}).spawn().status
const afterSqlFiles = listSqlFiles()
const afterFiles = listFiles(drizzleDir)
const newSqlFiles = afterSqlFiles.filter(
  (file) => !beforeSqlFiles.includes(file),
)
const newFiles = afterFiles.filter((file) => !beforeFiles.includes(file))

for (const file of newFiles) {
  Deno.removeSync(`${drizzleDir}/${file}`)
}

const cleanupStatus = await new Deno.Command("git", {
  args: ["checkout", "--", drizzleDir],
  stdout: "inherit",
  stderr: "inherit",
}).spawn().status

if (!cleanupStatus.success) {
  writeError("Failed to restore drizzle/ after migration drift check.")
  Deno.exit(cleanupStatus.code)
}

if (!generateStatus.success) {
  writeError(
    "Drizzle migration drift check failed because drizzle-kit generate failed.",
  )
  Deno.exit(generateStatus.code)
}

if (newSqlFiles.length > 0) {
  writeError("Drizzle migration drift detected.")
  writeError("Run deno task db:generate and commit the generated migration.")
  writeError(`Generated migration file(s): ${newSqlFiles.join(", ")}`)
  Deno.exit(1)
}

writeOutput("No Drizzle migration drift detected.")

function listSqlFiles(): string[] {
  return Array.from(Deno.readDirSync(drizzleDir))
    .filter((entry) => entry.isFile && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

function listFiles(dir: string, prefix = ""): string[] {
  return Array.from(Deno.readDirSync(dir))
    .flatMap((entry) => {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (!entry.isDirectory) return relativePath
      return listFiles(`${dir}/${entry.name}`, relativePath)
    })
    .sort((left, right) => left.localeCompare(right))
}

function writeOutput(message: string): void {
  Deno.stdout.writeSync(new TextEncoder().encode(`${message}\n`))
}

function writeError(message: string): void {
  Deno.stderr.writeSync(new TextEncoder().encode(`${message}\n`))
}
