import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BEARDS } from "@/data/beards";
import { BROWS } from "@/data/brows";
import { NAILS } from "@/data/nails";
import { CALIBRATION_CAP_INR, CALIBRATION_MAX_IMAGES, runCalibration } from "@/lib/ai/calibrate";
import { paintFlat } from "@/lib/ai/flat-edit";
import { cropRgb, padImageAndMask, padRgb } from "@/lib/ai/square";
import { finalizePaidCall, releasePaidCall, beginPaidCall, spendSummary } from "@/lib/ai/spend";
import { costUsdFromUsage, exactInr } from "@/lib/ai/tiers";
import { writeOverlays } from "@/lib/face/fixtures";
import { outsideMaskDelta, runLockedEdit, saveRawProviderImage } from "@/lib/face/pipeline";
import { analyzeRegion, compositeLocked, decodeRgb, maskPng, preflightPhoto, type FaceBox, type RegionTool } from "@/lib/face/region";
import type { GenerateOutput } from "@/lib/ai/types";
import { classifySkinPhoto } from "@/lib/hand-photo";
import { prisma } from "@/lib/prisma";
import { drawFrontal, drawHand, drawLongHair, drawTilted, type Scene } from "@/lib/face/synthetic";

const FACE_TOOLS: RegionTool[] = ["style", "colour", "brows", "beard"];

function identityEdit(image: Buffer): GenerateOutput {
  return { image, mime: "image/jpeg", provider: "identity", providerCostUsd: 0, latencyMs: 0 };
}

async function zoomFromCenter(jpeg: Buffer, factor: number) {
  const meta = await sharp(jpeg).metadata();
  const width = meta.width || 8;
  const height = meta.height || 8;
  const scaledWidth = Math.round(width * factor);
  const scaledHeight = Math.round(height * factor);
  const big = await sharp(jpeg).resize(scaledWidth, scaledHeight, { fit: "fill" }).toBuffer();
  return sharp(big)
    .extract({ left: Math.floor((scaledWidth - width) / 2), top: Math.floor((scaledHeight - height) / 2), width, height })
    .jpeg({ quality: 95 })
    .toBuffer();
}

function faceSpots(face: FaceBox): [number, number][] {
  return [
    [face.cx, face.y + face.h * 0.12],
    [face.cx - face.w * 0.18, face.y + face.h * 0.42],
    [face.cx + face.w * 0.18, face.y + face.h * 0.42],
    [face.cx, face.y + face.h * 0.55],
    [face.cx, face.y + face.h * 0.72],
  ];
}

function pixel(data: Buffer, width: number, x: number, y: number) {
  const i = (y * width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]] as const;
}

describe("region masks", () => {
  it("keeps every pixel outside the feathered mask byte-identical after a full-frame recolour", async () => {
    const scene = drawFrontal(480, 640);
    const jpeg = await sharp(scene.data, { raw: { width: 480, height: 640, channels: 3 } }).jpeg().toBuffer();
    for (const tool of FACE_TOOLS) {
      const decoded = await decodeRgb(jpeg);
      const report = analyzeRegion(decoded.data, decoded.width, decoded.height, tool);
      expect(report.ok, tool).toBe(true);
      const flat = Buffer.alloc(decoded.data.length, 0);
      for (let i = 0; i < flat.length; i += 3) flat[i] = 255;
      const locked = compositeLocked(decoded.data, flat, report.feather);
      expect(await outsideMaskDelta(decoded.data, locked, report.feather)).toBe(0);
      const inside = report.feather.indexOf(255);
      expect(inside).toBeGreaterThan(-1);
      expect(locked[inside * 3]).toBe(255);
      expect(locked[inside * 3 + 1]).toBe(0);
    }
  });

  it("places hair above the eyes, brows on the brow band, and the beard below the nose", async () => {
    const scene = drawFrontal(480, 640);
    const report = analyzeRegion(scene.data, scene.width, scene.height, "style");
    expect(report.ok).toBe(true);
    const face = report.face!;
    expect(Math.abs(face.cx - (scene.face!.x + scene.face!.w / 2))).toBeLessThan(scene.face!.w * 0.2);
    const hair = analyzeRegion(scene.data, scene.width, scene.height, "style");
    const brows = analyzeRegion(scene.data, scene.width, scene.height, "brows");
    const beard = analyzeRegion(scene.data, scene.width, scene.height, "beard");
    const colour = analyzeRegion(scene.data, scene.width, scene.height, "colour");
    expect(brows.ok && beard.ok && colour.ok).toBe(true);
    const sample = (mask: Uint8Array, x: number, y: number) => mask[Math.round(y) * scene.width + Math.round(x)] > 0;
    const cx = face.cx;
    expect(sample(hair.mask, cx, face.y - face.h * 0.1)).toBe(true);
    expect(sample(hair.mask, cx, face.y + face.h * 0.05)).toBe(false);
    expect(sample(hair.mask, cx, face.y + face.h * 0.7)).toBe(false);
    expect(sample(brows.mask, cx, face.y + face.h * 0.27)).toBe(true);
    expect(sample(brows.mask, cx, face.y + face.h * 0.05)).toBe(false);
    expect(sample(brows.mask, cx, face.y + face.h * 0.7)).toBe(false);
    expect(sample(beard.mask, cx, face.y + face.h * 0.9)).toBe(true);
    expect(sample(beard.mask, cx, face.y + face.h * 0.2)).toBe(false);
    expect(sample(beard.mask, cx, face.y + face.h * 0.42)).toBe(false);
    expect(sample(beard.mask, cx, face.y + face.h * 0.73)).toBe(false);
  });

  it("keeps eyes, forehead, nose, and mouth out of the hair and colour zones", () => {
    const scenes: Scene[] = [
      drawFrontal(480, 640),
      drawFrontal(720, 1280, 0.5, 0.42, 0.9),
      drawFrontal(1280, 720, 0.42, 0.5, 0.85),
      drawLongHair(),
      drawFrontal(96, 128, 0.5, 0.48, 0.7),
      drawTilted(),
    ];
    for (const scene of scenes) {
      for (const tool of ["style", "colour"] as const) {
        const report = analyzeRegion(scene.data, scene.width, scene.height, tool);
        const face = report.face;
        expect(face, `${scene.name} ${tool}`).toBeTruthy();
        if (!face) continue;
        let skinInside = 0;
        let rectInside = 0;
        const y0 = Math.ceil(face.y + face.h * 0.2);
        const y1 = Math.floor(face.y + face.h * 0.9);
        const x0 = Math.ceil(face.cx - face.w * 0.35);
        const x1 = Math.floor(face.cx + face.w * 0.35);
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) continue;
            const on = report.mask[y * scene.width + x] > 0;
            if (on) rectInside += 1;
            const i = (y * scene.width + x) * 3;
            const r = scene.data[i];
            const g = scene.data[i + 1];
            const b = scene.data[i + 2];
            if (r > 90 && g > 40 && b > 20 && r > g && r > b && r - g > 12 && r - b > 12 && on) skinInside += 1;
          }
        }
        expect(skinInside, `${scene.name} ${tool} skin`).toBe(0);
        expect(report.mask[Math.round(face.cy) * scene.width + Math.round(face.cx)], `${scene.name} ${tool} center`).toBe(0);
        if (scene.name === "tilted") continue;
        expect(rectInside, `${scene.name} ${tool} face`).toBe(0);
        for (const [px, py] of faceSpots(face)) {
          const x = Math.round(px);
          const y = Math.round(py);
          if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) continue;
          expect(report.mask[y * scene.width + x], `${scene.name} ${tool} ${x},${y}`).toBe(0);
        }
      }
    }
  });

  it("includes long hair and leaves the shirt out of the hair zone", () => {
    const scene = drawLongHair();
    const report = analyzeRegion(scene.data, scene.width, scene.height, "style");
    expect(report.ok).toBe(true);
    const face = report.face!;
    const cx = Math.round(face.cx);
    const below = Math.round(face.y + face.h * 1.55);
    const hairX = Math.round(face.x - face.w * 0.2);
    expect(report.mask[below * scene.width + hairX]).toBe(255);
    expect(report.mask[below * scene.width + cx]).toBe(0);
    expect(report.mask[Math.round(face.y + face.h * 0.45) * scene.width + Math.round(face.cx)]).toBe(0);
    expect(report.mask[4 * scene.width + 4]).toBe(0);
  });

  it("keeps a short cut on the existing hair and gives a long cut a little room below it", () => {
    const scene = drawLongHair();
    const long = analyzeRegion(scene.data, scene.width, scene.height, "style", { hairExtent: "long" });
    const short = analyzeRegion(scene.data, scene.width, scene.height, "style", { hairExtent: "short" });
    expect(long.ok && short.ok).toBe(true);
    const face = long.face!;
    const hairX = Math.round(face.x - face.w * 0.2);
    let bottom = Math.round(face.y);
    for (let y = 0; y < scene.height; y += 1) {
      const i = (y * scene.width + hairX) * 3;
      if (scene.data[i] < 80 && scene.data[i + 1] < 60 && scene.data[i + 2] < 50) bottom = y;
    }
    const grown = Math.min(scene.height - 1, Math.round(bottom + face.h * 0.15));
    expect(short.mask[bottom * scene.width + hairX]).toBe(255);
    expect(long.mask[bottom * scene.width + hairX]).toBe(255);
    expect(short.mask[grown * scene.width + hairX]).toBe(0);
    expect(long.mask[grown * scene.width + hairX]).toBe(255);
    expect(long.mask[4 * scene.width + 4]).toBe(0);
  });

  it("marks transparent mask pixels as editable and opaque pixels as keep for the OpenAI edit", async () => {
    const scene = drawFrontal(480, 640);
    const report = analyzeRegion(scene.data, scene.width, scene.height, "style");
    expect(report.ok).toBe(true);
    const png = await maskPng(report.feather, scene.width, scene.height);
    const decoded = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => decoded.data[(y * decoded.info.width + x) * decoded.info.channels + decoded.info.channels - 1];
    const face = report.face!;
    const hairX = Math.round(face.cx);
    const hairY = Math.round(face.y - face.h * 0.1);
    expect(report.feather[hairY * scene.width + hairX]).toBe(255);
    expect(alphaAt(hairX, hairY)).toBe(0);
    const faceX = Math.round(face.cx);
    const faceY = Math.round(face.y + face.h * 0.45);
    expect(report.feather[faceY * scene.width + faceX]).toBe(0);
    expect(alphaAt(faceX, faceY)).toBe(255);
  });

  it("pads a photo to a square and crops it back to the same pixels", async () => {
    for (const scene of [drawLongHair(), drawFrontal(480, 640), drawFrontal(320, 320)]) {
      const pad = padRgb(scene.data, scene.width, scene.height);
      expect(pad.size).toBe(Math.max(scene.width, scene.height));
      expect(pad.offsetX).toBe(Math.floor((pad.size - scene.width) / 2));
      expect(pad.offsetY).toBe(Math.floor((pad.size - scene.height) / 2));
      const back = cropRgb(pad.data, pad.size, pad.offsetX, pad.offsetY, scene.width, scene.height);
      expect(Buffer.compare(back, scene.data)).toBe(0);
    }
    const scene = drawLongHair();
    const jpeg = await sharp(scene.data, { raw: { width: scene.width, height: scene.height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const report = analyzeRegion(scene.data, scene.width, scene.height, "style");
    const png = await maskPng(report.feather, scene.width, scene.height);
    const padded = await padImageAndMask(jpeg, png);
    expect(padded.size).toBeGreaterThan(padded.contentHeight);
    const mask = await sharp(padded.mask!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corner = mask.data[mask.info.channels - 1];
    expect(corner).toBe(255);
    const face = report.face!;
    const hairX = padded.offsetX + Math.round(face.cx);
    const hairY = padded.offsetY + Math.round(face.y - face.h * 0.1);
    const hairAlpha = mask.data[(hairY * mask.info.width + hairX) * mask.info.channels + mask.info.channels - 1];
    expect(hairAlpha).toBe(0);
    const faceAlpha = mask.data[((padded.offsetY + Math.round(face.cy)) * mask.info.width + padded.offsetX + Math.round(face.cx)) * mask.info.channels + mask.info.channels - 1];
    expect(faceAlpha).toBe(255);
  });

  it("rejects a hair edit that changes the eyes and does not retry", async () => {
    const scene = drawFrontal(360, 480);
    const jpeg = await sharp(scene.data, { raw: { width: 360, height: 480, channels: 3 } }).jpeg().toBuffer();
    let calls = 0;
    const guarded = await runLockedEdit({
      image: jpeg,
      tool: "style",
      skipLock: true,
      edit: async () => {
        calls += 1;
        return paintFlat(jpeg);
      },
    });
    expect(guarded.ok).toBe(false);
    expect(calls).toBe(1);
    if (!guarded.ok) expect(guarded.reason).toBe("face-guard");

    calls = 0;
    const locked = await runLockedEdit({
      image: jpeg,
      tool: "colour",
      edit: async () => {
        calls += 1;
        return identityEdit(jpeg);
      },
    });
    expect(locked.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("rejects the reframed paid hair frame and accepts a matched one", async () => {
    const before = readFileSync(path.join(process.cwd(), "tests/fixtures/replay/long-layers-before.jpg"));
    const raw = readFileSync(path.join(process.cwd(), "tests/fixtures/replay/long-layers-raw.jpg"));
    let calls = 0;
    const rejected = await runLockedEdit({
      image: before,
      tool: "style",
      hairExtent: "long",
      edit: async () => {
        calls += 1;
        return { ...identityEdit(raw), callId: "paid-long-layers" };
      },
    });
    expect(calls).toBe(1);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reason).toBe("face-guard");
      expect(rejected.message).toContain("Try another photo");
      expect(rejected.detail || "").toMatch(/scale/);
    }

    const scene = drawFrontal(360, 480);
    const jpeg = await sharp(scene.data, { raw: { width: 360, height: 480, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const matched = await runLockedEdit({
      image: jpeg,
      tool: "style",
      edit: async () => identityEdit(jpeg),
    });
    expect(matched.ok).toBe(true);

    const zoomed = await zoomFromCenter(jpeg, 1.12);
    const aligned = await runLockedEdit({
      image: jpeg,
      tool: "style",
      edit: async () => identityEdit(zoomed),
    });
    expect(aligned.ok).toBe(true);
    const tooFar = await zoomFromCenter(jpeg, 1.8);
    let farCalls = 0;
    const refused = await runLockedEdit({
      image: jpeg,
      tool: "style",
      edit: async () => {
        farCalls += 1;
        return identityEdit(tooFar);
      },
    });
    expect(farCalls).toBe(1);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe("face-guard");
  });

  it("saves the raw provider image only when DEBUG_SAVE_RAW is on", async () => {
    const scene = drawFrontal(360, 480);
    const jpeg = await sharp(scene.data, { raw: { width: 360, height: 480, channels: 3 } }).jpeg().toBuffer();
    const dir = path.join(process.cwd(), "var", "ai-debug");
    rmSync(dir, { recursive: true, force: true });
    expect(await saveRawProviderImage(jpeg, "style")).toBeNull();
    process.env.DEBUG_SAVE_RAW = "true";
    const saved = await saveRawProviderImage(jpeg, "style");
    expect(saved && existsSync(saved)).toBe(true);
    delete process.env.DEBUG_SAVE_RAW;
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a missing face, a second face, a tilt, a profile, and a tiny face before any edit", async () => {
    const { writeMaskFixtures } = await import("@/lib/face/fixtures");
    const files = await writeMaskFixtures();
    const jpeg = (name: string) => files.find((item) => item.name === name)!.jpeg;
    const reasons: Record<string, string> = {};
    for (const name of ["no-face", "two-face", "tilted", "profile", "low-res"]) {
      let calls = 0;
      const result = await runLockedEdit({
        image: jpeg(name),
        tool: "beard",
        edit: async () => {
          calls += 1;
          return paintFlat(jpeg(name));
        },
      });
      expect(result.ok).toBe(false);
      expect(calls).toBe(0);
      if (!result.ok) reasons[name] = (await preflightPhoto(jpeg(name), "beard")).reason || "";
    }
    expect(reasons["no-face"]).toBe("none");
    expect(reasons["two-face"]).toBe("many");
    expect(reasons.tilted).toBe("tilt");
    expect(reasons.profile).toBe("profile");
    expect(reasons["low-res"]).toBe("small");
  });

  it("locks an off-centre, mirrored, EXIF-rotated, wide, and camera photo", async () => {
    const { writeMaskFixtures } = await import("@/lib/face/fixtures");
    const files = await writeMaskFixtures();
    for (const name of ["frontal", "off-centre", "mirrored", "exif", "upload-wide", "camera-portrait"]) {
      const jpeg = files.find((item) => item.name === name)!.jpeg;
      const result = await runLockedEdit({
        image: jpeg,
        tool: name === "upload-wide" ? "colour" : "style",
        edit: async (attempt) => {
          expect(attempt).toBe(1);
          return identityEdit(jpeg);
        },
      });
      expect(result.ok, name).toBe(true);
      if (!result.ok) continue;
      const decoded = await decodeRgb(jpeg);
      const after = await decodeRgb(result.image);
      const corner = pixel(after.data, after.width, 4, 4);
      expect(corner[2]).toBeGreaterThan(corner[0] + 40);
      expect(corner[0]).toBeLessThan(90);
      const report = analyzeRegion(decoded.data, decoded.width, decoded.height, name === "upload-wide" ? "colour" : "style");
      expect(report.ok, name).toBe(true);
      expect(report.face && report.face.h).toBeGreaterThan(72);
    }
  });

  it("asks for another photo when beard paint would be judged on the forehead, and does not retry", async () => {
    const scene = drawFrontal(360, 480);
    const jpeg = await sharp(scene.data, { raw: { width: 360, height: 480, channels: 3 } }).jpeg().toBuffer();
    let calls = 0;
    const result = await runLockedEdit({
      image: jpeg,
      tool: "beard",
      skipLock: true,
      edit: async () => {
        calls += 1;
        return paintFlat(jpeg);
      },
    });
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
    if (!result.ok) expect(result.reason).toBe("postcheck");
  });

  it("does not retry a throwing provider, and does not call it when placement already failed", async () => {
    const scene = drawFrontal(360, 480);
    const jpeg = await sharp(scene.data, { raw: { width: 360, height: 480, channels: 3 } }).jpeg().toBuffer();
    let calls = 0;
    const thrown = await runLockedEdit({
      image: jpeg,
      tool: "brows",
      edit: async () => {
        calls += 1;
        throw new Error("provider down");
      },
    });
    expect(thrown.ok).toBe(false);
    expect(calls).toBe(1);
    calls = 0;
    const blocked = await runLockedEdit({
      image: await sharp({ create: { width: 200, height: 200, channels: 3, background: "#2244aa" } }).jpeg().toBuffer(),
      tool: "style",
      edit: async () => {
        calls += 1;
        return paintFlat(jpeg);
      },
    });
    expect(blocked.ok).toBe(false);
    expect(calls).toBe(0);
  });

  it("masks fingertips on a hand and refuses that hand for a beard", async () => {
    const hand = drawHand();
    const nails = analyzeRegion(hand.data, hand.width, hand.height, "nails");
    expect(nails.reason ?? "ok").toBe("ok");
    const nail = hand.nails[0];
    expect(nails.mask[(nail.y + 8) * hand.width + (nail.x + 8)]).toBe(255);
    expect(nails.mask[(hand.height - 8) * hand.width + 8]).toBe(0);
    const beard = analyzeRegion(hand.data, hand.width, hand.height, "beard");
    expect(beard.ok).toBe(false);
    const jpeg = await sharp(hand.data, { raw: { width: hand.width, height: hand.height, channels: 3 } }).jpeg().toBuffer();
    const small = await sharp(jpeg).resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer();
    expect(classifySkinPhoto(small, 48, 48, 3)).not.toBe("face");
    const face = drawFrontal(480, 640);
    const faceJpeg = await sharp(face.data, { raw: { width: 480, height: 640, channels: 3 } }).jpeg().toBuffer();
    const faceSmall = await sharp(faceJpeg).resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer();
    expect(classifySkinPhoto(faceSmall, 48, 48, 3)).toBe("face");
  });

  it("writes an overlay for every fixture and tool, including the real portraits", async () => {
    const written = await writeOverlays();
    expect(written.length).toBeGreaterThan(20);
    for (const file of written) expect(existsSync(file)).toBe(true);
    const portrait = await preflightPhoto(
      await sharp(path.join(process.cwd(), "public/styles/soft-bob.jpg")).jpeg().toBuffer(),
      "style",
    );
    expect(portrait.ok).toBe(true);
    expect(portrait.face && portrait.face.cy).toBeLessThan(portrait.height * 0.75);
  });

  it("ships a photo card for every brow, beard, and nail id", () => {
    for (const [folder, rows] of [
      ["brows", BROWS],
      ["beards", BEARDS],
      ["nails", NAILS],
    ] as const) {
      const names = new Set(readdirSync(path.join(process.cwd(), "public", folder)));
      expect(names.size).toBe(rows.length);
      for (const row of rows) expect(names.has(`${row.id}.jpg`)).toBe(true);
    }
  });
});

describe("calibration budget", () => {
  it("runs at most five offline images and stops before the rupee cap", async () => {
    const offline = await runCalibration();
    expect(offline.panels).toHaveLength(CALIBRATION_MAX_IMAGES);
    expect(offline.spentInr).toBe(0);
    expect(offline.panels.every((panel) => panel.ok && panel.calls === 1 && panel.chargedInr === 0)).toBe(true);

    let charged = 0;
    const paid = await runCalibration({
      estimateInr: 8,
      capInr: CALIBRATION_CAP_INR,
      pay: async () => {
        charged += 1;
        return { ok: true, id: `cal-${charged}` };
      },
    });
    expect(charged).toBe(3);
    expect(paid.spentInr).toBe(24);
    expect(paid.stoppedBecause).toBe("cap");
    expect(paid.panels).toHaveLength(3);

    let released = 0;
    const blocked = await runCalibration({
      fixtures: [{ name: "empty", tool: "style", image: await sharp({ create: { width: 180, height: 180, channels: 3, background: "#113388" } }).jpeg().toBuffer() }],
      estimateInr: 8,
      pay: async () => {
        throw new Error("should not charge");
      },
      release: async () => {
        released += 1;
      },
    });
    expect(blocked.panels[0].ok).toBe(false);
    expect(blocked.panels[0].calls).toBe(0);
    expect(blocked.spentInr).toBe(0);
    expect(released).toBe(0);
  });

  it("releases a charged call so a failed placement cannot spend the cap twice", async () => {
    process.env.AI_SPEND_CAP_INR = "9";
    process.env.AI_COST_PER_CALL_INR_OPENAI_MEDIUM = "6";
    await prisma.aiCall.deleteMany();
    const first = await beginPaidCall({ provider: "openai", quality: "medium", model: "gpt-image-1", tenantId: "mask-spend" });
    expect(first.ok).toBe(true);
    if (first.ok) await releasePaidCall(first.id);
    const second = await beginPaidCall({ provider: "openai", quality: "medium", model: "gpt-image-1", tenantId: "mask-spend" });
    expect(second.ok).toBe(true);
    expect(await prisma.aiCall.count({ where: { status: "CHARGED" } })).toBe(1);
    expect(await prisma.aiCall.count({ where: { status: "REFUNDED" } })).toBe(1);
    delete process.env.AI_SPEND_CAP_INR;
    delete process.env.AI_COST_PER_CALL_INR_OPENAI_MEDIUM;
  });

  it("keeps a billed face-guard failure inside the spend cap", async () => {
    process.env.AI_SPEND_CAP_INR = "0.6";
    await prisma.aiCall.deleteMany();
    const first = await beginPaidCall({ provider: "openai", quality: "test", model: "gpt-image-1-mini", tenantId: "face-guard", estimateInr: 0.6 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await finalizePaidCall(first.id, { model: "gpt-image-1-mini", billed: true, charged: true, costUsd: 0.005, estimateInr: 0.6 });
    await releasePaidCall(first.id, "BILLED_FAILED");
    const row = await prisma.aiCall.findFirst({ where: { id: first.id } });
    expect(row?.status).toBe("BILLED_FAILED");
    expect(row?.charged).toBe(true);
    expect(row?.billed).toBe(true);
    const second = await beginPaidCall({ provider: "openai", quality: "test", model: "gpt-image-1-mini", tenantId: "face-guard", estimateInr: 0.6 });
    expect(second.ok).toBe(false);
    delete process.env.AI_SPEND_CAP_INR;
  });

  it("settles a successful call to actual usage and keeps the estimate when the bill is unknown", async () => {
    process.env.AI_SPEND_CAP_INR = "40";
    await prisma.aiCall.deleteMany();
    const usage = { textTokens: 100, imageTokens: 1000, outputTokens: 800, inputTokens: 1100, totalTokens: 1900 };
    const actualUsd = costUsdFromUsage("gpt-image-2.5-sunburst", usage);
    expect(actualUsd).not.toBeNull();
    const actualInr = exactInr(actualUsd || 0);
    const success = await beginPaidCall({
      provider: "openai",
      quality: "edit",
      model: "gpt-image-2.5-sunburst",
      tenantId: "settle-actual",
      estimateInr: 16.6,
      estimateUsd: 0.16,
    });
    expect(success.ok).toBe(true);
    if (!success.ok) return;
    await finalizePaidCall(success.id, {
      model: "gpt-image-2.5-sunburst",
      billed: true,
      charged: true,
      costUsd: 0.16,
      estimateInr: 16.6,
      usage,
    });
    const settled = await prisma.aiCall.findFirst({ where: { id: success.id } });
    expect(settled?.costSource).toBe("usage");
    expect(settled?.estimatePaise).toBe(1660);
    expect(settled?.costInrPaise).toBe(Math.round(actualInr * 100));
    expect(settled?.costInrPaise).toBeLessThan(1660);
    const unknown = await beginPaidCall({
      provider: "openai",
      quality: "edit",
      model: "gpt-image-2.5-sunburst",
      tenantId: "settle-unknown",
      estimateInr: 16.6,
      estimateUsd: 0.16,
    });
    expect(unknown.ok).toBe(true);
    if (!unknown.ok) return;
    await finalizePaidCall(unknown.id, {
      model: "gpt-image-2.5-sunburst",
      billed: true,
      charged: true,
      costUsd: 0.16,
      estimateInr: 16.6,
    });
    await releasePaidCall(unknown.id, "UNCERTAIN");
    const held = await prisma.aiCall.findFirst({ where: { id: unknown.id } });
    expect(held?.status).toBe("UNCERTAIN");
    expect(held?.estimatePaise).toBe(1660);
    const summary = await spendSummary();
    expect(summary.spentInr).toBeCloseTo(actualInr + 16.6, 2);
    delete process.env.AI_SPEND_CAP_INR;
  });
});
