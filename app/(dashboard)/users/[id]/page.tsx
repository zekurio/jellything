import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { getUserById, type JellyfinUser } from "@/server/jellyfin";

interface UserPageProps {
  params: Promise<{ id: string }>;
}

export default async function UserPage({ params }: UserPageProps) {
  const { id } = await params;

  let jellyfinUser: JellyfinUser;
  try {
    jellyfinUser = await getUserById(id);
  } catch {
    notFound();
  }

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Users", href: "/users" },
          {
            label: jellyfinUser.name,
            href: `/users/${id}`,
            avatarUrl: jellyfinUser.avatarUrl,
          },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6"></div>
    </>
  );
}
