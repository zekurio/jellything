import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentUser } from "@/server/auth";

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
          </div>
        </div>
      </div>
    </>
  );
}
