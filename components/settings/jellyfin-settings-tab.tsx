"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/shared/password-input";
import { getJellyfinConfig, updateJellyfinConfig } from "@/app/actions/config";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

interface JellyfinConfigData {
	internalUrl: string;
	externalUrl: string | undefined;
	apiKeySet: boolean;
}

export function JellyfinSettingsTab() {
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [config, setConfig] = useState<JellyfinConfigData | null>(null);

	// Form state
	const [internalUrl, setInternalUrl] = useState("");
	const [externalUrl, setExternalUrl] = useState("");
	const [apiKey, setApiKey] = useState("");

	useEffect(() => {
		async function loadConfig() {
			const result = await getJellyfinConfig();
			if (result.success && result.data) {
				setConfig(result.data);
				setInternalUrl(result.data.internalUrl);
				setExternalUrl(result.data.externalUrl ?? "");
			}
			setIsLoading(false);
		}
		loadConfig();
	}, []);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSaving(true);

		try {
			const updates: {
				internalUrl?: string;
				externalUrl?: string;
				apiKey?: string;
			} = {};

			if (internalUrl !== config?.internalUrl) {
				updates.internalUrl = internalUrl;
			}
			if (externalUrl !== (config?.externalUrl ?? "")) {
				updates.externalUrl = externalUrl || undefined;
			}
			if (apiKey) {
				updates.apiKey = apiKey;
			}

			if (Object.keys(updates).length === 0) {
				toast.info("No changes to save");
				setIsSaving(false);
				return;
			}

			const result = await updateJellyfinConfig(updates);
			if (result.success) {
				toast.success("Jellyfin settings saved");
				setApiKey("");
				// Reload config to get fresh state
				const reloadResult = await getJellyfinConfig();
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
				<CardTitle>Jellyfin Connection</CardTitle>
				<CardDescription>Configure how Jellything connects to your Jellyfin server.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
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
							Public URL for browser access to assets (avatars, etc.). Falls back to internal URL if not
							set.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="apiKey">API Key</Label>
						<PasswordInput
							id="apiKey"
							placeholder={config?.apiKeySet ? "••••••••••••••••" : "Enter API key"}
							value={apiKey}
							onChange={setApiKey}
						/>
						<p className="text-muted-foreground text-sm">
							{config?.apiKeySet
								? "Leave blank to keep current key. Enter a new key to update."
								: "Create an API key in Jellyfin Dashboard → API Keys."}
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
