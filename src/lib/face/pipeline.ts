import sharp from "sharp";
import {
  analyzeRegion,
  compositeLocked,
  decodeRgb,
  disallowedChange,
  preflightPhoto,
  TRY_ANOTHER_PHOTO,
  type RegionTool,
} from "@/lib/face/region";
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
      reason: "placement" | "provider" | "postcheck";
      message: string;
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
 * The returned pixels outside the feathered mask match the original photo byte for byte.
 */
export async function runLockedEdit(args: {
  image: Buffer;
  tool: RegionTool;
  edit: (attempt: number) => Promise<GenerateOutput>;
  /** Test hook. Skips the composite so the post-check can fail on purpose. */
  skipLock?: boolean;
}): Promise<LockedEdit> {
  const decoded = await decodeRgb(args.image);
  const report = analyzeRegion(decoded.data, decoded.width, decoded.height, args.tool);
  if (!report.ok) return { ok: false, calls: 0, reason: "placement", message: report.message || TRY_ANOTHER_PHOTO };

  let calls = 0;
  let last: GenerateOutput | null = null;
  while (calls < MAX_PROVIDER_ATTEMPTS) {
    try {
      calls += 1;
      last = await args.edit(calls);
      break;
    } catch {
      last = null;
      if (calls >= MAX_PROVIDER_ATTEMPTS) return { ok: false, calls, reason: "provider", message: TRY_ANOTHER_PHOTO };
    }
  }
  if (!last) return { ok: false, calls, reason: "provider", message: TRY_ANOTHER_PHOTO };

  const edited = await sharp(last.image, { failOn: "none" })
    .rotate()
    .resize(decoded.width, decoded.height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const locked = args.skipLock ? edited : compositeLocked(decoded.data, edited, report.feather);
  const outside = await outsideMaskDelta(decoded.data, locked, report.feather);
  const spill = disallowedChange(args.tool, report.face, changedPixels(decoded.data, locked, decoded.width, decoded.height), decoded.width, decoded.height);
  if (outside !== 0 || spill > 0.02) return { ok: false, calls, reason: "postcheck", message: TRY_ANOTHER_PHOTO };

  const image = await sharp(locked, { raw: { width: decoded.width, height: decoded.height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  return { ok: true, image, calls, output: last };
}

export { preflightPhoto };
