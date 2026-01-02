"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/shared/password-input";
import { Spinner } from "@/components/ui/spinner";
import { verifyPasswordResetPin, completePasswordReset } from "@/app/actions/password-reset";
import { validatePassword } from "@/lib/schemas";

type Step = "verifying" | "error" | "password";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("verifying");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const urlUsername = searchParams.get("username") || "";
  const urlPin = searchParams.get("pin") || "";

  const passwordValidation = validatePassword(password);
  const passwordsMatch = password === confirmPassword;
  const isPasswordValid = passwordValidation.isValid && passwordsMatch;

  useEffect(() => {
    const initialUsername = urlUsername;
    const initialPin = urlPin;

    if (initialUsername && initialPin) {
      setUsername(initialUsername);
      setPin(initialPin);
      verifyPin(initialUsername, initialPin);
    } else {
      setStep("error");
    }
  }, [urlUsername, urlPin]);

  async function verifyPin(verifyUsername: string, verifyPin: string) {
    setStep("verifying");
    setError(null);

    try {
      const result = await verifyPasswordResetPin({ username: verifyUsername, pin: verifyPin });

      if (!result.success) {
        setError(result.error || "Invalid or expired PIN. Please try again or request a new one.");
        setStep("error");
        return;
      }

      setStep("password");
    } catch {
      setError("Something went wrong. Please try again.");
      setStep("error");
    }
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await verifyPasswordResetPin({ username, pin });

      if (!result.success) {
        setError(result.error || "Invalid PIN. Please try again.");
        setStep("error");
        return;
      }

      setStep("password");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
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
      const result = await completePasswordReset({ username, pin, newPassword: password });

      if (!result.success) {
        setError(result.error || "Failed to reset password. Please try again.");
        setStep("error");
        return;
      }

      router.push("/login");
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
          {step === "verifying" && (
            <>
              <CardTitle className="text-2xl font-semibold tracking-tight">Verifying PIN</CardTitle>
              <CardDescription>Please wait while we verify your PIN...</CardDescription>
            </>
          )}
          {step === "error" && (
            <>
              <CardTitle className="text-2xl font-semibold tracking-tight">Verify PIN</CardTitle>
              <CardDescription>Enter the PIN from your email.</CardDescription>
            </>
          )}
          {step === "password" && (
            <>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                Set new password
              </CardTitle>
              <CardDescription>Enter your new password.</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {step === "verifying" && (
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <Spinner size="lg" />
              <p className="text-sm text-muted-foreground">Verifying your PIN...</p>
            </div>
          )}

          {(step === "error" || step === "password") && (
            <form
              onSubmit={step === "password" ? handlePasswordSubmit : handlePinSubmit}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              {step === "error" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pin">PIN</Label>
                    <Input
                      id="pin"
                      type="text"
                      placeholder="XX-XX-XX-XX"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isLoading || !pin}>
                    {isLoading ? "Verifying..." : "Verify PIN"}
                  </Button>
                  <div className="text-center space-y-2">
                    <Link
                      href="/forgot-password"
                      className="text-sm text-muted-foreground hover:underline block"
                    >
                      Request a new PIN
                    </Link>
                  </div>
                </>
              )}

              {step === "password" && (
                <>
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
                    error={
                      confirmPassword && !passwordsMatch ? "Passwords do not match" : undefined
                    }
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isLoading || !isPasswordValid}>
                    {isLoading ? "Resetting..." : "Reset password"}
                  </Button>
                </>
              )}

              <div className="text-center">
                <Link href="/login" className="text-sm text-muted-foreground hover:underline">
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold tracking-tight">Loading...</CardTitle>
              <CardDescription>Please wait while we load the page.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <Spinner size="lg" />
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
