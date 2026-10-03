import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

let cache: { secret: string; key: Buffer } | null = null;

function keyMaterial() {
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 8) throw new Error("AUTH_SECRET is too short to store an AI key");
  if (cache?.secret === secret) return cache.key;
  const key = scryptSync(secret, "helix-ai-key", 32);
  cache = { secret, key };
  return key;
}

/** AES-256-GCM. The return value is ciphertext only. Callers must not log it. */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(payload: string) {
  const buf = Buffer.from(payload, "base64url");
  if (buf.length < 29) throw new Error("AI key payload is unreadable");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Last four characters only. Safe to show in the admin form. */
export function keyHint(plain: string) {
  const tail = plain.trim().slice(-4);
  return `••••${tail}`;
}
