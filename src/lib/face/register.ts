import sharp from "sharp";
import { faceRegionDelta, primaryFace, type FaceBox } from "@/lib/face/region";

/** A matched frame: scale within 5% and the face has barely moved. */
const SCALE_PASS = 0.05;
const OFFSET_PASS = 0.08;
/** Still correctable: warp, then composite. Outside this, reject. */
const SCALE_WARP_MIN = 0.8;
const SCALE_WARP_MAX = 1.25;
const OFFSET_WARP = 0.45;
const FACE_DELTA_MAX = 18;

export type FrameRegistration = {
  ok: boolean;
  warped: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  faceDelta: number;
  detail: string;
};

function blankRegistration(detail: string): FrameRegistration {
  return { ok: false, warped: false, scale: 0, offsetX: 0, offsetY: 0, faceDelta: 0, detail };
}

/**
 * Place `scaled` onto a copy of `base` so the provider face lands on the original face.
 * Pixels the scaled frame does not cover stay as the original photo.
 */
export function pasteScaled(
  base: Buffer,
  scaled: Buffer,
  width: number,
  height: number,
  scaledWidth: number,
  scaledHeight: number,
  destX: number,
  destY: number,
) {
  const out = Buffer.from(base);
  const yStart = Math.max(0, destY);
  const yEnd = Math.min(height, destY + scaledHeight);
  const xStart = Math.max(0, destX);
  const xEnd = Math.min(width, destX + scaledWidth);
  for (let y = yStart; y < yEnd; y += 1) {
    const sy = y - destY;
    for (let x = xStart; x < xEnd; x += 1) {
      const sx = x - destX;
      const si = (sy * scaledWidth + sx) * 3;
      const di = (y * width + x) * 3;
      out[di] = scaled[si];
      out[di + 1] = scaled[si + 1];
      out[di + 2] = scaled[si + 2];
    }
  }
  return out;
}

async function warpOnto(base: Buffer, edited: Buffer, width: number, height: number, from: FaceBox, to: FaceBox) {
  const scale = to.h / Math.max(1, from.h);
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  const scaled = await sharp(edited, { raw: { width, height, channels: 3 } })
    .resize(scaledWidth, scaledHeight, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const destX = Math.round(to.cx - from.cx * scale);
  const destY = Math.round(to.cy - from.cy * scale);
  return pasteScaled(base, scaled, width, height, scaledWidth, scaledHeight, destX, destY);
}

/**
 * Compare the provider frame with the original face before any composite.
 * A small mismatch is warped back. A re-frame outside 0.8–1.25 is rejected.
 * The eye, brow, and nose delta is measured on this aligned frame, not on the composite.
 */
export async function registerProviderFrame(original: Buffer, edited: Buffer, width: number, height: number, face: FaceBox): Promise<{ rgb: Buffer; registration: FrameRegistration }> {
  const found = primaryFace(edited, width, height);
  if (!found) return { rgb: edited, registration: blankRegistration("no face in the provider image") };
  const scaleH = found.h / Math.max(1, face.h);
  const scaleW = found.w / Math.max(1, face.w);
  const scale = Math.max(scaleH, scaleW);
  const offsetX = (found.cx - face.cx) / Math.max(1, face.w);
  const offsetY = (found.cy - face.cy) / Math.max(1, face.h);
  const detailOf = (note: string, delta = 0) => `scale ${scale.toFixed(3)} (h ${scaleH.toFixed(3)} w ${scaleW.toFixed(3)}) offset ${offsetX.toFixed(3)},${offsetY.toFixed(3)} faceDelta ${delta.toFixed(1)} ${note}`.trim();
  const tight = Math.abs(scale - 1) <= SCALE_PASS && Math.abs(scaleH - scaleW) <= SCALE_PASS && Math.abs(offsetX) <= OFFSET_PASS && Math.abs(offsetY) <= OFFSET_PASS;
  const modest = scale >= SCALE_WARP_MIN && scale <= SCALE_WARP_MAX && Math.abs(scaleH - scaleW) <= 0.12 && Math.abs(offsetX) <= OFFSET_WARP && Math.abs(offsetY) <= OFFSET_WARP;
  if (!tight && !modest && (scale < SCALE_WARP_MIN || scale > SCALE_WARP_MAX || Math.abs(offsetX) > OFFSET_WARP || Math.abs(offsetY) > OFFSET_WARP)) {
    const faceDelta = faceRegionDelta(original, edited, face, width, height);
    return { rgb: edited, registration: { ok: false, warped: false, scale, offsetX, offsetY, faceDelta, detail: detailOf("out of range", faceDelta) } };
  }
  if (!tight && !modest) {
    const faceDelta = faceRegionDelta(original, edited, face, width, height);
    return { rgb: edited, registration: { ok: false, warped: false, scale, offsetX, offsetY, faceDelta, detail: detailOf("non-uniform", faceDelta) } };
  }
  const rgb = tight ? edited : await warpOnto(original, edited, width, height, found, face);
  const faceDelta = faceRegionDelta(original, rgb, face, width, height);
  if (faceDelta > FACE_DELTA_MAX) {
    return { rgb, registration: { ok: false, warped: !tight, scale, offsetX, offsetY, faceDelta, detail: detailOf("face changed", faceDelta) } };
  }
  return { rgb, registration: { ok: true, warped: !tight, scale, offsetX, offsetY, faceDelta, detail: detailOf(tight ? "matched" : "aligned", faceDelta) } };
}
