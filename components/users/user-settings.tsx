"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  getLibraries,
  getUserPolicyAction,
  updateUserPolicyAction,
} from "@/app/actions/admin/users";
import type { MediaLibrary } from "@/server/jellyfin/admin";

type Library = MediaLibrary;

interface UserSettingsProps {
  userId: string;
}

export function UserSettings({ userId }: UserSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [libraries, setLibraries] = useState<Library[]>([]);

  const [enableAllFolders, setEnableAllFolders] = useState(true);
  const [enabledFolders, setEnabledFolders] = useState<string[]>([]);
  const [bitrateMbps, setBitrateMbps] = useState<string>("0");
  const [allowVideoTranscoding, setAllowVideoTranscoding] = useState(true);
  const [allowAudioTranscoding, setAllowAudioTranscoding] = useState(true);
  const [allowMediaRemuxing, setAllowMediaRemuxing] = useState(true);

  const id = useId();

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const librariesResult = await getLibraries();
        if (cancelled) return;

        if (librariesResult.success) {
          setLibraries(librariesResult.data);
        }

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
  }, [userId]);

  const handleSave = useCallback(async () => {
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
      const result = await updateUserPolicyAction(userId, updates);

      if (!result.success) {
        toast.error("Failed to update user");
      } else {
        toast.success("User settings updated");
      }
    } catch {
      toast.error("Failed to update");
    }
    setSaving(false);
  }, [
    userId,
    enableAllFolders,
    enabledFolders,
    bitrateMbps,
    allowVideoTranscoding,
    allowAudioTranscoding,
    allowMediaRemuxing,
  ]);

  const toggleLibrary = (libraryId: string) => {
    setEnabledFolders((prev) =>
      prev.includes(libraryId) ? prev.filter((id) => id !== libraryId) : [...prev, libraryId],
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
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

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
