"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/shared/password-input";
import { completePasswordReset } from "@/app/actions/password-reset";
import { validatePassword } from "@/lib/schemas";

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const passwordValidation = validatePassword(password);
  const passwordsMatch = password === confirmPassword;
  const isFormValid = pin.length > 0 && passwordValidation.isValid && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!passwordValidation.isValid) {
      setError(passwordValidation.errors[0] || "Password does not meet requirements");
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const result = await completePasswordReset({
        username,
        pin,
        newPassword: password,
      });

      if (!result.success) {
        setError(result.error || "Failed to reset password. Please check your PIN and try again.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">Reset password</CardTitle>
          <CardDescription>Enter the PIN from your email and your new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                type="text"
                placeholder="XX-XX-XX-XX"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
            </div>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              label="New password"
              placeholder="New password"
              showStrengthIndicator
              showRequirements
              autoComplete="new-password"
            />
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={setConfirmPassword}
              label="Confirm password"
              placeholder="Confirm password"
              autoComplete="new-password"
              error={confirmPassword && !passwordsMatch ? "Passwords do not match" : undefined}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading || !isFormValid}>
              {isLoading ? "Resetting..." : "Reset password"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Link href="/forgot-password" className="text-sm text-muted-foreground hover:underline">
              Request a new PIN
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
