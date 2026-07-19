import sharp from "sharp"
import { describe, expect, it } from "vitest"

import {
  BRANDING_LOGO_MAX_HEIGHT,
  BRANDING_LOGO_MAX_WIDTH,
  getContrastRatio,
} from "@/lib/branding"
import { DEFAULT_EMAIL_BRANDING } from "@/lib/email"
import {
  BrandingImageValidationError,
  normalizeBrandingImage,
} from "@/server/branding"
import {
  resolveEmailBranding,
  resolveEmailTheme,
} from "@/server/email/branding"

const LOGO_BOUNDS = {
  maxWidth: BRANDING_LOGO_MAX_WIDTH,
  maxHeight: BRANDING_LOGO_MAX_HEIGHT,
}

describe("email branding", () => {
  it.each([
    ["#6B5FC3", "#ECECEF"],
    ["#FFFF00", "#FFFFFF"],
    ["#111111", "#08080A"],
    ["#00FF88", "#212126"],
  ])("derives readable colors for %s on %s", (accent, background) => {
    const theme = resolveEmailTheme({
      accentColor: accent,
      pageBackgroundColor: background,
    })

    expect(
      getContrastRatio(theme.accentForeground, theme.accent),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      getContrastRatio(theme.accentText, theme.surface),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      getContrastRatio(theme.mutedText, theme.surface),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      getContrastRatio(theme.border, theme.surface),
    ).toBeGreaterThanOrEqual(3)
  })

  it("keeps in-bounds logos at their natural size", async () => {
    const buffer = await sharp({
      create: {
        width: 320,
        height: 96,
        channels: 4,
        background: "#6B5FC3",
      },
    })
      .png()
      .toBuffer()

    await expect(
      normalizeBrandingImage(
        { mimeType: "image/png", base64: buffer.toString("base64") },
        LOGO_BOUNDS,
      ),
    ).resolves.toMatchObject({
      mimeType: "image/png",
      width: 320,
      height: 96,
    })
  })

  it("downscales oversized logos to fit the layout bounds", async () => {
    const buffer = await sharp({
      create: {
        width: 2000,
        height: 800,
        channels: 4,
        background: "#6B5FC3",
      },
    })
      .png()
      .toBuffer()

    const logo = await normalizeBrandingImage(
      { mimeType: "image/png", base64: buffer.toString("base64") },
      LOGO_BOUNDS,
    )

    // 2000x800 scaled by min(1200/2000, 600/800) = 0.6 -> 1200x480.
    expect(logo).toMatchObject({
      mimeType: "image/png",
      width: 1200,
      height: 480,
    })

    const output = sharp(Buffer.from(logo.base64, "base64"))
    await expect(output.metadata()).resolves.toMatchObject({
      format: "png",
      width: 1200,
      height: 480,
    })
  })

  it("rejects a MIME type that does not match decoded content", async () => {
    const buffer = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: "#FFFFFF",
      },
    })
      .jpeg()
      .toBuffer()

    await expect(
      normalizeBrandingImage(
        { mimeType: "image/png", base64: buffer.toString("base64") },
        LOGO_BOUNDS,
      ),
    ).rejects.toBeInstanceOf(BrandingImageValidationError)
  })

  it("rejects malformed base64", async () => {
    await expect(
      normalizeBrandingImage(
        { mimeType: "image/png", base64: "not-base64" },
        LOGO_BOUNDS,
      ),
    ).rejects.toBeInstanceOf(BrandingImageValidationError)
  })

  it("uses the saved email branding when no override is given", () => {
    const emailLogo = {
      mimeType: "image/jpeg" as const,
      base64: "d29ybGQ=",
      width: 50,
      height: 20,
    }
    const resolved = resolveEmailBranding({
      from: "a@b.c",
      branding: { accentColor: "#FF0000", logo: emailLogo },
    })

    expect(resolved.theme.accent).toBe("#FF0000")
    expect(resolved.logo).toEqual(emailLogo)
  })

  it("lets a preview draft replace saved email branding entirely", () => {
    const resolved = resolveEmailBranding(
      { from: "a@b.c", branding: { accentColor: "#FF0000" } },
      // Draft without an accent falls back to the default, not the saved
      // email value.
      { pageBackgroundColor: "#ECECEF" },
    )

    expect(resolved.theme.accent).toBe(DEFAULT_EMAIL_BRANDING.accentColor)
  })

  it("rejects truncated image data", async () => {
    const buffer = await sharp({
      create: {
        width: 320,
        height: 96,
        channels: 4,
        background: "#6B5FC3",
      },
    })
      .png()
      .toBuffer()

    await expect(
      normalizeBrandingImage(
        {
          mimeType: "image/png",
          base64: buffer.subarray(0, buffer.length / 2).toString("base64"),
        },
        LOGO_BOUNDS,
      ),
    ).rejects.toBeInstanceOf(BrandingImageValidationError)
  })
})
