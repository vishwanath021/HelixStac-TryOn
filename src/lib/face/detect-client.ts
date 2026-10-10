"use client";

import { poseFromLandmarks, type FaceLandmark } from "@/lib/face/pose";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

export type DetectedFace = {
  landmarks: FaceLandmark[];
  pose: { yaw: number; roll: number; pitch: number };
  faceCount: number;
};

let loading: Promise<FaceLandmarker | null> | null = null;

async function landmarker() {
  if (!loading) {
    loading = (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const model = { modelAssetPath: "/mediapipe/face-landmarker" };
        const options = {
          runningMode: "IMAGE" as const,
          numFaces: 2,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        };
        try {
          return await vision.FaceLandmarker.createFromOptions(files, {
            baseOptions: { ...model, delegate: "GPU" },
            ...options,
          });
        } catch {
          return await vision.FaceLandmarker.createFromOptions(files, {
            baseOptions: { ...model, delegate: "CPU" },
            ...options,
          });
        }
      } catch {
        return null;
      }
    })();
  }
  return loading;
}

/** Browser face landmarks. Returns null when the model cannot run, so the server can fall back. */
export async function detectFaceLandmarks(blob: Blob): Promise<DetectedFace | null> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  const marker = await landmarker();
  if (!marker) return null;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const result = marker.detect(canvas);
    const faces = result.faceLandmarks ?? [];
    const first = faces[0];
    if (!first?.length) return null;
    const landmarks = first.map((point) => ({ x: point.x, y: point.y, z: point.z }));
    const pose = poseFromLandmarks(landmarks, bitmap.width, bitmap.height);
    if (!pose) return null;
    return {
      landmarks,
      pose: { yaw: pose.yaw, roll: pose.roll, pitch: pose.pitch },
      faceCount: faces.length,
    };
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
