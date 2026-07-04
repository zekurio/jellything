import { DataTable } from "@/components/ui/data-table"
import type { ManagedUserListItemDto } from "@/lib/api/contracts/admin"

type UsersDesktopTableProps = {
  table: import("@tanstack/react-table").Table<ManagedUserListItemDto>
  emptyLabel: string
  getRowClassName?: (user: ManagedUserListItemDto) => string | undefined
  getCellClassName?: (
    user: ManagedUserListItemDto,
    columnId: string,
  ) => string | undefined
}

export function UsersDesktopTable({
  table,
  emptyLabel,
  getRowClassName,
  getCellClassName,
}: UsersDesktopTableProps) {
  return (
    <DataTable
      table={table}
      emptyLabel={emptyLabel}
      getRowClassName={getRowClassName}
      getCellClassName={getCellClassName}
    />
  )
}
