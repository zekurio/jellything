"use client";

import { useCallback, useState } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { getFullProfileAction } from "@/app/actions/user/profile";
import { useSession, useAsyncData } from "@/lib/hooks";
import { ProfileTab } from "@/components/settings/profile-tab";
import { ServerSettingsTab } from "@/components/settings/server-settings-tab";

interface ProfileData {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string;
}

export default function SettingsPage() {
  const { isAdmin } = useSession();
  const [activeTab, setActiveTab] = useState("profile");

  const fetchProfile = useCallback(async () => {
    const result = await getFullProfileAction();
    if (!result.success || !result.data) {
      throw new Error("Failed to load profile");
    }
    return result.data;
  }, []);

  const { data: profile, isLoading } = useAsyncData<ProfileData>(fetchProfile, [], {
    errorMessage: "Failed to load settings",
  });

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

  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Settings" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="server" disabled className="opacity-50 cursor-not-allowed">
                Server Settings
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <ProfileTab profile={profile} onUpdate={() => setActiveTab("profile")} />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="server" className="mt-6">
              <ServerSettingsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
