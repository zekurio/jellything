import { env } from "@/lib/env";
import { Jellyfin } from "@jellyfin/sdk";
import { version } from "@/package.json";

export const JELLYFIN_URL = env.JELLYFIN_URL;

export const jellyfin = new Jellyfin({
  clientInfo: {
    name: "Jellything",
    version,
  },
  deviceInfo: {
    name: "Jellything Server",
    id: "jellything-server",
  },
});

export function createApiWithToken(token: string) {
  return jellyfin.createApi(env.JELLYFIN_URL, token);
}

export function createAdminApi() {
  return jellyfin.createApi(env.JELLYFIN_URL, env.JELLYFIN_API_KEY);
}
