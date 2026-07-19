import { describe, expect, it, vi } from "vitest"

import { EMAIL_MESSAGE_TYPES, type EmailMessageType } from "@/lib/email"

// The accent color only surfaces on action buttons and highlights, which
// the pure-notice templates (disabled/deleted) intentionally do not have.
const ACCENTED_MESSAGE_TYPES: readonly EmailMessageType[] = [
  "verifyEmail",
  "passwordReset",
  "expiryWarning",
  "accountRenewed",
]

const { logoBase64 } = vi.hoisted(() => ({
  logoBase64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lG8L8QAAAABJRU5ErkJggg==",
}))

vi.mock("@/lib/server/config.server", () => ({
  configManager: {
    app: {
      title: "Cinema Club",
      defaultLocale: "en",
      url: "https://cinema.example.com",
    },
    email: {
      from: "Cinema Club <mail@cinema.example.com>",
      branding: {
        accentColor: "#123456",
        pageBackgroundColor: "#F1F2F3",
        logo: {
          mimeType: "image/png",
          base64: logoBase64,
          width: 1,
          height: 1,
        },
      },
    },
  },
}))

vi.mock("@/server/email/index", () => ({
  sendEmail: vi.fn<(options: unknown) => Promise<void>>(async () => undefined),
}))

import { buildSyntheticEmailMessage } from "@/server/email/messages"

describe("email message registry", () => {
  it.each(EMAIL_MESSAGE_TYPES)("builds the %s preview", async (messageType) => {
    const message = await buildSyntheticEmailMessage(messageType, {
      delivery: "preview",
      now: new Date("2026-07-18T12:00:00.000Z"),
    })

    expect(message.subject.length).toBeGreaterThan(0)
    expect(message.html).toContain("Cinema Club")
    // A custom logo replaces the header brand text entirely.
    expect(message.html).not.toMatch(/>Cinema Club<\/p>/)
    expect(message.html.includes("#123456")).toBe(
      ACCENTED_MESSAGE_TYPES.includes(messageType),
    )
    expect(message.html).toContain("#F1F2F3")
    expect(message.html).toContain(`data:image/png;base64,${logoBase64}`)
    expect(message.text.length).toBeGreaterThan(0)
    expect(message.attachments).toBeUndefined()
  })

  it("uses an inline CID attachment for SMTP delivery", async () => {
    const message = await buildSyntheticEmailMessage("verifyEmail", {
      delivery: "smtp",
    })

    expect(message.html).toContain("cid:inviterr-email-logo")
    expect(message.attachments).toHaveLength(1)
    expect(message.attachments?.[0]).toMatchObject({
      cid: "inviterr-email-logo",
      contentType: "image/png",
      contentDisposition: "inline",
    })
  })

  it("uses the built-in subject for each message type", async () => {
    const message = await buildSyntheticEmailMessage("accountDisabled", {
      delivery: "preview",
    })

    expect(message.subject).toBe("Your access has been disabled - Cinema Club")
  })
})
