"use client";

import { Edit, Plus, Search, Star, Trash } from "lucide-react";
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
import { formatRelativeTime } from "@/lib/utils";
import {
  listProfiles,
  ensureDefaultProfile,
  updateProfileAction,
  deleteProfileAction,
} from "@/app/actions/admin/profiles";
import { ProfileFormDialog } from "@/components/profiles/profile-form-dialog";

type Profile = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
};

export function ProfilesTable() {
  // Data fetching
  const fetchProfiles = useCallback(async () => {
    const result = await listProfiles();
    if (!result.success) {
      throw new Error("Failed to fetch profiles. You may not have admin access.");
    }
    if (result.data.length === 0) {
      const ensureResult = await ensureDefaultProfile();
      if (ensureResult.success && ensureResult.data.profile) {
        return [ensureResult.data.profile];
      }
      const retryResult = await listProfiles();
      if (retryResult.success) {
        return retryResult.data;
      }
    }
    return result.data;
  }, []);

  const {
    data: profiles,
    isLoading,
    error,
    refetch,
  } = useAsyncData<Profile[]>(fetchProfiles, [], {
    errorMessage: "Failed to fetch profiles",
  });

  // Table state
  const [globalFilter, setGlobalFilter] = useState("");

  // Dialog state
  const createDialog = useSimpleDialog();
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const deleteDialog = useDialogAction<Profile>({
    onSuccess: () => refetch(),
  });

  const [defaultLoading, setDefaultLoading] = useState(false);

  const handleSetDefault = useCallback(
    async (profile: Profile) => {
      setDefaultLoading(true);
      try {
        const result = await updateProfileAction(profile.id, {
          isDefault: true,
        });
        if (!result.success) {
          toast.error("Failed to update profile");
        } else {
          toast.success(`Set ${profile.name} as default`);
          refetch();
        }
      } catch {
        toast.error("Failed to update profile");
      }
      setDefaultLoading(false);
    },
    [refetch],
  );

  const columns = useMemo<ColumnDef<Profile>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.isDefault && <Badge variant="secondary">Default</Badge>}
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatRelativeTime(row.original.createdAt)}
          </span>
        ),
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
                setEditProfileId(row.original.id);
              }}
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleSetDefault(row.original);
              }}
              disabled={row.original.isDefault || defaultLoading}
              title={row.original.isDefault ? "Already default" : "Set as default"}
            >
              <Star
                className={
                  row.original.isDefault ? "h-4 w-4 fill-current text-amber-500" : "h-4 w-4"
                }
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                deleteDialog.open(row.original);
              }}
              disabled={row.original.isDefault}
              title={row.original.isDefault ? "Cannot delete default profile" : "Delete"}
              className="text-destructive hover:text-destructive"
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [handleSetDefault, defaultLoading, deleteDialog],
  );

  const table = useReactTable({
    data: profiles ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: {
      globalFilter,
    },
  });

  const handleDelete = () => {
    const profile = deleteDialog.item;
    if (!profile) return;

    deleteDialog.execute(async () => {
      const result = await deleteProfileAction(profile.id);
      if (!result.success) {
        throw new Error("Failed to delete profile");
      }
      toast.success(`Deleted ${profile.name}`);
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
              placeholder="Search profiles..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Button onClick={createDialog.open}>
          <Plus className="mr-2 h-4 w-4" />
          Create Profile
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
                  No profiles found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{profiles?.length ?? 0} profile(s)</p>

      <ProfileFormDialog
        open={createDialog.isOpen}
        onOpenChange={(open) => !open && createDialog.close()}
        onSaveComplete={() => {
          createDialog.close();
          refetch();
        }}
      />

      <ProfileFormDialog
        open={!!editProfileId}
        onOpenChange={(open) => {
          if (!open) setEditProfileId(null);
        }}
        profileId={editProfileId ?? undefined}
        onSaveComplete={() => {
          setEditProfileId(null);
          refetch();
        }}
      />

      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && deleteDialog.close()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteDialog.item?.name}&quot;? This action
              cannot be undone. Invites using this profile will also need to be deleted first.
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
