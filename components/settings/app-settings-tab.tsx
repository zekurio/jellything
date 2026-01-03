"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAppConfig, updateAppConfig } from "@/app/actions/config";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

interface AppConfigData {
	title: string;
	description: string;
}

export function AppSettingsTab() {
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [config, setConfig] = useState<AppConfigData | null>(null);

	// Form state
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");

	useEffect(() => {
		async function loadConfig() {
			const result = await getAppConfig();
			if (result.success && result.data) {
				setConfig(result.data);
				setTitle(result.data.title);
				setDescription(result.data.description);
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
				title?: string;
				description?: string;
			} = {};

			if (title !== config?.title) {
				updates.title = title;
			}
			if (description !== config?.description) {
				updates.description = description;
			}

			if (Object.keys(updates).length === 0) {
				toast.info("No changes to save");
				setIsSaving(false);
				return;
			}

			const result = await updateAppConfig(updates);
			if (result.success) {
				toast.success("App settings saved. Refresh the page to see title changes.");
				// Reload config
				const reloadResult = await getAppConfig();
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
				<CardTitle>Application Settings</CardTitle>
				<CardDescription>Configure the app name and description.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="title">App Title</Label>
						<Input
							id="title"
							type="text"
							placeholder="Jellything"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							required
						/>
						<p className="text-muted-foreground text-sm">
							The name displayed in the browser tab and throughout the app.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Input
							id="description"
							type="text"
							placeholder="User management and invitation system for Jellyfin"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
						<p className="text-muted-foreground text-sm">
							Used in page metadata for search engines.
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
