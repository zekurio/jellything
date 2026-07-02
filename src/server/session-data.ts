import { and, eq, gt, isNotNull } from "drizzle-orm"

import { isValidLocale } from "@/lib/i18n"
import type { SessionData } from "@/lib/session"
import { db } from "@/server/db.server"
import { emailVerificationTokens, users } from "@/server/db/schema"
import { getUserAvatarUrl } from "@/server/jellyfin"
import { ensureUserRecord } from "@/server/users"

export async function getSessionDataForUser(input: {
  userId: string
  name: string
  isAdmin: boolean
}): Promise<SessionData> {
  let user = await db.query.users.findFirst({
    where: eq(users.userId, input.userId),
  })

  if (!user) {
    user = await ensureUserRecord(input.userId)
  }

  const [pendingVerification] = await db
    .select({
      pendingEmail: emailVerificationTokens.pendingEmail,
    })
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, input.userId),
        gt(emailVerificationTokens.expiresAt, new Date()),
        isNotNull(emailVerificationTokens.pendingEmail),
      ),
    )
    .limit(1)

  const locale = user.locale && isValidLocale(user.locale) ? user.locale : null
  const email = pendingVerification?.pendingEmail ?? user.email
  const emailVerified = pendingVerification ? false : user.emailVerified

  return {
    userId: input.userId,
    name: input.name,
    avatarUrl: getUserAvatarUrl(input.userId),
    isAdmin: input.isAdmin,
    email,
    emailVerified,
    locale,
    createdAt: user.createdAt.toISOString(),
  }
}
