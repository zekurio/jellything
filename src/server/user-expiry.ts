export function getEffectiveUserExpiry(
  user: { expiresAt: Date | null },
  isAdmin: boolean,
): Date | null {
  return isAdmin ? null : user.expiresAt
}

export function isUserExpired(
  user: { expiresAt: Date | null },
  isAdmin: boolean,
  now = new Date(),
): boolean {
  const expiresAt = getEffectiveUserExpiry(user, isAdmin)
  return expiresAt !== null && expiresAt.getTime() <= now.getTime()
}
