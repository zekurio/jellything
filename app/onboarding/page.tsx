"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { validateSetupKey, initializeConfig } from "@/app/actions/config";
import { toast } from "sonner";

type Step = "key" | "config";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("key");
  const [setupKey, setSetupKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  // Config form state
  const [internalUrl, setInternalUrl] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsValidating(true);

    try {
      const result = await validateSetupKey(setupKey);
      if (result.success && result.data) {
        setStep("config");
      } else {
        toast.error(
          "Invalid setup key. Check the console output for the correct key.",
        );
      }
    } catch {
      toast.error("Failed to validate setup key");
    } finally {
      setIsValidating(false);
    }
  }

  async function handleConfigSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const result = await initializeConfig({
        setupKey,
        internalUrl,
        externalUrl: externalUrl || undefined,
        apiKey,
      });

      if (result.success) {
        toast.success("Configuration saved successfully!");
        router.push("/login");
      } else {
        toast.error(result.error ?? "Failed to save configuration");
      }
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Jellything Setup</CardTitle>
          <CardDescription>
            {step === "key"
              ? "Enter the setup key from the console to continue"
              : "Configure your Jellyfin connection"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "key" ? (
            <form onSubmit={handleKeySubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="setupKey">Setup Key</Label>
                <Input
                  id="setupKey"
                  type="text"
                  placeholder="Enter setup key from console"
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                  required
                  className="font-mono"
                />
                <p className="text-muted-foreground text-sm">
                  Check the server console output for the setup key.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isValidating || !setupKey}
              >
                {isValidating ? "Validating..." : "Continue"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleConfigSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="internalUrl">Internal URL</Label>
                <Input
                  id="internalUrl"
                  type="url"
                  placeholder="http://jellyfin:8096"
                  value={internalUrl}
                  onChange={(e) => setInternalUrl(e.target.value)}
                  required
                />
                <p className="text-muted-foreground text-sm">
                  URL for server-to-server communication (e.g., Docker network).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="externalUrl">External URL (optional)</Label>
                <Input
                  id="externalUrl"
                  type="url"
                  placeholder="https://jellyfin.example.com"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                />
                <p className="text-muted-foreground text-sm">
                  Public URL for browser access to assets (avatars, etc.). Falls
                  back to internal URL if not set.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Your Jellyfin API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                />
                <p className="text-muted-foreground text-sm">
                  Create an API key in Jellyfin Dashboard → API Keys.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("key")}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSaving || !internalUrl || !apiKey}
                >
                  {isSaving ? "Saving..." : "Complete Setup"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
