"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/app/actions/password-reset";

type Step = "form" | "submitted";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await requestPasswordReset({ email });

      if (!result.success) {
        setError(result.error || "Failed to send reset link. Please try again.");
        return;
      }

      setStep("submitted");
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
          {step === "form" && (
            <>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                Forgot password?
              </CardTitle>
              <CardDescription>
                Enter your email address and we&apos;ll send you a link to reset your password.
              </CardDescription>
            </>
          )}
          {step === "submitted" && (
            <>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                Check your email
              </CardTitle>
              <CardDescription>
                If an account exists with that email address, we&apos;ve sent you a link to reset
                your password.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {step === "form" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send Reset Link"}
              </Button>
              <div className="text-center">
                <Link href="/login" className="text-sm text-muted-foreground hover:underline">
                  Back to login
                </Link>
              </div>
            </form>
          )}

          {step === "submitted" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Click the link in the email to verify your PIN and set a new password.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  Back to login
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
