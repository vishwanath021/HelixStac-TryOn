/**
 * Shared on-device models for the live look.
 * IMAGE mode on a copied frame: VIDEO mode stays blank on the fake camera and some Android GPUs.
 */

import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import { hushMediapipeInfo } from "@/lib/face/detect-client";

export type LiveVision = {
  landmarker: FaceLandmarker;
  segmenter: ImageSegmenter | null;
  delegate: "GPU" | "CPU";
};

let pending: Promise<LiveVision | null> | null = null;

export function loadLiveVision(): Promise<LiveVision | null> {
  if (!pending) {
    pending = (async () => {
      try {
        hushMediapipeInfo();
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const face = {
          runningMode: "IMAGE" as const,
          numFaces: 1,
          minFaceDetectionConfidence: 0.3,
          minFacePresenceConfidence: 0.3,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        };
        const createFace = (delegate: "GPU" | "CPU") =>
          vision.FaceLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: "/mediapipe/face-landmarker", delegate },
            ...face,
          });
        let landmarker: FaceLandmarker;
        let delegate: "GPU" | "CPU" = "GPU";
        try {
          landmarker = await createFace("GPU");
        } catch {
          delegate = "CPU";
          landmarker = await createFace("CPU");
        }
        const seg = {
          runningMode: "IMAGE" as const,
          outputCategoryMask: true,
          outputConfidenceMasks: true,
        };
        const createSeg = (delegate: "GPU" | "CPU") =>
          vision.ImageSegmenter.createFromOptions(files, {
            baseOptions: { modelAssetPath: "/mediapipe/selfie-multiclass", delegate },
            ...seg,
          });
        let segmenter: ImageSegmenter | null = null;
        try {
          segmenter = await createSeg("GPU");
        } catch {
          try {
            segmenter = await createSeg("CPU");
          } catch {
            segmenter = null;
          }
        }
        return { landmarker, segmenter, delegate };
      } catch {
        return null;
      }
    })();
  }
  return pending;
}

/** Downscale a camera or still so detection and the shader share one frame. */
export function copySource(source: CanvasImageSource, sample: HTMLCanvasElement, longEdge: number) {
  const sw = source instanceof HTMLVideoElement
    ? source.videoWidth
    : source instanceof HTMLImageElement
      ? source.naturalWidth
      : (source as HTMLCanvasElement).width;
  const sh = source instanceof HTMLVideoElement
    ? source.videoHeight
    : source instanceof HTMLImageElement
      ? source.naturalHeight
      : (source as HTMLCanvasElement).height;
  if (!sw || !sh) return null;
  const fit = Math.min(1, longEdge / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * fit));
  const height = Math.max(1, Math.round(sh * fit));
  if (sample.width !== width) sample.width = width;
  if (sample.height !== height) sample.height = height;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return sample;
}
