import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { describe, expect, it } from "vitest"

import { defaultFormValues } from "@/components/profiles/profile-form-utils"
import {
  emailSettingsFormSchema,
  inviteFormSchema,
  memberOnboardingSettingsFormSchema,
  passwordFormSchema,
  profileFormSchema,
} from "@/lib/schemas"
import { standardSchema } from "@/lib/validation"

const options = { fields: {}, shouldUseNativeValidation: false }

// Exercise the same resolver used by the forms, including field errors and
// submitted values. Primitive validation belongs to the schema library.
describe("form submission", () => {
  it("shows password strength and confirmation errors, then accepts the corrected password", async () => {
    const resolve = standardSchemaResolver(standardSchema(passwordFormSchema))
    const rejected = await resolve(
      {
        currentPassword: "old",
        newPassword: "short",
        confirmPassword: "different",
      },
      undefined,
      options,
    )
    expect(rejected.values).toEqual({})
    expect(rejected.errors.newPassword?.message).toBe(
      "validation.passwordMinLength",
    )
    expect(rejected.errors.confirmPassword?.message).toBe(
      "validation.passwordsDoNotMatch",
    )

    // Password limits count UTF-16 units, as they did before the migration.
    const corrected = {
      currentPassword: "old",
      newPassword: "Aa😀😀😀",
      confirmPassword: "Aa😀😀😀",
    }
    expect(await resolve(corrected, undefined, options)).toEqual({
      values: corrected,
      errors: {},
    })
  })

  it("rejects an expired invite and submits a trimmed custom code with the corrected expiry", async () => {
    const resolve = standardSchemaResolver(standardSchema(inviteFormSchema))
    const input = {
      profileId: "profile",
      code: "  family-2026  ",
      useLimit: "",
      expiresAt: new Date(0),
    }
    const rejected = await resolve(input, undefined, options)
    expect(rejected.errors.expiresAt?.message).toBe("validation.expiryFuture")
    const expiresAt = new Date(Date.now() + 86_400_000)
    expect(await resolve({ ...input, expiresAt }, undefined, options)).toEqual({
      values: { ...input, code: "family-2026", expiresAt },
      errors: {},
    })
  })

  it("allows SMTP to remain unconfigured but requires connection details once enabled", async () => {
    const resolve = standardSchemaResolver(
      standardSchema(emailSettingsFormSchema),
    )
    const empty = {
      from: "",
      smtpHost: "",
      smtpPort: "",
      smtpSecure: false,
      smtpUsername: "",
      smtpPassword: "",
    }
    expect(await resolve(empty, undefined, options)).toEqual({
      values: empty,
      errors: {},
    })
    const partial = { ...empty, from: "Inviterr <invites@example.com>" }
    const rejected = await resolve(partial, undefined, options)
    expect(rejected.errors.smtpHost?.message).toBe(
      "validation.smtpHostRequired",
    )
    expect(rejected.errors.smtpPort?.message).toBe(
      "validation.smtpPortRequired",
    )
    const configured = {
      ...partial,
      smtpHost: "smtp.example.com",
      smtpPort: "587",
    }
    expect(await resolve(configured, undefined, options)).toEqual({
      values: configured,
      errors: {},
    })
  })

  it("requires a quota only when the profile enables a limited override", async () => {
    const resolve = standardSchemaResolver(standardSchema(profileFormSchema))
    const input = { ...defaultFormValues, name: "Members" }
    expect((await resolve(input, undefined, options)).errors).toEqual({})
    const limited = {
      ...input,
      seerrMovieQuotaOverride: true,
      seerrMovieQuotaMode: "limited" as const,
    }
    const rejected = await resolve(limited, undefined, options)
    expect(rejected.errors.seerrMovieQuotaLimit?.message).toBe(
      "validation.seerrQuotaRange",
    )
    expect(rejected.errors.seerrMovieQuotaDays?.message).toBe(
      "validation.seerrQuotaRange",
    )
    const corrected = {
      ...limited,
      seerrMovieQuotaLimit: "5",
      seerrMovieQuotaDays: "30",
    }
    expect(await resolve(corrected, undefined, options)).toEqual({
      values: corrected,
      errors: {},
    })
  })

  it("shows onboarding errors on the affected page and trims content before submission", async () => {
    const resolve = standardSchemaResolver(
      standardSchema(memberOnboardingSettingsFormSchema),
    )
    const input = {
      enabled: true,
      pages: [{ id: "welcome", title: " Welcome ", markdown: "   " }],
    }
    const rejected = await resolve(input, undefined, options)
    expect(rejected.errors.pages?.[0]?.markdown?.message).toBe(
      "validation.pageContentRequired",
    )
    expect(
      await resolve(
        {
          ...input,
          pages: [{ ...input.pages[0]!, markdown: " Enjoy the server " }],
        },
        undefined,
        options,
      ),
    ).toEqual({
      values: {
        enabled: true,
        pages: [
          { id: "welcome", title: "Welcome", markdown: "Enjoy the server" },
        ],
      },
      errors: {},
    })
  })
})
