"use client";

import {
  Ban,
  Check,
  Edit,
  Search,
  Settings,
  Trash,
} from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { UserSettingsDialog } from "@/components/users/user-settings-dialog";
import {
  listUsers,
  bulkUpdatePolicyAction,
  bulkDeleteUsersAction,
  updateUserPolicyAction,
  deleteUserAction,
} from "@/app/actions/admin/users";
import type { JellyfinUserListItem } from "@/server/jellyfin/admin";
import { formatRelativeTime, getInitials } from "@/lib/utils";

type User = JellyfinUserListItem;

export function UsersTable() {
  const router = useRouter();

  // Data fetching
  const fetchUsers = useCallback(async () => {
    const result = await listUsers();
    if (!result.success) {
      throw new Error("Failed to fetch users. You may not have admin access.");
    }
    return result.data;
  }, []);

  const {
    data: users,
    isLoading,
    error,
    refetch,
  } = useAsyncData<User[]>(fetchUsers, [], {
    errorMessage: "Failed to fetch users",
  });

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");

  // Edit dialog state
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState<string | null>(null);

  // Dialog hooks
  const bulkEditDialog = useSimpleDialog();
  const disableDialog = useDialogAction<User>({
    onSuccess: () => refetch(),
  });
  const deleteDialog = useDialogAction<User>({
    onSuccess: () => refetch(),
  });

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center justify-center px-2">
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center px-2">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={row.original.avatarUrl} alt={row.original.name} />
              <AvatarFallback className="text-xs">{getInitials(row.original.name)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: "lastActivityDate",
        header: "Last Active",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatRelativeTime(row.original.lastActivityDate)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const user = row.original;
          if (user.isDisabled) {
            return <span className="text-destructive">Disabled</span>;
          }
          if (user.isAdmin) {
            return <span className="text-primary">Enabled (Admin)</span>;
          }
          return <span className="text-muted-foreground">Enabled</span>;
        },
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
                setEditUserId(row.original.id);
                setEditUserName(row.original.name);
              }}
              aria-label={"Edit " + row.original.name}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                disableDialog.open(row.original);
              }}
              aria-label={
                row.original.isDisabled
                  ? `Enable ${row.original.name}`
                  : `Disable ${row.original.name}`
              }
            >
              {row.original.isDisabled ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Ban className="h-4 w-4 text-warning" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                deleteDialog.open(row.original);
              }}
              aria-label={"Delete " + row.original.name}
            >
              <Trash className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [disableDialog, deleteDialog],
  );

  const table = useReactTable({
    data: users ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
  });

  const selectedCount = Object.keys(rowSelection).length;

  const bulkActionWillEnable = table
    .getSelectedRowModel()
    .rows.every((row) => row.original.isDisabled);

  const [bulkLoading, setBulkLoading] = useState(false);

  const handleBulkDisable = useCallback(async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    const userIds = selectedRows.map((row) => row.original.id);
    if (userIds.length === 0) return;

    const allDisabled = selectedRows.every((row) => row.original.isDisabled);
    const disable = !allDisabled;

    setBulkLoading(true);
    try {
      const result = await bulkUpdatePolicyAction({
        userIds,
        updates: { isDisabled: disable },
      });
      if (result.success) {
        toast.success(
          disable
            ? `Disabled ${result.data.updated} user(s)`
            : `Enabled ${result.data.updated} user(s)`,
        );
        setRowSelection({});
        refetch();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      toast.error(disable ? "Failed to disable users" : "Failed to enable users");
      console.error(err);
    }
    setBulkLoading(false);
  }, [refetch, table]);

  const handleBulkDelete = useCallback(async () => {
    const userIds = table.getSelectedRowModel().rows.map((row) => row.original.id);
    if (userIds.length === 0) return;

    setBulkLoading(true);
    try {
      const result = await bulkDeleteUsersAction({ userIds });
      if (result.success) {
        toast.success(`Deleted ${result.data.deleted} user(s)`);
        setRowSelection({});
        refetch();
      } else {
        throw new Error(result.error);
      }
    } catch {
      toast.error("Failed to delete users");
    }
    setBulkLoading(false);
  }, [refetch, table]);

  const handleToggleDisable = () => {
    const user = disableDialog.item;
    if (!user) return;

    disableDialog.execute(async () => {
      const result = await updateUserPolicyAction(user.id, {
        isDisabled: !user.isDisabled,
      });
      if (!result.success) {
        throw new Error("Failed to update user");
      }
      toast.success(user.isDisabled ? `Enabled ${user.name}` : `Disabled ${user.name}`);
    });
  };

  const handleDelete = () => {
    const user = deleteDialog.item;
    if (!user) return;

    deleteDialog.execute(async () => {
      const result = await deleteUserAction(user.id);
      if (!result.success) {
        throw new Error("Failed to delete user");
      }
      toast.success(`Deleted ${user.name}`);
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
              placeholder="Search users..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <span className="text-sm text-muted-foreground">{selectedCount} selected</span>
              <Button variant="outline" size="sm" onClick={bulkEditDialog.open}>
                <Settings className="mr-2 h-4 w-4" />
                Edit Selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkDisable()}
                disabled={bulkLoading}
              >
                {bulkActionWillEnable ? (
                  <Check className="mr-2 h-4 w-4 text-success" />
                ) : (
                  <Ban className="mr-2 h-4 w-4 text-warning" />
                )}
                {bulkActionWillEnable ? "Enable Selected" : "Disable Selected"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleBulkDelete()}
                disabled={bulkLoading}
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete Selected
              </Button>
            </>
          )}
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
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      onClick={() => {
                        if (cell.column.id === "select") return;
                        if (cell.column.id === "actions") return;
                        router.push(`/users/${row.original.id}`);
                      }}
                    >
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
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} of {users?.length ?? 0} user(s)
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>

      <UserSettingsDialog
        open={!!editUserId}
        onOpenChange={(open) => {
          if (!open) {
            setEditUserId(null);
            setEditUserName(null);
          }
        }}
        userId={editUserId ?? undefined}
        userName={editUserName ?? undefined}
        onSaveComplete={() => {
          setEditUserId(null);
          setEditUserName(null);
          refetch();
        }}
      />

      <UserSettingsDialog
        open={selectedCount > 0 && !editUserId && bulkEditDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            bulkEditDialog.close();
          }
        }}
        userIds={
          selectedCount > 0
            ? table.getSelectedRowModel().rows.map((row) => row.original.id)
            : undefined
        }
        onSaveComplete={() => {
          bulkEditDialog.close();
          setRowSelection({});
          refetch();
        }}
      />

      <AlertDialog
        open={disableDialog.isOpen}
        onOpenChange={(open) => !open && disableDialog.close()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {disableDialog.item?.isDisabled ? "Enable User" : "Disable User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {disableDialog.item?.isDisabled
                ? `Are you sure you want to enable ${disableDialog.item?.name}? They will be able to sign in to Jellyfin.`
                : `Are you sure you want to disable ${disableDialog.item?.name}? They will not be able to sign in to Jellyfin.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disableDialog.isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleDisable} disabled={disableDialog.isLoading}>
              {disableDialog.isLoading
                ? "Loading..."
                : disableDialog.item?.isDisabled
                  ? "Enable"
                  : "Disable"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && deleteDialog.close()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteDialog.item?.name}? This action cannot be
              undone. All user data, watch history, and preferences will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDialog.isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteDialog.isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDialog.isLoading ? "Loading..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
