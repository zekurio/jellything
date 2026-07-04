import { createServerFn } from "@tanstack/react-start"

import { enforcePageAccessFn } from "@/lib/page-access-fns"
import type { MyExpiryInfo } from "@/lib/renewal-types"

// Loaded in the profile loader so the account-access card renders without a
// client-side waterfall. The heavy server module is imported lazily inside the
// server-only handler so it never reaches the browser bundle.
export const getMyExpiryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyExpiryInfo | null> => {
    const { getMyExpiry } = await import("@/server/me")
    const result = await getMyExpiry()
    return result.success ? result.data : null
  },
)

export async function getProfilePageDataFn() {
  const [access, expiry] = await Promise.all([
    enforcePageAccessFn({ data: "protected" }),
    getMyExpiryFn(),
  ])

  return {
    emailConfigured: access.bootstrap.emailConfigured,
    expiry,
  }
}
