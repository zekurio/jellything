import { InviteHistoryTable } from "@/components/invites/invite-history-table";
import { SiteHeader } from "@/components/layout/site-header";

export default function InviteHistoryPage() {
  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Invites", href: "/invites" },
          { label: "History" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <InviteHistoryTable />
      </div>
    </>
  );
}
