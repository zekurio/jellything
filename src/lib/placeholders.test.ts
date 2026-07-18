import { describe, expect, it } from "vitest"

import { formatPlaceholder, interpolatePlaceholders } from "@/lib/placeholders"

describe("interpolatePlaceholders", () => {
  it("replaces known tokens", () => {
    expect(
      interpolatePlaceholders("Welcome to {{serverName}}, {{username}}!", {
        serverName: "Cinema Club",
        username: "alex",
      }),
    ).toBe("Welcome to Cinema Club, alex!")
  })

  it("keeps unknown tokens verbatim", () => {
    expect(
      interpolatePlaceholders("Hello {{username}} {{unknown}}", {
        username: "alex",
      }),
    ).toBe("Hello alex {{unknown}}")
  })

  it("stringifies numeric values", () => {
    expect(
      interpolatePlaceholders("Expires in {{expiresInMinutes}} minutes", {
        expiresInMinutes: 15,
      }),
    ).toBe("Expires in 15 minutes")
  })

  it("replaces repeated tokens and leaves single braces alone", () => {
    expect(
      interpolatePlaceholders("{{a}} and {{a}} but not {a}", { a: "x" }),
    ).toBe("x and x but not {a}")
  })

  it("leaves text without tokens untouched", () => {
    expect(interpolatePlaceholders("No tokens here", {})).toBe("No tokens here")
  })

  it("does not resolve inherited Object.prototype members", () => {
    expect(
      interpolatePlaceholders("{{constructor}} {{toString}} {{valueOf}}", {}),
    ).toBe("{{constructor}} {{toString}} {{valueOf}}")
  })
})

describe("formatPlaceholder", () => {
  it("wraps a key in double braces", () => {
    expect(formatPlaceholder("serverName")).toBe("{{serverName}}")
  })
})
