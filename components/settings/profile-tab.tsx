"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconTrash } from "@tabler/icons-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PasswordInput } from "@/components/shared/password-input";
import { AvatarUpload, type AvatarFile } from "@/components/shared/avatar-upload";
import {
  updateOwnProfileAction,
  changePasswordAction,
  updateEmailAction,
  uploadAvatarAction,
  deleteAccountAction,
} from "@/app/actions/user/profile";
import { resendVerification } from "@/app/actions/email";
import { validatePassword } from "@/lib/schemas";

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
    async (file: AvatarFile) => {
      setAvatarUploading(true);
      try {
        const result = await uploadAvatarAction({
          imageBase64: file.rawBase64,
          mimeType: file.mimeType,
        });
        if (result.success) {
          toast.success("Avatar uploaded");
          onUpdate();
        } else {
          toast.error(result.error || "Failed to upload avatar");
        }
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
          <AvatarUpload
            currentAvatarUrl={profile.avatarUrl}
            name={profile.name}
            onFileSelect={handleAvatarUpload}
            isUploading={avatarUploading}
            size="lg"
            showRemove={false}
          />
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
  const [displayEmail, setDisplayEmail] = useState(profile.email ?? "");
  const [displayEmailVerified, setDisplayEmailVerified] = useState(profile.emailVerified);

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

    const emailResult = z.string().email().safeParse(newEmail.trim());
    if (!emailResult.success) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setEmailSaving(true);
    try {
      const result = await updateEmailAction({ newEmail });
      if (result.success) {
        toast.success("Email updated. Please verify your new email.");
        setEmailChangeOpen(false);
        setNewEmail("");
        setDisplayEmail(newEmail.trim());
        setDisplayEmailVerified(false);
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
            <Input id="email" value={displayEmail} disabled className="flex-1" />
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
          {displayEmail && (
            <p className="text-xs text-muted-foreground">
              {displayEmailVerified ? "Email verified" : "Email not verified - check your inbox"}
            </p>
          )}
          {displayEmail && !displayEmailVerified && (
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

  const passwordValidation = useMemo(() => validatePassword(newPassword), [newPassword]);
  const passwordsMatch = newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error("Current password is required");
      return;
    }

    if (!passwordValidation.isValid) {
      toast.error(passwordValidation.errors[0] || "Password does not meet requirements");
      return;
    }

    if (!passwordsMatch) {
      toast.error("Passwords do not match");
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
          <PasswordInput
            id="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            label="Current Password"
            autoComplete="current-password"
          />
          <PasswordInput
            id="new-password"
            value={newPassword}
            onChange={setNewPassword}
            label="New Password"
            showStrengthIndicator
            showRequirements
            autoComplete="new-password"
          />
          <PasswordInput
            id="confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            label="Confirm New Password"
            autoComplete="new-password"
            error={confirmPassword && !passwordsMatch ? "Passwords do not match" : undefined}
          />
          <Button type="submit" disabled={saving || !passwordValidation.isValid || !passwordsMatch}>
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
                This action cannot be undone. This will permanently delete your account and remove
                your data from our servers.
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
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting || confirmText !== "DELETE"}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting..." : "Delete Account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
