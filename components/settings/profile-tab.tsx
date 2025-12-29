"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCamera, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  updateOwnProfileAction,
  changePasswordAction,
  updateEmailAction,
  uploadAvatarAction,
  deleteAccountAction,
} from "@/app/actions/user/profile";
import { resendVerification } from "@/app/actions/email";
import { getInitials } from "@/lib/utils";

interface ProfileData {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string;
}

interface ProfileTabProps {
  profile: ProfileData | null;
  onUpdate: () => void;
}

export function ProfileTab({ profile, onUpdate }: ProfileTabProps) {
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be less than 5MB");
        return;
      }

      const mimeType = file.type;
      const validTypes = ["image/jpeg", "image/png", "image/webp"] as const;
      if (!validTypes.includes(mimeType as (typeof validTypes)[number])) {
        toast.error("Invalid image type. Only JPEG, PNG, and WebP are allowed.");
        return;
      }

      setAvatarUploading(true);
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target?.result as string;
          const result = await uploadAvatarAction({ imageBase64: base64.split(",")[1]!, mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp" });
          if (result.success) {
            toast.success("Avatar uploaded");
            onUpdate();
          } else {
            toast.error(result.error || "Failed to upload avatar");
          }
        };
        reader.readAsDataURL(file);
      } finally {
        setAvatarUploading(false);
      }
    },
    [onUpdate],
  );

  if (!profile) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
          <CardDescription>Upload a new profile picture</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <Avatar className="size-24">
              <AvatarImage src={profile.avatarUrl} alt={profile.name} />
              <AvatarFallback className="text-2xl">{getInitials(profile.name)}</AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="avatar-upload" className="cursor-pointer" tabIndex={0}>
                <div className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  {avatarUploading ? <Spinner className="size-4 animate-spin" /> : <IconCamera className="size-4" />}
                  {avatarUploading ? "Uploading..." : "Upload Photo"}
                </div>
              </Label>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarUpload(file);
                }}
                disabled={avatarUploading}
              />
              <p className="mt-2 text-xs text-muted-foreground">JPG, PNG, or WebP. Max 5MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProfileInfoForm profile={profile} onUpdate={onUpdate} />
      <PasswordForm />
      <DangerZone />
    </div>
  );
}

function ProfileInfoForm({ profile, onUpdate }: { profile: ProfileData; onUpdate: () => void }) {
  const [name, setName] = useState(profile.name);
  const [saving, setSaving] = useState(false);
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Username is required");
      return;
    }

    setSaving(true);
    try {
      const result = await updateOwnProfileAction({ name });
      if (result.success) {
        toast.success("Profile updated");
        onUpdate();
      } else {
        toast.error(result.error || "Failed to update profile");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");

    if (!newEmail || !newEmail.includes("@")) {
      setEmailError("Invalid email address");
      return;
    }

    setEmailSaving(true);
    try {
      const result = await updateEmailAction({ newEmail });
      if (result.success) {
        toast.success("Email updated. Please verify your new email.");
        setEmailChangeOpen(false);
        setNewEmail("");
        onUpdate();
      } else {
        setEmailError(result.error || "Failed to update email");
      }
    } finally {
      setEmailSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>Update your profile details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Username</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="flex gap-2">
            <Input id="email" value={profile.email ?? ""} disabled className="flex-1" />
            <AlertDialog open={emailChangeOpen} onOpenChange={setEmailChangeOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline">Change</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Change Email</AlertDialogTitle>
                  <AlertDialogDescription>
                    A verification email will be sent to your new email address.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <form onSubmit={handleUpdateEmail} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-email">New Email</Label>
                    <Input
                      id="new-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                    {emailError && <p className="text-sm text-destructive">{emailError}</p>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button type="submit" disabled={emailSaving}>
                      {emailSaving ? "Updating..." : "Update Email"}
                    </Button>
                  </div>
                </form>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {profile.email && (
            <p className="text-xs text-muted-foreground">
              {profile.emailVerified ? "Email verified" : "Email not verified - check your inbox"}
            </p>
          )}
          {profile.email && !profile.emailVerified && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const result = await resendVerification();
                if (result.success) {
                  toast.success("Verification email sent");
                } else {
                  toast.error(result.error || "Failed to send verification email");
                }
              }}
            >
              Resend verification email
            </Button>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (!currentPassword || !newPassword) {
      toast.error("All password fields are required");
      return;
    }

    setSaving(true);
    try {
      const result = await changePasswordAction({ currentPassword, newPassword });
      if (result.success) {
        toast.success("Password changed");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(result.error || "Failed to change password");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Update your password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Changing..." : "Change Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DangerZone() {
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const router = useRouter();

  const handleDelete = async () => {
    if (confirmText !== "DELETE") {
      toast.error("Type DELETE to confirm");
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteAccountAction();
      if (result.success) {
        toast.success("Account deleted");
        router.push("/login");
      } else {
        toast.error(result.error || "Failed to delete account");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>Permanently delete your account and all associated data</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <IconTrash className="size-4 mr-2" />
              Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your account and remove your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
                <Input
                  id="delete-confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting || confirmText !== "DELETE"} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? "Deleting..." : "Delete Account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
