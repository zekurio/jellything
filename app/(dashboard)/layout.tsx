import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/server/auth";
import { getServerInfo } from "@/server/jellyfin";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, serverInfo] = await Promise.all([getCurrentUser(), getServerInfo()]);

  if (!user) {
    redirect("/login");
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="floating" user={user} serverInfo={serverInfo} isAdmin={user.isAdmin} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
