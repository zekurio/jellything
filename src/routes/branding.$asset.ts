import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"

import { ensureApplicationReady } from "@/server/readiness"

// Public, unauthenticated image endpoint: it only ever serves the
// admin-uploaded email logo for the settings preview, never
// user-controlled paths or data.
async function handleBrandingAssetRequest({
  request,
  params,
}: {
  request: Request
  params: { asset: string }
}) {
  if (params.asset !== "email-logo") {
    return new Response(null, { status: 404 })
  }

  await ensureApplicationReady()
  const [{ configManager }, { getBrandingImageVersion }] = await Promise.all([
    import("@/lib/server/config.server"),
    import("@/server/branding"),
  ])

  const image = configManager.email?.branding?.logo
  if (!image) {
    return new Response(null, { status: 404 })
  }

  const version = getBrandingImageVersion(image)
  const etag = `"${version}"`
  const headers = {
    "content-type": image.mimeType,
    // Versioned URLs (?v=<hash>) come from the bootstrap payload, so
    // long-lived immutable caching is safe.
    "cache-control": "public, max-age=31536000, immutable",
    etag,
  }

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers })
  }

  return new Response(Buffer.from(image.base64, "base64"), { headers })
}

export const Route = createFileRoute("/branding/$asset")({
  server: {
    handlers: {
      GET: handleBrandingAssetRequest,
      HEAD: handleBrandingAssetRequest,
    },
  },
})
