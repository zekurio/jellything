"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { UserProfileHeader } from "@/components/profile/user-profile-header";

interface UserLayoutClientProps {
  user: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    memberSince: Date;
  };
  children: React.ReactNode;
}

export function UserLayoutClient({ user, children }: UserLayoutClientProps) {
  const pathname = usePathname();
  const isSettings = pathname === `/users/${user.id}/settings`;

  const breadcrumbs = isSettings
    ? [
        { label: "Users", href: "/users" },
        { label: user.name, href: `/users/${user.id}`, avatarUrl: user.avatarUrl ?? undefined },
        { label: "Settings" },
      ]
    : [
        { label: "Users", href: "/users" },
        { label: user.name, href: `/users/${user.id}`, avatarUrl: user.avatarUrl ?? undefined },
      ];

  return (
    <>
      <SiteHeader breadcrumbs={breadcrumbs} />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <UserProfileHeader
          name={user.name}
          avatarUrl={user.avatarUrl}
          memberSince={user.memberSince}
          settingsHref={isSettings ? undefined : `/users/${user.id}/settings`}
        />
        {children}
      </div>
    </>
  );
}
