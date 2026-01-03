"use client";

import { useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { ProfileHeader } from "@/components/profile/profile-header";

interface ProfileLayoutClientProps {
  user: {
    name: string;
    avatarUrl?: string | null;
    createdAt: Date;
  };
  children: React.ReactNode;
}

export function ProfileLayoutClient({ user, children }: ProfileLayoutClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isSettings = pathname === "/profile/settings";

  const handleAvatarUpdate = useCallback(() => {
    router.refresh();
  }, [router]);

  const breadcrumbs = isSettings
    ? [{ label: "Profile", href: "/profile" }, { label: "Settings" }]
    : [{ label: "Profile" }];

  return (
    <>
      <SiteHeader breadcrumbs={breadcrumbs} />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <ProfileHeader
          name={user.name}
          avatarUrl={user.avatarUrl}
          memberSince={user.createdAt}
          onAvatarUpdate={handleAvatarUpdate}
        />
        {children}
      </div>
    </>
  );
}
