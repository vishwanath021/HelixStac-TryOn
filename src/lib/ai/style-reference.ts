import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const STYLE_ID = /^[a-z0-9-]{1,80}$/;

export type ThumbFolder = "styles" | "brows" | "beards" | "nails";

export function thumbnailFolder(kind?: string): ThumbFolder {
  if (kind === "brows") return "brows";
  if (kind === "beard") return "beards";
  if (kind === "nails") return "nails";
  return "styles";
}

export function sendStyleReference(provider: "openai" | "gemini") {
  const name = provider === "openai" ? "OPENAI_SEND_STYLE_REFERENCE" : "GEMINI_SEND_STYLE_REFERENCE";
  const raw = (process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function readStyleThumbnail(styleId: string, folder: ThumbFolder = "styles") {
  if (!STYLE_ID.test(styleId)) return null;
  if (folder !== "styles" && folder !== "brows" && folder !== "beards" && folder !== "nails") return null;
  const file = path.join(process.cwd(), "public", folder, `${styleId}.jpg`);
  if (!existsSync(file)) return null;
  return readFileSync(file);
}

/** Guest photo is the only input image unless the matching env flag is explicitly on. */
export function styleReferenceFor(input: { kind?: string; styleId: string }, provider: "openai" | "gemini") {
  if (!sendStyleReference(provider)) return null;
  return readStyleThumbnail(input.styleId, thumbnailFolder(input.kind));
}

/**
 * Benchmark mode always sends the catalogue JPEG. It does not upscale a 512px file.
 * A larger sibling (`{id}@2x.jpg` or `{id}-large.jpg`) is preferred when one exists.
 */
export function hairstyleReferenceFile(styleId: string, folder: ThumbFolder = "styles") {
  if (!STYLE_ID.test(styleId)) return null;
  const dir = path.join(process.cwd(), "public", folder);
  const candidates = [`${styleId}@2x.jpg`, `${styleId}-large.jpg`, `${styleId}.jpg`];
  for (const name of candidates) {
    const file = path.join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

export function readHairstyleReference(styleId: string, folder: ThumbFolder = "styles") {
  const file = hairstyleReferenceFile(styleId, folder);
  if (!file) return null;
  return readFileSync(file);
}
