import { z } from "zod";

// Config schema with Zod validation
const configSchema = z.object({
	app: z
		.object({
			title: z.string().default("Jellything"),
			description: z.string().default("User management and invitation system for Jellyfin"),
		})
		.default({
			title: "Jellything",
			description: "User management and invitation system for Jellyfin",
		}),
	jellyfin: z.object({
		internalUrl: z.url(),
		externalUrl: z.url().optional(),
		apiKey: z.string().min(1),
	}),
	email: z
		.object({
			from: z.string().default("Jellything <noreply@example.com>"),
			resendApiKey: z.string().optional(),
		})
		.optional(),
});

export type Config = z.infer<typeof configSchema>;
export type JellyfinConfig = Config["jellyfin"];
export type AppConfig = Config["app"];
export type EmailConfig = NonNullable<Config["email"]>;

/**
 * Configuration manager singleton.
 * Handles loading, validating, and persisting application configuration.
 */
class ConfigManager {
	private config: Config | null = null;
	private configPath: string;
	private setupKey: string | null = null;
	private error: string | null = null;
	private loaded = false;

	constructor() {
		this.configPath = process.env.CONFIG_PATH ?? "./config.json";
	}

	/**
	 * Load configuration from disk.
	 * Must be called before accessing config in server context.
	 */
	load(): void {
		if (this.loaded) return;
		this.loaded = true;

		// Use fs.existsSync for reliable file existence check
		const fs = require("fs");
		if (!fs.existsSync(this.configPath)) {
			// No config file = needs onboarding
			this.generateSetupKey();
			return;
		}

		try {
			// Use synchronous read for startup
			const raw = fs.readFileSync(this.configPath, "utf-8");
			const parsed = JSON.parse(raw);
			this.config = configSchema.parse(parsed);
		} catch (e) {
			if (e instanceof z.ZodError) {
				this.error = `Config validation error: ${e.issues.map((err: z.ZodIssue) => `${err.path.join(".")}: ${err.message}`).join(", ")}`;
			} else if (e instanceof SyntaxError) {
				this.error = `Config JSON parse error: ${e.message}`;
			} else {
				this.error = e instanceof Error ? e.message : "Unknown config error";
			}
		}
	}

	/**
	 * Generate a new setup key for onboarding.
	 */
	private generateSetupKey(): void {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		this.setupKey = Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		console.log(`\n[jellything] Setup key: ${this.setupKey}\n`);
	}

	/**
	 * Save current config to disk.
	 */
	private async save(): Promise<void> {
		if (!this.config) {
			throw new Error("Cannot save: no config loaded");
		}
		await Bun.write(this.configPath, JSON.stringify(this.config, null, "\t"));
	}

	// =========================================================================
	// State checks
	// =========================================================================

	/**
	 * Check if config is loaded and valid.
	 */
	isConfigured(): boolean {
		this.load();
		return this.config !== null;
	}

	/**
	 * Check if there was an error loading config.
	 */
	hasError(): boolean {
		this.load();
		return this.error !== null;
	}

	/**
	 * Get the error message if config loading failed.
	 */
	getError(): string | null {
		this.load();
		return this.error;
	}

	/**
	 * Check if onboarding is needed (no config and no error).
	 */
	needsOnboarding(): boolean {
		this.load();
		return !this.config && !this.error;
	}

	// =========================================================================
	// Setup key management
	// =========================================================================

	/**
	 * Validate a setup key for onboarding access.
	 */
	validateSetupKey(key: string): boolean {
		return this.setupKey !== null && key === this.setupKey;
	}

	/**
	 * Clear the setup key after successful onboarding.
	 */
	private clearSetupKey(): void {
		this.setupKey = null;
	}

	// =========================================================================
	// Getters
	// =========================================================================

	/**
	 * Get the full config object.
	 * Throws if not configured.
	 */
	get(): Config {
		this.load();
		if (!this.config) {
			throw new Error("Config not loaded. Run onboarding first.");
		}
		return this.config;
	}

	/**
	 * Get Jellyfin configuration.
	 */
	get jellyfin(): JellyfinConfig {
		return this.get().jellyfin;
	}

	/**
	 * Get app configuration.
	 */
	get app(): AppConfig {
		return this.get().app;
	}

	/**
	 * Get email configuration (may be undefined).
	 */
	get email(): EmailConfig | undefined {
		return this.get().email;
	}

	/**
	 * Get the external Jellyfin URL, falling back to internal if not set.
	 */
	get jellyfinExternalUrl(): string {
		return this.jellyfin.externalUrl ?? this.jellyfin.internalUrl;
	}

	/**
	 * Get the internal Jellyfin URL.
	 */
	get jellyfinInternalUrl(): string {
		return this.jellyfin.internalUrl;
	}

	// =========================================================================
	// Setters (update in-memory + persist)
	// =========================================================================

	/**
	 * Initialize config during onboarding.
	 * Creates a new config file with the provided values.
	 */
	async initialize(jellyfinConfig: JellyfinConfig): Promise<void> {
		const newConfig: Config = {
			app: {
				title: "Jellything",
				description: "User management and invitation system for Jellyfin",
			},
			jellyfin: jellyfinConfig,
		};

		this.config = configSchema.parse(newConfig);
		await this.save();
		this.clearSetupKey();
		this.error = null;
		// Mark as loaded so subsequent calls see the new config
		this.loaded = true;
	}

	/**
	 * Update Jellyfin settings.
	 */
	async setJellyfin(values: Partial<JellyfinConfig>): Promise<void> {
		const current = this.get();
		this.config = {
			...current,
			jellyfin: { ...current.jellyfin, ...values },
		};
		await this.save();
	}

	/**
	 * Update app settings.
	 */
	async setApp(values: Partial<AppConfig>): Promise<void> {
		const current = this.get();
		this.config = {
			...current,
			app: { ...current.app, ...values },
		};
		await this.save();
	}

	/**
	 * Update email settings.
	 */
	async setEmail(values: EmailConfig | undefined): Promise<void> {
		const current = this.get();
		this.config = {
			...current,
			email: values,
		};
		await this.save();
	}
}

// Export singleton instance
export const configManager = new ConfigManager();
