"use client";

import {
  IconCheck,
  IconClock,
  IconCopy,
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import * as React from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { listInvites, deleteInviteAction } from "@/app/actions/admin/invites";
import { formatRelativeTime } from "@/lib/utils";
import { InviteFormDialog } from "@/components/invites/invite-form-dialog";

type Invite = {
  id: string;
  code: string;
  profileId: string;
  profileName: string;
  label: string | null;
  useLimit: number | null;
  useCount: number;
  expiresAt: string | null;
  createdAt: string;
  status: "active" | "expired" | "exhausted";
};

function getStatusBadge(status: Invite["status"]) {
  switch (status) {
    case "active":
      return (
        <Badge variant="default" className="gap-1">
          <IconCheck className="h-3 w-3" />
          Active
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="secondary" className="gap-1">
          <IconClock className="h-3 w-3" />
          Expired
        </Badge>
      );
    case "exhausted":
      return (
        <Badge variant="outline" className="gap-1">
          <IconX className="h-3 w-3" />
          Exhausted
        </Badge>
      );
  }
}

export function InvitesTable() {
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [editInviteId, setEditInviteId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [actionInvite, setActionInvite] = React.useState<Invite | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  const fetchInvites = React.useCallback(async () => {
    setError(null);
    const result = await listInvites();
    if (!result.success) {
      setError("Failed to fetch invites");
      toast.error("Failed to fetch invites");
      return;
    }
    setInvites(result.data);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadInvites = async () => {
      const result = await listInvites();
      if (cancelled) return;
      if (!result.success) {
        setError("Failed to fetch invites. You may not have admin access.");
        setLoading(false);
        return;
      }
      setInvites(result.data);
      setLoading(false);
    };

    loadInvites();

    return () => {
      cancelled = true;
    };
  }, []);

  const copyInviteLink = React.useCallback((code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied to clipboard");
  }, []);

  const columns = React.useMemo<ColumnDef<Invite>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Label / Code",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.label || row.original.code}</span>
            {row.original.label && (
              <span className="text-xs text-muted-foreground font-mono">{row.original.code}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "profileName",
        header: "Profile",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.profileName}</span>
        ),
      },
      {
        accessorKey: "usage",
        header: "Uses",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.useCount}
            {row.original.useLimit !== null ? ` / ${row.original.useLimit}` : " / ∞"}
          </span>
        ),
      },
      {
        accessorKey: "expiresAt",
        header: "Expires",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.expiresAt ? formatRelativeTime(row.original.expiresAt) : "Never"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                copyInviteLink(row.original.code);
              }}
              aria-label="Copy invite link"
            >
              <IconCopy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setEditInviteId(row.original.id);
              }}
              aria-label="Edit invite"
            >
              <IconEdit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setActionInvite(row.original);
                setDeleteDialogOpen(true);
              }}
              aria-label="Delete invite"
            >
              <IconTrash className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [copyInviteLink],
  );

  const table = useReactTable({
    data: invites,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: {
      globalFilter,
    },
  });

  const handleDelete = async () => {
    if (!actionInvite) return;

    setActionLoading(true);
    try {
      const result = await deleteInviteAction(actionInvite.id);
      if (!result.success) {
        toast.error("Failed to delete invite");
      } else {
        toast.success("Invite deleted");
        setDeleteDialogOpen(false);
        setActionInvite(null);
        fetchInvites();
      }
    } catch {
      toast.error("Failed to delete invite");
    }
    setActionLoading(false);
  };

  if (loading) {
    return <Spinner centered />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={fetchInvites}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invites..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          Create Invite
        </Button>
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
                  No invites found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{invites.length} invite(s)</p>

      <InviteFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSaveComplete={() => {
          setCreateDialogOpen(false);
          fetchInvites();
        }}
      />

      <InviteFormDialog
        open={!!editInviteId}
        onOpenChange={(open) => {
          if (!open) setEditInviteId(null);
        }}
        inviteId={editInviteId ?? undefined}
        onSaveComplete={() => {
          setEditInviteId(null);
          fetchInvites();
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invite</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the invite &quot;
              {actionInvite?.label || actionInvite?.code}
              &quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
