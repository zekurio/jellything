import "@tanstack/react-start/server-only"
import { createHash } from "node:crypto"

import {
  BRANDING_IMAGE_MAX_BASE64_LENGTH,
  BRANDING_IMAGE_MAX_BYTES,
  type BrandingImageReplacement,
} from "@/lib/branding"
import type { BrandingImageConfig } from "@/lib/server/config.server"

const CANONICAL_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

// Decode safety cap for decompression bombs; oversized-but-sane images are
// downscaled to the requested bounds instead of being rejected.
const BRANDING_IMAGE_DECODE_MAX_PIXELS = 32_000_000

export class BrandingImageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BrandingImageValidationError"
  }
}

export interface BrandingImageBounds {
  maxWidth: number
  maxHeight: number
}

// Decodes, downscales to the given bounds, and re-encodes the uploaded
// image. Re-encoding strips metadata and guarantees the stored image is a
// well-formed PNG/JPEG regardless of the upload's encoder quirks.
export async function normalizeBrandingImage(
  replacement: BrandingImageReplacement,
  bounds: BrandingImageBounds,
): Promise<BrandingImageConfig> {
  if (
    replacement.base64.length === 0 ||
    replacement.base64.length > BRANDING_IMAGE_MAX_BASE64_LENGTH ||
    !CANONICAL_BASE64_PATTERN.test(replacement.base64)
  ) {
    throw new BrandingImageValidationError("Invalid branding image data")
  }

  const buffer = Buffer.from(replacement.base64, "base64")
  if (
    buffer.length === 0 ||
    buffer.length > BRANDING_IMAGE_MAX_BYTES ||
    buffer.toString("base64") !== replacement.base64
  ) {
    throw new BrandingImageValidationError("Invalid branding image size")
  }

  // Loaded lazily so a broken native sharp install only fails logo uploads.
  // At module scope it would be pulled into the SSR graph via the pure
  // helpers below and break server rendering for every route.
  const { default: sharp } = await import("sharp")
  const image = sharp(buffer, {
    limitInputPixels: BRANDING_IMAGE_DECODE_MAX_PIXELS,
    failOn: "error",
  })
  const metadata = await image.metadata()
  const expectedFormat = replacement.mimeType === "image/png" ? "png" : "jpeg"

  if (metadata.format !== expectedFormat) {
    throw new BrandingImageValidationError("Invalid branding image format")
  }

  try {
    const resized = image.rotate().resize({
      width: bounds.maxWidth,
      height: bounds.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    const { data, info } = await (
      replacement.mimeType === "image/png"
        ? resized.png()
        : resized.jpeg({ quality: 85 })
    ).toBuffer({ resolveWithObject: true })

    if (data.length > BRANDING_IMAGE_MAX_BYTES) {
      throw new BrandingImageValidationError("Branding image is too large")
    }

    return {
      mimeType: replacement.mimeType,
      base64: data.toString("base64"),
      width: info.width,
      height: info.height,
    }
  } catch (error) {
    if (error instanceof BrandingImageValidationError) {
      throw error
    }

    // sharp throws plain Errors for corrupt/truncated image data.
    throw new BrandingImageValidationError("Invalid branding image data")
  }
}

// Short content hash used as a cache-busting version and ETag for the
// public /branding/* asset endpoints.
export function getBrandingImageVersion(image: BrandingImageConfig): string {
  return createHash("sha256").update(image.base64).digest("hex").slice(0, 16)
}

export function getBrandingImageDataUrl(image: BrandingImageConfig): string {
  return `data:${image.mimeType};base64,${image.base64}`
}
