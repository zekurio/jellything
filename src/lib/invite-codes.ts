export const INVITE_CODE_MIN_LENGTH = 8
export const INVITE_CODE_MAX_LENGTH = 32
export const INVITE_CODE_PATTERN = /^[A-Za-z0-9-]+$/

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase()
}
