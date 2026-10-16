import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ID = /^[a-z0-9-]{1,80}$/;

/** Catalogue photo when one was generated. Otherwise a plain warm plate for the model, never shown as a card. */
export async function bridalReferenceJpeg(id: string) {
  if (!ID.test(id)) {
    return sharp({ create: { width: 64, height: 64, channels: 3, background: "#C4A484" } }).jpeg().toBuffer();
  }
  const folder = path.join(process.cwd(), "public", "bridal");
  const webp = path.join(folder, `${id}.webp`);
  const jpg = path.join(folder, `${id}.jpg`);
  const file = existsSync(webp) ? webp : existsSync(jpg) ? jpg : "";
  if (file) return sharp(readFileSync(file)).jpeg({ quality: 90 }).toBuffer();
  return sharp({ create: { width: 768, height: 1024, channels: 3, background: "#C4A484" } }).jpeg({ quality: 80 }).toBuffer();
}

export function bridalThumbPublicPath(id: string) {
  if (!ID.test(id)) return "";
  const folder = path.join(process.cwd(), "public", "bridal");
  if (existsSync(path.join(folder, `${id}.webp`))) return `/bridal/${id}.webp`;
  if (existsSync(path.join(folder, `${id}.jpg`))) return `/bridal/${id}.jpg`;
  return "";
}
