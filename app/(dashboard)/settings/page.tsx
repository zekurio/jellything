"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFullProfileAction } from "@/app/actions/user/profile";
import { getSession } from "@/lib/auth";
import { ProfileTab } from "@/components/settings/profile-tab";
import { QuotasTab } from "@/components/settings/quotas-tab";
import { ServerSettingsTab } from "@/components/settings/server-settings-tab";

interface ProfileData {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    const loadData = async () => {
      try {
        const session = await getSession();
        if (!session) {
          window.location.href = "/login";
          return;
        }

        setIsAdmin(session.isAdmin);

        const profileResult = await getFullProfileAction();
        if (profileResult.success && profileResult.data) {
          setProfile(profileResult.data);
        }
      } catch {
        console.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <>
        <SiteHeader breadcrumbs={[{ label: "Settings" }]} />
        <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse space-y-4 w-full max-w-md">
              <div className="h-32 bg-muted rounded-md"></div>
              <div className="h-48 bg-muted rounded-md"></div>
            </div>
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
            <TabsTrigger value="quotas" disabled className="opacity-50 cursor-not-allowed">
              Quotas
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="server" disabled className="opacity-50 cursor-not-allowed">
                Server Settings
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <ProfileTab profile={profile} onUpdate={() => setActiveTab("profile")} />
          </TabsContent>

          <TabsContent value="quotas" className="mt-6">
            <QuotasTab />
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
