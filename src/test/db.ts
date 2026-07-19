import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

export interface TestDatabase {
  dbPath: string
  configPath: string
  cleanup: () => Promise<void>
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const directory = await mkdtemp(path.join(tmpdir(), "inviterr-test-"))

  return {
    dbPath: path.join(directory, "test.db"),
    configPath: path.join(directory, "config.json"),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  }
}

export function configureTestEnvironment(testDatabase: TestDatabase): void {
  process.env.SKIP_ENV_VALIDATION = "true"
  process.env.NODE_ENV = "test"
  process.env.DB_PATH = testDatabase.dbPath
  process.env.CONFIG_PATH = testDatabase.configPath
  process.env.LOG_LEVEL = "fatal"
}
