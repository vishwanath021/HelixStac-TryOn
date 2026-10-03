import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomInt, createHash } from "node:crypto";

export type PreviewTier = "anon" | "member" | "salon";

export const AI_PREVIEW_KINDS = ["STYLE", "BROWS", "BEARD", "NAILS"] as const;

export function capForTier(tier: PreviewTier, anonDailyCap: number, memberDailyCap: number) {
  if (tier === "salon") return null;
  if (tier === "member") return Math.max(0, memberDailyCap);
  return Math.max(0, anonDailyCap);
}

export function actorKeyFor(tier: PreviewTier, ipHash: string, customerId?: string | null) {
  if (tier === "member" && customerId) return `member:${customerId}`;
  if (tier === "salon") return `salon:${ipHash}`;
  return `anon:${ipHash}`;
}

export function hashIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

function secret() {
  return process.env.AUTH_SECRET || "dev-only-secret";
}

export function signSalonToken(tenantId: string, nonce: string, days = 30) {
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  const body = `${tenantId}.${nonce}.${exp}`;
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}

export function verifySalonToken(token: string, tenantId: string, nonce: string) {
  if (!token || !nonce) return false;
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split(".");
    if (parts.length !== 4) return false;
    const [id, tokenNonce, exp, sig] = parts;
    const body = `${id}.${tokenNonce}.${exp}`;
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    if (id !== tenantId || tokenNonce !== nonce) return false;
    return Number(exp) > Date.now();
  } catch {
    return false;
  }
}

export function newSalonNonce() {
  return randomBytes(9).toString("base64url");
}

export function signGuestToken(customerId: string, tenantId: string) {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ customerId, tenantId, exp })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readGuestToken(token: string | undefined | null) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { customerId: string; tenantId: string; exp: number };
    if (!parsed.customerId || !parsed.tenantId || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hashOtp(tenantId: string, phone: string, code: string) {
  return scryptSync(code, `${tenantId}:${phone}`, 16).toString("hex");
}

export function otpMatches(tenantId: string, phone: string, code: string, codeHash: string) {
  const next = Buffer.from(hashOtp(tenantId, phone, code));
  const prev = Buffer.from(codeHash);
  return next.length === prev.length && timingSafeEqual(next, prev);
}

export function newOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function ageYears(iso: string, now = new Date()) {
  const dob = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

export function normalizePhone(input: string) {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 16) return digits;
  return "";
}
