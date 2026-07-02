import { createServerFn } from "@tanstack/react-start"

import type { DashboardPageLoaderInput } from "@/server/dashboard-page-data"
export type {
  DashboardOverviewData,
  DashboardPageData,
  DashboardPageLoaderInput,
} from "@/server/dashboard-page-data"

type DashboardPageDataModule = typeof import("@/server/dashboard-page-data")

let dashboardPageDataModulePromise: Promise<DashboardPageDataModule> | null =
  null

async function getDashboardPageDataModule() {
  if (!import.meta.env.SSR) {
    throw new Error(
      "Dashboard page data helpers are unavailable in the browser build.",
    )
  }

  dashboardPageDataModulePromise ??= import("@/server/dashboard-page-data")

  return dashboardPageDataModulePromise
}

export const getDashboardPageDataFn = createServerFn({ method: "GET" })
  .inputValidator((input: DashboardPageLoaderInput) => input)
  .handler(async ({ data }: { data: DashboardPageLoaderInput }) => {
    const { loadDashboardPageData } = await getDashboardPageDataModule()
    return loadDashboardPageData(data)
  })

export const getDashboardOverviewFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadDashboardOverview } = await getDashboardPageDataModule()
    return loadDashboardOverview()
  },
)
