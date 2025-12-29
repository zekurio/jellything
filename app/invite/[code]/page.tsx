"use client";

import { IconLoader2, IconMail, IconUpload, IconUser, IconX } from "@tabler/icons-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { redeemInvite, validateInvite } from "@/app/actions/invite";
import { getSession } from "@/lib/auth";
import { resendVerification } from "@/app/actions/email";

export default function InviteRedeemPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string)?.toUpperCase();

  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [resending, setResending] = useState(false);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkSession = async () => {
      const session = await getSession();
      if (session) {
        setIsLoggedIn(true);
        setUserEmail(session.user.email);
        setEmailVerified(session.user.emailVerified);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    if (!code) {
      setValidating(false);
      setErrorMessage("Invalid invite link");
      return;
    }

    let cancelled = false;

    const validateCode = async () => {
      const result = await validateInvite(code);
      if (cancelled) return;

      if (!result.success) {
        setErrorMessage("Failed to validate invite");
        setValidating(false);
        return;
      }

      const data = result.data;
      if (data.valid) {
        setValid(true);
        setProfileName(data.profileName || "");
      } else {
        setErrorMessage(data.error || "Invalid invite");
      }
      setValidating(false);
    };

    validateCode();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setAvatarPreview(result);
      setAvatar(result);
    };
    reader.readAsDataURL(file);
  }, []);

  const clearAvatar = useCallback(() => {
    setAvatar(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      toast.error("Username is required");
      return;
    }

    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (!password) {
      toast.error("Password is required");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }

    setSubmitting(true);

    try {
      const result = await redeemInvite({
        code,
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        avatar: avatar || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to create account");
      } else if (result.data.success) {
        toast.success("Account created successfully!");
        router.push("/dashboard");
      }
    } catch {
      toast.error("Failed to create account");
    }

    setSubmitting(false);
  };

  const handleResendVerification = async () => {
    setResending(true);
    try {
      const result = await resendVerification();
      if (result.success) {
        toast.success("Verification email sent");
      } else {
        toast.error(result.error || "Failed to send verification email");
      }
    } finally {
      setResending(false);
    }
  };

  if (isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <IconMail className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Email Verification</CardTitle>
            <CardDescription>
              You&apos;re already logged in with email: {userEmail}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-center">
              <p className="text-sm font-medium">
                {emailVerified ? "Your email is verified" : "Your email is not verified"}
              </p>
            </div>
            {!emailVerified && (
              <Button
                className="w-full"
                onClick={handleResendVerification}
                disabled={resending}
              >
                {resending ? "Sending..." : "Resend verification email"}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Spinner />
            <p className="text-muted-foreground">Validating invite...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <IconX className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>{errorMessage || "This invite link is not valid."}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={() => router.push("/")}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <IconMail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Create Your Account</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join with the &quot;{profileName}&quot; profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  disabled={submitting}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={submitting}
                autoComplete="email"
              />
              <p className="text-xs text-muted-foreground">
                Used for password reset and notifications.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={submitting}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                disabled={submitting}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label>Avatar (optional)</Label>
              <div className="flex items-center gap-4">
                {avatarPreview ? (
                  <div className="relative">
                    <Image
                      src={avatarPreview}
                      alt="Avatar preview"
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -right-2 -top-2 h-6 w-6"
                      onClick={clearAvatar}
                    >
                      <IconX className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <IconUser className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="avatar-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                  >
                    <IconUpload className="mr-2 h-4 w-4" />
                    Upload Image
                  </Button>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
