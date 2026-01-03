"use server";

import { z } from "zod";
import { configManager, type JellyfinConfig, type AppConfig, type EmailConfig } from "@/lib/config";
import { success, error, type ActionResult } from "@/app/actions/types";
import { requireAdmin } from "@/lib/auth";
import { resetEmailClient } from "@/server/email";

// ============================================================================
// Setup Key Validation
// ============================================================================

/**
 * Validate a setup key for onboarding access.
 */
export async function validateSetupKey(key: string): Promise<ActionResult<boolean>> {
	try {
		const isValid = configManager.validateSetupKey(key);
		return success(isValid);
	} catch (e) {
		return error(e instanceof Error ? e.message : "Failed to validate setup key");
	}
}

// ============================================================================
// Onboarding - Initialize Config
// ============================================================================

const initializeConfigSchema = z.object({
	setupKey: z.string().min(1, "Setup key is required"),
	internalUrl: z.url(),
	externalUrl: z.url().optional(),
	apiKey: z.string().min(1, "API key is required"),
});

/**
 * Initialize config during onboarding.
 * Only works if no config exists yet and requires valid setup key.
 */
export async function initializeConfig(
	data: z.infer<typeof initializeConfigSchema>,
): Promise<ActionResult<void>> {
	try {
		if (configManager.isConfigured()) {
			return error("Config already exists");
		}

		const validated = initializeConfigSchema.parse(data);

		// Validate setup key server-side
		if (!configManager.validateSetupKey(validated.setupKey)) {
			return error("Invalid setup key");
		}

		const jellyfinConfig: JellyfinConfig = {
			internalUrl: validated.internalUrl,
			externalUrl: validated.externalUrl,
			apiKey: validated.apiKey,
		};

		await configManager.initialize(jellyfinConfig);
		return success(undefined);
	} catch (e) {
		if (e instanceof z.ZodError) {
			return error(e.issues[0]?.message ?? "Validation error");
		}
		return error(e instanceof Error ? e.message : "Failed to initialize config");
	}
}

// ============================================================================
// Config State Checks
// ============================================================================

/**
 * Get the current config status.
 */
export async function getConfigStatus(): Promise<
	ActionResult<{
		configured: boolean;
		needsOnboarding: boolean;
		hasError: boolean;
		error: string | null;
	}>
> {
	return success({
		configured: configManager.isConfigured(),
		needsOnboarding: configManager.needsOnboarding(),
		hasError: configManager.hasError(),
		error: configManager.getError(),
	});
}

// ============================================================================
// Config Updates (for settings page)
// ============================================================================

const updateJellyfinSchema = z.object({
	internalUrl: z.url().optional(),
	externalUrl: z.url().optional(),
	apiKey: z.string().min(1).optional(),
});

/**
 * Update Jellyfin settings.
 * Requires admin access.
 */
export async function updateJellyfinConfig(
	data: z.infer<typeof updateJellyfinSchema>,
): Promise<ActionResult<void>> {
	try {
		await requireAdmin();

		if (!configManager.isConfigured()) {
			return error("Config not initialized");
		}

		const validated = updateJellyfinSchema.parse(data);

		// Filter out undefined values
		const updates: Partial<JellyfinConfig> = {};
		if (validated.internalUrl !== undefined) updates.internalUrl = validated.internalUrl;
		if (validated.externalUrl !== undefined) updates.externalUrl = validated.externalUrl;
		if (validated.apiKey !== undefined) updates.apiKey = validated.apiKey;

		await configManager.setJellyfin(updates);
		return success(undefined);
	} catch (e) {
		if (e instanceof z.ZodError) {
			return error(e.issues[0]?.message ?? "Validation error");
		}
		return error(e instanceof Error ? e.message : "Failed to update Jellyfin config");
	}
}

const updateAppSchema = z.object({
	title: z.string().min(1).optional(),
	description: z.string().optional(),
});

/**
 * Update app settings.
 * Requires admin access.
 */
export async function updateAppConfig(
	data: z.infer<typeof updateAppSchema>,
): Promise<ActionResult<void>> {
	try {
		await requireAdmin();

		if (!configManager.isConfigured()) {
			return error("Config not initialized");
		}

		const validated = updateAppSchema.parse(data);

		const updates: Partial<AppConfig> = {};
		if (validated.title !== undefined) updates.title = validated.title;
		if (validated.description !== undefined) updates.description = validated.description;

		await configManager.setApp(updates);
		return success(undefined);
	} catch (e) {
		if (e instanceof z.ZodError) {
			return error(e.issues[0]?.message ?? "Validation error");
		}
		return error(e instanceof Error ? e.message : "Failed to update app config");
	}
}

const updateEmailSchema = z
	.object({
		from: z.string().min(1),
		resendApiKey: z.string().optional(),
	})
	.optional();

/**
 * Update email settings.
 * Requires admin access.
 */
export async function updateEmailConfig(
	data: z.infer<typeof updateEmailSchema>,
): Promise<ActionResult<void>> {
	try {
		await requireAdmin();

		if (!configManager.isConfigured()) {
			return error("Config not initialized");
		}

		const validated = updateEmailSchema.parse(data);
		await configManager.setEmail(validated as EmailConfig | undefined);
		// Reset the email client cache so it picks up the new API key
		resetEmailClient();
		return success(undefined);
	} catch (e) {
		if (e instanceof z.ZodError) {
			return error(e.issues[0]?.message ?? "Validation error");
		}
		return error(e instanceof Error ? e.message : "Failed to update email config");
	}
}

// ============================================================================
// Config Getters (for settings page)
// ============================================================================

/**
 * Get current Jellyfin config (masks API key).
 * Requires admin access.
 */
export async function getJellyfinConfig(): Promise<
	ActionResult<{
		internalUrl: string;
		externalUrl: string | undefined;
		apiKeySet: boolean;
	}>
> {
	try {
		await requireAdmin();

		if (!configManager.isConfigured()) {
			return error("Config not initialized");
		}

		const config = configManager.jellyfin;
		return success({
			internalUrl: config.internalUrl,
			externalUrl: config.externalUrl,
			apiKeySet: Boolean(config.apiKey),
		});
	} catch (e) {
		return error(e instanceof Error ? e.message : "Failed to get Jellyfin config");
	}
}

/**
 * Get current app config.
 * Requires admin access.
 */
export async function getAppConfig(): Promise<ActionResult<AppConfig>> {
	try {
		await requireAdmin();

		if (!configManager.isConfigured()) {
			return error("Config not initialized");
		}

		return success(configManager.app);
	} catch (e) {
		return error(e instanceof Error ? e.message : "Failed to get app config");
	}
}

/**
 * Get current email config (masks API key).
 * Requires admin access.
 */
export async function getEmailConfig(): Promise<
	ActionResult<{
		from: string | undefined;
		resendApiKeySet: boolean;
	}>
> {
	try {
		await requireAdmin();

		if (!configManager.isConfigured()) {
			return error("Config not initialized");
		}

		const config = configManager.email;
		return success({
			from: config?.from,
			resendApiKeySet: Boolean(config?.resendApiKey),
		});
	} catch (e) {
		return error(e instanceof Error ? e.message : "Failed to get email config");
	}
}
