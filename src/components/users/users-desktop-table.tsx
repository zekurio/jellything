import type { Table as TanstackTable } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table"
import type { ManagedUserListItemDto as ManagedUserListItem } from "@/lib/api/contracts/admin"

type UsersDesktopTableProps = {
  table: TanstackTable<ManagedUserListItem>
  emptyLabel: string
  getRowClassName?: (user: ManagedUserListItem) => string | undefined
  getCellClassName?: (
    user: ManagedUserListItem,
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
