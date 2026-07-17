import { createFileRoute } from "@tanstack/react-router"

import { ensureApplicationReady, getReadinessStatus } from "@/server/readiness"

async function handleReadinessRequest() {
  try {
    await ensureApplicationReady()
    return Response.json(
      { status: getReadinessStatus() },
      {
        headers: { "cache-control": "no-store" },
      },
    )
  } catch {
    return Response.json(
      { status: getReadinessStatus() },
      {
        status: 503,
        headers: { "cache-control": "no-store" },
      },
    )
  }
}

export const Route = createFileRoute("/readyz")({
  server: {
    handlers: {
      HEAD: handleReadinessRequest,
      GET: handleReadinessRequest,
    },
  },
})
