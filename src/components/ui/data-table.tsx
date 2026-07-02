"use client"

import { flexRender, type Table as TanstackTable } from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface DataTableProps<TData> {
  table: TanstackTable<TData>
  emptyLabel: string
  className?: string
  getRowClassName?: (row: TData) => string | undefined
  getCellClassName?: (row: TData, columnId: string) => string | undefined
}

export function DataTable<TData>({
  table,
  emptyLabel,
  className,
  getRowClassName,
  getCellClassName,
}: DataTableProps<TData>) {
  const headers = table.getFlatHeaders()

  return (
    <div className={cn("hidden rounded-md border md:block", className)}>
      <Table className="table-fixed">
        <colgroup>
          {headers.map((header) => (
            <col key={header.id} style={{ width: `${header.getSize()}px` }} />
          ))}
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(getRowClassName?.(row.original))}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      getCellClassName?.(row.original, cell.column.id),
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={headers.length}
                className="text-muted-foreground h-24 text-center"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
