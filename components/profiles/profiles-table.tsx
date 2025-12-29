"use client";

import { IconEdit, IconPlus, IconSearch, IconStar, IconTrash } from "@tabler/icons-react";
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
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [editProfileId, setEditProfileId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [actionProfile, setActionProfile] = React.useState<Profile | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  const fetchProfiles = React.useCallback(async () => {
    setError(null);
    const result = await listProfiles();
    if (!result.success) {
      setError("Failed to fetch profiles");
      toast.error("Failed to fetch profiles");
      return;
    }
    if (result.data.length === 0) {
      const ensureResult = await ensureDefaultProfile();
      if (ensureResult.success && ensureResult.data.profile) {
        setProfiles([ensureResult.data.profile]);
      } else {
        const retryResult = await listProfiles();
        if (retryResult.success) {
          setProfiles(retryResult.data);
        }
      }
    } else {
      setProfiles(result.data);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadProfiles = async () => {
      const result = await listProfiles();
      if (cancelled) return;
      if (!result.success) {
        setError("Failed to fetch profiles. You may not have admin access.");
        setLoading(false);
        return;
      }
      if (result.data.length === 0) {
        const ensureResult = await ensureDefaultProfile();
        if (!cancelled) {
          if (ensureResult.success && ensureResult.data.profile) {
            setProfiles([ensureResult.data.profile]);
          } else {
            const retryResult = await listProfiles();
            if (retryResult.success) {
              setProfiles(retryResult.data);
            }
          }
        }
      } else {
        setProfiles(result.data);
      }
      setLoading(false);
    };

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSetDefault = React.useCallback(
    async (profile: Profile) => {
      setActionLoading(true);
      try {
        const result = await updateProfileAction(profile.id, {
          isDefault: true,
        });
        if (!result.success) {
          toast.error("Failed to update profile");
        } else {
          toast.success(`Set ${profile.name} as default`);
          fetchProfiles();
        }
      } catch {
        toast.error("Failed to update profile");
      }
      setActionLoading(false);
    },
    [fetchProfiles],
  );

  const columns = React.useMemo<ColumnDef<Profile>[]>(
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
              <IconEdit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleSetDefault(row.original);
              }}
              disabled={row.original.isDefault || actionLoading}
              title={row.original.isDefault ? "Already default" : "Set as default"}
            >
              <IconStar
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
                setActionProfile(row.original);
                setDeleteDialogOpen(true);
              }}
              disabled={row.original.isDefault}
              title={row.original.isDefault ? "Cannot delete default profile" : "Delete"}
              className="text-destructive hover:text-destructive"
            >
              <IconTrash className="h-4 w-4" />
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [handleSetDefault, actionLoading],
  );

  const table = useReactTable({
    data: profiles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: {
      globalFilter,
    },
  });

  const handleDelete = async () => {
    if (!actionProfile) return;

    setActionLoading(true);
    try {
      const result = await deleteProfileAction(actionProfile.id);
      if (!result.success) {
        toast.error("Failed to delete profile");
      } else {
        toast.success(`Deleted ${actionProfile.name}`);
        setDeleteDialogOpen(false);
        setActionProfile(null);
        fetchProfiles();
      }
    } catch {
      toast.error("Failed to delete profile");
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
        <Button variant="outline" onClick={fetchProfiles}>
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
              placeholder="Search profiles..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
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
      <p className="text-xs text-muted-foreground">{profiles.length} profile(s)</p>

      <ProfileFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSaveComplete={() => {
          setCreateDialogOpen(false);
          fetchProfiles();
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
          fetchProfiles();
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{actionProfile?.name}&quot;? This action cannot
              be undone. Invites using this profile will also need to be deleted first.
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
