import { SiteHeader } from "@/components/layout/site-header";
import { ProfilesTable } from "@/components/profiles/profiles-table";

export default function ProfilesPage() {
  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Profiles" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <ProfilesTable />
      </div>
    </>
  );
}
