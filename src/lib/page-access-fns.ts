import { createServerFn } from "@tanstack/react-start"

type PageAccessMode =
  | "public"
  | "login"
  | "onboarding"
  | "protected"
  | "admin"
  | "config-error"
type PageAccessServerModule = typeof import("@/server/page-access")

let pageAccessModulePromise: Promise<PageAccessServerModule> | null = null

async function getPageAccessModule() {
  if (!import.meta.env.SSR) {
    throw new Error("Page access helpers are unavailable in the browser build.")
  }

  pageAccessModulePromise ??= import("@/server/page-access")

  return pageAccessModulePromise
}

export const getPageAccessFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getPageAccess } = await getPageAccessModule()
    return getPageAccess()
  },
)

export const enforcePageAccessFn = createServerFn({ method: "GET" })
  .validator((input: PageAccessMode) => input)
  .handler(async ({ data }: { data: PageAccessMode }) => {
    const { enforcePageAccess } = await getPageAccessModule()
    return enforcePageAccess(data)
  })
