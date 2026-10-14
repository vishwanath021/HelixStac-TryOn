import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredObject = { body: Buffer; contentType: string };

function driver() {
  return (process.env.OBJECT_STORAGE || "local").toLowerCase() === "s3" ? "s3" : "local";
}

function localRoot() {
  return path.join(process.cwd(), "var", "objects");
}

function localPath(key: string) {
  const clean = key.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!clean || clean.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("Object key is not allowed");
  }
  const full = path.resolve(localRoot(), clean);
  const root = path.resolve(localRoot());
  if (!full.startsWith(root + path.sep) && full !== root) throw new Error("Object key is not allowed");
  return full;
}

function secret() {
  const value = process.env.AUTH_SECRET || "";
  if (value.length < 8) throw new Error("AUTH_SECRET is too short to sign an object URL");
  return value;
}

export function signObjectKey(key: string, exp: number) {
  return createHmac("sha256", secret()).update(`${key}.${exp}`).digest("base64url");
}

export function verifyObjectSig(key: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = signObjectKey(key, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** App-hosted share link. The signature expires, and the media route reads local disk or S3. */
export function appMediaUrl(key: string, ttlSeconds = 300) {
  const exp = Date.now() + ttlSeconds * 1000;
  const sig = signObjectKey(key, exp);
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const params = new URLSearchParams({ key, exp: String(exp), sig });
  return `${base}/api/v1/media?${params.toString()}`;
}

export async function signedGetUrl(key: string, ttlSeconds = 300) {
  if (driver() === "s3") {
    const { s3SignedGet } = await import("@/lib/storage/s3");
    return s3SignedGet(key, ttlSeconds);
  }
  const exp = Date.now() + ttlSeconds * 1000;
  const sig = signObjectKey(key, exp);
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const params = new URLSearchParams({ key, exp: String(exp), sig });
  return `${base}/api/v1/media?${params.toString()}`;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (driver() === "s3") {
    const { s3Put } = await import("@/lib/storage/s3");
    await s3Put(key, body, contentType);
    return;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getObject(key: string): Promise<Buffer | null> {
  if (driver() === "s3") {
    const { s3Get } = await import("@/lib/storage/s3");
    return s3Get(key);
  }
  try {
    return await readFile(localPath(key));
  } catch {
    return null;
  }
}

export async function deleteObject(key: string) {
  if (!key) return;
  if (driver() === "s3") {
    const { s3Delete } = await import("@/lib/storage/s3");
    await s3Delete(key);
    return;
  }
  await rm(localPath(key), { force: true }).catch(() => undefined);
}

/** Read a generation or benchmark object. Absolute disk paths from older rows still resolve. */
export async function readStored(imagePath: string): Promise<Buffer | null> {
  if (!imagePath) return null;
  if (path.isAbsolute(imagePath) || imagePath.includes("generation-jobs") || imagePath.includes("benchmarks")) {
    try {
      return await readFile(imagePath);
    } catch {
      return getObject(imagePath);
    }
  }
  return getObject(imagePath);
}
