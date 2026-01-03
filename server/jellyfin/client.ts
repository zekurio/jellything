import { configManager } from "@/lib/config";
import { version } from "@/package.json";

// Export URLs from config for external use
export const JELLYFIN_INTERNAL_URL = () => configManager.jellyfinInternalUrl;
export const JELLYFIN_EXTERNAL_URL = () => configManager.jellyfinExternalUrl;

// Client info for Jellyfin authentication headers
const CLIENT_NAME = "Jellything";
const CLIENT_VERSION = version;
const DEVICE_NAME = "Jellything Server";
const DEVICE_ID = "jellything-server";

/**
 * Build the authorization header value for Jellyfin API requests.
 * Format: MediaBrowser Client="...", Device="...", DeviceId="...", Version="...", Token="..."
 */
function buildAuthHeader(token?: string): string {
  const parts = [
    `Client="${CLIENT_NAME}"`,
    `Device="${DEVICE_NAME}"`,
    `DeviceId="${DEVICE_ID}"`,
    `Version="${CLIENT_VERSION}"`,
  ];

  if (token) {
    parts.push(`Token="${token}"`);
  }

  return `MediaBrowser ${parts.join(", ")}`;
}

/**
 * Custom Jellyfin API client using fetch.
 * Replaces the @jellyfin/sdk with a simpler, more flexible implementation.
 */
export class JellyfinClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.token = token;
  }

  /**
   * Get the access token for this client instance.
   */
  get accessToken(): string | undefined {
    return this.token;
  }

  /**
   * Make an authenticated request to the Jellyfin API.
   */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers);

    // Set authorization header (Jellyfin uses X-Emby-Authorization)
    headers.set("X-Emby-Authorization", buildAuthHeader(this.token));

    // Set content-type for JSON bodies
    if (
      options.body &&
      typeof options.body === "string" &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    const startTime = Date.now();

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new JellyfinApiError(
        `Jellyfin API error: ${response.status} ${response.statusText}`,
        response.status,
        errorText,
      );
    }

    // Return empty object for 204 No Content responses
    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get("Content-Type");
    if (contentType?.includes("application/json")) {
      return response.json() as Promise<T>;
    }

    return {} as T;
  }

  /**
   * Make a GET request.
   */
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  /**
   * Make a POST request with JSON body.
   */
  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Make a DELETE request.
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  /**
   * Upload a file (e.g., avatar image).
   */
  async upload(
    endpoint: string,
    data: string,
    contentType: string,
  ): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers();

    headers.set("X-Emby-Authorization", buildAuthHeader(this.token));
    headers.set("Content-Type", contentType);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: data,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new JellyfinApiError(
        `Upload failed: ${response.status} ${response.statusText}`,
        response.status,
        errorText,
      );
    }
  }
}

/**
 * Custom error class for Jellyfin API errors.
 */
export class JellyfinApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "JellyfinApiError";
  }
}

/**
 * Create an API client with a user's access token.
 */
export function createApiWithToken(token: string): JellyfinClient {
  return new JellyfinClient(configManager.jellyfinInternalUrl, token);
}

/**
 * Create an API client with the admin API key.
 */
export function createAdminApi(): JellyfinClient {
  return new JellyfinClient(
    configManager.jellyfinInternalUrl,
    configManager.jellyfin.apiKey,
  );
}

// Jellyfin API response types

export interface JellyfinUserDto {
  Id?: string;
  Name?: string;
  HasPassword?: boolean;
  LastActivityDate?: string;
  Policy?: JellyfinUserPolicy;
}

export interface JellyfinUserPolicy {
  IsAdministrator?: boolean;
  IsDisabled?: boolean;
  EnabledFolders?: string[];
  EnableAllFolders?: boolean;
  RemoteClientBitrateLimit?: number;
  EnableVideoPlaybackTranscoding?: boolean;
  EnableAudioPlaybackTranscoding?: boolean;
  EnablePlaybackRemuxing?: boolean;
  [key: string]: unknown; // Allow other policy fields
}

export interface JellyfinAuthResponse {
  User?: JellyfinUserDto;
  AccessToken?: string;
}

export interface JellyfinSystemInfo {
  ServerName?: string;
  Version?: string;
}

export interface JellyfinMediaFolder {
  Id?: string;
  Name?: string;
  CollectionType?: string;
}

export interface JellyfinMediaFoldersResponse {
  Items?: JellyfinMediaFolder[];
}

export interface JellyfinForgotPasswordResponse {
  Action?: "PinCode" | "ContactAdmin" | "InNetworkRequired";
  PinFile?: string;
  PinExpirationDate?: string;
}

// Companion plugin types

export interface CompanionPasswordResetResponse {
  Username: string;
  Pin: string;
  ExpirationDate: string;
}

export interface CompanionErrorResponse {
  message: string;
}
