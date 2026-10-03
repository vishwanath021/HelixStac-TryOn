import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { registerProviderFrame } from "@/lib/face/register";
import {
  analyzeRegion,
  compositeLocked,
  decodeRgb,
  disallowedChange,
  preflightPhoto,
  TRY_ANOTHER_PHOTO,
  type HairExtent,
  type RegionTool,
} from "@/lib/face/region";
import { SpendCapError, UnknownModelError } from "@/lib/ai/errors";
import type { GenerateOutput } from "@/lib/ai/types";

export const MAX_PROVIDER_ATTEMPTS = 2;

export type LockedEdit =
  | {
      ok: true;
      image: Buffer;
      calls: number;
      output: GenerateOutput;
    }
  | {
      ok: false;
      calls: number;
      reason: "placement" | "provider" | "postcheck" | "face-guard" | "unknown-model" | "spend-cap";
      message: string;
      callId?: string;
      detail?: string;
    };

function changedPixels(original: Buffer, next: Buffer, width: number, height: number) {
  const changed = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 3;
    if (original[o] !== next[o] || original[o + 1] !== next[o + 1] || original[o + 2] !== next[o + 2]) changed[i] = 1;
  }
  return changed;
}

export async function outsideMaskDelta(original: Buffer, next: Buffer, feather: Uint8Array) {
  let delta = 0;
  for (let i = 0; i < feather.length; i += 1) {
    if (feather[i] !== 0) continue;
    const o = i * 3;
    if (original[o] !== next[o] || original[o + 1] !== next[o + 1] || original[o + 2] !== next[o + 2]) delta += 1;
  }
  return delta;
}

/**
 * Placement is checked before `edit` is called. A failed placement check does not call the provider.
 * The provider may be tried once more if it throws. A failed post-check does not try again.
 * Hair and colour compare the provider frame with the original face before compositing.
 * The returned pixels outside the feathered mask match the original photo byte for byte.
 */
export async function runLockedEdit(args: {
  image: Buffer;
  tool: RegionTool;
  edit: (attempt: number) => Promise<GenerateOutput>;
  hairExtent?: HairExtent;
  /** Test hook. Skips the composite so the post-check can fail on purpose. */
  skipLock?: boolean;
}): Promise<LockedEdit> {
  const decoded = await decodeRgb(args.image);
  const report = analyzeRegion(decoded.data, decoded.width, decoded.height, args.tool, { hairExtent: args.hairExtent });
  if (!report.ok) return { ok: false, calls: 0, reason: "placement", message: report.message || TRY_ANOTHER_PHOTO };

  let calls = 0;
  let last: GenerateOutput | null = null;
  while (calls < MAX_PROVIDER_ATTEMPTS) {
    try {
      calls += 1;
      last = await args.edit(calls);
      break;
    } catch (error) {
      const callId = last?.callId;
      last = null;
      if (error instanceof UnknownModelError) {
        return { ok: false, calls, reason: "unknown-model", message: "That model is not available. No further call was made.", callId };
      }
      if (error instanceof SpendCapError) {
        return { ok: false, calls, reason: "spend-cap", message: TRY_ANOTHER_PHOTO, callId };
      }
      if (calls >= MAX_PROVIDER_ATTEMPTS) return { ok: false, calls, reason: "provider", message: TRY_ANOTHER_PHOTO, callId };
    }
  }
  if (!last) return { ok: false, calls, reason: "provider", message: TRY_ANOTHER_PHOTO };

  await saveRawProviderImage(last.image, args.tool);
  let edited = await sharp(last.image, { failOn: "none" })
    .rotate()
    .resize(decoded.width, decoded.height, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer();
  if ((args.tool === "style" || args.tool === "colour") && report.face) {
    const registered = await registerProviderFrame(decoded.data, edited, decoded.width, decoded.height, report.face);
    if (!registered.registration.ok) {
      return { ok: false, calls, reason: "face-guard", message: TRY_ANOTHER_PHOTO, callId: last.callId, detail: registered.registration.detail };
    }
    edited = registered.rgb;
  }
  const locked = args.skipLock ? edited : compositeLocked(decoded.data, edited, report.feather);
  const outside = await outsideMaskDelta(decoded.data, locked, report.feather);
  const spill = disallowedChange(args.tool, report.face, changedPixels(decoded.data, locked, decoded.width, decoded.height), decoded.width, decoded.height);
  if (outside !== 0 || spill > 0.02) return { ok: false, calls, reason: "postcheck", message: TRY_ANOTHER_PHOTO, callId: last.callId };

  const image = await sharp(locked, { raw: { width: decoded.width, height: decoded.height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  return { ok: true, image, calls, output: last };
}

/** Writes the provider JPEG from before the composite. Off unless DEBUG_SAVE_RAW is 1 or true. Not served. */
export async function saveRawProviderImage(image: Buffer, tool: string) {
  const flag = process.env.DEBUG_SAVE_RAW;
  if (flag !== "1" && flag !== "true") return null;
  const dir = path.join(process.cwd(), "var", "ai-debug");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}-${tool}.jpg`);
  await writeFile(file, image);
  return file;
}

export { preflightPhoto };
