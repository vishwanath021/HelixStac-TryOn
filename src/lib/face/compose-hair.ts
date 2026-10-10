import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  alignGeneratedToOriginal,
  buildProtectedZone,
  compositeHair,
  drawFaceCheck,
  unchangedWallDelta,
  faceDrift,
  faceRatios,
  maskOverlay,
  ssimRegion,
  UnreliableDetectionError,
  warpMask,
  warpRgb,
  type DriftReport,
} from "@/lib/face/hair-composite";
import type { RgbImage } from "@/lib/face/raster";
import type { Point } from "@/lib/face/similarity";
import { assertVisionFiles, visionPython } from "@/lib/face/vision-assets";

export type PortraitSegmentation = {
  width: number;
  height: number;
  hairFraction: number;
  points: Point[];
  hair: Uint8Array;
  classes: Uint8Array;
};

type LandmarkFile = { width: number; height: number; hairFraction: number; points: number[][] };

export async function segmentPortrait(image: Buffer): Promise<PortraitSegmentation> {
  const models = assertVisionFiles();
  const dir = await mkdtemp(path.join(tmpdir(), "helix-vision-"));
  const imagePath = path.join(dir, "input.png");
  const hairPath = path.join(dir, "hair.png");
  const classPath = path.join(dir, "classes.png");
  const landmarkPath = path.join(dir, "landmarks.json");
  try {
    await writeFile(imagePath, image);
    await runInfer({ models, imagePath, hairPath, classPath, landmarkPath });
    const payload = JSON.parse(await readFile(landmarkPath, "utf8")) as LandmarkFile;
    const hairRaw = await sharp(hairPath).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
    const classRaw = await sharp(classPath).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
    if (hairRaw.info.channels !== 1 || classRaw.info.channels !== 1) {
      throw new UnreliableDetectionError("The segmenter masks were not single channel. Hair-only composite did not run.");
    }
    if (!payload.points || payload.points.length < 478) {
      throw new UnreliableDetectionError("Face landmarks were incomplete. Hair-only composite did not run.");
    }
    return {
      width: payload.width,
      height: payload.height,
      hairFraction: payload.hairFraction,
      points: payload.points.slice(0, 478).map(([x, y]) => ({ x, y })),
      hair: new Uint8Array(hairRaw.data),
      classes: new Uint8Array(classRaw.data),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runInfer(args: { models: string; imagePath: string; hairPath: string; classPath: string; landmarkPath: string }) {
  const script = path.join(process.cwd(), "scripts", "vision-infer.py");
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      visionPython(),
      [
        script,
        "--image",
        args.imagePath,
        "--models",
        args.models,
        "--hair",
        args.hairPath,
        "--classes",
        args.classPath,
        "--landmarks",
        args.landmarkPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", () => reject(new UnreliableDetectionError("Python is not available. Hair-only composite did not run.")));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const line = stderr.trim().split("\n").filter((item) => item && !item.startsWith("I0000") && !item.startsWith("W0000") && !item.includes("WARNING")).pop()
          || "Hair segmentation failed.";
        reject(new UnreliableDetectionError(line));
      }
    });
  });
}

export async function decodeRgb(image: Buffer): Promise<RgbImage> {
  const decoded = await sharp(image, { failOn: "none" }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: decoded.data, width: decoded.info.width, height: decoded.info.height };
}

export async function encodePng(image: RgbImage) {
  return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 3 } }).png().toBuffer();
}

/** Skin in the protected zone that neither hair mask claims. Hair over the forehead is not counted as a redrawn face. */
export function faceDriftZone(protectedZone: Uint8Array, oldHair: Uint8Array, newHair: Uint8Array) {
  const zone = new Uint8Array(protectedZone.length);
  let count = 0;
  for (let i = 0; i < zone.length; i += 1) {
    if (protectedZone[i] >= 128 && oldHair[i] < 128 && newHair[i] < 128) {
      zone[i] = 255;
      count += 1;
    }
  }
  if (count >= 200) return zone;
  return protectedZone;
}

function classMask(classes: Uint8Array, ids: number[]) {
  const out = new Uint8Array(classes.length);
  for (let i = 0; i < classes.length; i += 1) if (ids.includes(classes[i])) out[i] = 255;
  return out;
}

export type HairCompositeOutput = {
  compositePng: Buffer;
  overlayPng: Buffer;
  alignedPng: Buffer;
  faceCheckPng: Buffer;
  rawDrift: DriftReport;
  compositeDrift: DriftReport;
  compositeLandmarksDetected: boolean;
  wallBandDelta: number;
};

/**
 * Register the generated frame onto the original, then keep original pixels
 * outside the hair edit. This does not call a provider.
 */
export async function composeHairOnly(originalImage: Buffer, generatedImage: Buffer): Promise<HairCompositeOutput> {
  const original = await decodeRgb(originalImage);
  const generated = await decodeRgb(generatedImage);
  const [originalPng, generatedPng] = await Promise.all([encodePng(original), encodePng(generated)]);
  const originalSeg = await segmentPortrait(originalPng);
  const generatedSeg = await segmentPortrait(generatedPng);
  if (originalSeg.hair.length !== original.width * original.height || generatedSeg.hair.length !== generated.width * generated.height) {
    throw new UnreliableDetectionError("The hair mask does not match the frame. Hair-only composite did not run.");
  }
  const similarity = alignGeneratedToOriginal(generatedSeg.points, originalSeg.points);
  const aligned = warpRgb(generated, similarity, original.width, original.height);
  const newHair = warpMask(generatedSeg.hair, generated.width, generated.height, similarity, original.width, original.height);
  const garments = classMask(originalSeg.classes, [4, 5]);
  const skin = classMask(originalSeg.classes, [2, 3]);
  const protectedZone = buildProtectedZone({
    width: original.width,
    height: original.height,
    landmarks: originalSeg.points,
    oldHair: originalSeg.hair,
  });
  const composited = compositeHair({
    original,
    aligned,
    oldHair: originalSeg.hair,
    newHair,
    garments,
    skin,
    protectedZone,
  });
  const overlay = maskOverlay(original, originalSeg.hair, newHair, protectedZone);
  const zone = faceDriftZone(protectedZone, originalSeg.hair, newHair);
  const rawDrift = faceDrift({
    original,
    compared: aligned,
    originalLandmarks: originalSeg.points,
    comparedLandmarks: generatedSeg.points,
    zone,
  });
  const originalRatios = faceRatios(originalSeg.points);
  const compositeSsim = ssimRegion(original, composited.image, zone);
  const faceCheck = drawFaceCheck(original, originalSeg.points, generatedSeg.points);
  let compositeLandmarksDetected = false;
  let compositeDrift: DriftReport = {
    ssim: compositeSsim,
    browDelta: 0,
    noseDelta: 0,
    widthDelta: 0,
    landmarkError: 0,
    flagged: false,
    ratios: { brow: originalRatios.brow, nose: originalRatios.nose, width: originalRatios.width },
  };
  try {
    const again = await segmentPortrait(await encodePng(composited.image));
    compositeLandmarksDetected = true;
    compositeDrift = faceDrift({
      original,
      compared: composited.image,
      originalLandmarks: originalSeg.points,
      comparedLandmarks: again.points,
      zone,
    });
  } catch {
    compositeLandmarksDetected = false;
  }
  return {
    compositePng: await encodePng(composited.image),
    overlayPng: await encodePng(overlay),
    alignedPng: await encodePng(aligned),
    faceCheckPng: await encodePng(faceCheck),
    rawDrift,
    compositeDrift,
    compositeLandmarksDetected,
    wallBandDelta: unchangedWallDelta(original, composited.image, originalSeg.hair, newHair),
  };
}

/** Landmark warning for the raw frame. No composite, no provider call. */
export async function reviewProviderFace(originalImage: Buffer, generatedImage: Buffer) {
  const original = await decodeRgb(originalImage);
  const generated = await decodeRgb(generatedImage);
  const [originalPng, generatedPng] = await Promise.all([encodePng(original), encodePng(generated)]);
  const originalSeg = await segmentPortrait(originalPng);
  const generatedSeg = await segmentPortrait(generatedPng);
  if (originalSeg.hair.length !== original.width * original.height || generatedSeg.hair.length !== generated.width * generated.height) {
    throw new UnreliableDetectionError("The hair mask does not match the frame. The face check did not run.");
  }
  const similarity = alignGeneratedToOriginal(generatedSeg.points, originalSeg.points);
  const aligned = warpRgb(generated, similarity, original.width, original.height);
  const newHair = warpMask(generatedSeg.hair, generated.width, generated.height, similarity, original.width, original.height);
  const protectedZone = buildProtectedZone({
    width: original.width,
    height: original.height,
    landmarks: originalSeg.points,
    oldHair: originalSeg.hair,
  });
  const zone = faceDriftZone(protectedZone, originalSeg.hair, newHair);
  const rawDrift = faceDrift({
    original,
    compared: aligned,
    originalLandmarks: originalSeg.points,
    comparedLandmarks: generatedSeg.points,
    zone,
  });
  const faceCheck = drawFaceCheck(original, originalSeg.points, generatedSeg.points);
  return {
    rawDrift,
    alignedPng: await encodePng(aligned),
    faceCheckPng: await encodePng(faceCheck),
  };
}
