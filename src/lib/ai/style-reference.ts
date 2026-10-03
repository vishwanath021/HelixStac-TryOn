import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const STYLE_ID = /^[a-z0-9-]{1,80}$/;

export function sendStyleReference(provider: "openai" | "gemini") {
  const name = provider === "openai" ? "OPENAI_SEND_STYLE_REFERENCE" : "GEMINI_SEND_STYLE_REFERENCE";
  const raw = (process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function readStyleThumbnail(styleId: string) {
  if (!STYLE_ID.test(styleId)) return null;
  const file = path.join(process.cwd(), "public", "styles", `${styleId}.jpg`);
  if (!existsSync(file)) return null;
  return readFileSync(file);
}

/** Guest photo is the only input image unless the matching env flag is explicitly on. */
export function styleReferenceFor(input: { kind?: string; styleId: string }, provider: "openai" | "gemini") {
  if (input.kind && input.kind !== "style") return null;
  if (!sendStyleReference(provider)) return null;
  return readStyleThumbnail(input.styleId);
}
