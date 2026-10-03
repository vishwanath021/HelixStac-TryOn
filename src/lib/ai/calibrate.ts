import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { paintFlat } from "@/lib/ai/flat-edit";
import { runLockedEdit } from "@/lib/face/pipeline";
import { preflightPhoto, renderOverlay, TRY_ANOTHER_PHOTO, type RegionTool } from "@/lib/face/region";
import { drawFrontal, drawHand, type Scene } from "@/lib/face/synthetic";

export const CALIBRATION_MAX_IMAGES = 5;
export const CALIBRATION_CAP_INR = 30;

export type CalibrationPanel = {
  name: string;
  tool: RegionTool;
  ok: boolean;
  message: string;
  calls: number;
  chargedInr: number;
  before: Buffer;
  overlay: Buffer;
  after: Buffer;
};

async function jpegOf(scene: Scene) {
  return sharp(scene.data, { raw: { width: scene.width, height: scene.height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

/** Five pictures: hair, brows, beard, colour, nails. A sixth portrait is available for the offline suite. */
export async function calibrationFixtures(): Promise<{ name: string; tool: RegionTool; image: Buffer }[]> {
  const frontal = await jpegOf(drawFrontal(480, 640));
  const shifted = await jpegOf(drawFrontal(480, 640, 0.72));
  const hand = await jpegOf(drawHand());
  return [
    { name: "frontal-hair", tool: "style", image: frontal },
    { name: "frontal-brows", tool: "brows", image: frontal },
    { name: "frontal-beard", tool: "beard", image: frontal },
    { name: "shifted-colour", tool: "colour", image: shifted },
    { name: "hand-nails", tool: "nails", image: hand },
  ];
}

export function portraitFixture() {
  return readFileSync(path.join(process.cwd(), "public/styles/soft-bob.jpg"));
}

export async function runCalibration(args: {
  fixtures?: { name: string; tool: RegionTool; image: Buffer }[];
  capInr?: number;
  maxImages?: number;
  estimateInr?: number;
  pay?: (estimate: number) => Promise<{ ok: boolean; id?: string }>;
  release?: (id: string) => Promise<void>;
  edit?: (image: Buffer, tool: RegionTool, attempt: number) => Promise<Buffer>;
} = {}) {
  const cap = args.capInr ?? CALIBRATION_CAP_INR;
  const maxImages = Math.min(args.maxImages ?? CALIBRATION_MAX_IMAGES, CALIBRATION_MAX_IMAGES);
  const estimate = Math.max(0, args.estimateInr ?? 0);
  const fixtures = args.fixtures ?? (await calibrationFixtures());
  const edit = args.edit ?? (async (image: Buffer) => (await paintFlat(image)).image);
  let spentInr = 0;
  let stoppedBecause: "cap" | "limit" | "" = "";
  const panels: CalibrationPanel[] = [];

  for (const fixture of fixtures) {
    if (panels.length >= maxImages) {
      stoppedBecause = "limit";
      break;
    }
    const pre = await preflightPhoto(fixture.image, fixture.tool);
    const overlay = await renderOverlay(pre.raw, pre.width, pre.height, pre.mask, pre.face);
    if (!pre.ok) {
      panels.push({
        name: fixture.name,
        tool: fixture.tool,
        ok: false,
        message: pre.message || TRY_ANOTHER_PHOTO,
        calls: 0,
        chargedInr: 0,
        before: fixture.image,
        overlay,
        after: fixture.image,
      });
      continue;
    }
    if (spentInr + estimate > cap) {
      stoppedBecause = "cap";
      break;
    }
    const payment = estimate > 0 && args.pay ? await args.pay(estimate) : { ok: true as const, id: undefined };
    if (!payment.ok) {
      stoppedBecause = "cap";
      break;
    }
    const locked = await runLockedEdit({
      image: fixture.image,
      tool: fixture.tool,
      edit: async (attempt) => ({
        image: await edit(fixture.image, fixture.tool, attempt),
        mime: "image/jpeg",
        provider: estimate > 0 ? "calibration" : "flat",
        providerCostUsd: 0,
        latencyMs: 0,
      }),
    });
    if (!locked.ok) {
      if (payment.id && args.release) await args.release(payment.id);
      panels.push({
        name: fixture.name,
        tool: fixture.tool,
        ok: false,
        message: locked.message,
        calls: locked.calls,
        chargedInr: 0,
        before: fixture.image,
        overlay,
        after: fixture.image,
      });
      continue;
    }
    spentInr = Math.round((spentInr + estimate) * 10) / 10;
    panels.push({
      name: fixture.name,
      tool: fixture.tool,
      ok: true,
      message: estimate > 0 ? "Paid calibration image." : "Offline check. No provider call. This does not measure blending quality.",
      calls: locked.calls,
      chargedInr: estimate,
      before: fixture.image,
      overlay,
      after: locked.image,
    });
  }

  return { spentInr, capInr: cap, maxImages, stoppedBecause, panels };
}
