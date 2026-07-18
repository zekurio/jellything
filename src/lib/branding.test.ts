import { describe, expect, it } from "vitest"

import { getReadableForeground, isHexColor } from "@/lib/branding"

describe("branding colors", () => {
  it("validates hex colors case-insensitively", () => {
    expect(isHexColor("#6b5fc3")).toBe(true)
    expect(isHexColor(" #6B5FC3 ")).toBe(true)
    expect(isHexColor("#6B5FC")).toBe(false)
    expect(isHexColor("6B5FC3")).toBe(false)
  })

  it("picks a readable foreground for light and dark accents", () => {
    expect(getReadableForeground("#111111")).toBe("#FFFFFF")
    expect(getReadableForeground("#FFEE55")).toBe("#000000")
  })
})
