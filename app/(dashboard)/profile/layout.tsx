import { redirect } from "next/navigation";
import { ProfileLayoutClient } from "@/components/profile/profile-layout-client";
import { getCurrentUser } from "@/server/auth";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ProfileLayoutClient
      user={{
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      }}
    >
      {children}
    </ProfileLayoutClient>
  );
}
