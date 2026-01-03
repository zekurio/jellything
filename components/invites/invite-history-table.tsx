"use client";

import { Search } from "lucide-react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInviteHistory } from "@/app/actions/admin/invites";
import { formatRelativeTime, getInitials } from "@/lib/utils";

type InviteUsage = {
  id: string;
  inviteId: string;
  inviteLabel: string | null;
  inviteCode: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  usedAt: string;
};

export function InviteHistoryTable() {
  const [usages, setUsages] = React.useState<InviteUsage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const fetchHistory = React.useCallback(async () => {
    setError(null);
    const result = await getInviteHistory();
    if (!result.success) {
      setError("Failed to fetch history");
      toast.error("Failed to fetch history");
      return;
    }
    setUsages(result.data);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      const result = await getInviteHistory();
      if (cancelled) return;
      if (!result.success) {
        setError("Failed to fetch history. You may not have admin access.");
        setLoading(false);
        return;
      }
      setUsages(result.data);
      setLoading(false);
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  const columns = React.useMemo<ColumnDef<InviteUsage>[]>(
    () => [
      {
        accessorKey: "userName",
        header: "User",
        cell: ({ row }) => (
          <Link
            href={`/users/${row.original.userId}`}
            className="flex items-center gap-3 hover:underline"
          >
            <Avatar className="h-8 w-8 rounded-lg">
              {row.original.avatarUrl && (
                <AvatarImage src={row.original.avatarUrl} alt={row.original.userName} />
              )}
              <AvatarFallback className="rounded-lg">
                {getInitials(row.original.userName)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{row.original.userName}</span>
          </Link>
        ),
      },
      {
        accessorKey: "invite",
        header: "Invite",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.inviteLabel || row.original.inviteCode}</span>
            {row.original.inviteLabel && (
              <span className="text-xs text-muted-foreground font-mono">
                {row.original.inviteCode}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "usedAt",
        header: "Used",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatRelativeTime(row.original.usedAt)}</span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: usages,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: {
      globalFilter,
    },
  });

  if (loading) {
    return <Spinner centered />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={fetchHistory}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-1">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search history..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No invite usage history found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{usages.length} usage(s)</p>
    </div>
  );
}
