"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Spinner } from "@/components/ui/spinner";
import {
  getLibraries,
  getUserPolicyAction,
  bulkUpdatePolicyAction,
  updateUserPolicyAction,
} from "@/app/actions/admin/users";
import type { MediaLibrary } from "@/server/jellyfin/admin";

type Library = MediaLibrary;

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
  userName?: string;
  userIds?: string[];
  onSaveComplete?: () => void;
}

export function UserSettingsDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userIds,
  onSaveComplete,
}: UserSettingsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [libraries, setLibraries] = useState<Library[]>([]);

  const [enableAllFolders, setEnableAllFolders] = useState(true);
  const [enabledFolders, setEnabledFolders] = useState<string[]>([]);
  const [bitrateMbps, setBitrateMbps] = useState<string>("0");
  const [allowVideoTranscoding, setAllowVideoTranscoding] = useState(true);
  const [allowAudioTranscoding, setAllowAudioTranscoding] = useState(true);
  const [allowMediaRemuxing, setAllowMediaRemuxing] = useState(true);

  const id = useId();
  const isBulkMode = !userId && userIds && userIds.length > 0;
  const targetCount = isBulkMode ? userIds.length : 1;

  const resetForm = useCallback(() => {
    setEnableAllFolders(true);
    setEnabledFolders([]);
    setBitrateMbps("0");
    setAllowVideoTranscoding(true);
    setAllowAudioTranscoding(true);
    setAllowMediaRemuxing(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const librariesResult = await getLibraries();
        if (cancelled) return;

        if (librariesResult.success) {
          setLibraries(librariesResult.data);
        }

        if (userId) {
          const policyResult = await getUserPolicyAction(userId);
          if (cancelled) return;

          if (policyResult.success) {
            const policy = policyResult.data;
            setEnableAllFolders(policy.enableAllFolders);
            setEnabledFolders(policy.enabledFolders || []);
            setBitrateMbps((policy.remoteClientBitrateLimit / 1000000).toString());
            setAllowVideoTranscoding(policy.allowVideoTranscoding ?? true);
            setAllowAudioTranscoding(policy.allowAudioTranscoding ?? true);
            setAllowMediaRemuxing(policy.allowMediaRemuxing ?? true);
          }
        } else {
          resetForm();
        }
      } catch {
        toast.error("Failed to load settings");
      }
      if (!cancelled) {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [open, userId, resetForm]);

  const handleSave = async () => {
    setSaving(true);

    const updates: {
      enabledFolders?: string[];
      enableAllFolders?: boolean;
      remoteClientBitrateLimit?: number;
      allowVideoTranscoding?: boolean;
      allowAudioTranscoding?: boolean;
      allowMediaRemuxing?: boolean;
    } = {};

    updates.enableAllFolders = enableAllFolders;
    if (!enableAllFolders) {
      updates.enabledFolders = enabledFolders;
    }

    updates.remoteClientBitrateLimit = Math.round(Number.parseFloat(bitrateMbps || "0") * 1000000);
    updates.allowVideoTranscoding = allowVideoTranscoding;
    updates.allowAudioTranscoding = allowAudioTranscoding;
    updates.allowMediaRemuxing = allowMediaRemuxing;

    try {
      if (isBulkMode && userIds) {
        const result = await bulkUpdatePolicyAction({
          userIds,
          updates,
        });

        if (!result.success) {
          toast.error("Failed to update users");
        } else if (result.data.failed > 0) {
          toast.warning(`Updated ${result.data.updated} users, ${result.data.failed} failed`);
        } else {
          toast.success(`Updated ${result.data.updated} users`);
        }
        onOpenChange(false);
        resetForm();
        onSaveComplete?.();
      } else if (userId) {
        const result = await updateUserPolicyAction(userId, updates);

        if (!result.success) {
          toast.error("Failed to update user");
        } else {
          toast.success("User settings updated");
          onOpenChange(false);
          onSaveComplete?.();
        }
      }
    } catch {
      toast.error("Failed to update");
    }
    setSaving(false);
  };

  const toggleLibrary = (libraryId: string) => {
    setEnabledFolders((prev) =>
      prev.includes(libraryId) ? prev.filter((id) => id !== libraryId) : [...prev, libraryId],
    );
  };

  const title = isBulkMode ? "Edit Users" : "User Settings";
  const description = isBulkMode
    ? `Update settings for ${targetCount} selected user(s).`
    : `Manage settings for ${userName || "user"}`;

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
            <div className="space-y-6 py-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Library Access</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-settings-all-folders`}
                    checked={enableAllFolders}
                    onCheckedChange={(checked) => setEnableAllFolders(!!checked)}
                  />
                  <Label
                    htmlFor={`${id}-settings-all-folders`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    Access to all libraries
                  </Label>
                </div>

                {!enableAllFolders && (
                  <div className="space-y-2 border-l-2 pl-4 ml-1">
                    {libraries.map((library) => (
                      <div key={library.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`${id}-settings-${library.id}`}
                          checked={enabledFolders.includes(library.id)}
                          onCheckedChange={() => toggleLibrary(library.id)}
                        />
                        <Label
                          htmlFor={`${id}-settings-${library.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {library.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Transcoding Options</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-settings-video-transcoding`}
                    checked={allowVideoTranscoding}
                    onCheckedChange={(checked) => setAllowVideoTranscoding(!!checked)}
                  />
                  <Label
                    htmlFor={`${id}-settings-video-transcoding`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    Allow video transcoding
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-settings-audio-transcoding`}
                    checked={allowAudioTranscoding}
                    onCheckedChange={(checked) => setAllowAudioTranscoding(!!checked)}
                  />
                  <Label
                    htmlFor={`${id}-settings-audio-transcoding`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    Allow audio transcoding
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-settings-remuxing`}
                    checked={allowMediaRemuxing}
                    onCheckedChange={(checked) => setAllowMediaRemuxing(!!checked)}
                  />
                  <Label
                    htmlFor={`${id}-settings-remuxing`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    Allow remuxing
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${id}-settings-bitrate`} className="text-sm font-medium">
                  Remote Streaming Bitrate
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${id}-settings-bitrate`}
                    type="number"
                    value={bitrateMbps}
                    onChange={(e) => setBitrateMbps(e.target.value)}
                    placeholder="0"
                    min={0}
                    step={1}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">Mbps (0 = unlimited)</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
