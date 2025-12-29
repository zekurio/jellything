/**
 * Invite code generator using cryptographically secure random values.
 * Uses an alphabet without ambiguous characters (0, 1, I, O, l) for clarity.
 */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

/**
 * Generate a random invite code.
 * Example output: "K7X3PMVN"
 */
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
