"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { verifyEmail } from "@/app/actions/email";

export default function VerifyEmailPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function verifyEmailAddress() {
      try {
        const result = await verifyEmail({ token });

        if (!result.success) {
          setStatus("error");
          setErrorMessage("Invalid or expired verification link");
          return;
        }

        setStatus("success");

        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 2000);
      } catch {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    }

    verifyEmailAddress();
  }, [token, router]);

  if (status === "verifying") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <Spinner size="lg" />
            <span className="text-sm text-muted-foreground">Verifying email...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Verification failed
            </CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            <Link href="/">
              <Button className="w-full">Go to dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight">Email verified</CardTitle>
          <CardDescription>
            Your email has been successfully verified. Redirecting to dashboard...
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
