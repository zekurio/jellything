import "@tanstack/react-start/server-only"
import { ensureMigrated } from "@/server/db"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "readiness" })

type ReadinessStatus = "initializing" | "ready" | "error"

let readinessStatus: ReadinessStatus = "initializing"
let readinessPromise: Promise<void> | null = null

export function ensureApplicationReady(): Promise<void> {
  if (!readinessPromise) {
    readinessStatus = "initializing"
    readinessPromise = ensureMigrated()
      .then(() => {
        readinessStatus = "ready"
      })
      .catch((error: unknown) => {
        readinessStatus = "error"
        readinessPromise = null
        log.error({ error }, "Application initialization failed")
        throw error
      })
  }

  return readinessPromise
}

export function getReadinessStatus(): ReadinessStatus {
  return readinessStatus
}
