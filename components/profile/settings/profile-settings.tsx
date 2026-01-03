"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  updateOwnProfileAction,
  changePasswordAction,
  updateEmailAction,
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
  createdAt: Date;
}

interface ProfileSettingsProps {
  profile: ProfileData | null;
  onUpdate: () => void;
}

export function ProfileSettings({ profile, onUpdate }: ProfileSettingsProps) {
  if (!profile) {
    return null;
  }

  return (
    <Tabs defaultValue="general" className="max-w-2xl">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="mt-6 space-y-8">
        <AccountForm profile={profile} onUpdate={onUpdate} />
        <DangerZone />
      </TabsContent>

      <TabsContent value="password" className="mt-6">
        <PasswordForm />
      </TabsContent>
    </Tabs>
  );
}

function AccountForm({ profile, onUpdate }: { profile: ProfileData; onUpdate: () => void }) {
  const [name, setName] = useState(profile.name);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState(profile.email ?? "");
  const [originalEmail, setOriginalEmail] = useState(profile.email ?? "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState("");

  const handleSaveName = async () => {
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

  const handleSaveEmail = async () => {
    setEmailError("");

    const emailResult = z.email().safeParse(email.trim());
    if (!emailResult.success) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setEmailSaving(true);
    try {
      const result = await updateEmailAction({ newEmail: email.trim() });
      if (result.success) {
        toast.success("Email updated. Please verify your new email.");
        setOriginalEmail(email.trim());
        onUpdate();
      } else {
        setEmailError(result.error || "Failed to update email");
      }
    } finally {
      setEmailSaving(false);
    }
  };

  const emailVerified = profile.emailVerified && email.trim() === originalEmail;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Account Details</h2>

      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Username</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={emailError ? "border-destructive pr-14" : "pr-14"}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSaveEmail}
              disabled={emailSaving || email.trim() === originalEmail}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
            >
              {emailSaving ? "..." : "Save"}
            </Button>
          </div>
          {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          {email && (
            <p className="text-xs text-muted-foreground">
              {emailVerified ? (
                "Email verified"
              ) : (
                <>
                  Your email is not verified. Check your inbox or{" "}
                  <Button
                    variant="link"
                    size="sm"
                    onClick={async () => {
                      const result = await resendVerification();
                      if (result.success) {
                        toast.success("Verification email sent");
                      } else {
                        toast.error(result.error || "Failed to send verification email");
                      }
                    }}
                    className="h-auto p-0 text-xs inline"
                  >
                    resend email.
                  </Button>
                </>
              )}
            </p>
          )}
        </div>

        <Button onClick={handleSaveName} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </section>
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
      const result = await changePasswordAction({
        currentPassword,
        newPassword,
      });
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
    <section>
      <h2 className="text-lg font-semibold mb-4">Change Password</h2>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
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
    </section>
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
    <section>
      <h2 className="text-lg font-semibold text-destructive mb-2">Danger Zone</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Destructive actions which are potentially irreversible. Be careful.
      </p>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            <Trash2 className="size-4 mr-2" />
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
            <div className="grid gap-2">
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
    </section>
  );
}
