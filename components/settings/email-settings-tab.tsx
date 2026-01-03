"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/shared/password-input";
import { getEmailConfig, updateEmailConfig } from "@/app/actions/config";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

interface EmailConfigData {
	from: string | undefined;
	resendApiKeySet: boolean;
}

export function EmailSettingsTab() {
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [config, setConfig] = useState<EmailConfigData | null>(null);

	// Form state
	const [from, setFrom] = useState("");
	const [resendApiKey, setResendApiKey] = useState("");

	useEffect(() => {
		async function loadConfig() {
			const result = await getEmailConfig();
			if (result.success && result.data) {
				setConfig(result.data);
				setFrom(result.data.from ?? "");
			}
			setIsLoading(false);
		}
		loadConfig();
	}, []);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSaving(true);

		try {
			// If no from address and no API key, clear email config
			if (!from && !resendApiKey && !config?.resendApiKeySet) {
				const result = await updateEmailConfig(undefined);
				if (result.success) {
					toast.success("Email settings cleared");
					setConfig(null);
				} else {
					toast.error(result.error ?? "Failed to save settings");
				}
				setIsSaving(false);
				return;
			}

			// Build the update
			const updates: { from: string; resendApiKey?: string } = {
				from: from || "Jellything <noreply@example.com>",
			};

			if (resendApiKey) {
				updates.resendApiKey = resendApiKey;
			}

			const result = await updateEmailConfig(updates);
			if (result.success) {
				toast.success("Email settings saved");
				setResendApiKey("");
				// Reload config
				const reloadResult = await getEmailConfig();
				if (reloadResult.success && reloadResult.data) {
					setConfig(reloadResult.data);
				}
			} else {
				toast.error(result.error ?? "Failed to save settings");
			}
		} catch {
			toast.error("Failed to save settings");
		} finally {
			setIsSaving(false);
		}
	}

	if (isLoading) {
		return (
			<Card>
				<CardContent className="flex items-center justify-center py-12">
					<Spinner className="h-8 w-8" />
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Email Settings</CardTitle>
				<CardDescription>
					Configure email notifications. Uses Resend for email delivery.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="from">From Address</Label>
						<Input
							id="from"
							type="text"
							placeholder="Jellything <noreply@example.com>"
							value={from}
							onChange={(e) => setFrom(e.target.value)}
						/>
						<p className="text-muted-foreground text-sm">
							The sender address for outgoing emails.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="resendApiKey">Resend API Key</Label>
						<PasswordInput
							id="resendApiKey"
							placeholder={config?.resendApiKeySet ? "••••••••••••••••" : "Enter Resend API key"}
							value={resendApiKey}
							onChange={setResendApiKey}
						/>
						<p className="text-muted-foreground text-sm">
							{config?.resendApiKeySet
								? "Leave blank to keep current key."
								: "Get an API key from resend.com."}
						</p>
					</div>

					<Button type="submit" disabled={isSaving}>
						{isSaving ? "Saving..." : "Save Changes"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
