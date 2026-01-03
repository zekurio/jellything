"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PasswordInput } from "@/components/shared/password-input";
import { AVATAR_CONFIG, type AvatarFile, type AcceptedMimeType } from "@/components/shared/avatar-upload";
import { Spinner } from "@/components/ui/spinner";
import { redeemInvite, validateInvite } from "@/app/actions/invite";
import { getSession } from "@/lib/auth";
import { resendVerification } from "@/app/actions/email";
import { validatePassword, normalizeEmail } from "@/lib/schemas";
import { cn, getInitials } from "@/lib/utils";

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
  const [avatarFile, setAvatarFile] = useState<AvatarFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const passwordValidation = useMemo(() => validatePassword(password), [password]);
  const passwordsMatch = password === confirmPassword;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      toast.error("Username is required");
      return;
    }

    // Email validation using Zod
    const emailResult = z.string().email().safeParse(email.trim());
    if (!emailResult.success) {
      toast.error("Please enter a valid email address");
      return;
    }

    // Password validation using shared validator
    if (!passwordValidation.isValid) {
      toast.error(passwordValidation.errors[0] || "Password does not meet requirements");
      return;
    }

    if (!passwordsMatch) {
      toast.error("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      const result = await redeemInvite({
        code,
        username: username.trim(),
        email: normalizeEmail(email),
        password,
        avatar: avatarFile?.base64 || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to create account");
      } else if (result.data.success) {
        setRegistrationComplete(true);
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

  if (registrationComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">Account created</CardTitle>
            <CardDescription>
              Please check your email to verify your address before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We sent a verification link to{" "}
              <span className="font-medium text-foreground">{email}</span>. If you don&apos;t see
              the email, check your spam folder.
            </p>
            <Button className="w-full" onClick={() => router.push("/dashboard")}>
              Continue to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Email verification
            </CardTitle>
            <CardDescription>You&apos;re already logged in with email: {userEmail}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {emailVerified ? "Your email is verified." : "Your email is not verified."}
            </p>
            {!emailVerified && (
              <Button className="w-full" onClick={handleResendVerification} disabled={resending}>
                {resending ? "Sending..." : "Resend verification email"}
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => router.push("/dashboard")}>
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
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-8">
            <Spinner size="lg" />
            <span className="text-sm text-muted-foreground">Validating invite...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">Invalid invite</CardTitle>
            <CardDescription>{errorMessage || "This invite link is not valid."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
              Go home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Create your account
          </CardTitle>
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

            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              label="Password"
              placeholder="Enter your password"
              disabled={submitting}
              showStrengthIndicator
              showRequirements
              autoComplete="new-password"
            />

            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              label="Confirm Password"
              placeholder="Confirm your password"
              disabled={submitting}
              autoComplete="new-password"
              error={confirmPassword && !passwordsMatch ? "Passwords do not match" : undefined}
            />

            <div className="space-y-2">
              <Label>Avatar (optional)</Label>
              <AvatarUploadButton
                name={username}
                avatarFile={avatarFile}
                onFileSelect={setAvatarFile}
                disabled={submitting}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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

interface AvatarUploadButtonProps {
  name: string;
  avatarFile: AvatarFile | null;
  onFileSelect: (file: AvatarFile | null) => void;
  disabled?: boolean;
}

function AvatarUploadButton({ name, avatarFile, onFileSelect, disabled }: AvatarUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!AVATAR_CONFIG.acceptedTypes.includes(file.type as AcceptedMimeType)) {
        toast.error("Invalid image type. Only JPEG, PNG, and WebP are allowed.");
        return;
      }

      if (file.size > AVATAR_CONFIG.maxSize) {
        toast.error("Image must be less than 1MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const rawBase64 = base64.split(",")[1] || "";

        onFileSelect({
          base64,
          mimeType: file.type as AcceptedMimeType,
          rawBase64,
        });
      };
      reader.readAsDataURL(file);
    },
    [onFileSelect],
  );

  const displayUrl = avatarFile?.base64;

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_CONFIG.acceptString}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="group relative shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
        aria-label="Upload avatar"
      >
        <Avatar className="h-16 w-16">
          {displayUrl && <AvatarImage src={displayUrl} alt={name || "Avatar"} />}
          <AvatarFallback className="text-lg">
            {name ? getInitials(name) : <Camera className="h-5 w-5 text-muted-foreground" />}
          </AvatarFallback>
        </Avatar>
        {/* Upload indicator overlay */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full bg-black/50 transition-opacity",
            "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          <Camera className="h-5 w-5 text-white" />
        </div>
      </button>
      <div className="text-xs text-muted-foreground">
        <p>Click to upload</p>
        <p>JPG, PNG, or WebP. Max 1MB.</p>
      </div>
    </div>
  );
}
