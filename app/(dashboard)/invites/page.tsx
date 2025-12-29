import { SiteHeader } from "@/components/layout/site-header";
import { InvitesTable } from "@/components/invites/invites-table";

export default function InvitesPage() {
  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Invites" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <InvitesTable />
      </div>
    </>
  );
}
