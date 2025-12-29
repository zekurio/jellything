"use client";

import { createInviteAction, getInvite, updateInviteAction } from "@/app/actions/admin/invites";
import { listProfiles } from "@/app/actions/admin/profiles";
import { format } from "date-fns";
import { AlertTriangleIcon, CalendarIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface Profile {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

interface InviteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteId?: string;
  onSaveComplete?: () => void;
}

export function InviteFormDialog({
  open,
  onOpenChange,
  inviteId,
  onSaveComplete,
}: InviteFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [profileId, setProfileId] = useState("");
  const [label, setLabel] = useState("");
  const [useLimit, setUseLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined);

  const isEditMode = !!inviteId;

  const resetForm = useCallback(() => {
    setLabel("");
    setUseLimit("");
    setExpiresAt(undefined);
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const profilesResult = await listProfiles();
        if (cancelled) return;

        if (profilesResult.success) {
          setProfiles(profilesResult.data);
          if (!inviteId && profilesResult.data.length > 0) {
            const defaultProfile = profilesResult.data.find((p) => p.isDefault);
            setProfileId(defaultProfile?.id || profilesResult.data[0].id);
          }
        } else {
          toast.error(profilesResult.error);
        }

        if (inviteId) {
          const inviteResult = await getInvite(inviteId);
          if (cancelled) return;

          if (inviteResult.success) {
            const invite = inviteResult.data;
            setProfileId(invite.profileId);
            setLabel(invite.label || "");
            setUseLimit(invite.useLimit?.toString() || "");
            setExpiresAt(undefined);
          } else {
            toast.error(inviteResult.error);
          }
        } else {
          resetForm();
        }
      } catch {
        toast.error("Failed to load data");
      }
      if (!cancelled) {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [open, inviteId, resetForm]);

  const handleSave = async () => {
    if (!profileId) {
      toast.error("Please select a profile");
      return;
    }

    setSaving(true);

    try {
      if (isEditMode && inviteId) {
        const result = await updateInviteAction(inviteId, {
          label: label || undefined,
          useLimit: useLimit ? Number.parseInt(useLimit, 10) : null,
        });

        if (result.success) {
          toast.success("Invite updated");
          onOpenChange(false);
          onSaveComplete?.();
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createInviteAction({
          profileId,
          label: label || undefined,
          useLimit: useLimit ? Number.parseInt(useLimit, 10) : undefined,
          expiresAt: expiresAt?.toISOString(),
        });

        if (result.success) {
          toast.success("Invite created");
          onOpenChange(false);
          resetForm();
          onSaveComplete?.();
        } else {
          toast.error(result.error);
        }
      }
    } catch {
      toast.error("Failed to save invite");
    }
    setSaving(false);
  };

  const title = isEditMode ? "Edit Invite" : "Create Invite";
  const description = isEditMode
    ? "Update the invite settings."
    : "Create a new invite link for users to register.";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Profile</Label>
                <Select value={profileId} onValueChange={setProfileId} disabled={isEditMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                        {profile.isDefault && " (Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isEditMode && (
                  <p className="text-xs text-muted-foreground">
                    Profile cannot be changed after creation.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Label (optional)</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., For friends"
                />
                <p className="text-xs text-muted-foreground">
                  A friendly name to identify this invite.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Use Limit (optional)</Label>
                <Input
                  type="number"
                  value={useLimit}
                  onChange={(e) => setUseLimit(e.target.value)}
                  placeholder="Unlimited"
                  min={1}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of times this invite can be used.
                </p>
              </div>

              {!isEditMode && (
                <div className="space-y-2">
                  <Label>Expires On (optional)</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "flex-1 justify-start text-left font-normal",
                            !expiresAt && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {expiresAt ? format(expiresAt, "PPP") : "Never"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={expiresAt}
                          onSelect={setExpiresAt}
                          disabled={(date) => date < tomorrow}
                        />
                      </PopoverContent>
                    </Popover>
                    {expiresAt && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpiresAt(undefined)}
                        aria-label="Clear expiry date"
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When the invite will expire and become unusable.
                  </p>
                </div>
              )}

              {!isEditMode && !useLimit && !expiresAt && (
                <div className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-500">
                  <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm">
                    This invite has no usage limit and no expiry date. It can be used unlimited
                    times forever. Consider adding restrictions.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : isEditMode ? "Save Changes" : "Create Invite"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
