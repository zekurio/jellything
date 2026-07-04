import { success, type ActionResult } from "@/lib/api/contracts/errors"
import { getMediaLibraries } from "@/server/jellyfin"
import type { MediaLibrary } from "@/server/jellyfin/admin"

export async function getLibrariesService(): Promise<
  ActionResult<MediaLibrary[]>
> {
  const libraries = await getMediaLibraries()
  return success(libraries)
}
