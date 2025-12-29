import { SiteHeader } from "@/components/layout/site-header";
import { UsersTable } from "@/components/users/users-table";

export default function UsersPage() {
  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Users" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <UsersTable />
      </div>
    </>
  );
}
