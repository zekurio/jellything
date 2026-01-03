"use client";

import {
  Check,
  Clock,
  Copy,
  Edit,
  Plus,
  Search,
  Trash,
  X,
} from "lucide-react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAsyncData, useDialogAction, useSimpleDialog } from "@/lib/hooks";
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
          <Check className="h-3 w-3" />
          Active
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          Expired
        </Badge>
      );
    case "exhausted":
      return (
        <Badge variant="outline" className="gap-1">
          <X className="h-3 w-3" />
          Exhausted
        </Badge>
      );
  }
}

export function InvitesTable() {
  // Data fetching
  const fetchInvites = useCallback(async () => {
    const result = await listInvites();
    if (!result.success) {
      throw new Error("Failed to fetch invites. You may not have admin access.");
    }
    return result.data;
  }, []);

  const {
    data: invites,
    isLoading,
    error,
    refetch,
  } = useAsyncData<Invite[]>(fetchInvites, [], {
    errorMessage: "Failed to fetch invites",
  });

  // Table state
  const [globalFilter, setGlobalFilter] = useState("");

  // Dialog state
  const createDialog = useSimpleDialog();
  const [editInviteId, setEditInviteId] = useState<string | null>(null);
  const deleteDialog = useDialogAction<Invite>({
    onSuccess: () => refetch(),
  });

  const copyInviteLink = useCallback((code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied to clipboard");
  }, []);

  const columns = useMemo<ColumnDef<Invite>[]>(
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
              <Copy className="h-4 w-4" />
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
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                deleteDialog.open(row.original);
              }}
              aria-label="Delete invite"
            >
              <Trash className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [copyInviteLink, deleteDialog],
  );

  const table = useReactTable({
    data: invites ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: {
      globalFilter,
    },
  });

  const handleDelete = () => {
    const invite = deleteDialog.item;
    if (!invite) return;

    deleteDialog.execute(async () => {
      const result = await deleteInviteAction(invite.id);
      if (!result.success) {
        throw new Error("Failed to delete invite");
      }
      toast.success("Invite deleted");
    });
  };

  if (isLoading) {
    return <Spinner centered />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={refetch}>
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
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invites..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Button onClick={createDialog.open}>
          <Plus className="mr-2 h-4 w-4" />
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
      <p className="text-xs text-muted-foreground">{invites?.length ?? 0} invite(s)</p>

      <InviteFormDialog
        open={createDialog.isOpen}
        onOpenChange={(open) => !open && createDialog.close()}
        onSaveComplete={() => {
          createDialog.close();
          refetch();
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
          refetch();
        }}
      />

      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && deleteDialog.close()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invite</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the invite &quot;
              {deleteDialog.item?.label || deleteDialog.item?.code}
              &quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDialog.isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteDialog.isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDialog.isLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
