"use server";

import { success, type ActionResult } from "@/app/actions/types";
import { getServerInfo as fetchServerInfo } from "@/server/jellyfin";
import type { ServerInfo } from "@/server/jellyfin/admin";

export async function getServerInfo(): Promise<ActionResult<ServerInfo | null>> {
  try {
    const info = await fetchServerInfo();
    return success(info);
  } catch {
    return success(null);
  }
}
