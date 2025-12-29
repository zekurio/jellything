"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { ProfileFormDialog } from "@/components/profiles/profile-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { getProfile } from "@/app/actions/admin/profiles";

type Profile = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  policy?: {
    enableAllFolders: boolean;
    enabledFolders: string[];
    remoteClientBitrateLimit: number;
    isDisabled: boolean;
  };
};

export default function ProfileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const profileId = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const result = await getProfile(profileId);
      if (!result.success) {
        setError(result.error || "Failed to fetch profile");
      } else {
        setProfile(result.data);
      }
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return (
      <>
        <SiteHeader
          breadcrumbs={[{ label: "Profiles", href: "/profiles" }, { label: "Loading..." }]}
        />
        <div className="flex flex-1 items-center justify-center">
          <Spinner centered />
        </div>
      </>
    );
  }

  if (error || !profile) {
    return (
      <>
        <SiteHeader breadcrumbs={[{ label: "Profiles", href: "/profiles" }, { label: "Error" }]} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <p className="text-muted-foreground">{error || "Profile not found"}</p>
          <Button variant="outline" onClick={() => router.push("/profiles")}>
            Back to Profiles
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Profiles", href: "/profiles" },
          { label: profile.name, href: `/profiles/${profileId}` },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <Button onClick={() => setEditDialogOpen(true)}>Edit Profile</Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Basic configuration for this profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="font-medium">Account Status: </span>
                <span className={profile.policy?.isDisabled ? "text-destructive" : "text-success"}>
                  {profile.policy?.isDisabled ? "Disabled by default" : "Enabled by default"}
                </span>
              </div>
              <div>
                <span className="font-medium">Streaming Bitrate: </span>
                <span>
                  {profile.policy?.remoteClientBitrateLimit
                    ? `${profile.policy.remoteClientBitrateLimit / 1000000} Mbps`
                    : "Unlimited"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Library Access</CardTitle>
              <CardDescription>Default library access permissions</CardDescription>
            </CardHeader>
            <CardContent>
              {profile.policy?.enableAllFolders ? (
                <p>Access to all libraries enabled</p>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium">Specific libraries only:</p>
                  {profile.policy?.enabledFolders?.length ? (
                    <ul className="list-disc pl-5">
                      {profile.policy.enabledFolders.map((folderId) => (
                        <li key={folderId} className="text-sm text-muted-foreground">
                          {folderId}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No libraries selected</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <ProfileFormDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          profileId={profileId}
          onSaveComplete={() => {
            setEditDialogOpen(false);
            fetchProfile();
            toast.success("Profile updated");
          }}
        />
      </div>
    </>
  );
}
