import { z } from "zod"

import { createChildLogger } from "@/server/logger"
import {
  SeerrApiError,
  seerrRequest,
  seerrRequestDecoded,
} from "@/server/seerr/client"
import {
  SeerrUserSchema,
  SeerrUserSearchResponseSchema,
  type SeerrUser,
  type SeerrUserResults,
} from "@/server/seerr/schemas"

const log = createChildLogger({ module: "seerr-users" })

type SeerrUserSearchResponse = ReadonlyArray<SeerrUser> | SeerrUserResults

export type SeerrUserLookupCache = {
  lookups: Map<string, Promise<SeerrUser | null>>
}

export function createSeerrUserLookupCache(): SeerrUserLookupCache {
  return {
    lookups: new Map(),
  }
}

function normalizeUserSearchResponse(
  response: SeerrUserSearchResponse,
): Required<Pick<SeerrUserResults, "results">> &
  Pick<SeerrUserResults, "pageInfo"> {
  if (Array.isArray(response)) {
    return {
      results: response,
    }
  }

  const objectResponse = response as SeerrUserResults

  return {
    results: objectResponse.results ?? [],
    pageInfo: objectResponse.pageInfo,
  }
}

export async function importSeerrUserFromJellyfin(
  jellyfinUserId: string,
): Promise<SeerrUser | null> {
  const result = await seerrRequestDecoded(
    "/user/import-from-jellyfin",
    z.array(SeerrUserSchema),
    {
      method: "POST",
      body: { jellyfinUserIds: [jellyfinUserId] },
    },
  )

  return result[0] ?? null
}

export async function findSeerrUserByJellyfinId(
  jellyfinUserId: string,
  query: string,
): Promise<SeerrUser | null> {
  const take = 50
  let skip = 0
  const maxPages = 200

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const response = await seerrRequestDecoded(
      "/user",
      SeerrUserSearchResponseSchema,
      {
        query: {
          take,
          skip,
          q: query,
        },
      },
    )

    if (Array.isArray(response)) {
      return (
        response.find((user) => user.jellyfinUserId === jellyfinUserId) ?? null
      )
    }

    const result = normalizeUserSearchResponse(response)

    const match = result.results.find(
      (user) => user.jellyfinUserId === jellyfinUserId,
    )
    if (match) {
      return match
    }

    const totalResults = result.pageInfo?.results
    if (
      typeof totalResults === "number" &&
      totalResults <= skip + result.results.length
    ) {
      return null
    }

    if (result.results.length < take) {
      return null
    }

    skip += take
  }

  log.warn(
    { jellyfinUserId, query, skip, maxPages },
    "Stopped Seerr user search after max pages",
  )
  return null
}

export async function findSeerrUserByEmail(
  email: string,
): Promise<SeerrUser | null> {
  const normalizedEmail = email.toLowerCase()
  const take = 50
  let skip = 0
  const maxPages = 200

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const response = await seerrRequestDecoded(
      "/user",
      SeerrUserSearchResponseSchema,
      {
        query: {
          take,
          skip,
          q: email,
        },
      },
    )

    if (Array.isArray(response)) {
      return (
        response.find(
          (user) => user.email?.toLowerCase() === normalizedEmail,
        ) ?? null
      )
    }

    const result = normalizeUserSearchResponse(response)

    const match =
      result.results.find(
        (user) => user.email?.toLowerCase() === normalizedEmail,
      ) ?? null
    if (match) {
      return match
    }

    const totalResults = result.pageInfo?.results
    if (
      typeof totalResults === "number" &&
      totalResults <= skip + result.results.length
    ) {
      return null
    }

    if (result.results.length < take) {
      return null
    }

    skip += take
  }

  log.warn(
    { email, skip, maxPages },
    "Stopped Seerr email search after max pages",
  )
  return null
}

export async function getAllSeerrUsers(): Promise<SeerrUser[]> {
  const take = 50
  let skip = 0
  const allUsers: SeerrUser[] = []
  const maxPages = 200

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const response = await seerrRequestDecoded(
      "/user",
      SeerrUserSearchResponseSchema,
      {
        query: { take, skip },
      },
    )

    if (Array.isArray(response)) {
      allUsers.push(...response)
      break
    }

    const result = normalizeUserSearchResponse(response)
    allUsers.push(...result.results)

    const totalResults = result.pageInfo?.results
    if (
      typeof totalResults === "number" &&
      totalResults <= skip + result.results.length
    ) {
      break
    }

    if (result.results.length < take) {
      break
    }

    skip += take
  }

  return allUsers
}

export interface ResolveSeerrUserInput {
  jellyfinUserId: string
  userName?: string | null
  email?: string | null
  attemptImport?: boolean
  lookupCache?: SeerrUserLookupCache
}

export async function resolveSeerrUser({
  jellyfinUserId,
  userName,
  email,
  attemptImport = true,
  lookupCache,
}: ResolveSeerrUserInput): Promise<SeerrUser | null> {
  if (attemptImport) {
    try {
      const imported = await lookupSeerrUser(
        lookupCache,
        jellyfinUserCacheKey(jellyfinUserId),
        () => importSeerrUserFromJellyfin(jellyfinUserId),
      )
      if (imported) {
        cacheSeerrUser(lookupCache, imported)
        return imported
      }
    } catch (err) {
      if (err instanceof SeerrApiError) {
        log.warn(
          {
            jellyfinUserId,
            userName,
            email,
            statusCode: err.statusCode,
            responseBody: err.responseBody,
          },
          "Failed to import Seerr user from Jellyfin; falling back to lookup",
        )
      } else {
        throw err
      }
    }
  }

  const lookupQueries = [userName, jellyfinUserId].filter(
    (value, index, values): value is string =>
      typeof value === "string" &&
      value.length > 0 &&
      values.indexOf(value) === index,
  )

  for (const query of lookupQueries) {
    const existingByJellyfinId = await lookupSeerrUser(
      lookupCache,
      jellyfinQueryCacheKey(jellyfinUserId, query),
      () => findSeerrUserByJellyfinId(jellyfinUserId, query),
    )
    if (existingByJellyfinId) {
      cacheSeerrUser(lookupCache, existingByJellyfinId)
      return existingByJellyfinId
    }
  }

  if (email) {
    const existingByEmail = await lookupSeerrUser(
      lookupCache,
      emailCacheKey(email),
      () => findSeerrUserByEmail(email),
    )
    cacheSeerrUser(lookupCache, existingByEmail)
    return existingByEmail
  }

  return null
}

function lookupSeerrUser(
  lookupCache: SeerrUserLookupCache | undefined,
  key: string,
  lookup: () => Promise<SeerrUser | null>,
): Promise<SeerrUser | null> {
  if (!lookupCache) {
    return lookup()
  }

  const existing = lookupCache.lookups.get(key)
  if (existing) {
    return existing
  }

  const next = lookup()
  lookupCache.lookups.set(key, next)
  return next
}

function cacheSeerrUser(
  lookupCache: SeerrUserLookupCache | undefined,
  seerrUser: SeerrUser | null,
): void {
  if (!lookupCache || !seerrUser) {
    return
  }

  if (seerrUser.jellyfinUserId) {
    lookupCache.lookups.set(
      jellyfinUserCacheKey(seerrUser.jellyfinUserId),
      Promise.resolve(seerrUser),
    )
  }

  if (seerrUser.email) {
    lookupCache.lookups.set(
      emailCacheKey(seerrUser.email),
      Promise.resolve(seerrUser),
    )
  }
}

function jellyfinUserCacheKey(jellyfinUserId: string): string {
  return `jellyfin-user:${jellyfinUserId}`
}

function jellyfinQueryCacheKey(jellyfinUserId: string, query: string): string {
  return `jellyfin-user:${jellyfinUserId}:query:${query}`
}

function emailCacheKey(email: string): string {
  return `email:${email.toLowerCase()}`
}

export async function setSeerrUserPermissions(
  userId: number,
  permissions: number,
): Promise<void> {
  await seerrRequest("/user", {
    method: "PUT",
    body: {
      ids: [userId],
      permissions,
    },
  })
}

export interface SeerrQuotaSettings {
  movieQuotaLimit?: number
  movieQuotaDays?: number
  tvQuotaLimit?: number
  tvQuotaDays?: number
}

function normalizeQuotaValue(value: number | undefined): number | null {
  if (typeof value !== "number" || value < 0) {
    return null
  }

  return value
}

export async function setSeerrUserQuotas(
  userId: number,
  quotas: SeerrQuotaSettings,
): Promise<void> {
  await seerrRequest(`/user/${userId}/settings/main`, {
    method: "POST",
    body: {
      movieQuotaLimit: normalizeQuotaValue(quotas.movieQuotaLimit),
      movieQuotaDays: normalizeQuotaValue(quotas.movieQuotaDays),
      tvQuotaLimit: normalizeQuotaValue(quotas.tvQuotaLimit),
      tvQuotaDays: normalizeQuotaValue(quotas.tvQuotaDays),
    },
  })
}

export async function deleteSeerrUser(userId: number): Promise<void> {
  try {
    await seerrRequest(`/user/${userId}`, {
      method: "DELETE",
    })
  } catch (err) {
    if (err instanceof SeerrApiError && err.statusCode === 404) {
      log.info({ userId }, "Seerr user was already deleted")
      return
    }
    throw err
  }
}
