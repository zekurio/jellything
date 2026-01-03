import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentUser } from "@/server/auth";
import { Construction } from "lucide-react";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="px-4 lg:px-6">
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="text-muted-foreground">Welcome back, {user?.name ?? "User"}</p>
            </div>
            <div className="px-4 lg:px-6">
              <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Construction className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">Work in Progress</h2>
                  <p className="text-muted-foreground">
                    This dashboard is currently being built. Check back soon!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
