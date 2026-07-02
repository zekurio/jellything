import {
  ErrorCode,
  error,
  success,
  type ActionResult,
} from "@/lib/api/contracts/errors"
import { getMediaLibraries } from "@/server/jellyfin"
import type { MediaLibrary } from "@/server/jellyfin/admin"

export async function getLibrariesService(): Promise<
  ActionResult<MediaLibrary[]>
> {
  try {
    const libraries = await getMediaLibraries()
    return success(libraries)
  } catch {
    return error(ErrorCode.OPERATION_FAILED, "Failed to get libraries")
  }
}
