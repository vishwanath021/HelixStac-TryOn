"use client";

import {
  EYE_CORNER_INDEXES,
  alignAnchorIndexes,
  meanPointDistance,
  pixelPoints,
  similarityOrCover,
  warpRgba,
} from "@/lib/face/align-output";
import { detectFaceLandmarks } from "@/lib/face/detect-client";

export type AlignedPhoto = {
  blob: Blob;
  mode: "landmarks" | "cover";
  /** Mean eye-corner distance, in pixels, after a second landmark pass. Null when that pass finds no face. */
  eyeDelta: number | null;
};

function bitmapRgba(bitmap: ImageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

/**
 * Warp the provider image onto the selfie canvas so the faces share one frame.
 * Landmark failure uses a centred cover crop. Edge gaps are filled from the generated image.
 */
export async function alignGeneratedPhoto(original: Blob, generated: Blob, beard: boolean): Promise<AlignedPhoto> {
  const [originalBitmap, generatedBitmap] = await Promise.all([
    createImageBitmap(original),
    createImageBitmap(generated),
  ]);
  try {
    const dstW = originalBitmap.width;
    const dstH = originalBitmap.height;
    const srcW = generatedBitmap.width;
    const srcH = generatedBitmap.height;
    const indexes = alignAnchorIndexes(beard);
    const [originalFace, generatedFace] = await Promise.all([
      detectFaceLandmarks(original).catch(() => null),
      detectFaceLandmarks(generated).catch(() => null),
    ]);
    const generatedPoints = generatedFace ? pixelPoints(generatedFace.landmarks, srcW, srcH, indexes) : null;
    const originalPoints = originalFace ? pixelPoints(originalFace.landmarks, dstW, dstH, indexes) : null;
    const aligned = similarityOrCover({
      generated: generatedPoints,
      original: originalPoints,
      srcW,
      srcH,
      dstW,
      dstH,
    });
    const source = bitmapRgba(generatedBitmap);
    if (!source) return { blob: generated, mode: "cover", eyeDelta: null };
    const warped = warpRgba(source.data, srcW, srcH, aligned.sim, dstW, dstH);
    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: generated, mode: "cover", eyeDelta: null };
    ctx.putImageData(new ImageData(warped, dstW, dstH), 0, 0);
    const blob = await canvasBlob(canvas);
    if (!blob) return { blob: generated, mode: "cover", eyeDelta: null };
    let eyeDelta: number | null = null;
    if (aligned.mode === "landmarks" && originalFace) {
      const again = await detectFaceLandmarks(blob).catch(() => null);
      const before = pixelPoints(originalFace.landmarks, dstW, dstH, EYE_CORNER_INDEXES);
      const after = again ? pixelPoints(again.landmarks, dstW, dstH, EYE_CORNER_INDEXES) : null;
      if (before && after) eyeDelta = meanPointDistance(before, after);
    }
    return { blob, mode: aligned.mode, eyeDelta };
  } finally {
    originalBitmap.close();
    generatedBitmap.close();
  }
}
