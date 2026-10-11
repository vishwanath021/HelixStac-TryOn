import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding. Used for authenticator secrets. */
export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string) {
  const clean = input.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226), HMAC-SHA1, 6 digits. */
export function hotp(secret: Buffer, counter: number, digits = 6) {
  const buf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  buf.writeUInt32BE(high, 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** TOTP (RFC 6238), 30-second step. `at` is unix milliseconds. */
export function totp(secret: Buffer, at = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(at / 1000 / step);
  return hotp(secret, counter, digits);
}

export function verifyTotp(secret: Buffer, code: string, at = Date.now(), window = 1) {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(at / 1000 / 30);
  const given = Buffer.from(clean);
  for (let delta = -window; delta <= window; delta += 1) {
    const expected = Buffer.from(hotp(secret, counter + delta));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}

export function newTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function recoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString("hex");
    return raw.match(/.{4}/g)?.join("-") || raw;
  });
}

export function hashRecovery(code: string) {
  return createHash("sha256").update(code.replace(/-/g, "").trim().toLowerCase()).digest("hex");
}

export function otpauthUrl(email: string, secret: string) {
  const label = encodeURIComponent(`Lookuvi:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Lookuvi&algorithm=SHA1&digits=6&period=30`;
}
