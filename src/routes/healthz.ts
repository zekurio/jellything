import { createFileRoute } from "@tanstack/react-router"

function handleHealthRequest() {
  return Response.json(
    { status: "ok" },
    {
      headers: { "cache-control": "no-store" },
    },
  )
}

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      HEAD: handleHealthRequest,
      GET: handleHealthRequest,
    },
  },
})
