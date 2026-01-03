"use client";

import { useCallback } from "react";
import { Spinner } from "@/components/ui/spinner";
import { getFullProfileAction } from "@/app/actions/user/profile";
import { useAsyncData } from "@/lib/hooks";
import { ProfileSettings } from "@/components/profile/settings/profile-settings";

interface ProfileData {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string;
  createdAt: Date;
}

export default function ProfileSettingsPage() {
  const fetchProfile = useCallback(async () => {
    const result = await getFullProfileAction();
    if (!result.success || !result.data) {
      throw new Error("Failed to load profile");
    }
    return result.data;
  }, []);

  const {
    data: profile,
    isLoading,
    refetch,
  } = useAsyncData<ProfileData>(fetchProfile, [], {
    errorMessage: "Failed to load settings",
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return <ProfileSettings profile={profile ?? null} onUpdate={refetch} />;
}
