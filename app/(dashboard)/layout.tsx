import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SessionProviderWrapper } from "@/components/shared/session-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/server/auth";
import { getServerInfo } from "@/server/jellyfin";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, serverInfo] = await Promise.all([getCurrentUser(), getServerInfo()]);

  if (!user) {
    redirect("/login");
  }

  const session = {
    userId: user.userId,
    isAdmin: user.isAdmin,
    email: user.email,
    emailVerified: user.emailVerified,
  };

  return (
    <SessionProviderWrapper session={session}>
      <SidebarProvider>
        <AppSidebar user={user} serverInfo={serverInfo} isAdmin={user.isAdmin} />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </SessionProviderWrapper>
  );
}
