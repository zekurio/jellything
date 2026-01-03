"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JellyfinSettingsTab } from "@/components/settings/jellyfin-settings-tab";
import { AppSettingsTab } from "@/components/settings/app-settings-tab";
import { EmailSettingsTab } from "@/components/settings/email-settings-tab";
import { useSession } from "@/lib/hooks";

export default function SettingsPage() {
  const { isAdmin, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.push("/dashboard");
    }
  }, [isAdmin, isLoading, router]);

  if (isLoading) {
    return (
      <>
        <SiteHeader breadcrumbs={[{ label: "Settings" }]} />
        <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
          <div className="flex-1 flex items-center justify-center">
            <Spinner className="h-8 w-8" />
          </div>
        </div>
      </>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Settings" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Tabs defaultValue="jellyfin" className="w-full">
          <TabsList>
            <TabsTrigger value="jellyfin">Jellyfin</TabsTrigger>
            <TabsTrigger value="app">App</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>
          <TabsContent value="jellyfin" className="mt-4">
            <JellyfinSettingsTab />
          </TabsContent>
          <TabsContent value="app" className="mt-4">
            <AppSettingsTab />
          </TabsContent>
          <TabsContent value="email" className="mt-4">
            <EmailSettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
