import { env } from "@/lib/env";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_KEY = Buffer.from(env.ENCRYPTION_KEY, "hex");
const ALGORITHM = "aes-256-gcm";

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a string in the format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext}`;
}

/**
 * Decrypt a ciphertext string that was encrypted with the encrypt() function.
 * Expects format: iv:authTag:ciphertext (all hex-encoded)
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, "hex", "utf8");
  plaintext += decipher.final("utf8");

  return plaintext;
}
