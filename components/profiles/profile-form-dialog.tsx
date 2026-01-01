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
import { getLibraries } from "@/app/actions/admin/users";
import { createProfileAction, getProfile, updateProfileAction } from "@/app/actions/admin/profiles";

interface Library {
  id: string;
  name: string;
  collectionType: string | null;
}

interface ProfileFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId?: string;
  onSaveComplete?: () => void;
}

export function ProfileFormDialog({
  open,
  onOpenChange,
  profileId,
  onSaveComplete,
}: ProfileFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [libraries, setLibraries] = useState<Library[]>([]);

  const [name, setName] = useState("");
  const [enableAllFolders, setEnableAllFolders] = useState(true);
  const [enabledFolders, setEnabledFolders] = useState<string[]>([]);
  const [bitrateMbps, setBitrateMbps] = useState("0");
  const [allowVideoTranscoding, setAllowVideoTranscoding] = useState(true);
  const [allowAudioTranscoding, setAllowAudioTranscoding] = useState(true);
  const [allowMediaRemuxing, setAllowMediaRemuxing] = useState(true);

  const id = useId();
  const isEditMode = !!profileId;

  const resetForm = useCallback(() => {
    setName("");
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
        // Fetch libraries for the checkbox list
        const librariesResult = await getLibraries();
        if (cancelled) return;

        if (librariesResult.success) {
          setLibraries(librariesResult.data);
        } else {
          toast.error("Failed to load libraries");
        }

        // If editing, fetch the profile
        if (profileId) {
          const profileResult = await getProfile(profileId);
          if (cancelled) return;

          if (profileResult.success) {
            const profile = profileResult.data;
            setName(profile.name);
            if (profile.policy) {
              setEnableAllFolders(profile.policy.enableAllFolders);
              setEnabledFolders(profile.policy.enabledFolders || []);
              setBitrateMbps((profile.policy.remoteClientBitrateLimit / 1000000).toString());
              setAllowVideoTranscoding(profile.policy.allowVideoTranscoding ?? true);
              setAllowAudioTranscoding(profile.policy.allowAudioTranscoding ?? true);
              setAllowMediaRemuxing(profile.policy.allowMediaRemuxing ?? true);
            }
          } else {
            toast.error("Failed to load profile");
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
  }, [open, profileId, resetForm]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Profile name is required");
      return;
    }

    setSaving(true);

    const policy = {
      enableAllFolders,
      enabledFolders: enableAllFolders ? [] : enabledFolders,
      remoteClientBitrateLimit: Math.round(Number.parseFloat(bitrateMbps || "0") * 1000000),
      allowVideoTranscoding,
      allowAudioTranscoding,
      allowMediaRemuxing,
    };

    try {
      if (isEditMode && profileId) {
        const res = await updateProfileAction(profileId, {
          name,
          policy,
        });

        if (res.success) {
          toast.success("Profile updated");
          onOpenChange(false);
          onSaveComplete?.();
        } else {
          toast.error(res.error || "Failed to update profile");
        }
      } else {
        const res = await createProfileAction({
          name,
          policy,
        });

        if (res.success) {
          toast.success("Profile created");
          onOpenChange(false);
          resetForm();
          onSaveComplete?.();
        } else {
          toast.error(res.error || "Failed to create profile");
        }
      }
    } catch {
      toast.error("Failed to save profile");
    }
    setSaving(false);
  };

  const toggleLibrary = (libraryId: string) => {
    setEnabledFolders((prev) =>
      prev.includes(libraryId) ? prev.filter((id) => id !== libraryId) : [...prev, libraryId],
    );
  };

  const title = isEditMode ? "Edit Profile" : "Create Profile";
  const description = isEditMode
    ? "Update the profile settings."
    : "Create a new profile with custom settings.";

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
              <div className="space-y-2">
                <Label htmlFor={`${id}-profile-name`} className="text-sm font-medium">Profile Name</Label>
                <Input
                  id={`${id}-profile-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Friends & Family"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Library Access</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-profile-all-folders`}
                    checked={enableAllFolders}
                    onCheckedChange={(checked) => setEnableAllFolders(!!checked)}
                  />
                  <Label htmlFor={`${id}-profile-all-folders`} className="text-sm font-normal cursor-pointer">
                    Access to all libraries
                  </Label>
                </div>

                {!enableAllFolders && (
                  <div className="space-y-2 border-l-2 pl-4 ml-1">
                    {libraries.map((library) => (
                      <div key={library.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`${id}-profile-lib-${library.id}`}
                          checked={enabledFolders.includes(library.id)}
                          onCheckedChange={() => toggleLibrary(library.id)}
                        />
                        <Label htmlFor={`${id}-profile-lib-${library.id}`} className="text-sm font-normal cursor-pointer">
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
                    id={`${id}-profile-video-transcoding`}
                    checked={allowVideoTranscoding}
                    onCheckedChange={(checked) => setAllowVideoTranscoding(!!checked)}
                  />
                  <Label htmlFor={`${id}-profile-video-transcoding`} className="text-sm font-normal cursor-pointer">
                    Allow video transcoding
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-profile-audio-transcoding`}
                    checked={allowAudioTranscoding}
                    onCheckedChange={(checked) => setAllowAudioTranscoding(!!checked)}
                  />
                  <Label htmlFor={`${id}-profile-audio-transcoding`} className="text-sm font-normal cursor-pointer">
                    Allow audio transcoding
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-profile-remuxing`}
                    checked={allowMediaRemuxing}
                    onCheckedChange={(checked) => setAllowMediaRemuxing(!!checked)}
                  />
                  <Label htmlFor={`${id}-profile-remuxing`} className="text-sm font-normal cursor-pointer">
                    Allow remuxing
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${id}-profile-bitrate`} className="text-sm font-medium">Remote Streaming Bitrate</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${id}-profile-bitrate`}
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
                {saving ? "Saving..." : isEditMode ? "Save Changes" : "Create Profile"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
