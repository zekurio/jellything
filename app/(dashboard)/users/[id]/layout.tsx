import { notFound } from "next/navigation";
import { UserLayoutClient } from "@/components/users/user-layout-client";
import { getUserById as getJellyfinUser } from "@/server/jellyfin";
import { getUserById as getDbUser } from "@/server/db";

interface UserLayoutProps {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export default async function UserLayout({ params, children }: UserLayoutProps) {
  const { id } = await params;

  let jellyfinUser;
  try {
    jellyfinUser = await getJellyfinUser(id);
  } catch {
    notFound();
  }

  const dbUser = await getDbUser(id);
  const memberSince = dbUser?.createdAt ?? new Date();

  return (
    <UserLayoutClient
      user={{
        id,
        name: jellyfinUser.name,
        avatarUrl: jellyfinUser.avatarUrl,
        memberSince,
      }}
    >
      {children}
    </UserLayoutClient>
  );
}
